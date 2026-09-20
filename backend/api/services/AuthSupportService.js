const jwt = require('jsonwebtoken');

function getCustomConfig() {
  return (global.sails && sails.config && sails.config.custom) || {};
}

function getAuthConfig() {
  const custom = getCustomConfig();
  return custom.auth || {};
}

function getAdminCallbackConfig() {
  const custom = getCustomConfig();
  return custom.adminCallback || {};
}

function uniqueRoles(roles) {
  return Array.from(new Set((roles || []).filter(Boolean)));
}

module.exports = {
  getJwtSecret() {
    return getAuthConfig().jwtSecret || process.env.JWT_SECRET || 'cexie-monitor-jwt-secret-2026';
  },

  getJwtExpiresIn() {
    return getAuthConfig().jwtExpiresIn || process.env.JWT_EXPIRES_IN || '24h';
  },

  normalizeRoles(roles) {
    if (Array.isArray(roles)) {
      return uniqueRoles(roles);
    }

    if (typeof roles === 'string' && roles.trim()) {
      return uniqueRoles(
        roles
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      );
    }

    return ['user'];
  },

  getPrimaryRole(roles) {
    const normalizedRoles = this.normalizeRoles(roles);

    if (normalizedRoles.includes('system_admin')) {
      return 'system_admin';
    }
    if (normalizedRoles.includes('admin')) {
      return 'admin';
    }
    if (normalizedRoles.includes('client_admin')) {
      return 'client_admin';
    }

    return normalizedRoles[0] || 'user';
  },

  isAdminRole(roles) {
    const normalizedRoles = this.normalizeRoles(roles);
    return normalizedRoles.includes('admin') || normalizedRoles.includes('system_admin');
  },

  issueToken(payload) {
    return jwt.sign(payload, this.getJwtSecret(), {
      expiresIn: this.getJwtExpiresIn()
    });
  },

  verifyToken(token) {
    return jwt.verify(token, this.getJwtSecret());
  },

  extractBearerToken(req) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  },

  getServiceContext() {
    const custom = getCustomConfig();

    return {
      serviceName: custom.serviceName || process.env.SERVICE_NAME || 'cexie-client-business-service',
      serviceRole: custom.serviceRole || process.env.SERVICE_ROLE || 'client',
      adminApiBaseUrl: custom.adminApiBaseUrl || process.env.ADMIN_API_BASE_URL || '',
      adminClientKeyConfigured: Boolean(this.getAdminClientKey()),
      clientApiBaseUrl: custom.clientApiBaseUrl || process.env.CLIENT_API_BASE_URL || '',
      callbackHeaderName: this.getAdminCallbackHeaderName(),
      callbackSecretConfigured: Boolean(this.getAdminCallbackSecret())
    };
  },

  getAdminApiBaseUrl() {
    const custom = getCustomConfig();
    return custom.adminApiBaseUrl || process.env.ADMIN_API_BASE_URL || '';
  },

  getAdminClientKey() {
    const custom = getCustomConfig();
    return custom.adminClientKey || process.env.ADMIN_CLIENT_KEY || process.env.CLIENT_KEY || '';
  },

  getAdminCallbackSecret() {
    return getAdminCallbackConfig().secret || process.env.ADMIN_CALLBACK_SECRET || '';
  },

  getAdminCallbackHeaderName() {
    return getAdminCallbackConfig().headerName || process.env.ADMIN_CALLBACK_HEADER || 'x-admin-callback-secret';
  },

  verifyAdminCallback(req) {
    const secret = this.getAdminCallbackSecret();
    if (!secret) {
      return false;
    }

    const headerName = this.getAdminCallbackHeaderName().toLowerCase();
    return req.headers[headerName] === secret;
  },

  toUserPayload(user, roles) {
    const normalizedRoles = this.normalizeRoles(roles);

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      real_name: user.real_name,
      phone: user.phone,
      status: user.status,
      role: this.getPrimaryRole(normalizedRoles),
      roles: normalizedRoles,
      last_login_time: user.last_login_time,
      created_at: user.created_at,
      updated_at: user.updated_at
    };
  }
};
