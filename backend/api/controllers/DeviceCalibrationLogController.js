module.exports = {
  find: async function(req, res) {
    try {
      const { page = 1, limit = 10, device_id, review_status, calibration_status } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = {};
      
      if (device_id) {
        query.device_id = parseInt(device_id);
      }
      
      const validReviewStatuses = ['pending', 'approved', 'rejected'];
      if (review_status && validReviewStatuses.includes(review_status)) {
        query.review_status = review_status;
      }
      
      const validCalibrationStatuses = ['passed', 'failed', 'pending'];
      if (calibration_status && validCalibrationStatuses.includes(calibration_status)) {
        query.calibration_status = calibration_status;
      }
      
      const logs = await DeviceCalibrationLog.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('created_at DESC');
      
      const total = await DeviceCalibrationLog.count(query);
      
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
      const log = await DeviceCalibrationLog.findOne({ id: req.params.id });
      
      if (!log) {
        return res.status(404).json({
          success: false,
          message: '标定记录不存在'
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
        calibration_date,
        calibration_org,
        calibrator,
        K_value,
        beta_value,
        temperature,
        humidity,
        calibration_data,
        calibration_points,
        standard_deviation,
        correlation_coefficient,
        certificate_number,
        certificate_file,
        valid_until,
        calibration_status,
        created_by
      } = req.body;
      
      if (!device_id) {
        return res.status(400).json({
          success: false,
          message: '设备ID是必填的'
        });
      }
      
      if (!calibration_date) {
        return res.status(400).json({
          success: false,
          message: '标定日期是必填的'
        });
      }
      
      if (!calibration_org) {
        return res.status(400).json({
          success: false,
          message: '标定机构是必填的'
        });
      }
      
      if (K_value === undefined || K_value === null) {
        return res.status(400).json({
          success: false,
          message: '标定系数K是必填的'
        });
      }
      
      if (beta_value === undefined || beta_value === null) {
        return res.status(400).json({
          success: false,
          message: '标定系数β是必填的'
        });
      }
      
      const validCalibrationStatuses = ['passed', 'failed', 'pending'];
      
      const log = await DeviceCalibrationLog.create({
        device_id: parseInt(device_id),
        calibration_date,
        calibration_org,
        calibrator: calibrator || '',
        K_value: parseFloat(K_value),
        beta_value: parseFloat(beta_value),
        temperature: temperature ? parseFloat(temperature) : null,
        humidity: humidity ? parseFloat(humidity) : null,
        calibration_data: calibration_data || null,
        calibration_points: calibration_points ? parseInt(calibration_points) : null,
        standard_deviation: standard_deviation ? parseFloat(standard_deviation) : null,
        correlation_coefficient: correlation_coefficient ? parseFloat(correlation_coefficient) : null,
        certificate_number: certificate_number || '',
        certificate_file: certificate_file || '',
        valid_until: valid_until || '',
        calibration_status: validCalibrationStatuses.includes(calibration_status) ? calibration_status : 'passed',
        review_status: 'pending',
        created_by: created_by || null
      }).fetch();
      
      return res.json({
        success: true,
        message: '标定记录创建成功',
        data: log
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
        'device_id', 'calibration_date', 'calibration_org', 'calibrator',
        'K_value', 'beta_value', 'temperature', 'humidity',
        'calibration_data', 'calibration_points', 'standard_deviation',
        'correlation_coefficient', 'certificate_number', 'certificate_file',
        'valid_until', 'calibration_status'
      ];
      
      const validCalibrationStatuses = ['passed', 'failed', 'pending'];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          if (field === 'calibration_status' && !validCalibrationStatuses.includes(req.body[field])) {
            return;
          }
          if (field === 'device_id') {
            updateData[field] = parseInt(req.body[field]);
          } else if (['K_value', 'beta_value', 'temperature', 'humidity', 'standard_deviation', 'correlation_coefficient'].includes(field)) {
            updateData[field] = req.body[field] !== null && req.body[field] !== '' ? parseFloat(req.body[field]) : null;
          } else if (field === 'calibration_points') {
            updateData[field] = req.body[field] !== null && req.body[field] !== '' ? parseInt(req.body[field]) : null;
          } else {
            updateData[field] = req.body[field];
          }
        }
      });
      
      const log = await DeviceCalibrationLog.updateOne({ id }).set(updateData);
      
      if (!log) {
        return res.status(404).json({
          success: false,
          message: '标定记录不存在'
        });
      }
      
      return res.json({
        success: true,
        message: '标定记录更新成功',
        data: log
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  review: async function(req, res) {
    try {
      const { id } = req.params;
      const { review_status, review_notes, reviewed_by } = req.body;
      
      if (!review_status) {
        return res.status(400).json({
          success: false,
          message: '审核状态是必填的'
        });
      }
      
      const validReviewStatuses = ['approved', 'rejected'];
      if (!validReviewStatuses.includes(review_status)) {
        return res.status(400).json({
          success: false,
          message: '审核状态无效'
        });
      }
      
      const existingLog = await DeviceCalibrationLog.findOne({ id });
      
      if (!existingLog) {
        return res.status(404).json({
          success: false,
          message: '标定记录不存在'
        });
      }
      
      if (existingLog.review_status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: '该记录已审核，不能重复审核'
        });
      }
      
      const log = await DeviceCalibrationLog.updateOne({ id }).set({
        review_status,
        review_notes: review_notes || '',
        reviewed_by: reviewed_by || null,
        reviewed_at: Date.now()
      });
      
      if (review_status === 'approved') {
        await Device.updateOne({ id: existingLog.device_id }).set({
          K_value: existingLog.K_value,
          beta_value: existingLog.beta_value,
          calibration_date: existingLog.calibration_date,
          calibration_org: existingLog.calibration_org,
          valid_until: existingLog.valid_until,
          calibration_status: 'valid'
        });
      }
      
      return res.json({
        success: true,
        message: '审核完成',
        data: log
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
      
      const logs = await DeviceCalibrationLog.find({ device_id: parseInt(id) })
        .skip(skip)
        .limit(parseInt(limit))
        .sort('calibration_date DESC');
      
      const total = await DeviceCalibrationLog.count({ device_id: parseInt(id) });
      
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
  }
};
