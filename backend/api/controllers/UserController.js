const AuthSupportService = require('../services/AuthSupportService');

async function getUserRoles(userId) {
  try {
    const userRoles = await UserRole.find({ user_id: userId });
    if (userRoles.length === 0) {
      return ['user'];
    }
    const roleIds = userRoles.map(ur => ur.role_id);
    const roles = await Role.find({ id: { in: roleIds } });
    return roles.map(r => r.role_code).filter(Boolean);
  } catch (err) {
    return ['user'];
  }
}

module.exports = {
  find: async function(req, res) {
    try {
      const { page = 1, limit = 10, search, status } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = {};
      
      if (search) {
        query.or = [
          { username: { contains: search } },
          { email: { contains: search } },
          { real_name: { contains: search } }
        ];
      }
      
      if (status && ['active', 'inactive', 'locked'].includes(status)) {
        query.status = status;
      }
      
      const users = await User.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort('created_at DESC');
      
      const total = await User.count(query);
      
      const usersWithRoles = await Promise.all(users.map(async (user) => {
        const roles = await getUserRoles(user.id);
        const role = AuthSupportService.getPrimaryRole(roles);
        return {
          id: user.id,
          username: user.username,
          email: user.email,
          real_name: user.real_name,
          phone: user.phone,
          status: user.status,
          role,
          roles: roles,
          last_login_time: user.last_login_time,
          created_at: user.created_at,
          updated_at: user.updated_at
        };
      }));
      
      return res.json({
        success: true,
        data: {
          list: usersWithRoles,
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
      const user = await User.findOne({ id: req.params.id });
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }
      
      const roles = await getUserRoles(user.id);
      
      return res.json({
        success: true,
        data: AuthSupportService.toUserPayload(user, roles)
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  create: async function(req, res) {
    try {
      const { username, email, password, real_name, phone, status } = req.body;
      
      if (!username || !email || !password) {
        return res.status(400).json({
          success: false,
          message: '用户名、邮箱和密码都是必填的'
        });
      }
      
      const existingUser = await User.findOne({
        or: [
          { username: username },
          { email: email }
        ]
      });
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: '用户名或邮箱已存在'
        });
      }
      
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const validStatus = ['active', 'inactive', 'locked'].includes(status) ? status : 'active';
      
      const user = await User.create({
        username,
        email,
        password_hash: hashedPassword,
        real_name: real_name || '',
        phone: phone || '',
        status: validStatus
      }).fetch();
      
      const roles = await getUserRoles(user.id);
      
      return res.json({
        success: true,
        message: '用户创建成功',
        data: AuthSupportService.toUserPayload(user, roles)
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  update: async function(req, res) {
    try {
      const { id } = req.params;
      const updateData = {};
      const allowedFields = ['username', 'email', 'real_name', 'phone', 'status'];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          if (field === 'status' && !['active', 'inactive', 'locked'].includes(req.body[field])) {
            return;
          }
          updateData[field] = req.body[field];
        }
      });
      
      if (updateData.username || updateData.email) {
        const existingUser = await User.findOne({
          or: [
            updateData.username ? { username: updateData.username } : {},
            updateData.email ? { email: updateData.email } : {}
          ],
          id: { '!=': id }
        });
        
        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: '用户名或邮箱已存在'
          });
        }
      }
      
      if (req.body.password) {
        const bcrypt = require('bcryptjs');
        updateData.password_hash = await bcrypt.hash(req.body.password, 10);
      }
      
      const user = await User.updateOne({ id }).set(updateData);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }
      
      const roles = await getUserRoles(user.id);
      
      return res.json({
        success: true,
        message: '用户更新成功',
        data: AuthSupportService.toUserPayload(user, roles)
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  destroy: async function(req, res) {
    try {
      const { id } = req.params;
      
      const user = await User.destroyOne({ id });
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }
      
      return res.json({
        success: true,
        message: '用户删除成功'
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  updateStatus: async function(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (!['active', 'inactive', 'locked'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: '无效的状态值'
        });
      }
      
      const user = await User.updateOne({ id }).set({ status });
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: '用户不存在'
        });
      }
      
      return res.json({
        success: true,
        message: '状态更新成功',
        data: {
          id: user.id,
          status: user.status
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
