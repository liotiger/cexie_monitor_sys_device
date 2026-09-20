/**
 * 角色控制器
 * 处理角色的增删改查操作
 */
module.exports = {
  find: async function(req, res) {
    try {
      const { page = 1, limit = 10, search, role_type } = req.query;
      const skip = (page - 1) * limit;

      let query = {};
      if (search) {
        query = {
          or: [
            { role_code: { contains: search } },
            { role_name: { contains: search } }
          ]
        };
      }
      if (role_type) {
        query.role_type = role_type;
      }

      const roles = await Role.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('created_at DESC');

      const total = await Role.count(query);

      return res.json({
        success: true,
        data: {
          list: roles,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total
          }
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  findOne: async function(req, res) {
    try {
      const role = await Role.findOne({ id: req.params.id });

      if (!role) {
        return res.status(404).json({
          success: false,
          message: '角色不存在'
        });
      }

      return res.json({
        success: true,
        data: role
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  create: async function(req, res) {
    try {
      const { role_code, role_name, role_type, description, is_default } = req.body;

      const existingRole = await Role.findOne({ role_code });
      if (existingRole) {
        return res.status(400).json({
          success: false,
          message: '角色代码已存在'
        });
      }

      const role = await Role.create({
        role_code,
        role_name,
        role_type: role_type || 'system',
        description,
        is_default: is_default || false
      }).fetch();

      return res.json({
        success: true,
        message: '角色创建成功',
        data: role
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  update: async function(req, res) {
    try {
      const { id } = req.params;
      const updateData = {};
      const allowedFields = ['role_code', 'role_name', 'role_type', 'description', 'is_default'];

      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      if (updateData.role_code) {
        const existingRole = await Role.findOne({
          role_code: updateData.role_code,
          id: { '!=': id }
        });
        if (existingRole) {
          return res.status(400).json({
            success: false,
            message: '角色代码已存在'
          });
        }
      }

      const role = await Role.updateOne({ id }).set(updateData);

      if (!role) {
        return res.status(404).json({
          success: false,
          message: '角色不存在'
        });
      }

      return res.json({
        success: true,
        message: '角色更新成功',
        data: role
      });
    } catch (err) {
      return res.serverError(err);
    }
  },

  destroy: async function(req, res) {
    try {
      const { id } = req.params;

      const role = await Role.destroyOne({ id });

      if (!role) {
        return res.status(404).json({
          success: false,
          message: '角色不存在'
        });
      }

      return res.json({
        success: true,
        message: '角色删除成功'
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
