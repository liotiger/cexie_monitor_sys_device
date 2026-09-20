/**
 * 用户角色关联控制器
 * 处理用户角色的分配、移除和查询操作
 */
module.exports = {
  assign: async function(req, res) {
    try {
      const { user_id, role_id } = req.body;

      if (!user_id || !role_id) {
        return res.status(400).json({
          success: false,
          message: '用户ID和角色ID不能为空'
        });
      }

      const user = await User.findOne({ id: user_id });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }

      const role = await Role.findOne({ id: role_id });
      if (!role) {
        return res.status(404).json({
          success: false,
          message: '角色不存在'
        });
      }

      const existingRelation = await UserRole.findOne({
        user_id,
        role_id
      });

      if (existingRelation) {
        return res.status(400).json({
          success: false,
          message: '该用户已拥有此角色'
        });
      }

      const userRole = await UserRole.create({
        user_id,
        role_id
      }).fetch();

      return res.json({
        success: true,
        message: '角色分配成功',
        data: userRole
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  remove: async function(req, res) {
    try {
      const { user_id, role_id } = req.body;

      if (!user_id || !role_id) {
        return res.status(400).json({
          success: false,
          message: '用户ID和角色ID不能为空'
        });
      }

      const userRole = await UserRole.destroyOne({
        user_id,
        role_id
      });

      if (!userRole) {
        return res.status(404).json({
          success: false,
          message: '用户角色关联不存在'
        });
      }

      return res.json({
        success: true,
        message: '角色移除成功'
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  findByUser: async function(req, res) {
    try {
      const { userId } = req.params;

      const userRoles = await UserRole.find({ user_id: parseInt(userId) });

      if (userRoles.length === 0) {
        return res.json({
          success: true,
          data: []
        });
      }

      const roleIds = userRoles.map(ur => ur.role_id);
      const roles = await Role.find({ id: { in: roleIds } });

      const result = userRoles.map(ur => {
        const role = roles.find(r => r.id === ur.role_id);
        return {
          id: ur.id,
          user_id: ur.user_id,
          role_id: ur.role_id,
          created_at: ur.created_at,
          role: role || null
        };
      });

      return res.json({
        success: true,
        data: result
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  findByRole: async function(req, res) {
    try {
      const { roleId } = req.params;

      const userRoles = await UserRole.find({ role_id: parseInt(roleId) });

      if (userRoles.length === 0) {
        return res.json({
          success: true,
          data: []
        });
      }

      const userIds = userRoles.map(ur => ur.user_id);
      const users = await User.find({ id: { in: userIds } });

      const result = userRoles.map(ur => {
        const user = users.find(u => u.id === ur.user_id);
        return {
          id: ur.id,
          user_id: ur.user_id,
          role_id: ur.role_id,
          created_at: ur.created_at,
          user: user || null
        };
      });

      return res.json({
        success: true,
        data: result
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
