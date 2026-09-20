module.exports = {
  find: async function(req, res) {
    try {
      const { page = 1, limit = 10, search, status } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = {};
      
      if (search) {
        // 修复说明：工程搜索口径统一为“工程名称/业主”，移除工程编号与位置匹配，避免搜索范围过宽。
        query.or = [
          { project_name: { contains: search } },
          { client_name: { contains: search } }
        ];
      }
      
      if (status && ['planning', 'ongoing', 'paused', 'completed'].includes(status)) {
        query.status = status;
      }
      
      const projects = await Project.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('created_at DESC');
      
      const total = await Project.count(query);
      
      const projectsWithStats = await Promise.all(projects.map(async (project) => {
        const stats = await getProjectStats(project.id);
        return {
          ...project,
          hole_count: stats.holeCount,
          member_count: stats.memberCount
        };
      }));
      
      return res.json({
        success: true,
        data: {
          list: projectsWithStats,
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
      const project = await Project.findOne({ id: req.params.id });
      
      if (!project) {
        return res.status(404).json({
          success: false,
          message: '项目不存在'
        });
      }
      
      const stats = await getProjectStats(project.id);
      
      return res.json({
        success: true,
        data: {
          ...project,
          hole_count: stats.holeCount,
          member_count: stats.memberCount
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  create: async function(req, res) {
    try {
      const { 
        project_code, 
        project_name, 
        location, 
        client_name, 
        contractor, 
        supervisor, 
        start_date, 
        end_date, 
        status 
      } = req.body;
      
      if (!project_code || !project_name) {
        return res.status(400).json({
          success: false,
          message: '项目编号和项目名称都是必填的'
        });
      }
      
      const existingProject = await Project.findOne({ project_code: project_code });
      
      if (existingProject) {
        return res.status(400).json({
          success: false,
          message: '项目编号已存在'
        });
      }
      
      const validStatus = ['planning', 'ongoing', 'paused', 'completed'].includes(status) 
        ? status 
        : 'planning';
      
      const project = await Project.create({
        project_code,
        project_name,
        // 修复说明：项目位置不是必填项，空输入统一写成空字符串，避免前端不填时出现 undefined 脏值。
        location: location || '',
        client_name: client_name || '',
        contractor: contractor || '',
        supervisor: supervisor || '',
        // 修复说明：开始日期/结束日期不是必填项，空字符串必须转成 null，避免 MySQL 日期字段写入 '' 报错。
        start_date: start_date || null,
        end_date: end_date || null,
        status: validStatus,
        created_by: req.user ? req.user.id : null
      }).fetch();
      
      return res.json({
        success: true,
        message: '项目创建成功',
        data: {
          ...project,
          hole_count: 0,
          member_count: 0
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
        'project_code', 
        'project_name', 
        'location', 
        'client_name', 
        'contractor', 
        'supervisor', 
        'start_date', 
        'end_date', 
        'status'
      ];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          if (field === 'status' && !['planning', 'ongoing', 'paused', 'completed'].includes(req.body[field])) {
            return;
          }
          if (field === 'location') {
            // 修复说明：项目位置允许留空，更新时统一把空值收敛为空字符串，保持和创建接口口径一致。
            updateData[field] = normalizeOptionalText(req.body[field]);
            return;
          }
          if (field === 'start_date' || field === 'end_date') {
            // 修复说明：项目开始日期、结束日期不是必填项，更新时若前端传空字符串，这里必须转成 null，避免数据库日期列报错。
            updateData[field] = normalizeOptionalDate(req.body[field]);
            return;
          }
          updateData[field] = req.body[field];
        }
      });
      
      if (updateData.project_code) {
        const existingProject = await Project.findOne({
          project_code: updateData.project_code,
          id: { '!=': id }
        });
        
        if (existingProject) {
          return res.status(400).json({
            success: false,
            message: '项目编号已存在'
          });
        }
      }
      
      const project = await Project.updateOne({ id }).set(updateData);
      
      if (!project) {
        return res.status(404).json({
          success: false,
          message: '项目不存在'
        });
      }
      
      const stats = await getProjectStats(project.id);
      
      return res.json({
        success: true,
        message: '项目更新成功',
        data: {
          ...project,
          hole_count: stats.holeCount,
          member_count: stats.memberCount
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  destroy: async function(req, res) {
    try {
      const { id } = req.params;
      
      const project = await Project.destroyOne({ id });
      
      if (!project) {
        return res.status(404).json({
          success: false,
          message: '项目不存在'
        });
      }
      
      return res.json({
        success: true,
        message: '项目删除成功'
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}

function normalizeOptionalDate(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  return value;
}

async function getProjectStats(projectId) {
  let holeCount = 0;
  let memberCount = 0;
  
  try {
    if (typeof MonitoringHole !== 'undefined') {
      holeCount = await MonitoringHole.count({ project_id: projectId });
    }
  } catch (e) {
    holeCount = 0;
  }
  
  try {
    if (typeof ProjectMember !== 'undefined') {
      memberCount = await ProjectMember.count({ project_id: projectId, is_active: true });
    }
  } catch (e) {
    memberCount = 0;
  }
  
  return { holeCount, memberCount };
}
