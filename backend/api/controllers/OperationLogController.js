module.exports = {
  find: async function(req, res) {
    try {
      const { page = 1, limit = 20, user_id, operation_type, start_time, end_time } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = {};
      
      if (user_id) {
        query.user_id = parseInt(user_id);
      }
      
      if (operation_type) {
        query.operation_type = operation_type;
      }
      
      if (start_time || end_time) {
        query.operation_time = {};
        if (start_time) {
          query.operation_time['>='] = parseInt(start_time);
        }
        if (end_time) {
          query.operation_time['<='] = parseInt(end_time);
        }
      }
      
      const logs = await OperationLog.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('operation_time DESC');
      
      const total = await OperationLog.count(query);
      
      const logsWithUser = await Promise.all(logs.map(async (log) => {
        let user = null;
        if (log.user_id) {
          try {
            user = await User.findOne({ id: log.user_id });
          } catch (e) {
            user = null;
          }
        }
        return {
          ...log,
          user: user ? {
            id: user.id,
            username: user.username,
            real_name: user.real_name
          } : null
        };
      }));
      
      return res.json({
        success: true,
        data: {
          list: logsWithUser,
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
      const log = await OperationLog.findOne({ id: req.params.id });
      
      if (!log) {
        return res.status(404).json({
          success: false,
          message: '日志不存在'
        });
      }
      
      let user = null;
      if (log.user_id) {
        try {
          user = await User.findOne({ id: log.user_id });
        } catch (e) {
          user = null;
        }
      }
      
      return res.json({
        success: true,
        data: {
          ...log,
          user: user ? {
            id: user.id,
            username: user.username,
            real_name: user.real_name
          } : null
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  create: async function(req, res) {
    try {
      const {
        user_id,
        operation_type,
        operation_target,
        target_id,
        operation_details,
        ip_address,
        user_agent
      } = req.body;
      
      if (!user_id || !operation_type) {
        return res.status(400).json({
          success: false,
          message: '用户ID和操作类型是必填的'
        });
      }
      
      const log = await OperationLog.create({
        user_id,
        operation_type,
        operation_target: operation_target || '',
        target_id: target_id || null,
        operation_details: operation_details || '',
        ip_address: ip_address || '',
        user_agent: user_agent || '',
        operation_time: Date.now()
      }).fetch();
      
      return res.json({
        success: true,
        message: '日志创建成功',
        data: log
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  findByUser: async function(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20, operation_type, start_time, end_time } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = { user_id: parseInt(id) };
      
      if (operation_type) {
        query.operation_type = operation_type;
      }
      
      if (start_time || end_time) {
        query.operation_time = {};
        if (start_time) {
          query.operation_time['>='] = parseInt(start_time);
        }
        if (end_time) {
          query.operation_time['<='] = parseInt(end_time);
        }
      }
      
      const logs = await OperationLog.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('operation_time DESC');
      
      const total = await OperationLog.count(query);
      
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
      const { start_time, end_time } = req.query;
      
      let query = {};
      
      if (start_time || end_time) {
        query.operation_time = {};
        if (start_time) {
          query.operation_time['>='] = parseInt(start_time);
        }
        if (end_time) {
          query.operation_time['<='] = parseInt(end_time);
        }
      }
      
      const total = await OperationLog.count(query);
      
      const typeStats = await OperationLog.getDatastore().sendNativeQuery(
        'SELECT operation_type, COUNT(*) as count FROM operation_logs GROUP BY operation_type ORDER BY count DESC'
      );
      
      const userStats = await OperationLog.getDatastore().sendNativeQuery(
        'SELECT user_id, COUNT(*) as count FROM operation_logs GROUP BY user_id ORDER BY count DESC LIMIT 10'
      );
      
      const dailyStats = await OperationLog.getDatastore().sendNativeQuery(
        'SELECT DATE(FROM_UNIXTIME(operation_time/1000)) as date, COUNT(*) as count FROM operation_logs GROUP BY DATE(FROM_UNIXTIME(operation_time/1000)) ORDER BY date DESC LIMIT 30'
      );
      
      return res.json({
        success: true,
        data: {
          total,
          byType: typeStats.rows || [],
          byUser: userStats.rows || [],
          byDate: dailyStats.rows || []
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
