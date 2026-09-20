/**
 * 角色权限关联控制器
 * 处理角色与权限的关联操作
 */
module.exports = {
  assign: async function(req, res) {
    try {
      const { role_id, permission_id } = req.body;

      if (!role_id || !permission_id) {
        return res.status(400).json({
          success: false,
          message: '角色ID和权限ID不能为空'
        });
      }

      const role = await Role.findOne({ id: role_id });
      if (!role) {
        return res.status(404).json({
          success: false,
          message: '角色不存在'
        });
      }

      const permission = await Permission.findOne({ id: permission_id });
      if (!permission) {
        return res.status(404).json({
          success: false,
          message: '权限不存在'
        });
      }

      const existingRelation = await RolePermission.findOne({
        role_id,
        permission_id
      });

      if (existingRelation) {
        return res.status(400).json({
          success: false,
          message: '该角色已拥有此权限'
        });
      }

      const relation = await RolePermission.create({
        role_id,
        permission_id
      }).fetch();

      return res.json({
        success: true,
        message: '权限分配成功',
        data: relation
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  remove: async function(req, res) {
    try {
      const { role_id, permission_id } = req.body;

      if (!role_id || !permission_id) {
        return res.status(400).json({
          success: false,
          message: '角色ID和权限ID不能为空'
        });
      }

      const relation = await RolePermission.destroyOne({
        role_id,
        permission_id
      });

      if (!relation) {
        return res.status(404).json({
          success: false,
          message: '角色权限关联不存在'
        });
      }

      return res.json({
        success: true,
        message: '权限移除成功'
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  findByRole: async function(req, res) {
    try {
      const { roleId } = req.params;

      const role = await Role.findOne({ id: roleId });
      if (!role) {
        return res.status(404).json({
          success: false,
          message: '角色不存在'
        });
      }

      const relations = await RolePermission.find({ role_id: roleId });

      if (relations.length === 0) {
        return res.json({
          success: true,
          data: []
        });
      }

      const permissionIds = relations.map(r => r.permission_id);
      const permissions = await Permission.find({
        id: { in: permissionIds }
      });

      return res.json({
        success: true,
        data: permissions
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  findByPermission: async function(req, res) {
    try {
      const { permissionId } = req.params;

      const permission = await Permission.findOne({ id: permissionId });
      if (!permission) {
        return res.status(404).json({
          success: false,
          message: '权限不存在'
        });
      }

      const relations = await RolePermission.find({ permission_id: permissionId });

      if (relations.length === 0) {
        return res.json({
          success: true,
          data: []
        });
      }

      const roleIds = relations.map(r => r.role_id);
      const roles = await Role.find({
        id: { in: roleIds }
      });

      return res.json({
        success: true,
        data: roles
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
