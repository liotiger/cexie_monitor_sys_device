module.exports = {
  find: async function(req, res) {
    try {
      const { projectId } = req.params;
      const { page = 1, limit = 10, start_date, end_date } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = { project_id: projectId };
      
      if (start_date && end_date) {
        query.progress_date = {
          '>=': start_date,
          '<=': end_date
        };
      } else if (start_date) {
        query.progress_date = { '>=': start_date };
      } else if (end_date) {
        query.progress_date = { '<=': end_date };
      }
      
      const progressList = await ProjectProgress.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('progress_date DESC');
      
      const total = await ProjectProgress.count(query);
      
      const progressWithUser = await Promise.all(progressList.map(async (progress) => {
        let recorder = null;
        if (progress.recorded_by) {
          recorder = await User.findOne({ id: progress.recorded_by }).select(['id', 'username', 'real_name']);
        }
        return {
          ...progress,
          recorder
        };
      }));
      
      return res.json({
        success: true,
        data: {
          list: progressWithUser,
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
      const { id } = req.params;
      
      const progress = await ProjectProgress.findOne({ id });
      
      if (!progress) {
        return res.status(404).json({
          success: false,
          message: '进度记录不存在'
        });
      }
      
      let recorder = null;
      if (progress.recorded_by) {
        recorder = await User.findOne({ id: progress.recorded_by }).select(['id', 'username', 'real_name']);
      }
      
      return res.json({
        success: true,
        data: {
          ...progress,
          recorder
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  create: async function(req, res) {
    try {
      const { projectId } = req.params;
      const { 
        progress_date, 
        progress_description, 
        progress_percentage, 
        photo_urls 
      } = req.body;
      
      if (!progress_date) {
        return res.status(400).json({
          success: false,
          message: '进度日期是必填的'
        });
      }
      
      const project = await Project.findOne({ id: projectId });
      if (!project) {
        return res.status(404).json({
          success: false,
          message: '项目不存在'
        });
      }
      
      const progress = await ProjectProgress.create({
        project_id: parseInt(projectId),
        progress_date,
        progress_description: progress_description || '',
        progress_percentage: progress_percentage !== undefined ? parseFloat(progress_percentage) : null,
        photo_urls: photo_urls || [],
        recorded_by: req.user ? req.user.id : null
      }).fetch();
      
      let recorder = null;
      if (progress.recorded_by) {
        recorder = await User.findOne({ id: progress.recorded_by }).select(['id', 'username', 'real_name']);
      }
      
      return res.json({
        success: true,
        message: '进度记录创建成功',
        data: {
          ...progress,
          recorder
        }
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
        'progress_date', 
        'progress_description', 
        'progress_percentage', 
        'photo_urls'
      ];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          if (field === 'progress_percentage') {
            updateData[field] = parseFloat(req.body[field]);
          } else if (field === 'photo_urls') {
            updateData[field] = req.body[field];
          } else {
            updateData[field] = req.body[field];
          }
        }
      });
      
      const progress = await ProjectProgress.updateOne({ id }).set(updateData);
      
      if (!progress) {
        return res.status(404).json({
          success: false,
          message: '进度记录不存在'
        });
      }
      
      let recorder = null;
      if (progress.recorded_by) {
        recorder = await User.findOne({ id: progress.recorded_by }).select(['id', 'username', 'real_name']);
      }
      
      return res.json({
        success: true,
        message: '进度记录更新成功',
        data: {
          ...progress,
          recorder
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  destroy: async function(req, res) {
    try {
      const { id } = req.params;
      
      const progress = await ProjectProgress.destroyOne({ id });
      
      if (!progress) {
        return res.status(404).json({
          success: false,
          message: '进度记录不存在'
        });
      }
      
      return res.json({
        success: true,
        message: '进度记录删除成功'
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
