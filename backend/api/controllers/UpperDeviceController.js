const AuthSupportService = require('../services/AuthSupportService');

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text || null;
}

function normalizeDateTime(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeOptionalNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mergeDefined(baseValue, overrideValue) {
  const merged = { ...(baseValue || {}) };
  Object.keys(overrideValue || {}).forEach((key) => {
    if (overrideValue[key] !== undefined && overrideValue[key] !== null && overrideValue[key] !== '') {
      merged[key] = overrideValue[key];
    }
  });
  return merged;
}

function normalizeUpperDeviceStatus(status) {
  const statusMap = {
    maintenance: 'calibration_expired'
  };
  const normalized = statusMap[status] || status;
  return ['idle', 'active', 'fault', 'calibration_expired'].includes(normalized) ? normalized : 'idle';
}

function buildProjectPayload(project) {
  if (!project) {
    return null;
  }

  return {
    projectId: normalizeOptionalNumber(project.id || project.projectId),
    projectCode: normalizeOptionalString(project.project_code || project.projectCode),
    projectName: normalizeOptionalString(project.project_name || project.projectName),
    location: normalizeOptionalString(project.location),
    clientName: normalizeOptionalString(project.client_name || project.clientName),
    contractor: normalizeOptionalString(project.contractor),
    supervisor: normalizeOptionalString(project.supervisor),
    startDate: normalizeOptionalString(project.start_date || project.startDate),
    endDate: normalizeOptionalString(project.end_date || project.endDate),
    status: normalizeOptionalString(project.status)
  };
}

function buildHolePayload(hole) {
  if (!hole) {
    return null;
  }

  return {
    holeId: normalizeOptionalNumber(hole.id || hole.holeId),
    holeNumber: normalizeOptionalString(hole.hole_number || hole.holeNumber),
    holeName: normalizeOptionalString(hole.hole_name || hole.holeName),
    holeType: normalizeOptionalString(hole.hole_type || hole.holeType),
    locationDescription: normalizeOptionalString(hole.location_description || hole.locationDescription),
    depth: normalizeOptionalNumber(hole.depth),
    measurementInterval: normalizeOptionalNumber(hole.measurement_interval || hole.measurementInterval),
    // 修复说明：开始监测前管理端要用孔深、测量间隔、初始测量距离反算设备监测节点数，因此这里一并透传。
    initialMeasurementDistance: normalizeOptionalNumber(hole.initial_measurement_distance || hole.initialMeasurementDistance),
    upperDeviceId: normalizeOptionalNumber(hole.upper_device_id || hole.upperDeviceId)
  };
}

async function resolveMonitorProjectAndHole(upperDeviceId, requestBody = {}) {
  const explicitProject = buildProjectPayload(requestBody.project);
  const explicitHole = buildHolePayload(requestBody.hole);
  let localHole = null;
  let localProject = null;

  // 修复说明：用户现在要求由客户端把“上位机绑定的钻孔和工程信息”一并传给管理端；
  // 列表页没有显式选孔入口，因此这里统一按本地 upper_device_id 反查已绑定测孔，并补齐所属工程信息。
  if (!explicitHole || !explicitProject) {
    localHole = await MonitoringHole.findOne({ upper_device_id: upperDeviceId });
    if (!localHole) {
      throw new Error('当前上位机未绑定钻孔，无法启动监测');
    }

    if (localHole.project_id) {
      localProject = await Project.findOne({ id: localHole.project_id });
    }
    if (!localProject) {
      throw new Error('当前上位机绑定的钻孔未关联工程，无法启动监测');
    }
  }

  const resolvedProject = mergeDefined(buildProjectPayload(localProject), explicitProject);
  const resolvedHole = mergeDefined(buildHolePayload(localHole), explicitHole);

  if (!resolvedProject.projectCode && !resolvedProject.projectName) {
    throw new Error('监测请求缺少工程信息，无法发起监测');
  }
  if (!resolvedHole.holeNumber) {
    throw new Error('监测请求缺少钻孔信息，无法发起监测');
  }

  return {
    project: resolvedProject,
    hole: resolvedHole
  };
}

function buildSyncPayload(device) {
  return {
    imei: String(device.imei || '').trim(),
    device_name: normalizeOptionalString(device.device_name),
    manufacturer: normalizeOptionalString(device.manufacturer),
    model: normalizeOptionalString(device.model),
    serial_number: normalizeOptionalString(device.serial_number),
    firmware_version: normalizeOptionalString(device.firmware_version),
    network_status: ['online', 'offline'].includes(device.network_status) ? device.network_status : 'offline',
    last_online_time: normalizeDateTime(device.last_online_time),
    ip_address: normalizeOptionalString(device.ip_address),
    signal_strength: device.signal_strength === null || device.signal_strength === undefined || device.signal_strength === ''
      ? null
      : Number(device.signal_strength),
    wire_change_mileage: normalizeOptionalNumber(device.wire_change_mileage) ?? 0,
    total_mileage: normalizeOptionalNumber(device.total_mileage) ?? 0,
    inspection_mileage: normalizeOptionalNumber(device.inspection_mileage) ?? 0,
    status: normalizeUpperDeviceStatus(device.status)
  };
}

function withMileageWarnings(device) {
  const totalMileage = Number(device?.total_mileage) || 0;
  const wireChangeMileage = Number(device?.wire_change_mileage) || 0;
  const inspectionMileage = Number(device?.inspection_mileage) || 0;
  const warnings = [];
  if (wireChangeMileage > 0 && totalMileage >= wireChangeMileage) {
    warnings.push({ type: 'wire_change', message: '上位机累计监测里程已达到换线预警值，请及时换线。', threshold: wireChangeMileage, totalMileage });
  }
  if (inspectionMileage > 0 && totalMileage >= inspectionMileage) {
    warnings.push({ type: 'inspection', message: '上位机累计监测里程已达到检查预警值，请及时检查。', threshold: inspectionMileage, totalMileage });
  }
  return { ...device, mileage_warnings: warnings };
}

function getAdminApiConfig() {
  const adminApiBaseUrl = AuthSupportService.getAdminApiBaseUrl().replace(/\/$/, '');
  const clientKey = AuthSupportService.getAdminClientKey();
  return { adminApiBaseUrl, clientKey };
}

function getDefaultAdminCallbackUrl() {
  const custom = (global.sails && sails.config && sails.config.custom) || {};
  const baseUrl = String(custom.clientApiBaseUrl || process.env.CLIENT_API_BASE_URL || '').replace(/\/$/, '');
  return baseUrl ? `${baseUrl}/admin/task-callback` : null;
}

async function requestAdminApi(pathname, options = {}) {
  const { adminApiBaseUrl, clientKey } = getAdminApiConfig();

  if (!adminApiBaseUrl) {
    throw new Error('未配置 ADMIN_API_BASE_URL');
  }

  if (!clientKey) {
    throw new Error('未配置 ADMIN_CLIENT_KEY 或 CLIENT_KEY');
  }

  // 修复说明：客户端后端统一代理管理端任务接口，避免前端直接暴露客户 Key 和管理端地址。
  const requestUrl = `${adminApiBaseUrl}${pathname}`;
  const controller = new AbortController();
  const timeoutMs = Number(process.env.ADMIN_API_TIMEOUT_MS || 10000) || 10000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(requestUrl, {
      ...options,
      headers: {
        'Accept': 'application/json',
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
    throw new Error('管理端连接失败: ' + error.message);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  find: async function(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const { network_status, status, keyword, available_for_hole } = req.query;

      let where = {};
      if (network_status) where.network_status = network_status;
      if (status) where.status = status;
      if (keyword) {
        where.or = [
          { imei: { contains: keyword } },
          { device_name: { contains: keyword } }
        ];
      }

      if (available_for_hole === 'true' || available_for_hole === '1') {
        const occupiedHoles = await MonitoringHole.find({
          upper_device_id: { '!=': null }
        }).select(['upper_device_id']);
        const occupiedUpperDeviceIds = occupiedHoles
          .map((item) => item.upper_device_id)
          .filter((item) => item !== null && item !== undefined);

        if (occupiedUpperDeviceIds.length > 0) {
          where.id = { nin: occupiedUpperDeviceIds };
        }
      }

      const total = await UpperDevice.count(where);
      const list = await UpperDevice.find(where)
        .skip(skip)
        .limit(limit)
        .sort('last_online_time DESC');

      // 修复说明：上位机管理新增"绑定测孔"列，这里按上位机反查其绑定的测孔，随列表一并返回。
      const upperDeviceIds = list.map((item) => item.id);
      const boundHoles = upperDeviceIds.length > 0
        ? await MonitoringHole.find({ upper_device_id: upperDeviceIds })
        : [];
      const holesByUpperId = {};
      boundHoles.forEach((hole) => {
        const key = hole.upper_device_id;
        if (!holesByUpperId[key]) {
          holesByUpperId[key] = [];
        }
        holesByUpperId[key].push({
          id: hole.id,
          hole_number: hole.hole_number,
          hole_name: hole.hole_name || null,
          project_id: hole.project_id || null
        });
      });

      return res.json({
        success: true,
        data: {
          list: list.map((item) => withMileageWarnings({ ...item, bound_holes: holesByUpperId[item.id] || [] })),
          total,
          page,
          limit
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  findOne: async function(req, res) {
    try {
      const { id } = req.params;
      const device = await UpperDevice.findOne({ id });
      if (!device) {
        return res.status(404).json({ success: false, message: '设备不存在' });
      }

      const bindings = await DeviceBinding.find({
        upper_device_id: id,
        status: 'active'
      });

      const bindingsWithLower = await Promise.all(bindings.map(async (b) => {
        const lowerDevice = await LowerDevice.findOne({ id: b.lower_device_id });
        return { ...b, lowerDevice };
      }));

      return res.json({
        success: true,
        data: { ...withMileageWarnings(device), bindings: bindingsWithLower }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  update: async function(req, res) {
    try {
      const { id } = req.params;
      const data = { ...(req.body || {}) };
      delete data.id;
      delete data.imei;
      delete data.total_mileage;

      const existing = await UpperDevice.findOne({ id });
      if (!existing) {
        return res.status(404).json({ success: false, message: '设备不存在' });
      }
      if (data.wire_change_mileage !== undefined || data.inspection_mileage !== undefined) {
        const wireChangeMileage = normalizeOptionalNumber(data.wire_change_mileage);
        const inspectionMileage = normalizeOptionalNumber(data.inspection_mileage);
        if ((wireChangeMileage !== null && wireChangeMileage < 0) || (inspectionMileage !== null && inspectionMileage < 0)) {
          return res.status(400).json({ success: false, message: '里程预警值不能小于 0' });
        }
        const response = await requestAdminApi(`/client/upper-devices/${encodeURIComponent(existing.imei)}/mileage-thresholds`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wire_change_mileage: wireChangeMileage ?? (Number(existing.wire_change_mileage) || 0),
            inspection_mileage: inspectionMileage ?? (Number(existing.inspection_mileage) || 0)
          })
        });
        if (response.statusCode !== 200 || !response.body?.success) {
          return res.status(response.statusCode || 502).json({ success: false, message: response.body?.details || response.body?.error || response.body?.message || '更新里程预警值失败' });
        }
        data.wire_change_mileage = wireChangeMileage ?? (Number(existing.wire_change_mileage) || 0);
        data.inspection_mileage = inspectionMileage ?? (Number(existing.inspection_mileage) || 0);
      }

      const device = await UpperDevice.updateOne({ id }).set(data);
      return res.json({ success: true, data: withMileageWarnings(device) });
    } catch (err) {
      return res.serverError(err);
    }
  },

  destroy: async function(req, res) {
    try {
      const { id } = req.params;
      await DeviceBinding.destroy({ upper_device_id: id });
      await UpperDevice.destroyOne({ id });
      return res.json({ success: true, message: '删除成功' });
    } catch (err) {
      return res.serverError(err);
    }
  },

  getBindings: async function(req, res) {
    try {
      const { id } = req.params;
      const bindings = await DeviceBinding.find({
        upper_device_id: id,
        status: 'active'
      });

      const result = await Promise.all(bindings.map(async (b) => {
        const lowerDevice = await LowerDevice.findOne({ id: b.lower_device_id });
        return { ...b, lowerDevice };
      }));

      return res.json({ success: true, data: result });
    } catch (err) {
      return res.serverError(err);
    }
  },

  getOnlineList: async function(req, res) {
    try {
      const list = await UpperDevice.find({ network_status: 'online' })
        .sort('last_online_time DESC');
      return res.json({ success: true, data: list.map(withMileageWarnings) });
    } catch (err) {
      return res.serverError(err);
    }
  },

  getByImei: async function(req, res) {
    try {
      const { imei } = req.params;
      const device = await UpperDevice.findOne({ imei });
      if (!device) {
        return res.status(404).json({ success: false, message: '设备不存在' });
      }
      return res.json({ success: true, data: withMileageWarnings(device) });
    } catch (err) {
      return res.serverError(err);
    }
  },

  syncFromAdmin: async function(req, res) {
    try {
      const response = await requestAdminApi('/client/upper-devices', {
        method: 'GET'
      });

      if (response.statusCode !== 200 || !response.body?.success) {
        return res.status(response.statusCode || 502).json({
          success: false,
          message: response.body?.error || response.body?.message || '从管理端同步上位机失败'
        });
      }

      const remoteDevices = Array.isArray(response.body.data) ? response.body.data : [];
      const synced = [];

      for (const remoteDevice of remoteDevices) {
        const syncPayload = buildSyncPayload(remoteDevice);
        if (!syncPayload.imei) {
          continue;
        }

        const existing = await UpperDevice.findOne({ imei: syncPayload.imei });
        if (existing) {
          const updated = await UpperDevice.updateOne({ id: existing.id }).set(syncPayload);
          synced.push({
            id: updated.id,
            imei: updated.imei,
            action: 'updated'
          });
        } else {
          const created = await UpperDevice.create(syncPayload).fetch();
          synced.push({
            id: created.id,
            imei: created.imei,
            action: 'created'
          });
        }
      }

      return res.json({
        success: true,
        message: `已同步 ${synced.length} 台上位机`,
        data: {
          total: synced.length,
          list: synced
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message || '同步管理端上位机失败' });
    }
  },

  startMonitor: async function(req, res) {
    try {
      const { id } = req.params;
      const device = await UpperDevice.findOne({ id });
      if (!device) {
        return res.status(404).json({ success: false, message: '设备不存在' });
      }

      const monitorContext = await resolveMonitorProjectAndHole(id, req.body || {});

      const requestBody = {
        imei: device.imei,
        project: monitorContext.project,
        hole: monitorContext.hole
      };

      requestBody.callbackUrl = normalizeOptionalString(req.body.callbackUrl) || getDefaultAdminCallbackUrl();
      if (req.body.pollIntervalMs !== undefined) {
        requestBody.pollIntervalMs = Number(req.body.pollIntervalMs);
      }
      if (req.body.timeoutSeconds !== undefined) {
        requestBody.timeoutSeconds = Number(req.body.timeoutSeconds);
      }
      if (req.body.metadata && typeof req.body.metadata === 'object') {
        // 修复说明：把客户端上下文原样转交给管理端任务表，便于后续排查任务来源。
        requestBody.metadata = {
          ...req.body.metadata,
          // 修复说明：业务上的工程/钻孔标识需要跟随任务一起流转，回调客户端时仍要使用客户端本地的 holeId/projectId。
          projectId: monitorContext.project.projectId,
          projectCode: monitorContext.project.projectCode,
          projectName: monitorContext.project.projectName,
          holeId: monitorContext.hole.holeId,
          holeNo: monitorContext.hole.holeNumber,
          holeNumber: monitorContext.hole.holeNumber,
          holeName: monitorContext.hole.holeName,
          holeType: monitorContext.hole.holeType
        };
      } else {
        // 修复说明：上位机列表页没有显式传 metadata，这里仍要把钻孔/工程最小上下文写进任务元数据，避免管理端拒绝或回调丢失本地映射。
        requestBody.metadata = {
          projectId: monitorContext.project.projectId,
          projectCode: monitorContext.project.projectCode,
          projectName: monitorContext.project.projectName,
          holeId: monitorContext.hole.holeId,
          holeNo: monitorContext.hole.holeNumber,
          holeNumber: monitorContext.hole.holeNumber,
          holeName: monitorContext.hole.holeName,
          holeType: monitorContext.hole.holeType
        };
      }

      const response = await requestAdminApi('/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if ((response.statusCode !== 200 && response.statusCode !== 201) || !response.body?.success) {
        return res.status(response.statusCode || 502).json({
          success: false,
          // 修复说明：管理端返回了更具体的 details 时，客户端后端需要原样透传，避免前端只能看到“创建任务失败”这类泛化信息。
          message: response.body?.details || response.body?.error || response.body?.message || '启动监测失败',
          details: response.body?.details || null
        });
      }

      return res.status(201).json({
        success: true,
        message: response.body.message || '监测任务已创建',
        data: response.body.data
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message || '启动监测失败' });
    }
  },

  getLatestMonitorTask: async function(req, res) {
    try {
      const { id } = req.params;
      const device = await UpperDevice.findOne({ id });
      if (!device) {
        return res.status(404).json({ success: false, message: '设备不存在' });
      }

      const response = await requestAdminApi('/tasks?limit=50', {
        method: 'GET'
      });

      if (response.statusCode !== 200 || !response.body?.success) {
        return res.status(response.statusCode || 502).json({
          success: false,
          message: response.body?.error || response.body?.message || '查询最新监测任务失败'
        });
      }

      const tasks = Array.isArray(response.body.data) ? response.body.data : [];
      const latestTask = tasks.find((item) => String(item.imei || '') === String(device.imei || ''));

      if (!latestTask) {
        return res.json({
          success: true,
          data: null
        });
      }

      // 修复说明：若任务仍处于处理中，顺手读取详情接口，获取管理端最新状态。
      if (['created', 'queued', 'polling'].includes(String(latestTask.status || ''))) {
        const detailResponse = await requestAdminApi(`/tasks/${encodeURIComponent(latestTask.taskId)}`, {
          method: 'GET'
        });
        if (detailResponse.statusCode === 200 && detailResponse.body?.success) {
          return res.json({
            success: true,
            data: detailResponse.body.data
          });
        }
      }

      return res.json({
        success: true,
        data: latestTask
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message || '查询最新监测任务失败' });
    }
  },

  getMonitorTasks: async function(req, res) {
    try {
      const { id } = req.params;
      const device = await UpperDevice.findOne({ id });
      if (!device) {
        return res.status(404).json({ success: false, message: '设备不存在' });
      }

      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
      const response = await requestAdminApi(`/tasks?limit=${limit}&imei=${encodeURIComponent(device.imei)}`, {
        method: 'GET'
      });

      if (response.statusCode !== 200 || !response.body?.success) {
        return res.status(response.statusCode || 502).json({
          success: false,
          message: response.body?.details || response.body?.error || response.body?.message || '查询监测任务列表失败',
          details: response.body?.details || null
        });
      }

      return res.json({
        success: true,
        data: Array.isArray(response.body.data) ? response.body.data : []
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message || '查询监测任务列表失败' });
    }
  },

  getMonitorTask: async function(req, res) {
    try {
      const { taskId } = req.params;
      const response = await requestAdminApi(`/tasks/${encodeURIComponent(taskId)}`, {
        method: 'GET'
      });

      if (response.statusCode !== 200 || !response.body?.success) {
        return res.status(response.statusCode || 502).json({
          success: false,
          message: response.body?.error || response.body?.message || '查询监测任务失败'
        });
      }

      return res.json({
        success: true,
        data: response.body.data
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message || '查询监测任务失败' });
    }
  },

  cancelMonitorTask: async function(req, res) {
    try {
      const { taskId } = req.params;
      const response = await requestAdminApi(`/tasks/${encodeURIComponent(taskId)}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.statusCode !== 200 || !response.body?.success) {
        return res.status(response.statusCode || 502).json({
          success: false,
          message: response.body?.details || response.body?.error || response.body?.message || '取消监测任务失败',
          details: response.body?.details || null
        });
      }

      return res.json({
        success: true,
        message: response.body?.message || '监测任务已取消',
        data: response.body?.data || null
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message || '取消监测任务失败' });
    }
  },

  homeMove: async function(req, res) {
    const { id } = req.params;
    try {
      const device = await UpperDevice.findOne({ id });
      if (!device) {
        return res.status(404).json({ success: false, message: '设备不存在' });
      }
      if (device.network_status !== 'online') {
        return res.status(400).json({ success: false, message: '设备离线，无法执行归位任务' });
      }

      const requestBody = {
        imei: device.imei,
        taskType: 'home_move',
        callbackUrl: normalizeOptionalString(req.body?.callbackUrl) || getDefaultAdminCallbackUrl(),
        metadata: {
          ...(req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}),
          triggerSource: 'client-upper-device-list',
          upperDeviceId: Number(id)
        }
      };
      if (req.body?.pollIntervalMs !== undefined) {
        requestBody.pollIntervalMs = Number(req.body.pollIntervalMs);
      }
      if (req.body?.timeoutSeconds !== undefined) {
        requestBody.timeoutSeconds = Number(req.body.timeoutSeconds);
      }

      const response = await requestAdminApi('/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if ((response.statusCode !== 200 && response.statusCode !== 201) || !response.body?.success) {
        return res.status(response.statusCode || 502).json({
          success: false,
          message: response.body?.details || response.body?.error || response.body?.message || '归位任务创建失败',
          details: response.body?.details || null
        });
      }

      return res.status(201).json({
        success: true,
        message: response.body.message || '归位任务已创建',
        data: response.body.data
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message || '归位任务创建失败' });
    }
  },

  statusCheck: async function(req, res) {
    const { id } = req.params;
    try {
      const device = await UpperDevice.findOne({ id });
      if (!device) {
        return res.status(404).json({ success: false, message: '设备不存在' });
      }
      if (device.network_status !== 'online') {
        return res.status(400).json({ success: false, message: '设备离线，无法执行状态检查任务' });
      }

      const requestBody = {
        imei: device.imei,
        taskType: 'status_check',
        callbackUrl: normalizeOptionalString(req.body?.callbackUrl) || getDefaultAdminCallbackUrl(),
        metadata: {
          ...(req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}),
          triggerSource: 'client-upper-device-workbench',
          upperDeviceId: Number(id)
        }
      };
      if (req.body?.pollIntervalMs !== undefined) {
        requestBody.pollIntervalMs = Number(req.body.pollIntervalMs);
      }
      if (req.body?.timeoutSeconds !== undefined) {
        requestBody.timeoutSeconds = Number(req.body.timeoutSeconds);
      }

      const response = await requestAdminApi('/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if ((response.statusCode !== 200 && response.statusCode !== 201) || !response.body?.success) {
        return res.status(response.statusCode || 502).json({
          success: false,
          message: response.body?.details || response.body?.error || response.body?.message || '状态检查任务创建失败',
          details: response.body?.details || null
        });
      }

      return res.status(201).json({
        success: true,
        message: response.body.message || '状态检查任务已创建',
        data: response.body.data
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message || '状态检查任务创建失败' });
    }
  },

  bottomTest: async function(req, res) {
    const { id } = req.params;
    try {
      const device = await UpperDevice.findOne({ id });
      if (!device) {
        return res.status(404).json({ success: false, message: '设备不存在' });
      }
      if (device.network_status !== 'online') {
        return res.status(400).json({ success: false, message: '设备离线，无法执行底部检测任务' });
      }

      const requestedHoleId = normalizeOptionalNumber(req.body?.hole?.id || req.body?.hole?.holeId);
      let requestedHole = null;
      if (requestedHoleId !== null) {
        requestedHole = await MonitoringHole.findOne({
          id: requestedHoleId,
          upper_device_id: Number(id)
        });
        if (!requestedHole) {
          return res.status(400).json({ success: false, message: '指定测孔未绑定当前上位机' });
        }
      }

      const holePayload = buildHolePayload(requestedHole);

      const requestBody = {
        imei: device.imei,
        taskType: 'bottom_test',
        callbackUrl: normalizeOptionalString(req.body?.callbackUrl) || getDefaultAdminCallbackUrl(),
        ...(holePayload ? { hole: holePayload } : {}),
        metadata: {
          ...(req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {}),
          triggerSource: requestedHole ? 'client-hole-workbench' : 'client-upper-device-list',
          upperDeviceId: Number(id),
          ...(holePayload ? {
            sourceHoleId: holePayload.holeId,
            holeId: holePayload.holeId,
            holeNo: holePayload.holeNumber,
            holeNumber: holePayload.holeNumber,
            holeName: holePayload.holeName
          } : {})
        }
      };
      if (req.body?.pollIntervalMs !== undefined) {
        requestBody.pollIntervalMs = Number(req.body.pollIntervalMs);
      }
      if (req.body?.timeoutSeconds !== undefined) {
        requestBody.timeoutSeconds = Number(req.body.timeoutSeconds);
      }

      const response = await requestAdminApi('/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if ((response.statusCode !== 200 && response.statusCode !== 201) || !response.body?.success) {
        return res.status(response.statusCode || 502).json({
          success: false,
          message: response.body?.details || response.body?.error || response.body?.message || '底部检测任务创建失败',
          details: response.body?.details || null
        });
      }

      return res.status(201).json({
        success: true,
        message: response.body.message || '底部检测任务已创建',
        data: response.body.data
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message || '底部检测任务创建失败' });
    }
  }
};
