module.exports = {
  find: async function(req, res) {
    try {
      const { page = 1, limit = 10, search, module, group_by_module } = req.query;
      const skip = (page - 1) * limit;
      
      let query = {};
      if (search) {
        query = {
          or: [
            { permission_code: { contains: search } },
            { permission_name: { contains: search } }
          ]
        };
      }
      
      if (module) {
        query.module = module;
      }
      
      if (group_by_module === 'true') {
        const permissions = await Permission.find(query).sort('id ASC');
        const groupedPermissions = {};
        permissions.forEach(perm => {
          const moduleName = perm.module || '未分类';
          if (!groupedPermissions[moduleName]) {
            groupedPermissions[moduleName] = [];
          }
          groupedPermissions[moduleName].push(perm);
        });
        
        return res.json({
          success: true,
          data: {
            grouped: groupedPermissions,
            total: permissions.length
          }
        });
      }
      
      const permissions = await Permission.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('id DESC');
      
      const total = await Permission.count(query);
      
      return res.json({
        success: true,
        data: {
          list: permissions,
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
      const permission = await Permission.findOne({ id: req.params.id });
      
      if (!permission) {
        return res.status(404).json({
          success: false,
          message: '权限不存在'
        });
      }
      
      return res.json({
        success: true,
        data: permission
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  create: async function(req, res) {
    try {
      if (!req.user.roles || !(req.user.roles.includes('admin') || req.user.roles === 'admin')) {
        return res.status(403).json({
          success: false,
          message: '无权限执行此操作'
        });
      }
      
      const { permission_code, permission_name, permission_type, description, module } = req.body;
      
      const existingPermission = await Permission.findOne({ permission_code });
      if (existingPermission) {
        return res.status(400).json({
          success: false,
          message: '权限代码已存在'
        });
      }
      
      const permission = await Permission.create({
        permission_code,
        permission_name,
        permission_type: permission_type || 'system',
        description,
        module
      }).fetch();
      
      return res.json({
        success: true,
        message: '权限创建成功',
        data: permission
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  update: async function(req, res) {
    try {
      if (!req.user.roles || !(req.user.roles.includes('admin') || req.user.roles === 'admin')) {
        return res.status(403).json({
          success: false,
          message: '无权限执行此操作'
        });
      }
      
      const { id } = req.params;
      const updateData = {};
      const allowedFields = ['permission_code', 'permission_name', 'permission_type', 'description', 'module'];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });
      
      if (updateData.permission_code) {
        const existingPermission = await Permission.findOne({ 
          permission_code: updateData.permission_code,
          id: { '!=': id }
        });
        if (existingPermission) {
          return res.status(400).json({
            success: false,
            message: '权限代码已存在'
          });
        }
      }
      
      const permission = await Permission.updateOne({ id }).set(updateData);
      
      if (!permission) {
        return res.status(404).json({
          success: false,
          message: '权限不存在'
        });
      }
      
      return res.json({
        success: true,
        message: '权限更新成功',
        data: permission
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  destroy: async function(req, res) {
    try {
      if (!req.user.roles || !(req.user.roles.includes('admin') || req.user.roles === 'admin')) {
        return res.status(403).json({
          success: false,
          message: '无权限执行此操作'
        });
      }
      
      const { id } = req.params;
      
      const permission = await Permission.destroyOne({ id });
      
      if (!permission) {
        return res.status(404).json({
          success: false,
          message: '权限不存在'
        });
      }
      
      return res.json({
        success: true,
        message: '权限删除成功'
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
