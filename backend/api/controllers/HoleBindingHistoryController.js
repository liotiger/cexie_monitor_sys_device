module.exports = {
  find: async function(req, res) {
    try {
      const { page = 1, limit = 10, hole_id, device_id, bind_type, start_date, end_date, is_active } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = {};
      
      if (hole_id) {
        query.hole_id = parseInt(hole_id);
      }
      
      if (device_id) {
        query.device_id = parseInt(device_id);
      }
      
      if (bind_type) {
        query.bind_type = bind_type;
      }
      
      if (is_active === 'true') {
        query.unbind_time = null;
      } else if (is_active === 'false') {
        query.unbind_time = { '!=': null };
      }
      
      if (start_date || end_date) {
        query.bind_time = {};
        if (start_date) {
          query.bind_time['>='] = parseInt(start_date);
        }
        if (end_date) {
          query.bind_time['<='] = parseInt(end_date);
        }
      }
      
      const logs = await HoleBindingHistory.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('bind_time DESC');
      
      const total = await HoleBindingHistory.count(query);
      
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
      const log = await HoleBindingHistory.findOne({ id: req.params.id });
      
      if (!log) {
        return res.status(404).json({
          success: false,
          message: '绑定历史记录不存在'
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
  
  findByHole: async function(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10, is_active } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = { hole_id: parseInt(id) };
      
      if (is_active === 'true') {
        query.unbind_time = null;
      } else if (is_active === 'false') {
        query.unbind_time = { '!=': null };
      }
      
      const logs = await HoleBindingHistory.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('bind_time DESC');
      
      const total = await HoleBindingHistory.count(query);
      
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
  
  findByDevice: async function(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10, is_active } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = { device_id: parseInt(id) };
      
      if (is_active === 'true') {
        query.unbind_time = null;
      } else if (is_active === 'false') {
        query.unbind_time = { '!=': null };
      }
      
      const logs = await HoleBindingHistory.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('bind_time DESC');
      
      const total = await HoleBindingHistory.count(query);
      
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
  
  getCurrentBinding: async function(req, res) {
    try {
      const { id } = req.params;
      
      const currentBinding = await HoleBindingHistory.findOne({
        hole_id: parseInt(id),
        unbind_time: null
      }).sort('bind_time DESC');
      
      if (!currentBinding) {
        return res.json({
          success: true,
          data: null,
          message: '该测孔当前没有绑定设备'
        });
      }
      
      return res.json({
        success: true,
        data: currentBinding
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
