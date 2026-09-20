const bcrypt = require('bcryptjs');
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
  login: async function(req, res) {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: '用户名和密码不能为空'
        });
      }
      
      const user = await User.findOne({
        or: [
          { username: username },
          { email: username }
        ]
      });
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: '用户不存在'
        });
      }
      
      if (user.status === 'locked') {
        return res.status(403).json({
          success: false,
          message: '账户已被锁定，请联系管理员'
        });
      }
      
      if (user.status === 'inactive') {
        return res.status(403).json({
          success: false,
          message: '账户未激活'
        });
      }
      
      const isMatch = await bcrypt.compare(password, user.password_hash);
      
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: '密码错误'
        });
      }
      
      await User.updateOne({ id: user.id }).set({
        last_login_time: new Date()
      });
      
      const roles = await getUserRoles(user.id);
      const userPayload = AuthSupportService.toUserPayload(user, roles);
      const token = AuthSupportService.issueToken({
        id: user.id,
        username: user.username,
        role: userPayload.role,
        roles: userPayload.roles
      });
      
      return res.json({
        success: true,
        message: '登录成功',
        data: {
          token,
          user: userPayload
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  register: async function(req, res) {
    try {
      const { username, email, password, real_name, phone } = req.body;
      
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
      
      const user = await User.create({
        username,
        email,
        password_hash: password,
        real_name: real_name || '',
        phone: phone || '',
        status: 'active'
      }).fetch();
      
      const roles = ['user'];
      const userPayload = AuthSupportService.toUserPayload(user, roles);
      const token = AuthSupportService.issueToken({
        id: user.id,
        username: user.username,
        role: userPayload.role,
        roles: userPayload.roles
      });
      
      return res.json({
        success: true,
        message: '注册成功',
        data: {
          token,
          user: userPayload
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  logout: async function(req, res) {
    try {
      return res.json({
        success: true,
        message: '退出登录成功'
      });
    } catch (err) {
      return res.serverError(err);
    }
  },
  
  me: async function(req, res) {
    try {
      const user = await User.findOne({ id: req.user.id });
      
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

  clientHelper: async function(req, res) {
    try {
      const token = AuthSupportService.extractBearerToken(req);
      let principal = null;

      if (token) {
        try {
          const decoded = AuthSupportService.verifyToken(token);
          principal = {
            id: decoded.id,
            username: decoded.username,
            role: decoded.role || AuthSupportService.getPrimaryRole(decoded.roles),
            roles: AuthSupportService.normalizeRoles(decoded.roles)
          };
        } catch (err) {
          principal = null;
        }
      }

      return res.json({
        success: true,
        data: {
          service: AuthSupportService.getServiceContext(),
          auth: {
            scheme: 'Bearer',
            authorizationHeader: 'Authorization',
            tokenValid: Boolean(principal),
            principal,
            callbackHeaderName: AuthSupportService.getAdminCallbackHeaderName()
          }
        }
      });
    } catch (err) {
      return res.serverError(err);
    }
  }
};
