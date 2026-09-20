const path = require('path');

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// 根因说明：通讯服务与网关数据库已经迁移到云服务器，默认配置若继续指向本地会导致管理端无法连接云端服务。
const DEFAULT_CLOUD_TCP_API_BASE_URL = 'http://8.138.194.3:32771';
const DEFAULT_CLOUD_GATEWAY_DB_HOST = '8.138.194.3';
const DEFAULT_CLOUD_GATEWAY_DB_USER = 'device-gateway';
const DEFAULT_CLOUD_GATEWAY_DB_PASSWORD = 'T4xyidTRZmKFCfHM';

module.exports = {
  server: {
    host: process.env.ADMIN_BACKEND_HOST || '0.0.0.0',
    port: readNumber(process.env.ADMIN_BACKEND_PORT, 3002)
  },
  cors: {
    // 修复说明：管理端前端预览环境已固定从 10.20.0.44:4201 访问管理端后端；这里补齐默认白名单，避免预览态登录和数据查询被 CORS 拦截。
    origin: (process.env.ADMIN_FRONTEND_ORIGIN || 'http://localhost:4201,http://10.20.0.44:4201').split(',').map(item => item.trim()).filter(Boolean)
  },
  database: {
    host: process.env.ADMIN_DB_HOST || '127.0.0.1',
    port: readNumber(process.env.ADMIN_DB_PORT, 3306),
    user: process.env.ADMIN_DB_USER || 'root',
    password: process.env.ADMIN_DB_PASSWORD || '123456',
    database: process.env.ADMIN_DB_NAME || 'cexie_monitor_admin',
    connectionLimit: readNumber(process.env.ADMIN_DB_CONNECTION_LIMIT, 10),
    waitForConnections: true,
    queueLimit: 0,
    multipleStatements: true
  },
  gatewayDatabase: {
    // 修复说明：管理端查询上位机在线状态时应默认连接云服务器上的网关库，而不是误连本地数据库。
    host: process.env.ADMIN_GATEWAY_DB_HOST || DEFAULT_CLOUD_GATEWAY_DB_HOST,
    port: readNumber(process.env.ADMIN_GATEWAY_DB_PORT, process.env.ADMIN_DB_PORT || 3306),
    // 修复说明：这里保留环境变量优先级，方便后续运维切换账号时不再改源码。
    user: process.env.ADMIN_GATEWAY_DB_USER || DEFAULT_CLOUD_GATEWAY_DB_USER,
    password: process.env.ADMIN_GATEWAY_DB_PASSWORD || DEFAULT_CLOUD_GATEWAY_DB_PASSWORD,
    // 修复说明：按用户最新确认，云端网关数据库实际库名应为 device-gateway，这里恢复为正确默认值。
    database: process.env.ADMIN_GATEWAY_DB_NAME || 'device-gateway',
    connectionLimit: readNumber(process.env.ADMIN_GATEWAY_DB_CONNECTION_LIMIT, 5),
    waitForConnections: true,
    queueLimit: 0
  },
  tcpApi: {
    // 修复说明：管理端下发任务与查询指令结果时，应默认访问云端通讯服务 HTTP API，而不是本地 3001 端口。
    baseUrl: (process.env.TCP_HTTP_API_BASE_URL || DEFAULT_CLOUD_TCP_API_BASE_URL).replace(/\/$/, ''),
    timeoutMs: readNumber(process.env.TCP_HTTP_API_TIMEOUT_MS, 5000)
  },
  tasks: {
    defaultPollIntervalMs: readNumber(process.env.ADMIN_TASK_POLL_INTERVAL_MS, 3000),
    maxPollIntervalMs: readNumber(process.env.ADMIN_TASK_MAX_POLL_INTERVAL_MS, 10000),
    defaultTimeoutSeconds: readNumber(process.env.ADMIN_TASK_TIMEOUT_SECONDS, 120),
    maxTimeoutSeconds: readNumber(process.env.ADMIN_TASK_MAX_TIMEOUT_SECONDS, 900)
  },
  security: {
    adminBootstrapKey: process.env.ADMIN_BOOTSTRAP_KEY || 'admin-bootstrap-key',
    jwtSecret: process.env.ADMIN_JWT_SECRET || 'cexie-admin-jwt-secret-2026',
    jwtExpiresInSeconds: readNumber(process.env.ADMIN_JWT_EXPIRES_IN_SECONDS, 86400)
  },
  callbackAuth: {
    headerName: process.env.ADMIN_CALLBACK_HEADER || 'x-admin-callback-secret',
    secret: process.env.ADMIN_CALLBACK_SECRET || 'admin-callback-secret',
    serviceName: process.env.ADMIN_SERVICE_NAME || 'admin-backend'
  },
  paths: {
    initSql: path.join(__dirname, '..', 'init-management.sql')
  }
};
