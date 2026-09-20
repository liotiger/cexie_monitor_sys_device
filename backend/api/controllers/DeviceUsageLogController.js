module.exports = {
  find: async function(req, res) {
    try {
      const { page = 1, limit = 10, device_id, user_id, project_id, hole_id, start_date, end_date } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = {};
      
      if (device_id) {
        query.device_id = parseInt(device_id);
      }
      
      if (user_id) {
        query.user_id = parseInt(user_id);
      }
      
      if (project_id) {
        query.project_id = parseInt(project_id);
      }
      
      if (hole_id) {
        query.hole_id = parseInt(hole_id);
      }
      
      if (start_date || end_date) {
        query.start_time = {};
        if (start_date) {
          query.start_time['>='] = parseInt(start_date);
        }
        if (end_date) {
          query.start_time['<='] = parseInt(end_date);
        }
      }
      
      const logs = await DeviceUsageLog.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('created_at DESC');
      
      const total = await DeviceUsageLog.count(query);
      
      return res.json({
        success: true,
        data: {
          list: logs,
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
      const log = await DeviceUsageLog.findOne({ id: req.params.id });
      
      if (!log) {
        return res.status(404).json({
          success: false,
          message: '使用记录不存在'
        });
      }
      
      return res.json({
        success: true,
        data: log
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  create: async function(req, res) {
    try {
      const {
        device_id,
        user_id,
        project_id,
        hole_id,
        start_time,
        start_battery_level,
        start_temperature,
        start_signal_strength
      } = req.body;
      
      if (!device_id || !user_id || !project_id || !hole_id) {
        return res.status(400).json({
          success: false,
          message: '设备ID、使用人ID、项目ID和测孔ID都是必填的'
        });
      }
      
      const device = await Device.findOne({ id: device_id });
      if (!device) {
        return res.status(404).json({
          success: false,
          message: '设备不存在'
        });
      }
      
      const log = await DeviceUsageLog.create({
        device_id: parseInt(device_id),
        user_id: parseInt(user_id),
        project_id: parseInt(project_id),
        hole_id: parseInt(hole_id),
        start_time: start_time || Date.now(),
        start_battery_level: start_battery_level || device.battery_level,
        start_temperature: start_temperature || device.temperature,
        start_signal_strength: start_signal_strength || device.signal_strength,
        measurement_count: 0
      }).fetch();
      
      return res.json({
        success: true,
        message: '使用记录创建成功',
        data: log
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  end: async function(req, res) {
    try {
      const { id } = req.params;
      const {
        end_time,
        measurement_count,
        total_measurement_depth,
        total_measurement_time,
        end_battery_level,
        end_temperature,
        end_signal_strength
      } = req.body;
      
      const log = await DeviceUsageLog.findOne({ id });
      
      if (!log) {
        return res.status(404).json({
          success: false,
          message: '使用记录不存在'
        });
      }
      
      if (log.end_time) {
        return res.status(400).json({
          success: false,
          message: '该使用记录已结束'
        });
      }
      
      const actualEndTime = end_time || Date.now();
      const updateData = {
        end_time: actualEndTime
      };
      
      if (measurement_count !== undefined) {
        updateData.measurement_count = parseInt(measurement_count);
      }
      
      if (total_measurement_depth !== undefined) {
        updateData.total_measurement_depth = parseFloat(total_measurement_depth);
      }
      
      if (total_measurement_time !== undefined) {
        updateData.total_measurement_time = parseInt(total_measurement_time);
      }
      
      if (end_battery_level !== undefined) {
        updateData.end_battery_level = parseFloat(end_battery_level);
      }
      
      if (end_temperature !== undefined) {
        updateData.end_temperature = parseFloat(end_temperature);
      }
      
      if (end_signal_strength !== undefined) {
        updateData.end_signal_strength = parseFloat(end_signal_strength);
      }
      
      if (updateData.total_measurement_depth && updateData.measurement_count && updateData.measurement_count > 0) {
        updateData.average_depth_per_measurement = updateData.total_measurement_depth / updateData.measurement_count;
      }
      
      const updatedLog = await DeviceUsageLog.updateOne({ id }).set(updateData);
      
      return res.json({
        success: true,
        message: '使用记录已结束',
        data: updatedLog
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  findByDevice: async function(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const device = await Device.findOne({ id });
      if (!device) {
        return res.status(404).json({
          success: false,
          message: '设备不存在'
        });
      }
      
      const logs = await DeviceUsageLog.find({ device_id: parseInt(id) })
        .skip(skip)
        .limit(parseInt(limit))
        .sort('start_time DESC');
      
      const total = await DeviceUsageLog.count({ device_id: parseInt(id) });
      
      return res.json({
        success: true,
        data: {
          list: logs,
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
  
  stats: async function(req, res) {
    try {
      const { device_id, user_id, project_id, start_date, end_date } = req.query;
      
      let query = {};
      
      if (device_id) {
        query.device_id = parseInt(device_id);
      }
      
      if (user_id) {
        query.user_id = parseInt(user_id);
      }
      
      if (project_id) {
        query.project_id = parseInt(project_id);
      }
      
      if (start_date || end_date) {
        query.start_time = {};
        if (start_date) {
          query.start_time['>='] = parseInt(start_date);
        }
        if (end_date) {
          query.start_time['<='] = parseInt(end_date);
        }
      }
      
      const logs = await DeviceUsageLog.find(query);
      
      const totalUsageCount = logs.length;
      const totalMeasurementCount = logs.reduce((sum, log) => sum + (log.measurement_count || 0), 0);
      const totalMeasurementDepth = logs.reduce((sum, log) => sum + (log.total_measurement_depth || 0), 0);
      const totalMeasurementTime = logs.reduce((sum, log) => sum + (log.total_measurement_time || 0), 0);
      
      const completedLogs = logs.filter(log => log.end_time);
      const averageUsageTime = completedLogs.length > 0 
        ? completedLogs.reduce((sum, log) => {
            const duration = log.end_time - log.start_time;
            return sum + (duration / 60000);
          }, 0) / completedLogs.length 
        : 0;
      
      const averageDepthPerMeasurement = totalMeasurementCount > 0 
        ? totalMeasurementDepth / totalMeasurementCount 
        : 0;
      
      const deviceUsageMap = {};
      logs.forEach(log => {
        if (!deviceUsageMap[log.device_id]) {
          deviceUsageMap[log.device_id] = {
            device_id: log.device_id,
            usage_count: 0,
            measurement_count: 0,
            total_depth: 0,
            total_time: 0
          };
        }
        deviceUsageMap[log.device_id].usage_count++;
        deviceUsageMap[log.device_id].measurement_count += log.measurement_count || 0;
        deviceUsageMap[log.device_id].total_depth += log.total_measurement_depth || 0;
        deviceUsageMap[log.device_id].total_time += log.total_measurement_time || 0;
      });
      
      const deviceUsageStats = Object.values(deviceUsageMap).sort((a, b) => b.usage_count - a.usage_count);
      
      const userUsageMap = {};
      logs.forEach(log => {
        if (!userUsageMap[log.user_id]) {
          userUsageMap[log.user_id] = {
            user_id: log.user_id,
            usage_count: 0,
            measurement_count: 0,
            total_depth: 0,
            total_time: 0
          };
        }
        userUsageMap[log.user_id].usage_count++;
        userUsageMap[log.user_id].measurement_count += log.measurement_count || 0;
        userUsageMap[log.user_id].total_depth += log.total_measurement_depth || 0;
        userUsageMap[log.user_id].total_time += log.total_measurement_time || 0;
      });
      
      const userUsageStats = Object.values(userUsageMap).sort((a, b) => b.usage_count - a.usage_count);
      
      return res.json({
        success: true,
        data: {
          summary: {
            totalUsageCount,
            totalMeasurementCount,
            totalMeasurementDepth,
            totalMeasurementTime,
            averageUsageTime: Math.round(averageUsageTime * 100) / 100,
            averageDepthPerMeasurement: Math.round(averageDepthPerMeasurement * 100) / 100
          },
          deviceStats: deviceUsageStats,
          userStats: userUsageStats
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
