const AuthSupportService = require('../services/AuthSupportService');

function parseDateFilter(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseIdList(value) {
  const sourceValues = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(
    sourceValues
      .map(item => parseInt(String(item).trim(), 10))
      .filter(item => Number.isInteger(item) && item > 0)
  )];
}

function formatBeijingDateTime(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
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
  });
  const parts = formatter.formatToParts(date);
  const partMap = Object.fromEntries(parts.map(item => [item.type, item.value]));
  return `${partMap.year}-${partMap.month}-${partMap.day} ${partMap.hour}:${partMap.minute}:${partMap.second}`;
}

function getAdminApiConfig() {
  const adminApiBaseUrl = AuthSupportService.getAdminApiBaseUrl().replace(/\/$/, '');
  const clientKey = AuthSupportService.getAdminClientKey();
  return { adminApiBaseUrl, clientKey };
}

async function requestAdminApi(pathname, options = {}) {
  const { adminApiBaseUrl, clientKey } = getAdminApiConfig();

  if (!adminApiBaseUrl) {
    throw new Error('未配置 ADMIN_API_BASE_URL');
  }
  if (!clientKey) {
    throw new Error('未配置 ADMIN_CLIENT_KEY 或 CLIENT_KEY');
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.ADMIN_API_TIMEOUT_MS || 10000) || 10000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${adminApiBaseUrl}${pathname}`, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        'x-client-key': clientKey,
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch (error) {
        body = { raw: text };
      }
    }

    return {
      statusCode: response.status,
      body
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('管理端请求超时');
    }
    throw new Error(`管理端连接失败: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeGatewayPoints(payload) {
  const points = Array.isArray(payload?.points)
    ? payload.points
    : (Array.isArray(payload) ? payload : []);

  return points.map((item, index) => ({
    idx: item?.idx ?? index,
    node: item?.node ?? null,
    depth: item?.depth ?? null,
    value: item?.value ?? null
  }));
}

async function buildAdminMeasurementMetaMap(measurementUuids = []) {
  const targetMeasurementUuids = new Set(
    (Array.isArray(measurementUuids) ? measurementUuids : []).filter(Boolean)
  );
  const measurementMetaMap = new Map();

  if (!targetMeasurementUuids.size) {
    return measurementMetaMap;
  }

  const queryString = new URLSearchParams();
  queryString.set('limit', '500');
  queryString.set('status', 'completed');

  const response = await requestAdminApi(`/tasks?${queryString.toString()}`, {
    method: 'GET'
  });
  if (response.statusCode !== 200 || !response.body?.success) {
    return measurementMetaMap;
  }

  const tasks = Array.isArray(response.body?.data) ? response.body.data : [];
  tasks.forEach((task) => {
    const resultPayload = task?.resultPayload || {};
    const rawMeasurements = Array.isArray(resultPayload.rawMeasurements) ? resultPayload.rawMeasurements : [];
    const gatewayResultPoint = resultPayload.gatewayResultPoint || {};
    const positivePoints = normalizeGatewayPoints(gatewayResultPoint.result_a0_json);
    const negativePoints = normalizeGatewayPoints(gatewayResultPoint.result_a180_json);

    rawMeasurements.forEach((item, index) => {
      const measurementUuid = item?.measurement_uuid;
      if (!targetMeasurementUuids.has(measurementUuid) || measurementMetaMap.has(measurementUuid)) {
        return;
      }

      const positivePoint = positivePoints[index] || {};
      const negativePoint = negativePoints[index] || {};
      const node = positivePoint.node ?? negativePoint.node ?? null;
      measurementMetaMap.set(measurementUuid, {
        node: node !== null && node !== undefined && node !== '' ? node : null,
        completedAt: task?.completedAt || null
      });
    });
  });

  return measurementMetaMap;
}

function buildSeverityRank(level) {
  const rankMap = { normal: 0, warning: 1, alarm: 2 };
  return rankMap[level] || 0;
}

function buildResultGroupKey(result, rawMeasurement) {
  return [
    result.hole_id || '',
    rawMeasurement?.batch_number || '',
    result.measurement_time ? new Date(result.measurement_time).getTime() : ''
  ].join('|');
}

function sortDetailRowsByDepth(left, right) {
  return Number(left.depth || 0) - Number(right.depth || 0);
}

function buildCurveDisplayName(aggregated) {
  const measurementTimeText = formatBeijingDateTime(aggregated?.measurement_time) || '-';
  return `${aggregated?.project_name || '-'} / ${aggregated?.hole_code || '-'} / ${measurementTimeText}`;
}

async function buildAggregatedResults() {
  const allResults = await ProcessedResultData.find().sort('measurement_time DESC');
  const rawDataIds = [...new Set(allResults.map(item => item.raw_data_id).filter(Boolean))];
  const holeIds = [...new Set(allResults.map(item => item.hole_id).filter(Boolean))];
  const rawMeasurements = rawDataIds.length > 0 ? await RawMeasurementData.find({ id: rawDataIds }) : [];
  const holes = holeIds.length > 0 ? await MonitoringHole.find({ id: holeIds }) : [];
  const projectIds = [...new Set(holes.map(item => item.project_id).filter(Boolean))];
  const projects = projectIds.length > 0 ? await Project.find({ id: projectIds }) : [];

  const rawMeasurementMap = Object.fromEntries(rawMeasurements.map(item => [item.id, item]));
  const measurementUuids = rawMeasurements.map(item => item.measurement_uuid).filter(Boolean);
  const adminMeasurementMetaMap = await buildAdminMeasurementMetaMap(measurementUuids);
  const holeMap = Object.fromEntries(holes.map(item => [item.id, item]));
  const projectMap = Object.fromEntries(projects.map(item => [item.id, item]));
  const aggregatedMap = new Map();

  allResults.forEach((result) => {
    const rawMeasurement = rawMeasurementMap[result.raw_data_id] || null;
    const adminMeasurementMeta = rawMeasurement?.measurement_uuid
      ? adminMeasurementMetaMap.get(rawMeasurement.measurement_uuid) || null
      : null;
    const hole = holeMap[result.hole_id] || null;
    const project = hole?.project_id ? projectMap[hole.project_id] || null : null;
    const groupKey = buildResultGroupKey(result, rawMeasurement);
    const displacementValue = Number(result.current_displacement ?? result.cumulative_displacement ?? 0);
    const currentSeverityRank = buildSeverityRank(result.warning_level);

    if (!aggregatedMap.has(groupKey)) {
      aggregatedMap.set(groupKey, {
        // 修复说明：成果数据管理要求“一次监测一行”，这里以测孔+批次/监测时间聚合，并用最大变形值所在的成果记录 ID 作为该次成果 ID。
        id: result.id,
        group_key: groupKey,
        hole_id: result.hole_id,
        project_id: hole?.project_id || null,
        raw_data_id: result.raw_data_id,
        batch_number: rawMeasurement?.batch_number || null,
        project_name: project?.project_name || '-',
        hole_code: hole?.hole_number || '-',
        // 修复说明：成果数据监测时间与原始数据页保持一致，优先使用管理端任务 completedAt，避免继续沿用网关 measurement_time 导致少 8 小时。
        measurement_time: adminMeasurementMeta?.completedAt || result.measurement_time,
        max_displacement: displacementValue,
        max_depth: result.depth,
        alert_level: result.warning_level || 'normal',
        process_time: result.processed_time,
        severityRank: currentSeverityRank
      });
      return;
    }

    const aggregated = aggregatedMap.get(groupKey);
    aggregated.max_depth = Math.max(Number(aggregated.max_depth || 0), Number(result.depth || 0));
    if (Math.abs(displacementValue) >= Math.abs(Number(aggregated.max_displacement || 0))) {
      aggregated.id = result.id;
      aggregated.raw_data_id = result.raw_data_id;
      aggregated.max_displacement = displacementValue;
      aggregated.process_time = result.processed_time;
    }

    if (currentSeverityRank > aggregated.severityRank) {
      aggregated.alert_level = result.warning_level || 'normal';
      aggregated.severityRank = currentSeverityRank;
    }
  });

  return {
    allResults,
    rawMeasurementMap,
    adminMeasurementMetaMap,
    aggregatedList: Array.from(aggregatedMap.values())
  };
}

function buildGroupDetailRows({ allResults, rawMeasurementMap, adminMeasurementMetaMap, aggregated }) {
  const groupResults = allResults
    .filter(item => buildResultGroupKey(item, rawMeasurementMap[item.raw_data_id] || null) === aggregated.group_key)
    .sort((left, right) => {
      const leftRaw = rawMeasurementMap[left.raw_data_id] || null;
      const rightRaw = rawMeasurementMap[right.raw_data_id] || null;
      return sortDetailRowsByDepth(
        { depth: left.depth, node: leftRaw?.node ?? null },
        { depth: right.depth, node: rightRaw?.node ?? null }
      );
    });

  return groupResults.map((item, index) => {
    const rawMeasurement = rawMeasurementMap[item.raw_data_id] || null;
    const adminMeasurementMeta = rawMeasurement?.measurement_uuid
      ? adminMeasurementMetaMap.get(rawMeasurement.measurement_uuid) || null
      : null;
    return {
      id: item.id,
      raw_data_id: item.raw_data_id,
      // 修复说明：成果数据明细和趋势图必须复用同一套节点匹配逻辑，确保同一批次在列表弹窗与曲线图中的节点号、深度顺序完全一致。
      node: rawMeasurement?.node ?? adminMeasurementMeta?.node ?? (index + 1),
      depth: item.depth,
      current_pipe_value: item.current_pipe_value,
      cumulative_displacement: item.cumulative_displacement,
      previous_pipe_value: item.previous_pipe_value,
      current_displacement: item.current_displacement,
      deformation_rate: item.deformation_rate
    };
  });
}

module.exports = {
  find: async function(req, res) {
    try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
      const holeFilterText = String(req.query.hole_id || '').trim();
      const warningLevelFilter = String(req.query.warning_level || '').trim();
      const startTime = parseDateFilter(req.query.start_time);
      const endTime = parseDateFilter(req.query.end_time);

      const { aggregatedList: sourceAggregatedList } = await buildAggregatedResults();

      let aggregatedList = sourceAggregatedList
        .map(item => ({
          id: item.id,
          group_key: item.group_key,
          hole_id: item.hole_id,
          raw_data_id: item.raw_data_id,
          batch_number: item.batch_number,
          project_name: item.project_name,
          hole_code: item.hole_code,
          measurement_time: item.measurement_time,
          max_displacement: item.max_displacement,
          max_depth: item.max_depth,
          alert_level: item.alert_level,
          process_time: item.process_time
        }))
        .sort((left, right) => new Date(right.measurement_time).getTime() - new Date(left.measurement_time).getTime());

      if (holeFilterText) {
        const parsedHoleId = parseInt(holeFilterText, 10);
        aggregatedList = aggregatedList.filter(item => (
          item.hole_code.includes(holeFilterText) ||
          (!Number.isNaN(parsedHoleId) && item.hole_id === parsedHoleId)
        ));
      }

      if (warningLevelFilter && ['normal', 'warning', 'alarm'].includes(warningLevelFilter)) {
        aggregatedList = aggregatedList.filter(item => item.alert_level === warningLevelFilter);
      }

      if (startTime) {
        aggregatedList = aggregatedList.filter(item => new Date(item.measurement_time) >= startTime);
      }

      if (endTime) {
        aggregatedList = aggregatedList.filter(item => new Date(item.measurement_time) <= endTime);
      }

      const total = aggregatedList.length;
      const skip = (page - 1) * limit;
      const list = aggregatedList.slice(skip, skip + limit).map(item => ({
        ...item,
        // 修复说明：成果数据监测时间直接由后端统一转成北京时间字符串，避免前端按浏览器时区再次解析后出现 8 小时偏差。
        measurement_time: formatBeijingDateTime(item.measurement_time),
        process_time: formatBeijingDateTime(item.process_time)
      }));

      return res.json({
        success: true,
        data: {
          list,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  findAllDetails: async function(req, res) {
    try {
      const resultId = parseInt(req.params.id, 10);
      const { allResults, rawMeasurementMap, adminMeasurementMetaMap, aggregatedList } = await buildAggregatedResults();
      const aggregated = aggregatedList.find(item => item.id === resultId);

      if (!aggregated) {
        return res.status(404).json({
          success: false,
          message: '成果数据不存在'
        });
      }

      const detailRows = buildGroupDetailRows({
        allResults,
        rawMeasurementMap,
        adminMeasurementMetaMap,
        aggregated
      });

      return res.json({
        success: true,
        data: {
          id: aggregated.id,
          project_name: aggregated.project_name,
          hole_code: aggregated.hole_code,
          measurement_time: formatBeijingDateTime(aggregated.measurement_time),
          detailRows
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  findTrends: async function(req, res) {
    try {
      const holeIds = parseIdList(req.query.hole_ids);
      const startTime = parseDateFilter(req.query.start_time);
      const endTime = parseDateFilter(req.query.end_time);
      const { allResults, rawMeasurementMap, adminMeasurementMetaMap, aggregatedList } = await buildAggregatedResults();

      let matchedAggregatedList = aggregatedList
        .map(item => ({
          id: item.id,
          group_key: item.group_key,
          hole_id: item.hole_id,
          project_name: item.project_name,
          hole_code: item.hole_code,
          measurement_time: item.measurement_time,
          alert_level: item.alert_level
        }))
        .sort((left, right) => new Date(right.measurement_time).getTime() - new Date(left.measurement_time).getTime());

      if (holeIds.length > 0) {
        const holeIdSet = new Set(holeIds);
        matchedAggregatedList = matchedAggregatedList.filter(item => holeIdSet.has(item.hole_id));
      }

      if (startTime) {
        matchedAggregatedList = matchedAggregatedList.filter(item => new Date(item.measurement_time) >= startTime);
      }

      if (endTime) {
        matchedAggregatedList = matchedAggregatedList.filter(item => new Date(item.measurement_time) <= endTime);
      }

      const series = matchedAggregatedList.map((aggregated) => {
        const detailRows = buildGroupDetailRows({
          allResults,
          rawMeasurementMap,
          adminMeasurementMetaMap,
          aggregated
        });
        return {
          result_id: aggregated.id,
          hole_id: aggregated.hole_id,
          hole_code: aggregated.hole_code,
          project_name: aggregated.project_name,
          alert_level: aggregated.alert_level,
          measurement_time: formatBeijingDateTime(aggregated.measurement_time),
          curve_name: buildCurveDisplayName(aggregated),
          // 修复说明：趋势图和右侧成果列表现在要求严格联动，这里直接返回当前曲线对应的完整成果明细，前端无需二次请求或自行拼装数据。
          detail_rows: detailRows.map(item => ({
            id: item.id,
            raw_data_id: item.raw_data_id,
            node: item.node,
            depth: item.depth,
            current_pipe_value: Number(item.current_pipe_value || 0),
            cumulative_displacement: Number(item.cumulative_displacement || 0),
            previous_pipe_value: Number(item.previous_pipe_value || 0),
            current_displacement: Number(item.current_displacement || 0),
            deformation_rate: Number(item.deformation_rate || 0)
          })),
          // 修复说明：趋势图横坐标点位必须与 detail_rows 使用相同的数值安全转换，避免前端 normalizedSeries 因 depth 为 null/undefined 导致 Number() 得到 NaN 后被 isFinite 过滤掉全部曲线。
          points: detailRows.map(item => ({
            id: item.id,
            node: item.node,
            depth: Number(item.depth || 0),
            cumulative_displacement: Number(item.cumulative_displacement || 0),
            current_displacement: Number(item.current_displacement || 0)
          }))
        };
      }).filter(item => item.points.length > 0);

      return res.json({
        success: true,
        data: {
          list: series,
          total: series.length
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  findOne: async function(req, res) {
    try {
      const result = await ProcessedResultData.findOne({ id: req.params.id });
      
      if (!result) {
        return res.status(404).json({
          success: false,
          message: '处理结果不存在'
        });
      }
      
      return res.json({
        success: true,
        data: {
          ...result,
          // 修复说明：详情接口也要和列表保持同一时间口径，统一返回北京时间字符串，避免列表和详情显示不一致。
          measurement_time: formatBeijingDateTime(result.measurement_time),
          processed_time: formatBeijingDateTime(result.processed_time)
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  process: async function(req, res) {
    try {
      const { raw_data_ids, hole_id, device_id } = req.body;
      
      if (!raw_data_ids || !Array.isArray(raw_data_ids) || raw_data_ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: '原始数据ID数组是必填的'
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
      
      const device = await Device.findOne({ id: device_id });
      if (!device) {
        return res.status(404).json({
          success: false,
          message: '设备不存在'
        });
      }
      
      const K = device.K_value || 1;
      const beta = device.beta_value || 0;
      
      const hole = await MonitoringHole.findOne({ id: hole_id });
      if (!hole) {
        return res.status(404).json({
          success: false,
          message: '测孔不存在'
        });
      }
      
      const warningStandard = hole.warning_standard || 50;
      
      const processedResults = [];
      const errors = [];
      
      for (const rawId of raw_data_ids) {
        try {
          const rawData = await RawMeasurementData.findOne({ id: rawId });
          if (!rawData) {
            errors.push({ raw_data_id: rawId, error: '原始数据不存在' });
            continue;
          }
          
          const existingResult = await ProcessedResultData.findOne({ raw_data_id: rawId });
          if (existingResult) {
            errors.push({ raw_data_id: rawId, error: '该数据已处理' });
            continue;
          }
          
          const Y_average = (rawData.positive_value - rawData.negative_value) / 2;
          const inclination_angle = Math.asin(Y_average / K) - beta;
          const depth_offset = 500 * Math.sin(inclination_angle);
          
          const previousResults = await ProcessedResultData.find({
            hole_id: hole_id,
            depth: rawData.depth
          }).sort('measurement_time DESC').limit(1);
          
          const initialResults = await ProcessedResultData.find({
            hole_id: hole_id,
            depth: rawData.depth
          }).sort('measurement_time ASC').limit(1);
          
          let current_pipe_value = depth_offset;
          let previous_pipe_value = null;
          let initial_pipe_value = null;
          let cumulative_displacement = 0;
          let current_displacement = 0;
          let deformation_rate = 0;
          
          if (previousResults.length > 0) {
            previous_pipe_value = previousResults[0].current_pipe_value;
            current_pipe_value = previous_pipe_value + depth_offset;
          }
          
          if (initialResults.length > 0) {
            initial_pipe_value = initialResults[0].current_pipe_value;
            cumulative_displacement = current_pipe_value - initial_pipe_value;
          }
          
          if (previous_pipe_value !== null) {
            current_displacement = current_pipe_value - previous_pipe_value;
            const timeDiff = (rawData.measurement_time - previousResults[0].measurement_time) / (1000 * 60 * 60 * 24);
            if (timeDiff > 0) {
              deformation_rate = current_displacement / timeDiff;
            }
          }
          
          let warning_level = 'normal';
          let warning_message = '';
          
          if (Math.abs(cumulative_displacement) >= warningStandard) {
            warning_level = 'alarm';
            warning_message = `累计变形值${cumulative_displacement.toFixed(2)}mm已超过预警标准${warningStandard}mm`;
          } else if (Math.abs(cumulative_displacement) >= warningStandard * 0.7) {
            warning_level = 'warning';
            warning_message = `累计变形值${cumulative_displacement.toFixed(2)}mm接近预警标准`;
          }
          
          const result = await ProcessedResultData.create({
            raw_data_id: rawId,
            hole_id: hole_id,
            device_id: device_id,
            measurement_time: rawData.measurement_time,
            depth: rawData.depth,
            Y_average: Y_average,
            inclination_angle: inclination_angle,
            depth_offset: depth_offset,
            current_pipe_value: current_pipe_value,
            initial_pipe_value: initial_pipe_value,
            cumulative_displacement: cumulative_displacement,
            previous_pipe_value: previous_pipe_value,
            current_displacement: current_displacement,
            deformation_rate: deformation_rate,
            warning_level: warning_level,
            warning_message: warning_message,
            processed_time: Date.now()
          }).fetch();
          
          processedResults.push(result);
          
          await RawMeasurementData.updateOne({ id: rawId }).set({
            data_status: 'processed',
            processed_time: Date.now()
          });
          
        } catch (err) {
          errors.push({ raw_data_id: rawId, error: err.message });
        }
      }
      
      return res.json({
        success: true,
        message: `成功处理${processedResults.length}条数据`,
        data: {
          processed: processedResults,
          errors: errors
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  findByHole: async function(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10, start_time, end_time, warning_level } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = { hole_id: parseInt(id) };
      
      if (start_time || end_time) {
        query.measurement_time = {};
        if (start_time) {
          query.measurement_time['>='] = parseInt(start_time);
        }
        if (end_time) {
          query.measurement_time['<='] = parseInt(end_time);
        }
      }
      
      const validWarningLevels = ['normal', 'warning', 'alarm'];
      if (warning_level && validWarningLevels.includes(warning_level)) {
        query.warning_level = warning_level;
      }
      
      const results = await ProcessedResultData.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('measurement_time DESC');
      
      const total = await ProcessedResultData.count(query);
      
      return res.json({
        success: true,
        data: {
          list: results,
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
  
  generateCurve: async function(req, res) {
    try {
      const { hole_id, measurement_time, curve_type = 'single' } = req.body;
      
      if (!hole_id) {
        return res.status(400).json({
          success: false,
          message: '测孔ID是必填的'
        });
      }
      
      if (!measurement_time) {
        return res.status(400).json({
          success: false,
          message: '测量时间是必填的'
        });
      }
      
      const hole = await MonitoringHole.findOne({ id: hole_id });
      if (!hole) {
        return res.status(404).json({
          success: false,
          message: '测孔不存在'
        });
      }
      
      let query = { hole_id: hole_id };
      
      if (curve_type === 'single') {
        query.measurement_time = parseInt(measurement_time);
      } else {
        query.measurement_time = { '<=': parseInt(measurement_time) };
      }
      
      const results = await ProcessedResultData.find(query)
        .sort('depth ASC');
      
      if (results.length === 0) {
        return res.status(404).json({
          success: false,
          message: '未找到处理结果数据'
        });
      }
      
      const depth_data = results.map(r => r.depth);
      const displacement_data = results.map(r => r.cumulative_displacement || 0);
      
      const curve = await DeformationCurve.create({
        hole_id: hole_id,
        curve_type: curve_type,
        measurement_time: parseInt(measurement_time),
        depth_data: depth_data,
        displacement_data: displacement_data,
        curve_parameters: {
          max_displacement: Math.max(...displacement_data.map(Math.abs)),
          min_displacement: Math.min(...displacement_data),
          avg_displacement: displacement_data.reduce((a, b) => a + b, 0) / displacement_data.length,
          point_count: depth_data.length
        }
      }).fetch();
      
      return res.json({
        success: true,
        message: '曲线生成成功',
        data: curve
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
