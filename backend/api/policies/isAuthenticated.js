const AuthSupportService = require('../services/AuthSupportService');

module.exports = async function(req, res, proceed) {
  const token = AuthSupportService.extractBearerToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: '未提供认证令牌'
    });
  }

  try {
    const decoded = AuthSupportService.verifyToken(token);
    decoded.roles = AuthSupportService.normalizeRoles(decoded.roles);
    decoded.role = decoded.role || AuthSupportService.getPrimaryRole(decoded.roles);
    req.user = decoded;
    return proceed();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: '令牌无效或已过期'
    });
  }
};
