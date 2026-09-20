function normalizeOptionalNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsedValue = parseFloat(value);
  return Number.isNaN(parsedValue) ? null : parsedValue;
}

function validateWarningThresholds(yellowThreshold, redThreshold) {
  if (yellowThreshold !== null && yellowThreshold < 0) {
    return '黄色预警最大变形值不能为负数';
  }

  if (redThreshold !== null && redThreshold < 0) {
    return '红色预警最大变形值不能为负数';
  }

  if (yellowThreshold !== null && redThreshold !== null && redThreshold < yellowThreshold) {
    return '红色预警最大变形值不能小于黄色预警最大变形值';
  }

  return null;
}

function normalizeHoleStatus(status) {
  if (status === 'warning') {
    return 'active';
  }
  return ['active', 'inactive', 'completed'].includes(status) ? status : 'active';
}

module.exports = {

  find: async function(req, res) {
    try {
      const { page = 1, limit = 10, search, project_id, status, upper_device_id, hole_type } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = {};
      
      if (search) {
        query.or = [
          { hole_number: { contains: search } },
          { hole_name: { contains: search } },
          { location_description: { contains: search } }
        ];
      }
      
      if (project_id) {
        query.project_id = parseInt(project_id);
      }
      
      const validStatuses = ['active', 'inactive', 'completed'];
      if (status && validStatuses.includes(status)) {
        query.status = status;
      }
      
      if (upper_device_id) {
        query.upper_device_id = parseInt(upper_device_id);
      }
      
      const validHoleTypes = ['retaining_structure', 'soil_body'];
      if (hole_type && validHoleTypes.includes(hole_type)) {
        query.hole_type = hole_type;
      }
      
      const holes = await MonitoringHole.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('created_at DESC');
      
      const total = await MonitoringHole.count(query);
      
      const projectIds = [...new Set(holes.filter(h => h.project_id).map(h => h.project_id))];
      const upperDeviceIds = [...new Set(holes.filter(h => h.upper_device_id).map(h => h.upper_device_id))];
      
      let projects = [];
      let upperDevices = [];
      
      if (projectIds.length > 0) {
        projects = await Project.find({ id: projectIds });
      }
      
      if (upperDeviceIds.length > 0) {
        upperDevices = await UpperDevice.find({ id: upperDeviceIds });
      }
      
      const projectMap = {};
      projects.forEach(p => { projectMap[p.id] = p; });
      
      const upperDeviceMap = {};
      upperDevices.forEach(d => { upperDeviceMap[d.id] = d; });
      
      const holesWithRelations = holes.map(hole => ({
        ...hole,
        project: projectMap[hole.project_id] || null,
        upperDevice: upperDeviceMap[hole.upper_device_id] || null
      }));
      
      return res.json({
        success: true,
        data: {
          list: holesWithRelations,
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
  
  create: async function(req, res) {
    try {
      const {
        hole_number,
        project_id,
        hole_name,
        hole_type,
        location_description,
        coordinates,
        depth,
        measurement_interval,
        initial_measurement_distance,
        calculation_reference,
        warning_standard,
        warning_yellow_threshold,
        warning_red_threshold,
        collection_method,
        upper_device_id,
        created_by
      } = req.body;
      
      if (!hole_number) {
        return res.status(400).json({
          success: false,
          message: '测斜孔编号是必填的'
        });
      }
      
      if (!project_id) {
        return res.status(400).json({
          success: false,
          message: '所属项目是必填的'
        });
      }
      
      if (!hole_type) {
        return res.status(400).json({
          success: false,
          message: '测孔类型是必填的'
        });
      }
      
      if (depth === undefined || depth === null) {
        return res.status(400).json({
          success: false,
          message: '孔深是必填的'
        });
      }
      
      const project = await Project.findOne({ id: project_id });
      if (!project) {
        return res.status(400).json({
          success: false,
          message: '所选项目不存在'
        });
      }
      
      const existingHole = await MonitoringHole.findOne({
        hole_number: hole_number,
        project_id: project_id
      });
      
      if (existingHole) {
        return res.status(400).json({
          success: false,
          message: '该项目下测斜孔编号已存在'
        });
      }
      
      const validHoleTypes = ['retaining_structure', 'soil_body'];
      const validCalcRefs = ['top', 'bottom'];
      const validCollectionMethods = ['manual', 'auto'];
      const normalizedYellowThreshold = normalizeOptionalNumber(warning_yellow_threshold);
      const normalizedRedThreshold = normalizeOptionalNumber(warning_red_threshold);
      const warningThresholdError = validateWarningThresholds(normalizedYellowThreshold, normalizedRedThreshold);
      if (warningThresholdError) {
        return res.status(400).json({
          success: false,
          message: warningThresholdError
        });
      }

      // 修复说明：新增测孔时也支持直接绑定上位机，这里校验设备存在且未被其他测孔占用。
      let boundUpperDeviceId = null;
      if (upper_device_id) {
        const upperDevice = await UpperDevice.findOne({ id: upper_device_id });
        if (!upperDevice) {
          return res.status(404).json({
            success: false,
            message: '设备不存在'
          });
        }

        const occupiedHole = await MonitoringHole.findOne({ upper_device_id: upper_device_id });
        if (occupiedHole) {
          return res.status(400).json({
            success: false,
            message: '设备已绑定其他测孔，请先解绑'
          });
        }

        boundUpperDeviceId = upper_device_id;
      }

      const hole = await MonitoringHole.create({
        hole_number,
        project_id,
        hole_name: hole_name || '',
        hole_type: validHoleTypes.includes(hole_type) ? hole_type : 'retaining_structure',
        location_description: location_description || '',
        coordinates: coordinates || null,
        depth: parseFloat(depth),
        measurement_interval: measurement_interval !== undefined ? parseFloat(measurement_interval) : 0.5,
        // 修复说明：新增测孔时初始测量距离默认为 0.05m，该值会在开始监测前参与反算设备监测节点数。
        initial_measurement_distance: (initial_measurement_distance !== undefined && initial_measurement_distance !== null && initial_measurement_distance !== '')
          ? parseFloat(initial_measurement_distance)
          : 0.05,
        calculation_reference: validCalcRefs.includes(calculation_reference) ? calculation_reference : 'bottom',
        warning_standard: normalizeOptionalNumber(warning_standard),
        // 修复说明：测孔预警从单一阈值扩展为黄/红两级阈值，这里在创建时同步保存两个最大变形值配置。
        warning_yellow_threshold: normalizedYellowThreshold,
        warning_red_threshold: normalizedRedThreshold,
        collection_method: validCollectionMethods.includes(collection_method) ? collection_method : 'manual',
        upper_device_id: boundUpperDeviceId,
        lower_device_id: null,
        timer_enabled: false,
        timer_type: 'interval',
        timer_interval_minutes: null,
        fixed_times: null,
        timer_start_date: null,
        timer_end_date: null,
        status: normalizeHoleStatus(req.body.status),
        last_measurement_time: null,
        next_scheduled_time: null,
        total_measurements: 0,
        warning_count: 0,
        created_by: created_by || null
      }).fetch();
      
      return res.json({
        success: true,
        message: '测孔创建成功',
        data: hole
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
        'hole_number', 'project_id', 'hole_name', 'hole_type', 'location_description',
        'coordinates', 'depth', 'measurement_interval', 'initial_measurement_distance', 'calculation_reference',
        'warning_standard', 'warning_yellow_threshold', 'warning_red_threshold',
        'collection_method', 'upper_device_id', 'timer_enabled',
        'timer_type', 'timer_interval_minutes', 'fixed_times', 'timer_start_date',
        'timer_end_date', 'status', 'last_measurement_time', 'next_scheduled_time',
        'total_measurements', 'warning_count'
      ];
      
      const validHoleTypes = ['retaining_structure', 'soil_body'];
      const validCalcRefs = ['top', 'bottom'];
      const validCollectionMethods = ['manual', 'auto'];
      const validTimerTypes = ['interval', 'fixed_time'];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          if (field === 'hole_type' && !validHoleTypes.includes(req.body[field])) {
            return;
          }
          if (field === 'calculation_reference' && !validCalcRefs.includes(req.body[field])) {
            return;
          }
          if (field === 'collection_method' && !validCollectionMethods.includes(req.body[field])) {
            return;
          }
          if (field === 'timer_type' && !validTimerTypes.includes(req.body[field])) {
            return;
          }
          if (field === 'status') {
            updateData[field] = normalizeHoleStatus(req.body.status);
            return;
          }
          if (field === 'warning_standard') {
            updateData[field] = normalizeOptionalNumber(req.body[field]);
            return;
          }
          if (field === 'warning_yellow_threshold' || field === 'warning_red_threshold') {
            updateData[field] = normalizeOptionalNumber(req.body[field]);
            return;
          }
          if (field === 'initial_measurement_distance') {
            // 修复说明：初始测量距离留空时按默认值 0.05m 处理，避免空串写入数值列导致校验失败。
            updateData[field] = (req.body[field] === '' || req.body[field] === null)
              ? 0.05
              : parseFloat(req.body[field]);
            return;
          }
          updateData[field] = req.body[field];
        }
      });

      const currentHoleForThreshold = await MonitoringHole.findOne({ id });
      if (!currentHoleForThreshold) {
        return res.status(404).json({
          success: false,
          message: '测孔不存在'
        });
      }

      const mergedYellowThreshold = updateData.warning_yellow_threshold !== undefined
        ? updateData.warning_yellow_threshold
        : normalizeOptionalNumber(currentHoleForThreshold.warning_yellow_threshold);
      const mergedRedThreshold = updateData.warning_red_threshold !== undefined
        ? updateData.warning_red_threshold
        : normalizeOptionalNumber(currentHoleForThreshold.warning_red_threshold);
      const warningThresholdError = validateWarningThresholds(mergedYellowThreshold, mergedRedThreshold);
      if (warningThresholdError) {
        return res.status(400).json({
          success: false,
          message: warningThresholdError
        });
      }
      
      if (updateData.hole_number || updateData.project_id) {
        const checkNumber = updateData.hole_number || currentHoleForThreshold.hole_number;
        const checkProject = updateData.project_id || currentHoleForThreshold.project_id;
        
        const existingHole = await MonitoringHole.findOne({
          hole_number: checkNumber,
          project_id: checkProject,
          id: { '!=': id }
        });
        
        if (existingHole) {
          return res.status(400).json({
            success: false,
            message: '该项目下测斜孔编号已存在'
          });
        }
      }

      if (updateData.upper_device_id !== undefined && updateData.upper_device_id !== null) {
        const upperDevice = await UpperDevice.findOne({ id: updateData.upper_device_id });
        if (!upperDevice) {
          return res.status(404).json({
            success: false,
            message: '设备不存在'
          });
        }

        const occupiedHole = await MonitoringHole.findOne({
          upper_device_id: updateData.upper_device_id,
          id: { '!=': parseInt(id) }
        });

        if (occupiedHole) {
          return res.status(400).json({
            success: false,
            message: '设备已绑定其他测孔，请先解绑'
          });
        }
      }
      
      const hole = await MonitoringHole.updateOne({ id }).set(updateData);
      
      if (!hole) {
        return res.status(404).json({
          success: false,
          message: '测孔不存在'
        });
      }
      
      return res.json({
        success: true,
        message: '测孔更新成功',
        data: hole
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  destroy: async function(req, res) {
    try {
      const { id } = req.params;
      
      const hole = await MonitoringHole.findOne({ id });
      
      if (!hole) {
        return res.status(404).json({
          success: false,
          message: '测孔不存在'
        });
      }
      
      if (hole.upper_device_id || hole.lower_device_id) {
        return res.status(400).json({
          success: false,
          message: '测孔已绑定设备，请先解绑设备'
        });
      }
      
      await MonitoringHole.destroyOne({ id });
      
      return res.json({
        success: true,
        message: '测孔删除成功'
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  setTimer: async function(req, res) {
    try {
      const { id } = req.params;
      const {
        timer_enabled,
        timer_type,
        timer_interval_minutes,
        fixed_times,
        timer_start_date,
        timer_end_date
      } = req.body;
      
      const hole = await MonitoringHole.findOne({ id });
      
      if (!hole) {
        return res.status(404).json({
          success: false,
          message: '测孔不存在'
        });
      }
      
      if (hole.collection_method !== 'auto') {
        return res.status(400).json({
          success: false,
          message: '只有自动采集模式的测孔才能设置定时器'
        });
      }
      
      const validTimerTypes = ['interval', 'fixed_time'];
      const updateData = {
        timer_enabled: timer_enabled === true
      };
      
      if (timer_type && validTimerTypes.includes(timer_type)) {
        updateData.timer_type = timer_type;
      }
      
      if (timer_interval_minutes !== undefined) {
        updateData.timer_interval_minutes = parseInt(timer_interval_minutes);
      }
      
      if (fixed_times !== undefined) {
        updateData.fixed_times = fixed_times;
      }
      
      if (timer_start_date !== undefined) {
        updateData.timer_start_date = timer_start_date;
      }
      
      if (timer_end_date !== undefined) {
        updateData.timer_end_date = timer_end_date;
      }
      
      if (updateData.timer_enabled) {
        if (updateData.timer_type === 'interval' && !updateData.timer_interval_minutes) {
          return res.status(400).json({
            success: false,
            message: '间隔类型定时器需要设置采集间隔'
          });
        }
        
        if (updateData.timer_type === 'fixed_time' && !updateData.fixed_times) {
          return res.status(400).json({
            success: false,
            message: '固定时间类型定时器需要设置采集时间点'
          });
        }
      }
      
      const updatedHole = await MonitoringHole.updateOne({ id }).set(updateData);
      
      return res.json({
        success: true,
        message: '定时器设置成功',
        data: {
          id: updatedHole.id,
          timer_enabled: updatedHole.timer_enabled,
          timer_type: updatedHole.timer_type,
          timer_interval_minutes: updatedHole.timer_interval_minutes,
          fixed_times: updatedHole.fixed_times,
          timer_start_date: updatedHole.timer_start_date,
          timer_end_date: updatedHole.timer_end_date
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  bindDevice: async function(req, res) {
    try {
      const { id } = req.params;
      const { upper_device_id } = req.body;
      
      if (!upper_device_id) {
        return res.status(400).json({
          success: false,
          message: '设备ID是必填的'
        });
      }
      
      const hole = await MonitoringHole.findOne({ id });
      
      if (!hole) {
        return res.status(404).json({
          success: false,
          message: '测孔不存在'
        });
      }
      
      if (hole.upper_device_id) {
        return res.status(400).json({
          success: false,
          message: '测孔已绑定设备，请先解绑'
        });
      }
      
      const upperDevice = await UpperDevice.findOne({ id: upper_device_id });
      
      if (!upperDevice) {
        return res.status(404).json({
          success: false,
          message: '设备不存在'
        });
      }
      
      const occupiedHole = await MonitoringHole.findOne({
        upper_device_id,
        id: { '!=': parseInt(id) }
      });

      if (occupiedHole) {
        return res.status(400).json({
          success: false,
          message: '设备已绑定其他测孔，请先解绑'
        });
      }
      
      await MonitoringHole.updateOne({ id }).set({
        upper_device_id: upper_device_id
      });
      
      return res.json({
        success: true,
        message: '设备绑定成功',
        data: {
          hole_id: parseInt(id),
          upper_device_id: upper_device_id
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  unbindDevice: async function(req, res) {
    try {
      const { id } = req.params;
      
      const hole = await MonitoringHole.findOne({ id });
      
      if (!hole) {
        return res.status(404).json({
          success: false,
          message: '测孔不存在'
        });
      }
      
      if (!hole.upper_device_id) {
        return res.status(400).json({
          success: false,
          message: '测孔未绑定设备'
        });
      }
      
      const upperDeviceId = hole.upper_device_id;
      
      await MonitoringHole.updateOne({ id }).set({
        upper_device_id: null,
        timer_enabled: false,
        next_scheduled_time: null
      });
      
      return res.json({
        success: true,
        message: '设备解绑成功',
        data: {
          hole_id: parseInt(id),
          upper_device_id: upperDeviceId
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  stats: async function(req, res) {
    try {
      const { project_id } = req.query;
      
      let query = {};
      if (project_id) {
        query.project_id = parseInt(project_id);
      }
      
      const total = await MonitoringHole.count(query);
      const activeCount = await MonitoringHole.count({ ...query, status: 'active' });
      const inactiveCount = await MonitoringHole.count({ ...query, status: 'inactive' });
      const completedCount = await MonitoringHole.count({ ...query, status: 'completed' });
      
      const retainingCount = await MonitoringHole.count({ ...query, hole_type: 'retaining_structure' });
      const soilBodyCount = await MonitoringHole.count({ ...query, hole_type: 'soil_body' });
      
      const manualCount = await MonitoringHole.count({ ...query, collection_method: 'manual' });
      const autoCount = await MonitoringHole.count({ ...query, collection_method: 'auto' });
      
      const boundDeviceCount = await MonitoringHole.count({
        ...query,
        upper_device_id: { '!=': null }
      });
      
      const timerEnabledCount = await MonitoringHole.count({
        ...query,
        timer_enabled: true
      });
      
      const totalMeasurements = await MonitoringHole.sum('total_measurements').where(query);
      const totalWarnings = await MonitoringHole.sum('warning_count').where(query);
      
      return res.json({
        success: true,
        data: {
          total,
          byStatus: {
            active: activeCount,
            inactive: inactiveCount,
            completed: completedCount,
            warning: 0
          },
          byType: {
            retaining_structure: retainingCount,
            soil_body: soilBodyCount
          },
          byCollectionMethod: {
            manual: manualCount,
            auto: autoCount
          },
          deviceBinding: {
            bound: boundDeviceCount,
            unbound: total - boundDeviceCount
          },
          timer: {
            enabled: timerEnabledCount,
            disabled: total - timerEnabledCount
          },
          measurements: {
            total: totalMeasurements || 0,
            warnings: totalWarnings || 0
          }
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  findByProject: async function(req, res) {
    try {
      const { id } = req.params;
      const { status, hole_type } = req.query;
      
      const project = await Project.findOne({ id });
      if (!project) {
        return res.status(404).json({
          success: false,
          message: '项目不存在'
        });
      }
      
      let query = { project_id: parseInt(id) };
      
      const validStatuses = ['active', 'inactive', 'completed'];
      if (status && validStatuses.includes(status)) {
        query.status = status;
      }
      
      const validHoleTypes = ['retaining_structure', 'soil_body'];
      if (hole_type && validHoleTypes.includes(hole_type)) {
        query.hole_type = hole_type;
      }
      
      const holes = await MonitoringHole.find(query).sort('hole_number ASC');
      
      const upperDeviceIds = [...new Set(holes.filter(h => h.upper_device_id).map(h => h.upper_device_id))];
      let upperDevices = [];
      
      if (upperDeviceIds.length > 0) {
        upperDevices = await UpperDevice.find({ id: upperDeviceIds });
      }
      
      const upperDeviceMap = {};
      upperDevices.forEach(d => { upperDeviceMap[d.id] = d; });
      
      const holesWithDevice = holes.map(hole => ({
        ...hole,
        upperDevice: upperDeviceMap[hole.upper_device_id] || null
      }));
      
      return res.json({
        success: true,
        data: holesWithDevice
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

};
