const AuthSupportService = require('../services/AuthSupportService');

function normalizeOptionalString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDateOnly(value) {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.slice(0, 10) : null;
}

function buildSyncPayload(device = {}) {
  return {
    device_code: String(device.device_code || '').trim(),
    device_name: normalizeOptionalString(device.device_name),
    manufacturer: normalizeOptionalString(device.manufacturer),
    model: normalizeOptionalString(device.model),
    serial_number: normalizeOptionalString(device.serial_number),
    k_value: normalizeOptionalNumber(device.k_value),
    beta_value: normalizeOptionalNumber(device.beta_value),
    calibration_date: normalizeDateOnly(device.calibration_date),
    calibration_org: normalizeOptionalString(device.calibration_org),
    valid_until: normalizeDateOnly(device.valid_until),
    calibration_status: ['valid', 'expired', 'pending'].includes(device.calibration_status) ? device.calibration_status : 'valid',
    total_measurement_count: normalizeOptionalNumber(device.total_measurement_count) ?? 0,
    total_measurement_depth: normalizeOptionalNumber(device.total_measurement_depth) ?? 0,
    status: ['idle', 'measuring', 'maintenance', 'fault', 'calibrating'].includes(device.status) ? device.status : 'idle'
  };
}

async function requestAdminApi(pathname) {
  const adminApiBaseUrl = AuthSupportService.getAdminApiBaseUrl().replace(/\/$/, '');
  const clientKey = AuthSupportService.getAdminClientKey();
  if (!adminApiBaseUrl) throw new Error('未配置 ADMIN_API_BASE_URL');
  if (!clientKey) throw new Error('未配置 ADMIN_CLIENT_KEY 或 CLIENT_KEY');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.ADMIN_API_TIMEOUT_MS || 10000) || 10000);
  try {
    const response = await fetch(`${adminApiBaseUrl}${pathname}`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'x-client-key': clientKey },
      signal: controller.signal
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (error) { body = text; }
    return { statusCode: response.status, body };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('管理端请求超时');
    throw new Error(`管理端连接失败: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeClientPayload(payload = {}) {
  // 修复说明：厂商/型号/序列号由管理端同步维护、状态随监测任务变化，客户端手工编辑仅允许修改设备名称，
  // 其余字段从白名单移除，避免绕过前端直接调接口覆盖同步数据。
  const allowedFields = ['device_name'];

  return Object.fromEntries(
    allowedFields
      .filter(field => payload[field] !== undefined)
      .map(field => [field, payload[field]])
  );
}

module.exports = {
  find: async function(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const { calibration_status, status, keyword } = req.query;

      let where = {};
      if (calibration_status) where.calibration_status = calibration_status;
      if (status) where.status = status;
      if (keyword) {
        where.or = [
          { device_code: { contains: keyword } },
          { device_name: { contains: keyword } }
        ];
      }

      const total = await LowerDevice.count(where);
      const list = await LowerDevice.find(where)
        .skip(skip)
        .limit(limit)
        .sort('created_at DESC');

      const listWithDetails = await Promise.all(list.map(async (device) => {
        let hole = null;
        let project = null;
        if (device.current_hole_id) {
          hole = await MonitoringHole.findOne({ id: device.current_hole_id });
        }
        if (device.current_project_id) {
          project = await Project.findOne({ id: device.current_project_id });
        }
        return { ...device, hole, project };
      }));

      return res.json({
        success: true,
        data: { list: listWithDetails, total, page, limit }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  findOne: async function(req, res) {
    try {
      const { id } = req.params;
      const device = await LowerDevice.findOne({ id });
      if (!device) {
        return res.status(404).json({ success: false, message: '设备不存在' });
      }

      let hole = null;
      let project = null;
      if (device.current_hole_id) {
        hole = await MonitoringHole.findOne({ id: device.current_hole_id });
      }
      if (device.current_project_id) {
        project = await Project.findOne({ id: device.current_project_id });
      }

      const bindings = await DeviceBinding.find({
        lower_device_id: id,
        status: 'active'
      });

      const bindingsWithUpper = await Promise.all(bindings.map(async (b) => {
        const upperDevice = await UpperDevice.findOne({ id: b.upper_device_id });
        return { ...b, upperDevice };
      }));

      return res.json({
        success: true,
        data: { ...device, hole, project, bindings: bindingsWithUpper }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  syncFromAdmin: async function(req, res) {
    try {
      const response = await requestAdminApi('/client/lower-devices');
      if (response.statusCode !== 200 || !response.body?.success) {
        return res.status(response.statusCode || 502).json({
          success: false,
          message: response.body?.details || response.body?.error || response.body?.message || '从管理端同步下位机失败'
        });
      }

      const synced = [];
      for (const remoteDevice of (Array.isArray(response.body.data) ? response.body.data : [])) {
        const syncPayload = buildSyncPayload(remoteDevice);
        if (!syncPayload.device_code) continue;
        const existing = await LowerDevice.findOne({ device_code: syncPayload.device_code });
        if (existing) {
          const updated = await LowerDevice.updateOne({ id: existing.id }).set(syncPayload);
          synced.push({ id: updated.id, device_code: updated.device_code, action: 'updated' });
        } else {
          const created = await LowerDevice.create(syncPayload).fetch();
          synced.push({ id: created.id, device_code: created.device_code, action: 'created' });
        }
      }

      return res.json({ success: true, message: `已同步 ${synced.length} 台下位机`, data: { total: synced.length, list: synced } });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message || '同步管理端下位机失败' });
    }
  },

  update: async function(req, res) {
    try {
      const { id } = req.params;
      const data = sanitizeClientPayload(req.body);

      const device = await LowerDevice.updateOne({ id }).set(data);
      if (!device) {
        return res.status(404).json({ success: false, message: '设备不存在' });
      }
      return res.json({ success: true, data: device });
    } catch (err) {
      return res.serverError(err);
    }
  },

  destroy: async function(req, res) {
    try {
      const { id } = req.params;
      await DeviceBinding.destroy({ lower_device_id: id });
      await LowerDevice.destroyOne({ id });
      return res.json({ success: true, message: '删除成功' });
    } catch (err) {
      return res.serverError(err);
    }
  },

  bindHole: async function(req, res) {
    try {
      const { id } = req.params;
      const { hole_id } = req.body;

      const hole = await MonitoringHole.findOne({ id: hole_id });
      if (!hole) {
        return res.status(404).json({ success: false, message: '测孔不存在' });
      }

      const device = await LowerDevice.findOne({ id });
      if (!device) {
        return res.status(404).json({ success: false, message: '设备不存在' });
      }

      if (device.current_hole_id) {
        return res.status(400).json({ success: false, message: '设备已绑定其他测孔，请先解绑' });
      }

      if (hole.lower_device_id) {
        return res.status(400).json({ success: false, message: '测孔已绑定其他设备，请先解绑' });
      }

      await LowerDevice.updateOne({ id }).set({
        current_hole_id: hole_id,
        current_project_id: hole.project_id,
        status: 'measuring'
      });

      await MonitoringHole.updateOne({ id: hole_id }).set({
        lower_device_id: parseInt(id)
      });

      return res.json({ success: true, message: '绑定成功' });
    } catch (err) {
      return res.serverError(err);
    }
  },

  unbindHole: async function(req, res) {
    try {
      const { id } = req.params;

      const device = await LowerDevice.findOne({ id });
      if (!device) {
        return res.status(404).json({ success: false, message: '设备不存在' });
      }

      if (device.current_hole_id) {
        await MonitoringHole.updateOne({ id: device.current_hole_id }).set({
          lower_device_id: null,
          timer_enabled: false,
          next_scheduled_time: null
        });
      }

      await LowerDevice.updateOne({ id }).set({
        current_hole_id: null,
        current_project_id: null,
        status: 'idle'
      });

      return res.json({ success: true, message: '解绑成功' });
    } catch (err) {
      return res.serverError(err);
    }
  },

  getBindings: async function(req, res) {
    try {
      const { id } = req.params;
      const bindings = await DeviceBinding.find({
        lower_device_id: id,
        status: 'active'
      });

      const result = await Promise.all(bindings.map(async (b) => {
        const upperDevice = await UpperDevice.findOne({ id: b.upper_device_id });
        return { ...b, upperDevice };
      }));

      return res.json({ success: true, data: result });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
