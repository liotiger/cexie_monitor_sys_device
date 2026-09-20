const OPERATION_CONFIG = {
  'POST /api/users': { type: 'create', target: 'user' },
  'PUT /api/users/:id': { type: 'update', target: 'user' },
  'DELETE /api/users/:id': { type: 'delete', target: 'user' },
  'POST /api/roles': { type: 'create', target: 'role' },
  'PUT /api/roles/:id': { type: 'update', target: 'role' },
  'DELETE /api/roles/:id': { type: 'delete', target: 'role' },
  'POST /api/permissions': { type: 'create', target: 'permission' },
  'PUT /api/permissions/:id': { type: 'update', target: 'permission' },
  'DELETE /api/permissions/:id': { type: 'delete', target: 'permission' },
  'POST /api/devices': { type: 'create', target: 'device' },
  'PUT /api/devices/:id': { type: 'update', target: 'device' },
  'DELETE /api/devices/:id': { type: 'delete', target: 'device' },
  'POST /api/devices/:id/bind': { type: 'bind', target: 'device' },
  'POST /api/devices/:id/unbind': { type: 'unbind', target: 'device' },
  'POST /api/projects': { type: 'create', target: 'project' },
  'PUT /api/projects/:id': { type: 'update', target: 'project' },
  'DELETE /api/projects/:id': { type: 'delete', target: 'project' },
  'POST /api/monitoring-holes': { type: 'create', target: 'monitoring_hole' },
  'PUT /api/monitoring-holes/:id': { type: 'update', target: 'monitoring_hole' },
  'DELETE /api/monitoring-holes/:id': { type: 'delete', target: 'monitoring_hole' },
  'POST /api/monitoring-holes/:id/bind-device': { type: 'bind', target: 'monitoring_hole' },
  'POST /api/monitoring-holes/:id/unbind-device': { type: 'unbind', target: 'monitoring_hole' },
  'POST /api/scheduled-tasks': { type: 'create', target: 'scheduled_task' },
  'PUT /api/scheduled-tasks/:id': { type: 'update', target: 'scheduled_task' },
  'DELETE /api/scheduled-tasks/:id': { type: 'delete', target: 'scheduled_task' },
  'POST /api/system-config': { type: 'create', target: 'system_config' },
  'PUT /api/system-config/:id': { type: 'update', target: 'system_config' },
  'DELETE /api/system-config/:id': { type: 'delete', target: 'system_config' },
  'POST /api/system-config/upsert': { type: 'upsert', target: 'system_config' },
  'POST /api/auth/login': { type: 'login', target: 'auth' },
  'POST /api/auth/logout': { type: 'logout', target: 'auth' }
};

function getOperationType(method, path) {
  const routeKey = `${method.toUpperCase()} ${path}`;
  
  for (const [pattern, config] of Object.entries(OPERATION_CONFIG)) {
    const regex = new RegExp('^' + pattern.replace(/:id/g, '[^/]+').replace(/\//g, '\\/') + '$');
    if (regex.test(routeKey)) {
      return config;
    }
  }
  
  return null;
}

function getClientIp(req) {
  return req.headers['x-forwarded-for'] ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.ip ||
         '';
}

function getUserAgent(req) {
  return req.headers['user-agent'] || '';
}

module.exports = function logOperation(options) {
  options = options || {};
  
  const excludePaths = options.excludePaths || [
    '/api/auth/me',
    '/api/dashboard',
    '/api/operation-logs'
  ];
  
  return async function(req, res, proceed) {
    const method = req.method;
    const path = req.path;
    
    const shouldExclude = excludePaths.some(excludePath => 
      path.startsWith(excludePath)
    );
    
    if (shouldExclude || method === 'GET') {
      return proceed();
    }
    
    const operationConfig = getOperationType(method, path);
    
    if (!operationConfig) {
      return proceed();
    }
    
    const originalJson = res.json.bind(res);
    
    res.json = function(data) {
      if (data && data.success) {
        const logData = {
          user_id: req.user?.id || null,
          operation_type: operationConfig.type,
          operation_target: operationConfig.target,
          target_id: req.params?.id ? parseInt(req.params.id) : null,
          operation_details: JSON.stringify({
            method: method,
            path: path,
            body: sanitizeBody(req.body),
            query: req.query
          }),
          ip_address: getClientIp(req),
          user_agent: getUserAgent(req),
          operation_time: Date.now()
        };
        
        OperationLog.create(logData).exec((err) => {
          if (err) {
            sails.log.error('记录操作日志失败:', err);
          }
        });
      }
      
      return originalJson(data);
    };
    
    return proceed();
  };
};

function sanitizeBody(body) {
  if (!body) return {};
  
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'password_hash', 'token', 'secret', 'apiKey'];
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '******';
    }
  });
  
  return sanitized;
}
