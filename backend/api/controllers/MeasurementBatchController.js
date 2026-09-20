module.exports = {
  find: async function(req, res) {
    try {
      const { page = 1, limit = 10, hole_id, batch_status, operator_id } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = {};
      
      if (hole_id) {
        query.hole_id = parseInt(hole_id);
      }
      
      const validBatchStatuses = ['measuring', 'completed', 'aborted'];
      if (batch_status && validBatchStatuses.includes(batch_status)) {
        query.batch_status = batch_status;
      }
      
      if (operator_id) {
        query.operator_id = parseInt(operator_id);
      }
      
      const batches = await MeasurementBatch.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('created_at DESC');
      
      const total = await MeasurementBatch.count(query);
      
      const holeIds = [...new Set(batches.filter(b => b.hole_id).map(b => b.hole_id))];
      const operatorIds = [...new Set(batches.filter(b => b.operator_id).map(b => b.operator_id))];
      
      let holes = [];
      let operators = [];
      
      if (holeIds.length > 0) {
        holes = await MonitoringHole.find({ id: holeIds });
      }
      
      if (operatorIds.length > 0) {
        operators = await User.find({ id: operatorIds });
      }
      
      const holeMap = {};
      holes.forEach(h => { holeMap[h.id] = h; });
      
      const operatorMap = {};
      operators.forEach(o => { operatorMap[o.id] = o; });
      
      const batchesWithRelations = batches.map(batch => ({
        ...batch,
        hole: holeMap[batch.hole_id] || null,
        operator: operatorMap[batch.operator_id] || null
      }));
      
      return res.json({
        success: true,
        data: {
          list: batchesWithRelations,
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
      const batch = await MeasurementBatch.findOne({ id: req.params.id });
      
      if (!batch) {
        return res.status(404).json({
          success: false,
          message: '批次不存在'
        });
      }
      
      let hole = null;
      let operator = null;
      
      if (batch.hole_id) {
        hole = await MonitoringHole.findOne({ id: batch.hole_id });
      }
      
      if (batch.operator_id) {
        operator = await User.findOne({ id: batch.operator_id });
      }
      
      const measurementData = await RawMeasurementData.find({
        batch_number: batch.batch_number
      }).sort('depth ASC');
      
      return res.json({
        success: true,
        data: {
          ...batch,
          hole,
          operator,
          measurement_data: measurementData
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  create: async function(req, res) {
    try {
      const {
        batch_number,
        hole_id,
        start_time,
        operator_id
      } = req.body;
      
      if (!batch_number) {
        return res.status(400).json({
          success: false,
          message: '批次号是必填的'
        });
      }
      
      if (!hole_id) {
        return res.status(400).json({
          success: false,
          message: '测孔ID是必填的'
        });
      }
      
      if (!start_time) {
        return res.status(400).json({
          success: false,
          message: '批次开始时间是必填的'
        });
      }
      
      const existingBatch = await MeasurementBatch.findOne({ batch_number: batch_number });
      
      if (existingBatch) {
        return res.status(400).json({
          success: false,
          message: '批次号已存在'
        });
      }
      
      const hole = await MonitoringHole.findOne({ id: hole_id });
      if (!hole) {
        return res.status(400).json({
          success: false,
          message: '测孔不存在'
        });
      }
      
      const batch = await MeasurementBatch.create({
        batch_number,
        hole_id: parseInt(hole_id),
        start_time: parseInt(start_time),
        end_time: null,
        total_points: 0,
        operator_id: operator_id ? parseInt(operator_id) : null,
        batch_status: 'measuring'
      }).fetch();
      
      return res.json({
        success: true,
        message: '批次创建成功',
        data: batch
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  complete: async function(req, res) {
    try {
      const { id } = req.params;
      const { end_time } = req.body;
      
      const batch = await MeasurementBatch.findOne({ id });
      
      if (!batch) {
        return res.status(404).json({
          success: false,
          message: '批次不存在'
        });
      }
      
      if (batch.batch_status !== 'measuring') {
        return res.status(400).json({
          success: false,
          message: '只有测量中的批次才能完成'
        });
      }
      
      const measurementCount = await RawMeasurementData.count({
        batch_number: batch.batch_number
      });
      
      const updatedBatch = await MeasurementBatch.updateOne({ id }).set({
        end_time: end_time ? parseInt(end_time) : Date.now(),
        total_points: measurementCount,
        batch_status: 'completed'
      });
      
      return res.json({
        success: true,
        message: '批次已完成',
        data: updatedBatch
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  abort: async function(req, res) {
    try {
      const { id } = req.params;
      
      const batch = await MeasurementBatch.findOne({ id });
      
      if (!batch) {
        return res.status(404).json({
          success: false,
          message: '批次不存在'
        });
      }
      
      if (batch.batch_status !== 'measuring') {
        return res.status(400).json({
          success: false,
          message: '只有测量中的批次才能中止'
        });
      }
      
      const measurementCount = await RawMeasurementData.count({
        batch_number: batch.batch_number
      });
      
      const updatedBatch = await MeasurementBatch.updateOne({ id }).set({
        end_time: Date.now(),
        total_points: measurementCount,
        batch_status: 'aborted'
      });
      
      return res.json({
        success: true,
        message: '批次已中止',
        data: updatedBatch
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  findByHole: async function(req, res) {
    try {
      const { id } = req.params;
      const { batch_status } = req.query;
      
      const hole = await MonitoringHole.findOne({ id });
      if (!hole) {
        return res.status(404).json({
          success: false,
          message: '测孔不存在'
        });
      }
      
      let query = { hole_id: parseInt(id) };
      
      const validBatchStatuses = ['measuring', 'completed', 'aborted'];
      if (batch_status && validBatchStatuses.includes(batch_status)) {
        query.batch_status = batch_status;
      }
      
      const batches = await MeasurementBatch.find(query).sort('created_at DESC');
      
      return res.json({
        success: true,
        data: batches
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
