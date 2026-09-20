const AuthSupportService = require('../services/AuthSupportService');

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
      ...options,
      headers: {
        Accept: 'application/json',
        'x-client-key': clientKey,
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    const text = await response.text();
    try {
      return {
        statusCode: response.status,
        body: text ? JSON.parse(text) : null
      };
    } catch (error) {
      return {
        statusCode: response.status,
        body: text
      };
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('管理端请求超时');
    }
    throw new Error(`管理端连接失败: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getBeijingDayRange() {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(new Date());
  const partMap = Object.fromEntries(parts.map(item => [item.type, item.value]));
  const start = new Date(`${partMap.year}-${partMap.month}-${partMap.day}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function normalizeTaskMeasurementDate(task) {
  const rawMeasurements = Array.isArray(task?.resultPayload?.rawMeasurements) ? task.resultPayload.rawMeasurements : [];
  // 修复说明：客户端仪表盘的监测时间必须与原始数据页一致，优先使用管理端 completedAt，避免直接使用网关时间少 8 小时。
  const candidate = task?.completedAt || rawMeasurements[0]?.measurement_time || task?.createdAt || null;
  const date = candidate ? new Date(candidate) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function getTaskMaxDepth(task) {
  const rawMeasurements = Array.isArray(task?.resultPayload?.rawMeasurements) ? task.resultPayload.rawMeasurements : [];
  const depths = rawMeasurements
    .map(item => Number(item?.depth))
    .filter(value => Number.isFinite(value));
  return depths.length > 0 ? Math.max(...depths) : 0;
}

async function fetchCompletedTasks(limit = 2000) {
  const query = new URLSearchParams();
  query.set('limit', String(limit));
  const response = await requestAdminApi(`/tasks?${query.toString()}`, { method: 'GET' });
  if (response.statusCode !== 200 || !response.body?.success) {
    throw new Error(response.body?.details || response.body?.error || response.body?.message || '查询管理端任务失败');
  }

  // 修复说明：仪表盘“今日测量/最近测量”按管理端完成任务统计，避免把原始数据按深度明细重复计数。
  return (Array.isArray(response.body?.data) ? response.body.data : [])
    .filter(task => task?.status === 'completed' && task?.resultPayload?.gatewayResultPoint)
    .map(task => ({
      ...task,
      __measurementDate: normalizeTaskMeasurementDate(task)
    }))
    .filter(task => task.__measurementDate)
    .sort((left, right) => right.__measurementDate.getTime() - left.__measurementDate.getTime());
}

function buildWarningGroupKey(result, rawMeasurement) {
  return [
    result?.hole_id || '',
    rawMeasurement?.batch_number || '',
    result?.measurement_time ? new Date(result.measurement_time).getTime() : ''
  ].join('|');
}

function buildAlertLevelRank(level) {
  return level === 'alarm' ? 2 : (level === 'warning' ? 1 : 0);
}

async function buildWarningGroups() {
  const warningRows = await ProcessedResultData.find({
    warning_level: ['warning', 'alarm']
  }).sort('processed_time DESC');
  const rawDataIds = [...new Set(warningRows.map(item => item.raw_data_id).filter(Boolean))];
  const holeIds = [...new Set(warningRows.map(item => item.hole_id).filter(Boolean))];
  const rawMeasurements = rawDataIds.length > 0 ? await RawMeasurementData.find({ id: rawDataIds }) : [];
  const holes = holeIds.length > 0 ? await MonitoringHole.find({ id: holeIds }) : [];
  const rawMeasurementMap = Object.fromEntries(rawMeasurements.map(item => [item.id, item]));
  const holeMap = Object.fromEntries(holes.map(item => [item.id, item]));
  const groupMap = new Map();

  warningRows.forEach((item) => {
    const rawMeasurement = rawMeasurementMap[item.raw_data_id] || null;
    const groupKey = buildWarningGroupKey(item, rawMeasurement);
    const previous = groupMap.get(groupKey) || null;
    const currentRank = buildAlertLevelRank(item.warning_level);
    const previousRank = previous ? buildAlertLevelRank(previous.warning_level) : -1;

    if (!previous || currentRank > previousRank) {
      groupMap.set(groupKey, {
        id: item.id,
        hole_id: item.hole_id,
        holeName: holeMap[item.hole_id]?.hole_name || holeMap[item.hole_id]?.hole_number || '-',
        warning_level: item.warning_level,
        warning_message: item.warning_message || '数据异常预警',
        processed_time: item.processed_time || item.measurement_time || null
      });
    }
  });

  return Array.from(groupMap.values())
    .filter(item => item.processed_time)
    .sort((left, right) => new Date(right.processed_time).getTime() - new Date(left.processed_time).getTime());
}

module.exports = {
  stats: async function(req, res) {
    try {
      const { start: todayStart, end: todayEnd } = getBeijingDayRange();
      const [
        deviceTotal,
        deviceOnline,
        projectTotal,
        projectActive,
        holeTotal,
        holeActive,
        completedTasks,
        warningGroups
      ] = await Promise.all([
        // 修复说明：客户端设备管理已经切换到上位机/下位机体系，仪表盘不能继续读取废弃的 Device 通用表，否则会与设备页面数量不一致。
        UpperDevice.count(),
        UpperDevice.count({ network_status: 'online' }),
        Project.count(),
        Project.count({ status: 'ongoing' }),
        MonitoringHole.count(),
        MonitoringHole.count({ status: 'active' }),
        fetchCompletedTasks(),
        buildWarningGroups()
      ]);

      const todayMeasurements = completedTasks.filter(task => (
        task.__measurementDate >= todayStart && task.__measurementDate < todayEnd
      )).length;
      const todayAlerts = warningGroups.filter(item => {
        const processedAt = new Date(item.processed_time);
        return !Number.isNaN(processedAt.getTime()) && processedAt >= todayStart && processedAt < todayEnd;
      }).length;

      return res.json({
        success: true,
        data: {
          deviceTotal,
          deviceOnline,
          projectTotal,
          projectActive,
          holeTotal,
          holeActive,
          todayMeasurements,
          todayAlerts
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  recentMeasurements: async function(req, res) {
    try {
      const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
      const completedTasks = await fetchCompletedTasks(Math.max(limit * 20, 200));
      const holeIds = [...new Set(
        completedTasks
          .map(task => parsePositiveInteger(task?.metadata?.sourceHoleId || task?.metadata?.holeId))
          .filter(Boolean)
      )];
      const holes = holeIds.length > 0 ? await MonitoringHole.find({ id: holeIds }) : [];
      const projectIds = [...new Set(holes.map(item => item.project_id).filter(Boolean))];
      const projects = projectIds.length > 0 ? await Project.find({ id: projectIds }) : [];
      const holeMap = Object.fromEntries(holes.map(item => [item.id, item]));
      const projectMap = Object.fromEntries(projects.map(item => [item.id, item]));

      const result = completedTasks.slice(0, limit).map((task) => {
        const metadata = task?.metadata || {};
        const holeId = parsePositiveInteger(metadata.sourceHoleId || metadata.holeId);
        const hole = holeId ? holeMap[holeId] || null : null;
        const project = hole?.project_id ? projectMap[hole.project_id] || null : null;
        return {
          id: task.taskId,
          holeName: metadata.holeName || metadata.holeNumber || hole?.hole_name || hole?.hole_number || '-',
          projectName: metadata.projectName || project?.project_name || '-',
          measuredAt: task.__measurementDate,
          // 修复说明：最近测量按“一次监测”展示时，深度字段取该次监测的最大深度，避免误拿单个点位深度造成数据失真。
          depth: getTaskMaxDepth(task)
        };
      });

      return res.json({
        success: true,
        data: result
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  alerts: async function(req, res) {
    try {
      const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
      const warningGroups = await buildWarningGroups();
      const result = warningGroups.slice(0, limit).map((item) => ({
        id: item.id,
        level: item.warning_level === 'alarm' ? 'critical' : 'warning',
        message: item.warning_message,
        holeName: item.holeName,
        createdAt: item.processed_time
      }));

      return res.json({
        success: true,
        data: result
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  recentDevices: async function(req, res) {
    try {
      const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
      const devices = await UpperDevice.find()
        .limit(limit)
        .sort('last_online_time DESC');
      const deviceIds = devices.map(item => item.id);
      const holes = deviceIds.length > 0 ? await MonitoringHole.find({ upper_device_id: deviceIds }) : [];
      const projectIds = [...new Set(holes.map(item => item.project_id).filter(Boolean))];
      const projects = projectIds.length > 0 ? await Project.find({ id: projectIds }) : [];
      const holeByUpperDeviceId = Object.fromEntries(holes.map(item => [item.upper_device_id, item]));
      const projectMap = Object.fromEntries(projects.map(item => [item.id, item]));

      const result = devices.map((device) => {
        const hole = holeByUpperDeviceId[device.id] || null;
        const project = hole?.project_id ? projectMap[hole.project_id] || null : null;
        return {
          id: device.id,
          name: device.device_name || device.imei,
          // 修复说明：客户端上位机管理当前以 IMEI 为主标识，仪表盘设备卡片也统一显示 IMEI，避免 serial_number 为空时信息不一致。
          serialNumber: device.imei || device.serial_number || '-',
          projectName: project?.project_name || null,
          isOnline: device.network_status === 'online'
        };
      });

      return res.json({
        success: true,
        data: result
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
