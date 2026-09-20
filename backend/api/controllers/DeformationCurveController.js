module.exports = {
  find: async function(req, res) {
    try {
      const { page = 1, limit = 10, hole_id, curve_type, start_time, end_time } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = {};
      
      if (hole_id) {
        query.hole_id = parseInt(hole_id);
      }
      
      const validCurveTypes = ['single', 'history'];
      if (curve_type && validCurveTypes.includes(curve_type)) {
        query.curve_type = curve_type;
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
      
      const curves = await DeformationCurve.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('measurement_time DESC');
      
      const total = await DeformationCurve.count(query);
      
      return res.json({
        success: true,
        data: {
          list: curves,
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
      const curve = await DeformationCurve.findOne({ id: req.params.id });
      
      if (!curve) {
        return res.status(404).json({
          success: false,
          message: '曲线数据不存在'
        });
      }
      
      return res.json({
        success: true,
        data: curve
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  findByHole: async function(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10, curve_type, start_time, end_time } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = { hole_id: parseInt(id) };
      
      const validCurveTypes = ['single', 'history'];
      if (curve_type && validCurveTypes.includes(curve_type)) {
        query.curve_type = curve_type;
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
      
      const curves = await DeformationCurve.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('measurement_time DESC');
      
      const total = await DeformationCurve.count(query);
      
      return res.json({
        success: true,
        data: {
          list: curves,
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
  
  generate: async function(req, res) {
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
      
      const maxDisplacement = Math.max(...displacement_data.map(Math.abs));
      const minDisplacement = Math.min(...displacement_data);
      const avgDisplacement = displacement_data.reduce((a, b) => a + b, 0) / displacement_data.length;
      
      const curve = await DeformationCurve.create({
        hole_id: hole_id,
        curve_type: curve_type,
        measurement_time: parseInt(measurement_time),
        depth_data: depth_data,
        displacement_data: displacement_data,
        curve_parameters: {
          max_displacement: maxDisplacement,
          min_displacement: minDisplacement,
          avg_displacement: avgDisplacement,
          point_count: depth_data.length,
          hole_depth: hole.depth,
          warning_standard: hole.warning_standard
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
