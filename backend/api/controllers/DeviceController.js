module.exports = {
  find: async function(req, res) {
    try {
      const { page = 1, limit = 10, search, status, device_type, network_status } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = {};
      
      if (search) {
        query.or = [
          { device_id: { contains: search } },
          { device_name: { contains: search } },
          { serial_number: { contains: search } }
        ];
      }
      
      const validStatuses = ['idle', 'measuring', 'maintenance', 'fault', 'calibrating', 'charging'];
      if (status && validStatuses.includes(status)) {
        query.status = status;
      }
      
      if (device_type) {
        query.device_type = device_type;
      }
      
      const validNetworkStatuses = ['online', 'offline'];
      if (network_status && validNetworkStatuses.includes(network_status)) {
        query.network_status = network_status;
      }
      
      const devices = await Device.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('created_at DESC');
      
      const total = await Device.count(query);
      
      return res.json({
        success: true,
        data: {
          list: devices,
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
  
  findOne: async function(req, res) {
    try {
      const device = await Device.findOne({ id: req.params.id });
      
      if (!device) {
        return res.status(404).json({
          success: false,
          message: '设备不存在'
        });
      }
      
      return res.json({
        success: true,
        data: device
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  create: async function(req, res) {
    try {
      const {
        device_id,
        device_name,
        device_type,
        manufacturer,
        model,
        serial_number,
        purchase_date,
        dtu_id,
        ip_address,
        communication_protocol,
        K_value,
        beta_value,
        calibration_date,
        calibration_org,
        valid_until,
        created_by
      } = req.body;
      
      if (!device_id) {
        return res.status(400).json({
          success: false,
          message: '设备ID是必填的'
        });
      }
      
      const existingDevice = await Device.findOne({ device_id: device_id });
      
      if (existingDevice) {
        return res.status(400).json({
          success: false,
          message: '设备ID已存在'
        });
      }
      
      const validStatuses = ['idle', 'measuring', 'maintenance', 'fault', 'calibrating', 'charging'];
      const validNetworkStatuses = ['online', 'offline'];
      const validCalibrationStatuses = ['valid', 'expired', 'pending'];
      
      const device = await Device.create({
        device_id,
        device_name: device_name || '',
        device_type: device_type || '',
        manufacturer: manufacturer || '',
        model: model || '',
        serial_number: serial_number || '',
        purchase_date: purchase_date || '',
        dtu_id: dtu_id || '',
        network_status: validNetworkStatuses.includes(req.body.network_status) ? req.body.network_status : 'offline',
        ip_address: ip_address || '',
        communication_protocol: communication_protocol || '',
        signal_strength: req.body.signal_strength || null,
        K_value: K_value || null,
        beta_value: beta_value || null,
        calibration_date: calibration_date || '',
        calibration_org: calibration_org || '',
        valid_until: valid_until || '',
        calibration_status: validCalibrationStatuses.includes(req.body.calibration_status) ? req.body.calibration_status : 'valid',
        status: validStatuses.includes(req.body.status) ? req.body.status : 'idle',
        battery_level: req.body.battery_level || null,
        temperature: req.body.temperature || null,
        total_usage_hours: req.body.total_usage_hours || 0,
        total_measurement_count: req.body.total_measurement_count || 0,
        total_measurement_depth: req.body.total_measurement_depth || 0,
        created_by: created_by || null
      }).fetch();
      
      return res.json({
        success: true,
        message: '设备创建成功',
        data: device
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  update: async function(req, res) {
    try {
      const { id } = req.params;
      const updateData = {};
      
      const allowedFields = [
        'device_id', 'device_name', 'device_type', 'manufacturer', 'model',
        'serial_number', 'purchase_date', 'dtu_id', 'network_status',
        'last_online_time', 'ip_address', 'communication_protocol', 'signal_strength',
        'K_value', 'beta_value', 'calibration_date', 'calibration_org',
        'valid_until', 'calibration_status', 'status', 'battery_level',
        'temperature', 'current_hole_id', 'current_project_id',
        'total_usage_hours', 'total_measurement_count', 'total_measurement_depth'
      ];
      
      const validStatuses = ['idle', 'measuring', 'maintenance', 'fault', 'calibrating', 'charging'];
      const validNetworkStatuses = ['online', 'offline'];
      const validCalibrationStatuses = ['valid', 'expired', 'pending'];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          if (field === 'status' && !validStatuses.includes(req.body[field])) {
            return;
          }
          if (field === 'network_status' && !validNetworkStatuses.includes(req.body[field])) {
            return;
          }
          if (field === 'calibration_status' && !validCalibrationStatuses.includes(req.body[field])) {
            return;
          }
          updateData[field] = req.body[field];
        }
      });
      
      if (updateData.device_id) {
        const existingDevice = await Device.findOne({
          device_id: updateData.device_id,
          id: { '!=': id }
        });
        
        if (existingDevice) {
          return res.status(400).json({
            success: false,
            message: '设备ID已存在'
          });
        }
      }
      
      const device = await Device.updateOne({ id }).set(updateData);
      
      if (!device) {
        return res.status(404).json({
          success: false,
          message: '设备不存在'
        });
      }
      
      return res.json({
        success: true,
        message: '设备更新成功',
        data: device
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  destroy: async function(req, res) {
    try {
      const { id } = req.params;
      
      const device = await Device.destroyOne({ id });
      
      if (!device) {
        return res.status(404).json({
          success: false,
          message: '设备不存在'
        });
      }
      
      return res.json({
        success: true,
        message: '设备删除成功'
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  bindHole: async function(req, res) {
    try {
      const { id } = req.params;
      const { hole_id, project_id } = req.body;
      
      if (!hole_id) {
        return res.status(400).json({
          success: false,
          message: '测孔ID是必填的'
        });
      }
      
      const device = await Device.findOne({ id });
      
      if (!device) {
        return res.status(404).json({
          success: false,
          message: '设备不存在'
        });
      }
      
      if (device.current_hole_id) {
        return res.status(400).json({
          success: false,
          message: '设备已绑定测孔，请先解绑'
        });
      }
      
      const updatedDevice = await Device.updateOne({ id }).set({
        current_hole_id: hole_id,
        current_project_id: project_id || null,
        status: 'measuring'
      });
      
      return res.json({
        success: true,
        message: '设备绑定成功',
        data: {
          id: updatedDevice.id,
          device_id: updatedDevice.device_id,
          current_hole_id: updatedDevice.current_hole_id,
          current_project_id: updatedDevice.current_project_id,
          status: updatedDevice.status
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  unbindHole: async function(req, res) {
    try {
      const { id } = req.params;
      
      const device = await Device.findOne({ id });
      
      if (!device) {
        return res.status(404).json({
          success: false,
          message: '设备不存在'
        });
      }
      
      if (!device.current_hole_id) {
        return res.status(400).json({
          success: false,
          message: '设备未绑定测孔'
        });
      }
      
      const updatedDevice = await Device.updateOne({ id }).set({
        current_hole_id: null,
        current_project_id: null,
        status: 'idle'
      });
      
      return res.json({
        success: true,
        message: '设备解绑成功',
        data: {
          id: updatedDevice.id,
          device_id: updatedDevice.device_id,
          current_hole_id: updatedDevice.current_hole_id,
          current_project_id: updatedDevice.current_project_id,
          status: updatedDevice.status
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
