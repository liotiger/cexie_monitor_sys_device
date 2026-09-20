function normalizeOptionalNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function buildDepthKey(depth) {
  const parsedDepth = normalizeOptionalNumber(depth)
  return parsedDepth === null ? null : parsedDepth.toFixed(6)
}

function findBestBaselineMeasurement(rawMeasurement, baselineRows) {
  const rawNode = normalizeOptionalNumber(rawMeasurement?.node)
  if (rawNode !== null) {
    const byNode = baselineRows.find(item => normalizeOptionalNumber(item?.node) === rawNode) || null
    if (byNode) {
      return byNode
    }
  }

  const exactDepthKey = buildDepthKey(rawMeasurement?.depth)
  if (exactDepthKey) {
    const byExactDepth = baselineRows.find(item => buildDepthKey(item?.depth) === exactDepthKey) || null
    if (byExactDepth) {
      return byExactDepth
    }
  }

  const rawDepth = normalizeOptionalNumber(rawMeasurement?.depth)
  if (rawDepth === null) {
    return null
  }

  let bestCandidate = null
  let bestDiff = Number.POSITIVE_INFINITY
  baselineRows.forEach((item) => {
    const baselineDepth = normalizeOptionalNumber(item?.depth)
    if (baselineDepth === null) {
      return
    }

    const diff = Math.abs(rawDepth - baselineDepth)
    // 修复说明：不同批次同一节点的深度在现网存在 0.01 级别浮动，若仍按完全相等匹配会漏算节点；这里允许小范围近似匹配。
    if (diff <= 0.1 && diff < bestDiff) {
      bestCandidate = item
      bestDiff = diff
    }
  })

  return bestCandidate
}

function roundCalculatedNumber(value, digits = 6) {
  if (!Number.isFinite(value)) {
    return null
  }

  return Number(value.toFixed(digits))
}

function buildWarningResult(currentDisplacement, hole) {
  const safeCurrentDisplacement = normalizeOptionalNumber(currentDisplacement) || 0
  const absCurrentDisplacement = Math.abs(safeCurrentDisplacement)
  const yellowThreshold = normalizeOptionalNumber(hole?.warning_yellow_threshold)
  const redThreshold = normalizeOptionalNumber(hole?.warning_red_threshold)

  // 修复说明：用户要求测孔预警按“本次变形值 current_displacement”命中黄/红阈值触发，不能再沿用旧的累计变形单阈值逻辑。
  if (redThreshold !== null && absCurrentDisplacement >= redThreshold) {
    return {
      warningLevel: 'alarm',
      historyLevel: 'red',
      thresholdValue: redThreshold,
      warningMessage: `本次变形值${safeCurrentDisplacement.toFixed(2)}mm已超过红色预警值${redThreshold}mm`
    }
  }

  if (yellowThreshold !== null && absCurrentDisplacement >= yellowThreshold) {
    return {
      warningLevel: 'warning',
      historyLevel: 'yellow',
      thresholdValue: yellowThreshold,
      warningMessage: `本次变形值${safeCurrentDisplacement.toFixed(2)}mm已超过黄色预警值${yellowThreshold}mm`
    }
  }

  return {
    warningLevel: 'normal',
    historyLevel: null,
    thresholdValue: null,
    warningMessage: ''
  }
}

function groupMeasurementsByBatch(rawMeasurements) {
  const groupedMap = new Map()

  ;(Array.isArray(rawMeasurements) ? rawMeasurements : []).forEach((item) => {
    const batchKey = String(item.batch_number || item.measurement_time || item.id)
    if (!groupedMap.has(batchKey)) {
      groupedMap.set(batchKey, [])
    }
    groupedMap.get(batchKey).push(item)
  })

  return Array.from(groupedMap.entries())
    .map(([batchKey, items]) => ({
      batchKey,
      measurementTime: new Date(items[0].measurement_time).getTime(),
      items: items
        .slice()
        // 修复说明：成果数据按深度逐点计算时需要保持稳定顺序，这里按深度从浅到深遍历，便于和页面展示及对账结果一致。
        .sort((left, right) => (normalizeOptionalNumber(left.depth) || 0) - (normalizeOptionalNumber(right.depth) || 0))
    }))
    .sort((left, right) => left.measurementTime - right.measurementTime)
}

module.exports = {
  async recomputeHoleProcessedResults(holeId) {
    const normalizedHoleId = Number(holeId)
    if (!Number.isInteger(normalizedHoleId) || normalizedHoleId <= 0) {
      throw new Error('测孔ID无效，无法重算成果数据')
    }

    const hole = await MonitoringHole.findOne({ id: normalizedHoleId })
    if (!hole) {
      throw new Error('测孔不存在，无法重算成果数据')
    }

    if (!hole.initial_pipe_batch_number) {
      return {
        holeId: normalizedHoleId,
        initialBatchNumber: null,
        processedCount: 0,
        skipped: true,
        reason: 'hole_has_no_initial_pipe_batch'
      }
    }

    const baselineRows = await RawMeasurementData.find({
      hole_id: normalizedHoleId,
      batch_number: hole.initial_pipe_batch_number
    })

    if (!baselineRows.length) {
      throw new Error('测孔已记录初始管形批次，但未找到对应原始数据')
    }

    // 修复说明：重设初始管形值后，旧成果数据全部会失效，这里按测孔整体清空后重建，避免新旧基准混用。
    await ProcessedResultData.destroy({ hole_id: normalizedHoleId })
    // 修复说明：测孔预警历史直接依附成果重算结果，重算前先清空旧历史，避免旧阈值下的预警记录残留。
    await HoleWarningHistory.destroy({ hole_id: normalizedHoleId })

    const allHoleMeasurements = await RawMeasurementData.find({ hole_id: normalizedHoleId })
    const baselineMeasurementTime = new Date(baselineRows[0].measurement_time).getTime()
    const groupedMeasurements = groupMeasurementsByBatch(allHoleMeasurements)
      .filter(group => group.batchKey === String(hole.initial_pipe_batch_number) || group.measurementTime > baselineMeasurementTime)

    const latestProcessedBySeries = new Map()
    const processedRows = []
    let warningHistoryCount = 0

    for (const group of groupedMeasurements) {
      for (const rawMeasurement of group.items) {
        const baselineMeasurement = findBestBaselineMeasurement(rawMeasurement, baselineRows)
        if (!baselineMeasurement) {
          continue
        }
        const seriesKey = String(baselineMeasurement.id)

        const currentPipeValue = normalizeOptionalNumber(rawMeasurement.pipe_shape_value)
        const initialPipeValue = normalizeOptionalNumber(baselineMeasurement.pipe_shape_value)
        if (currentPipeValue === null || initialPipeValue === null) {
          continue
        }

        const previousProcessed = latestProcessedBySeries.get(seriesKey) || null
        const previousPipeValue = previousProcessed ? normalizeOptionalNumber(previousProcessed.current_pipe_value) : null
        const cumulativeDisplacement = roundCalculatedNumber(currentPipeValue - initialPipeValue)
        const currentDisplacement = roundCalculatedNumber(
          previousPipeValue === null ? 0 : currentPipeValue - previousPipeValue
        )

        let deformationRate = 0
        if (previousProcessed && previousProcessed.measurement_time) {
          const timeDiffSeconds = (
            new Date(rawMeasurement.measurement_time).getTime() - new Date(previousProcessed.measurement_time).getTime()
          ) / 1000
          if (timeDiffSeconds > 0) {
            // 修复说明：用户明确要求变形速率按秒计算，因此这里直接使用“本次变形值 / 秒差”。
            deformationRate = roundCalculatedNumber(currentDisplacement / timeDiffSeconds, 8)
          }
        }

        const warningResult = buildWarningResult(currentDisplacement, hole)
        const processedPayload = {
          raw_data_id: rawMeasurement.id,
          hole_id: normalizedHoleId,
          device_id: rawMeasurement.device_id,
          measurement_time: rawMeasurement.measurement_time,
          depth: rawMeasurement.depth,
          Y_average: normalizeOptionalNumber(rawMeasurement.y_average) || 0,
          inclination_angle: normalizeOptionalNumber(rawMeasurement.inclination_angle) || 0,
          depth_offset: normalizeOptionalNumber(rawMeasurement.depth_offset) || 0,
          current_pipe_value: currentPipeValue,
          initial_pipe_value: initialPipeValue,
          cumulative_displacement: cumulativeDisplacement,
          previous_pipe_value: previousPipeValue,
          current_displacement: currentDisplacement,
          deformation_rate: deformationRate,
          warning_level: warningResult.warningLevel,
          warning_message: warningResult.warningMessage,
          processed_time: new Date()
        }

        const created = await ProcessedResultData.create(processedPayload).fetch()
        processedRows.push(created)
        latestProcessedBySeries.set(seriesKey, created)

        if (warningResult.historyLevel) {
          warningHistoryCount += 1
          await HoleWarningHistory.create({
            hole_id: normalizedHoleId,
            processed_result_id: created.id,
            raw_data_id: rawMeasurement.id,
            batch_number: rawMeasurement.batch_number || null,
            measurement_time: rawMeasurement.measurement_time,
            depth: rawMeasurement.depth,
            warning_level: warningResult.historyLevel,
            threshold_value: warningResult.thresholdValue,
            current_displacement: currentDisplacement,
            warning_message: warningResult.warningMessage
          })
        }

        await RawMeasurementData.updateOne({ id: rawMeasurement.id }).set({
          data_status: 'processed',
          processed_time: new Date()
        })
      }
    }

    if (hole.status === 'warning') {
      await MonitoringHole.updateOne({ id: normalizedHoleId }).set({
        status: 'active',
        warning_count: warningHistoryCount
      })
    } else {
      await MonitoringHole.updateOne({ id: normalizedHoleId }).set({
        warning_count: warningHistoryCount
      })
    }

    return {
      holeId: normalizedHoleId,
      initialBatchNumber: hole.initial_pipe_batch_number,
      processedCount: processedRows.length,
      warningHistoryCount,
      skipped: false
    }
  }
}
