const AuthSupportService = require('../services/AuthSupportService');

module.exports = async function(req, res, proceed) {
  if (req.user && AuthSupportService.isAdminRole(req.user.roles || req.user.role)) {
    return proceed();
  }

  return res.status(403).json({
    success: false,
    message: '需要管理员权限'
  });
};
