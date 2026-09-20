module.exports = {
  find: async function(req, res) {
    try {
      const { projectId } = req.params;
      const { is_active, project_role } = req.query;
      
      let query = { project_id: projectId };
      
      if (is_active !== undefined) {
        query.is_active = is_active === 'true' || is_active === true;
      } else {
        query.is_active = true;
      }
      
      if (project_role && ['manager', 'member', 'viewer'].includes(project_role)) {
        query.project_role = project_role;
      }
      
      const members = await ProjectMember.find(query)
        .sort('created_at DESC');
      
      const membersWithUser = await Promise.all(members.map(async (member) => {
        const user = await User.findOne({ id: member.user_id }).select(['id', 'username', 'real_name', 'email', 'phone', 'status']);
        return {
          ...member,
          user
        };
      }));
      
      return res.json({
        success: true,
        data: membersWithUser
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  add: async function(req, res) {
    try {
      const { projectId } = req.params;
      const { user_id, project_role, join_date } = req.body;
      
      if (!user_id) {
        return res.status(400).json({
          success: false,
          message: '用户ID是必填的'
        });
      }
      
      if (!project_role || !['manager', 'member', 'viewer'].includes(project_role)) {
        return res.status(400).json({
          success: false,
          message: '项目角色必须是 manager、member 或 viewer'
        });
      }
      
      const project = await Project.findOne({ id: projectId });
      if (!project) {
        return res.status(404).json({
          success: false,
          message: '项目不存在'
        });
      }
      
      const user = await User.findOne({ id: user_id });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }
      
      const existingMember = await ProjectMember.findOne({
        project_id: parseInt(projectId),
        user_id: user_id
      });
      
      if (existingMember) {
        if (existingMember.is_active) {
          return res.status(400).json({
            success: false,
            message: '该用户已经是项目成员'
          });
        } else {
          const updatedMember = await ProjectMember.updateOne({ id: existingMember.id }).set({
            is_active: true,
            project_role: project_role,
            join_date: join_date || new Date().toISOString().split('T')[0],
            leave_date: null
          });
          
          const userInfo = await User.findOne({ id: updatedMember.user_id }).select(['id', 'username', 'real_name', 'email', 'phone', 'status']);
          
          return res.json({
            success: true,
            message: '项目成员添加成功',
            data: {
              ...updatedMember,
              user: userInfo
            }
          });
        }
      }
      
      const member = await ProjectMember.create({
        project_id: parseInt(projectId),
        user_id: user_id,
        project_role: project_role,
        join_date: join_date || new Date().toISOString().split('T')[0],
        is_active: true
      }).fetch();
      
      const userInfo = await User.findOne({ id: member.user_id }).select(['id', 'username', 'real_name', 'email', 'phone', 'status']);
      
      return res.json({
        success: true,
        message: '项目成员添加成功',
        data: {
          ...member,
          user: userInfo
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  update: async function(req, res) {
    try {
      const { id } = req.params;
      const { project_role, is_active, leave_date } = req.body;
      
      const updateData = {};
      
      if (project_role !== undefined) {
        if (!['manager', 'member', 'viewer'].includes(project_role)) {
          return res.status(400).json({
            success: false,
            message: '项目角色必须是 manager、member 或 viewer'
          });
        }
        updateData.project_role = project_role;
      }
      
      if (is_active !== undefined) {
        updateData.is_active = is_active;
      }
      
      if (leave_date !== undefined) {
        updateData.leave_date = leave_date;
      }
      
      const member = await ProjectMember.updateOne({ id }).set(updateData);
      
      if (!member) {
        return res.status(404).json({
          success: false,
          message: '项目成员记录不存在'
        });
      }
      
      const userInfo = await User.findOne({ id: member.user_id }).select(['id', 'username', 'real_name', 'email', 'phone', 'status']);
      
      return res.json({
        success: true,
        message: '项目成员更新成功',
        data: {
          ...member,
          user: userInfo
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  remove: async function(req, res) {
    try {
      const { id } = req.params;
      
      const member = await ProjectMember.findOne({ id });
      
      if (!member) {
        return res.status(404).json({
          success: false,
          message: '项目成员记录不存在'
        });
      }
      
      const updatedMember = await ProjectMember.updateOne({ id }).set({
        is_active: false,
        leave_date: new Date().toISOString().split('T')[0]
      });
      
      return res.json({
        success: true,
        message: '项目成员已移除'
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  findByUser: async function(req, res) {
    try {
      const { userId } = req.params;
      const { is_active } = req.query;
      
      let query = { user_id: userId };
      
      if (is_active !== undefined) {
        query.is_active = is_active === 'true' || is_active === true;
      }
      
      const members = await ProjectMember.find(query)
        .sort('created_at DESC');
      
      const membersWithProject = await Promise.all(members.map(async (member) => {
        const project = await Project.findOne({ id: member.project_id });
        return {
          ...member,
          project
        };
      }));
      
      return res.json({
        success: true,
        data: membersWithProject
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
