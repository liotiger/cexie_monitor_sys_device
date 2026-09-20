module.exports = {
  find: async function(req, res) {
    try {
      const { page = 1, limit = 10, hole_id, enabled, task_type } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = {};
      
      if (hole_id) {
        query.hole_id = parseInt(hole_id);
      }
      
      if (enabled !== undefined) {
        query.enabled = enabled === 'true' || enabled === true;
      }
      
      const validTaskTypes = ['interval', 'fixed_time', 'immediate'];
      if (task_type && validTaskTypes.includes(task_type)) {
        query.task_type = task_type;
      }
      
      const tasks = await ScheduledTask.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('created_at DESC');
      
      const total = await ScheduledTask.count(query);
      
      return res.json({
        success: true,
        data: {
          list: tasks,
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
      const task = await ScheduledTask.findOne({ id: req.params.id });
      
      if (!task) {
        return res.status(404).json({
          success: false,
          message: '任务不存在'
        });
      }
      
      return res.json({
        success: true,
        data: task
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  create: async function(req, res) {
    try {
      const {
        task_name,
        hole_id,
        task_type,
        interval_seconds,
        fixed_time,
        start_date,
        end_date,
        enabled,
        created_by
      } = req.body;
      
      if (!task_name) {
        return res.status(400).json({
          success: false,
          message: '任务名称是必填的'
        });
      }
      
      if (!hole_id) {
        return res.status(400).json({
          success: false,
          message: '关联测孔是必填的'
        });
      }
      
      const validTaskTypes = ['interval', 'fixed_time', 'immediate'];
      if (!task_type || !validTaskTypes.includes(task_type)) {
        return res.status(400).json({
          success: false,
          message: '任务类型必须是 interval、fixed_time 或 immediate'
        });
      }
      
      if (task_type === 'interval' && !interval_seconds) {
        return res.status(400).json({
          success: false,
          message: '间隔任务必须指定间隔秒数'
        });
      }
      
      if (task_type === 'fixed_time' && !fixed_time) {
        return res.status(400).json({
          success: false,
          message: '定时任务必须指定固定时间'
        });
      }
      
      const taskData = {
        task_name,
        hole_id: parseInt(hole_id),
        task_type,
        interval_seconds: interval_seconds || null,
        fixed_time: fixed_time || null,
        start_date: start_date || null,
        end_date: end_date || null,
        enabled: enabled !== undefined ? enabled : true,
        created_by: created_by || null
      };
      
      taskData.next_execution = ScheduledTask.calculateNextExecution(taskData);
      
      const task = await ScheduledTask.create(taskData).fetch();
      
      return res.json({
        success: true,
        message: '任务创建成功',
        data: task
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
        'task_name', 'hole_id', 'task_type', 'interval_seconds',
        'fixed_time', 'start_date', 'end_date', 'enabled',
        'last_executed', 'next_execution'
      ];
      
      const validTaskTypes = ['interval', 'fixed_time', 'immediate'];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          if (field === 'task_type' && !validTaskTypes.includes(req.body[field])) {
            return;
          }
          updateData[field] = req.body[field];
        }
      });
      
      const existingTask = await ScheduledTask.findOne({ id });
      
      if (!existingTask) {
        return res.status(404).json({
          success: false,
          message: '任务不存在'
        });
      }
      
      if (updateData.task_type === 'interval' && !updateData.interval_seconds && !existingTask.interval_seconds) {
        return res.status(400).json({
          success: false,
          message: '间隔任务必须指定间隔秒数'
        });
      }
      
      if (updateData.task_type === 'fixed_time' && !updateData.fixed_time && !existingTask.fixed_time) {
        return res.status(400).json({
          success: false,
          message: '定时任务必须指定固定时间'
        });
      }
      
      const mergedTask = { ...existingTask, ...updateData };
      if (updateData.enabled !== undefined || updateData.task_type || updateData.interval_seconds || updateData.fixed_time) {
        updateData.next_execution = ScheduledTask.calculateNextExecution(mergedTask);
      }
      
      const task = await ScheduledTask.updateOne({ id }).set(updateData);
      
      return res.json({
        success: true,
        message: '任务更新成功',
        data: task
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  destroy: async function(req, res) {
    try {
      const { id } = req.params;
      
      const task = await ScheduledTask.destroyOne({ id });
      
      if (!task) {
        return res.status(404).json({
          success: false,
          message: '任务不存在'
        });
      }
      
      await TaskExecutionLog.destroy({ task_id: id });
      
      return res.json({
        success: true,
        message: '任务删除成功'
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  enable: async function(req, res) {
    try {
      const { id } = req.params;
      
      const existingTask = await ScheduledTask.findOne({ id });
      
      if (!existingTask) {
        return res.status(404).json({
          success: false,
          message: '任务不存在'
        });
      }
      
      const nextExecution = ScheduledTask.calculateNextExecution({ ...existingTask, enabled: true });
      
      const task = await ScheduledTask.updateOne({ id }).set({
        enabled: true,
        next_execution: nextExecution
      });
      
      return res.json({
        success: true,
        message: '任务已启用',
        data: task
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  disable: async function(req, res) {
    try {
      const { id } = req.params;
      
      const task = await ScheduledTask.updateOne({ id }).set({
        enabled: false,
        next_execution: null
      });
      
      if (!task) {
        return res.status(404).json({
          success: false,
          message: '任务不存在'
        });
      }
      
      return res.json({
        success: true,
        message: '任务已禁用',
        data: task
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  executionLogs: async function(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10, status } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const task = await ScheduledTask.findOne({ id });
      
      if (!task) {
        return res.status(404).json({
          success: false,
          message: '任务不存在'
        });
      }
      
      let query = { task_id: parseInt(id) };
      
      const validStatuses = ['success', 'failed', 'skipped'];
      if (status && validStatuses.includes(status)) {
        query.status = status;
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
  }
};
