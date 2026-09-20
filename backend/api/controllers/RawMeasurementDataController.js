const AuthSupportService = require('../services/AuthSupportService')
const MeasurementProcessingService = require('../services/MeasurementProcessingService')

function parsePositiveInteger(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseDateValue(value) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function buildPagination(page, limit, total) {
  const safePage = Math.max(Number(page) || 1, 1)
  const safeLimit = Math.max(Number(limit) || 10, 1)
  return {
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.ceil(total / safeLimit)
  }
}

function getAdminApiConfig() {
  const adminApiBaseUrl = AuthSupportService.getAdminApiBaseUrl().replace(/\/$/, '')
  const clientKey = AuthSupportService.getAdminClientKey()
  return { adminApiBaseUrl, clientKey }
}

async function requestAdminApi(pathname, options = {}) {
  const { adminApiBaseUrl, clientKey } = getAdminApiConfig()

  if (!adminApiBaseUrl) {
    throw new Error('未配置 ADMIN_API_BASE_URL')
  }
  if (!clientKey) {
    throw new Error('未配置 ADMIN_CLIENT_KEY 或 CLIENT_KEY')
  }

  const controller = new AbortController()
  const timeoutMs = Number(process.env.ADMIN_API_TIMEOUT_MS || 10000) || 10000
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${adminApiBaseUrl}${pathname}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        'x-client-key': clientKey,
        ...(options.headers || {})
      },
      signal: controller.signal
    })
    const text = await response.text()
    try {
      return {
        statusCode: response.status,
        body: text ? JSON.parse(text) : null
      }
    } catch (error) {
      return {
        statusCode: response.status,
        body: text
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('管理端请求超时')
    }
    throw new Error(`管理端连接失败: ${error.message}`)
  } finally {
    clearTimeout(timer)
  }
}

function normalizeGatewayPoints(payload) {
  const points = Array.isArray(payload?.points)
    ? payload.points
    : (Array.isArray(payload) ? payload : [])

  return points.map((item, index) => ({
    // 修复说明：客户端点位弹窗需要稳定的 idx/node/depth/value 字段，这里直接按管理端/通讯服务统一结构做归一化。
    idx: item?.idx ?? index,
    node: item?.node ?? null,
    depth: item?.depth ?? null,
    value: item?.value ?? null
  }))
}

function createLocalMeasurementMap(records = []) {
  return new Map(
    (Array.isArray(records) ? records : [])
      .filter(item => item?.measurement_uuid)
      .map(item => [item.measurement_uuid, item])
  )
}

function buildMeasurementDetailRows(rawMeasurements, localMeasurementMap, positivePoints = [], negativePoints = []) {
  return (Array.isArray(rawMeasurements) ? rawMeasurements : [])
    .map((item, index) => {
      const localMeasurement = localMeasurementMap.get(item.measurement_uuid) || {}
      const positivePoint = Array.isArray(positivePoints) ? (positivePoints[index] || {}) : {}
      const negativePoint = Array.isArray(negativePoints) ? (negativePoints[index] || {}) : {}
      return {
        measurementUuid: item.measurement_uuid || null,
        // 修复说明：客户端明细弹窗仍需显示节点号，这里按管理端回传点位顺序把 node/idx 与本地计算结果重新对齐。
        idx: positivePoint.idx ?? negativePoint.idx ?? index,
        node: positivePoint.node ?? negativePoint.node ?? null,
        depth: item.depth ?? positivePoint.depth ?? negativePoint.depth ?? null,
        positiveValue: item.positive_value ?? positivePoint.value ?? null,
        negativeValue: item.negative_value ?? negativePoint.value ?? null,
        yAverage: localMeasurement.y_average ?? null,
        inclinationAngle: localMeasurement.inclination_angle ?? null,
        depthOffset: localMeasurement.depth_offset ?? null,
        pipeShapeValue: localMeasurement.pipe_shape_value ?? null,
        batchNumber: item.batch_number || null
      }
    })
    // 修复说明：用户要求明细按深度从浅到深展示，这里按深度升序排序；仅调整展示顺序，不影响回调入库时“从孔底往上累加”的计算结果。
    .sort((left, right) => (Number(left.depth) || 0) - (Number(right.depth) || 0))
}

function formatBeijingDateTime(value) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  const parts = formatter.formatToParts(date)
  const partMap = Object.fromEntries(parts.map(item => [item.type, item.value]))
  return `${partMap.year}-${partMap.month}-${partMap.day} ${partMap.hour}:${partMap.minute}:${partMap.second}`
}

function normalizeTaskMeasurementTime(task) {
  const rawMeasurements = Array.isArray(task?.resultPayload?.rawMeasurements) ? task.resultPayload.rawMeasurements : []
  // 修复说明：客户端原始数据“监测时间”应与管理端任务完成时间保持一致；
  // 现网网关回传的 measurement_time 会以 UTC 串回传，直接显示会少 8 小时，因此这里改为优先使用任务 completedAt 并在后端直接转成北京时间字符串。
  const candidate = task?.completedAt || rawMeasurements[0]?.measurement_time || task?.createdAt || null
  return formatBeijingDateTime(candidate)
}

function buildTaskRelatedHole(task) {
  const metadata = task?.metadata || {}
  const projectName = metadata.projectName || '--'
  const holeName = metadata.holeName || metadata.holeNumber || '--'
  return `${projectName} / ${holeName}`
}

function mapTaskAsRawData(task, localMeasurementMap = new Map()) {
  const metadata = task?.metadata || {}
  const resultPayload = task?.resultPayload || {}
  const rawMeasurements = Array.isArray(resultPayload.rawMeasurements) ? resultPayload.rawMeasurements : []
  const gatewayResultPoint = resultPayload.gatewayResultPoint || {}
  const positivePayload = gatewayResultPoint.result_a0_json || null
  const negativePayload = gatewayResultPoint.result_a180_json || null
  const positivePoints = normalizeGatewayPoints(positivePayload)
  const negativePoints = normalizeGatewayPoints(negativePayload)
  const detailRows = buildMeasurementDetailRows(rawMeasurements, localMeasurementMap, positivePoints, negativePoints)

  return {
    id: task.taskId,
    taskId: task.taskId,
    measurementTime: normalizeTaskMeasurementTime(task),
    relatedHole: buildTaskRelatedHole(task),
    upperImei: task.imei || null,
    lowerDeviceCode: rawMeasurements[0]?.device_code || metadata.lowerDeviceCode || null,
    nodeNum: gatewayResultPoint.node_num || detailRows.length || 0,
    detailRows,
    holeId: parsePositiveInteger(metadata.sourceHoleId || metadata.holeId) || rawMeasurements[0]?.hole_id || null,
    hasInitialPipeValue: Boolean(metadata.initialPipeBatchNumber),
    initialPipeBatchNumber: metadata.initialPipeBatchNumber || null,
    metadata,
    status: task.status,
    createdAt: task.createdAt,
    completedAt: task.completedAt
  }
}

function filterTaskByQuery(task, query) {
  const metadata = task?.metadata || {}
  const projectId = parsePositiveInteger(query.project_id)
  const holeId = parsePositiveInteger(query.hole_id)
  const upperImei = String(query.upper_imei || '').trim()
  const startTime = parseDateValue(query.start_time)
  const endTime = parseDateValue(query.end_time)
  const measurementTime = parseDateValue(normalizeTaskMeasurementTime(task))

  if (projectId) {
    const taskProjectId = parsePositiveInteger(metadata.sourceProjectId || metadata.projectId)
    if (taskProjectId !== projectId) {
      return false
    }
  }
  if (holeId) {
    const taskHoleId = parsePositiveInteger(metadata.sourceHoleId || metadata.holeId)
    if (taskHoleId !== holeId) {
      return false
    }
  }
  if (upperImei && String(task?.imei || '').trim() !== upperImei) {
    return false
  }
  if (startTime && (!measurementTime || measurementTime < startTime)) {
    return false
  }
  if (endTime && (!measurementTime || measurementTime > endTime)) {
    return false
  }
  return true
}

module.exports = {
  find: async function(req, res) {
    try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1)
      const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1)
      const startTime = parseDateValue(req.query.start_time)
      const endTime = parseDateValue(req.query.end_time)

      if (req.query.start_time && !startTime) {
        return res.status(400).json({ success: false, message: '开始监测时间格式无效' })
      }
      if (req.query.end_time && !endTime) {
        return res.status(400).json({ success: false, message: '结束监测时间格式无效' })
      }
      const queryString = new URLSearchParams()
      queryString.set('limit', '500')
      queryString.set('status', 'completed')
      if (req.query.upper_imei) {
        // 修复说明：上位机 IMEI 是管理端任务列表支持的原生过滤条件，优先下推到管理端减少无关任务返回量。
        queryString.set('imei', String(req.query.upper_imei).trim())
      }

      const response = await requestAdminApi(`/tasks?${queryString.toString()}`, {
        method: 'GET'
      })
      if (response.statusCode !== 200 || !response.body?.success) {
        return res.status(response.statusCode || 502).json({
          success: false,
          message: response.body?.details || response.body?.error || response.body?.message || '查询任务原始数据失败',
          details: response.body?.details || null
        })
      }

      const tasks = Array.isArray(response.body?.data) ? response.body.data : []
      const filteredTasks = tasks
        .filter(task => task?.resultPayload?.gatewayResultPoint)
        .filter(task => filterTaskByQuery(task, req.query))
        .sort((left, right) => {
          const leftTime = parseDateValue(normalizeTaskMeasurementTime(left)) || parseDateValue(left?.createdAt) || new Date(0)
          const rightTime = parseDateValue(normalizeTaskMeasurementTime(right)) || parseDateValue(right?.createdAt) || new Date(0)
          return rightTime - leftTime
        })
      const total = filteredTasks.length
      const skip = (page - 1) * limit
      const pagedTasks = filteredTasks.slice(skip, skip + limit)
      const measurementUuids = [...new Set(
        pagedTasks.flatMap(task => {
          const rawMeasurements = Array.isArray(task?.resultPayload?.rawMeasurements) ? task.resultPayload.rawMeasurements : []
          return rawMeasurements.map(item => item?.measurement_uuid).filter(Boolean)
        })
      )]
      const localMeasurements = measurementUuids.length > 0
        ? await RawMeasurementData.find({ measurement_uuid: measurementUuids })
        : []
      const localMeasurementMap = createLocalMeasurementMap(localMeasurements)
      const holeIds = [...new Set(
        pagedTasks
          .map(task => parsePositiveInteger(task?.metadata?.sourceHoleId || task?.metadata?.holeId))
          .filter(Boolean)
      )]
      const holes = holeIds.length > 0 ? await MonitoringHole.find({ id: holeIds }) : []
      const holeMap = Object.fromEntries(holes.map(item => [item.id, item]))
      const list = pagedTasks.map(task => {
        const mapped = mapTaskAsRawData(task, localMeasurementMap)
        const hole = mapped.holeId ? holeMap[mapped.holeId] || null : null
        return {
          ...mapped,
          hasInitialPipeValue: Boolean(hole?.initial_pipe_batch_number),
          initialPipeBatchNumber: hole?.initial_pipe_batch_number || null
        }
      })

      return res.json({
        success: true,
        data: {
          list,
          pagination: buildPagination(page, limit, total)
        }
      })
    } catch (err) {
      return res.serverError(err)
    }
  },
  
  findOne: async function(req, res) {
    try {
      const response = await requestAdminApi(`/tasks/${encodeURIComponent(req.params.id)}`, {
        method: 'GET'
      })
      if (response.statusCode === 404 || !response.body?.data) {
        return res.status(404).json({
          success: false,
          message: '任务原始数据不存在'
        })
      }
      if (response.statusCode !== 200 || !response.body?.success) {
        return res.status(response.statusCode || 502).json({
          success: false,
          message: response.body?.details || response.body?.error || response.body?.message || '查询任务原始数据详情失败',
          details: response.body?.details || null
        })
      }

      const task = response.body.data
      if (!task?.resultPayload?.gatewayResultPoint) {
        return res.status(404).json({
          success: false,
          message: '任务尚未产生原始结果数据'
        })
      }

      const measurementUuids = [...new Set(
        (Array.isArray(task?.resultPayload?.rawMeasurements) ? task.resultPayload.rawMeasurements : [])
          .map(item => item?.measurement_uuid)
          .filter(Boolean)
      )]
      const localMeasurements = measurementUuids.length > 0
        ? await RawMeasurementData.find({ measurement_uuid: measurementUuids })
        : []
      const localMeasurementMap = createLocalMeasurementMap(localMeasurements)
      const mappedTask = mapTaskAsRawData(task, localMeasurementMap)
      const hole = mappedTask.holeId ? await MonitoringHole.findOne({ id: mappedTask.holeId }) : null

      return res.json({
        success: true,
        data: {
          ...mappedTask,
          hasInitialPipeValue: Boolean(hole?.initial_pipe_batch_number),
          initialPipeBatchNumber: hole?.initial_pipe_batch_number || null
        }
      })
    } catch (err) {
      return res.serverError(err)
    }
  },
  
  create: async function(req, res) {
    try {
      const {
        measurement_uuid,
        hole_id,
        device_id,
        measurement_time,
        measurement_mode,
        operator_id,
        batch_number,
        node,
        depth,
        positive_value,
        negative_value,
        temperature,
        battery_voltage,
        signal_strength,
        data_status,
        quality_flag
      } = req.body;
      
      if (!measurement_uuid) {
        return res.status(400).json({
          success: false,
          message: '测量UUID是必填的'
        });
      }
      
      if (!hole_id) {
        return res.status(400).json({
          success: false,
          message: '测孔ID是必填的'
        });
      }
      
      if (!device_id) {
        return res.status(400).json({
          success: false,
          message: '设备ID是必填的'
        });
      }
      
      if (!measurement_time) {
        return res.status(400).json({
          success: false,
          message: '测量时间是必填的'
        });
      }
      
      if (!measurement_mode) {
        return res.status(400).json({
          success: false,
          message: '测量模式是必填的'
        });
      }
      
      if (depth === undefined || depth === null) {
        return res.status(400).json({
          success: false,
          message: '测量深度是必填的'
        });
      }
      
      if (positive_value === undefined || positive_value === null) {
        return res.status(400).json({
          success: false,
          message: '正测AD值是必填的'
        });
      }
      
      if (negative_value === undefined || negative_value === null) {
        return res.status(400).json({
          success: false,
          message: '反测AD值是必填的'
        });
      }
      
      const existingData = await RawMeasurementData.findOne({ measurement_uuid: measurement_uuid });
      
      if (existingData) {
        return res.status(400).json({
          success: false,
          message: '测量UUID已存在'
        });
      }
      
      const hole = await MonitoringHole.findOne({ id: hole_id });
      if (!hole) {
        return res.status(400).json({
          success: false,
          message: '测孔不存在'
        });
      }
      
      const device = await Device.findOne({ id: device_id });
      if (!device) {
        return res.status(400).json({
          success: false,
          message: '设备不存在'
        });
      }
      
      const validModes = ['manual', 'auto', 'scheduled'];
      const validDataStatuses = ['raw', 'processed', 'invalid', 'warning'];
      const validQualityFlags = ['good', 'fair', 'poor'];
      
      const record = await RawMeasurementData.create({
        measurement_uuid,
        hole_id: parseInt(hole_id),
        device_id: parseInt(device_id),
        measurement_time: parseInt(measurement_time),
        measurement_mode: validModes.includes(measurement_mode) ? measurement_mode : 'manual',
        operator_id: operator_id ? parseInt(operator_id) : null,
        batch_number: batch_number || null,
        node: node === undefined || node === null || node === '' ? null : parseInt(node),
        depth: parseFloat(depth),
        positive_value: parseFloat(positive_value),
        negative_value: parseFloat(negative_value),
        temperature: temperature !== undefined ? parseFloat(temperature) : null,
        battery_voltage: battery_voltage !== undefined ? parseFloat(battery_voltage) : null,
        signal_strength: signal_strength !== undefined ? parseFloat(signal_strength) : null,
        data_status: validDataStatuses.includes(data_status) ? data_status : 'raw',
        quality_flag: validQualityFlags.includes(quality_flag) ? quality_flag : 'good',
        upload_time: Date.now(),
        processed_time: null
      }).fetch();
      
      return res.json({
        success: true,
        message: '测量数据上传成功',
        data: record
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  batchCreate: async function(req, res) {
    try {
      const { data: dataList } = req.body;
      
      if (!Array.isArray(dataList) || dataList.length === 0) {
        return res.status(400).json({
          success: false,
          message: '请提供有效的测量数据数组'
        });
      }
      
      const validModes = ['manual', 'auto', 'scheduled'];
      const validDataStatuses = ['raw', 'processed', 'invalid', 'warning'];
      const validQualityFlags = ['good', 'fair', 'poor'];
      
      const createdRecords = [];
      const errors = [];
      
      for (let i = 0; i < dataList.length; i++) {
        const item = dataList[i];
        
        try {
          if (!item.measurement_uuid) {
            errors.push({ index: i, message: '测量UUID是必填的' });
            continue;
          }
          
          if (!item.hole_id || !item.device_id || !item.measurement_time || !item.measurement_mode || 
              item.depth === undefined || item.positive_value === undefined || item.negative_value === undefined) {
            errors.push({ index: i, message: '缺少必填字段' });
            continue;
          }
          
          const existingData = await RawMeasurementData.findOne({ measurement_uuid: item.measurement_uuid });
          if (existingData) {
            errors.push({ index: i, message: '测量UUID已存在' });
            continue;
          }
          
          const record = await RawMeasurementData.create({
            measurement_uuid: item.measurement_uuid,
            hole_id: parseInt(item.hole_id),
            device_id: parseInt(item.device_id),
            measurement_time: parseInt(item.measurement_time),
            measurement_mode: validModes.includes(item.measurement_mode) ? item.measurement_mode : 'manual',
            operator_id: item.operator_id ? parseInt(item.operator_id) : null,
            batch_number: item.batch_number || null,
            node: item.node === undefined || item.node === null || item.node === '' ? null : parseInt(item.node),
            depth: parseFloat(item.depth),
            positive_value: parseFloat(item.positive_value),
            negative_value: parseFloat(item.negative_value),
            temperature: item.temperature !== undefined ? parseFloat(item.temperature) : null,
            battery_voltage: item.battery_voltage !== undefined ? parseFloat(item.battery_voltage) : null,
            signal_strength: item.signal_strength !== undefined ? parseFloat(item.signal_strength) : null,
            data_status: validDataStatuses.includes(item.data_status) ? item.data_status : 'raw',
            quality_flag: validQualityFlags.includes(item.quality_flag) ? item.quality_flag : 'good',
            upload_time: Date.now(),
            processed_time: null
          }).fetch();
          
          createdRecords.push(record);
        } catch (err) {
          errors.push({ index: i, message: err.message || '创建失败' });
        }
      }
      
      return res.json({
        success: true,
        message: `成功上传 ${createdRecords.length} 条数据`,
        data: {
          created: createdRecords.length,
          failed: errors.length,
          records: createdRecords,
          errors: errors
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  updateStatus: async function(req, res) {
    try {
      const { id } = req.params;
      const { data_status, quality_flag, processed_time } = req.body;
      
      const data = await RawMeasurementData.findOne({ id });
      
      if (!data) {
        return res.status(404).json({
          success: false,
          message: '测量数据不存在'
        });
      }
      
      const updateData = {};
      
      const validDataStatuses = ['raw', 'processed', 'invalid', 'warning'];
      if (data_status && validDataStatuses.includes(data_status)) {
        updateData.data_status = data_status;
      }
      
      const validQualityFlags = ['good', 'fair', 'poor'];
      if (quality_flag && validQualityFlags.includes(quality_flag)) {
        updateData.quality_flag = quality_flag;
      }
      
      if (processed_time !== undefined) {
        updateData.processed_time = parseInt(processed_time);
      }
      
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          message: '没有有效的更新字段'
        });
      }
      
      const updatedData = await RawMeasurementData.updateOne({ id }).set(updateData);
      
      return res.json({
        success: true,
        message: '数据状态更新成功',
        data: updatedData
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  setInitialPipeValue: async function(req, res) {
    try {
      const measurementUuids = Array.isArray(req.body?.measurementUuids)
        ? req.body.measurementUuids.map(item => String(item || '').trim()).filter(Boolean)
        : []

      if (!measurementUuids.length) {
        return res.status(400).json({
          success: false,
          message: '缺少用于设置初始管形值的原始数据标识'
        })
      }

      const measurements = await RawMeasurementData.find({ measurement_uuid: measurementUuids })
      if (!measurements.length) {
        return res.status(404).json({
          success: false,
          message: '未找到对应的原始数据'
        })
      }

      const holeIds = [...new Set(measurements.map(item => item.hole_id).filter(Boolean))]
      const batchNumbers = [...new Set(measurements.map(item => item.batch_number).filter(Boolean))]
      if (holeIds.length !== 1 || batchNumbers.length !== 1) {
        return res.status(400).json({
          success: false,
          message: '设置初始管形值时，所选原始数据必须属于同一测孔和同一批次'
        })
      }

      const hole = await MonitoringHole.updateOne({ id: holeIds[0] }).set({
        // 修复说明：初始管形值按“整批监测”生效，因此这里只记录批次号，不把单个深度值错误地下沉到测孔主表。
        initial_pipe_batch_number: batchNumbers[0]
      })

      if (!hole) {
        return res.status(404).json({
          success: false,
          message: '关联测孔不存在'
        })
      }

      const recomputeResult = await MeasurementProcessingService.recomputeHoleProcessedResults(hole.id)

      return res.json({
        success: true,
        message: '初始管形值设置成功，已同步重算成果数据',
        data: {
          holeId: hole.id,
          initialPipeBatchNumber: hole.initial_pipe_batch_number,
          recomputeResult
        }
      })
    } catch (err) {
      return res.serverError(err)
    }
  },
  
  findByBatch: async function(req, res) {
    try {
      const { batch_number } = req.params;
      const { page = 1, limit = 50 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const query = { batch_number: batch_number };
      
      const data = await RawMeasurementData.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('depth ASC');
      
      const total = await RawMeasurementData.count(query);
      
      return res.json({
        success: true,
        data: {
          list: data,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  export: async function(req, res) {
    try {
      const { hole_id, device_id, start_time, end_time, data_status, batch_number } = req.query;
      
      let query = {};
      
      if (hole_id) {
        query.hole_id = parseInt(hole_id);
      }
      
      if (device_id) {
        query.device_id = parseInt(device_id);
      }
      
      if (batch_number) {
        query.batch_number = batch_number;
      }
      
      const validDataStatuses = ['raw', 'processed', 'invalid', 'warning'];
      if (data_status && validDataStatuses.includes(data_status)) {
        query.data_status = data_status;
      }
      
      if (start_time || end_time) {
        query.measurement_time = {};
        if (start_time) {
          query.measurement_time['>='] = parseInt(start_time);
        }
        if (end_time) {
          query.measurement_time['<='] = parseInt(end_time);
        }
      }
      
      const data = await RawMeasurementData.find(query)
        .sort('measurement_time DESC, depth ASC');
      
      const holeIds = [...new Set(data.filter(d => d.hole_id).map(d => d.hole_id))];
      const deviceIds = [...new Set(data.filter(d => d.device_id).map(d => d.device_id))];
      
      let holes = [];
      let devices = [];
      
      if (holeIds.length > 0) {
        holes = await MonitoringHole.find({ id: holeIds });
      }
      
      if (deviceIds.length > 0) {
        devices = await Device.find({ id: deviceIds });
      }
      
      const holeMap = {};
      holes.forEach(h => { holeMap[h.id] = h; });
      
      const deviceMap = {};
      devices.forEach(d => { deviceMap[d.id] = d; });
      
      const exportData = data.map(item => ({
        measurement_uuid: item.measurement_uuid,
        hole_number: holeMap[item.hole_id]?.hole_number || '',
        hole_name: holeMap[item.hole_id]?.hole_name || '',
        device_id: deviceMap[item.device_id]?.device_id || '',
        device_name: deviceMap[item.device_id]?.device_name || '',
        measurement_time: item.measurement_time,
        measurement_mode: item.measurement_mode,
        batch_number: item.batch_number || '',
        depth: item.depth,
        positive_value: item.positive_value,
        negative_value: item.negative_value,
        // 修复说明：原始数据表新增了回调即算的派生参数，导出结果也需要同步带出，避免库里有值但导出缺列。
        y_average: item.y_average,
        inclination_angle: item.inclination_angle,
        depth_offset: item.depth_offset,
        pipe_shape_value: item.pipe_shape_value,
        temperature: item.temperature,
        battery_voltage: item.battery_voltage,
        signal_strength: item.signal_strength,
        data_status: item.data_status,
        quality_flag: item.quality_flag,
        upload_time: item.upload_time
      }));
      
      return res.json({
        success: true,
        data: exportData
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
