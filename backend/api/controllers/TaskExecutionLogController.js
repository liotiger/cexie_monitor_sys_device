module.exports = {
  find: async function(req, res) {
    try {
      const { page = 1, limit = 10, task_id, status, start_time, end_time } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = {};
      
      if (task_id) {
        query.task_id = parseInt(task_id);
      }
      
      const validStatuses = ['success', 'failed', 'skipped'];
      if (status && validStatuses.includes(status)) {
        query.status = status;
      }
      
      if (start_time || end_time) {
        query.execution_time = {};
        if (start_time) {
          query.execution_time['>='] = parseInt(start_time);
        }
        if (end_time) {
          query.execution_time['<='] = parseInt(end_time);
        }
      }
      
      const logs = await TaskExecutionLog.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('execution_time DESC');
      
      const total = await TaskExecutionLog.count(query);
      
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
      const log = await TaskExecutionLog.findOne({ id: req.params.id });
      
      if (!log) {
        return res.status(404).json({
          success: false,
          message: '执行记录不存在'
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
        task_id,
        execution_time,
        status,
        error_message,
        measurement_id
      } = req.body;
      
      if (!task_id) {
        return res.status(400).json({
          success: false,
          message: '任务ID是必填的'
        });
      }
      
      if (!execution_time) {
        return res.status(400).json({
          success: false,
          message: '执行时间是必填的'
        });
      }
      
      const validStatuses = ['success', 'failed', 'skipped'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: '状态必须是 success、failed 或 skipped'
        });
      }
      
      const task = await ScheduledTask.findOne({ id: task_id });
      
      if (!task) {
        return res.status(404).json({
          success: false,
          message: '关联的任务不存在'
        });
      }
      
      const log = await TaskExecutionLog.create({
        task_id: parseInt(task_id),
        execution_time: parseInt(execution_time),
        status,
        error_message: error_message || null,
        measurement_id: measurement_id || null
      }).fetch();
      
      if (status === 'success') {
        const nextExecution = ScheduledTask.calculateNextExecution({
          ...task,
          last_executed: parseInt(execution_time)
        });
        await ScheduledTask.updateOne({ id: task_id }).set({
          last_executed: parseInt(execution_time),
          next_execution: nextExecution
        });
      }
      
      return res.json({
        success: true,
        message: '执行记录创建成功',
        data: log
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  stats: async function(req, res) {
    try {
      const { task_id, start_time, end_time } = req.query;
      
      let query = {};
      
      if (task_id) {
        query.task_id = parseInt(task_id);
      }
      
      if (start_time || end_time) {
        query.execution_time = {};
        if (start_time) {
          query.execution_time['>='] = parseInt(start_time);
        }
        if (end_time) {
          query.execution_time['<='] = parseInt(end_time);
        }
      }
      
      const total = await TaskExecutionLog.count(query);
      const successCount = await TaskExecutionLog.count({ ...query, status: 'success' });
      const failedCount = await TaskExecutionLog.count({ ...query, status: 'failed' });
      const skippedCount = await TaskExecutionLog.count({ ...query, status: 'skipped' });
      
      let taskStats = [];
      if (!task_id) {
        const tasks = await ScheduledTask.find({});
        for (const task of tasks) {
          const taskTotal = await TaskExecutionLog.count({ task_id: task.id });
          const taskSuccess = await TaskExecutionLog.count({ task_id: task.id, status: 'success' });
          const taskFailed = await TaskExecutionLog.count({ task_id: task.id, status: 'failed' });
          taskStats.push({
            task_id: task.id,
            task_name: task.task_name,
            total: taskTotal,
            success: taskSuccess,
            failed: taskFailed,
            success_rate: taskTotal > 0 ? ((taskSuccess / taskTotal) * 100).toFixed(2) : 0
          });
        }
      }
      
      return res.json({
        success: true,
        data: {
          summary: {
            total,
            success: successCount,
            failed: failedCount,
            skipped: skippedCount,
            success_rate: total > 0 ? ((successCount / total) * 100).toFixed(2) : 0
          },
          task_stats: taskStats
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
