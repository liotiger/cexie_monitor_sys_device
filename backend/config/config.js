const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  // 修复说明：客户端前端预览环境已固定从 10.20.0.44:4200 访问业务后端，若默认白名单缺少该来源，浏览器预检请求会被 CORS 拦截。
  'http://10.20.0.44:4200',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // 修复说明：保留 Vite 默认端口的预览访问来源，避免后续切回 5173 端口调试时再次出现跨域拦截。
  'http://10.20.0.44:5173'
];

function getAllowedOrigins() {
  if (!process.env.CORS_ALLOW_ORIGINS) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return process.env.CORS_ALLOW_ORIGINS
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const businessDbUrl =
  process.env.BUSINESS_DB_URL ||
  process.env.DATABASE_URL ||
  'mysql://root:123456@localhost:3306/cexie_monitor_business';

// 根因说明：客户端后端代理管理端任务接口时必须携带客户 Key；当前上位机 id=1 对应的真实绑定客户 Key 已从管理端库核实。
const defaultAdminClientKey =
  process.env.ADMIN_CLIENT_KEY ||
  process.env.CLIENT_KEY ||
  '9b0bc242de2accf99b6a390d63af688389fd46168a471454';

module.exports = {
  port: process.env.PORT || 1337,
  environment: process.env.NODE_ENV || 'development',
  hooks: {
    grunt: false
  },
  globals: {
    sails: true,
    models: true,
    services: true,
    _: require('@sailshq/lodash'),
    async: false
  },
  log: {
    level: 'debug'
  },
  http: {
    middleware: {
      order: [
        'cookieParser',
        'session',
        'bodyParser',
        'compress',
        'poweredBy',
        'router',
        'www',
        'favicon',
      ],
    }
  },
  session: {
    secret: process.env.SESSION_SECRET || 'cexie-monitor-client-session-secret-2026',
    cookie: {
      maxAge: 24 * 60 * 60 * 1000
    }
  },
  sockets: {
    onlyAllowOrigins: getAllowedOrigins(),
    transports: ['websocket']
  },
  models: {
    migrate: 'safe',
    attributes: {
      id: { type: 'number', autoIncrement: true },
      created_at: { type: 'ref', columnType: 'datetime', autoCreatedAt: true },
      updated_at: { type: 'ref', columnType: 'datetime', autoUpdatedAt: true }
    }
  },
  datastores: {
    default: {
      adapter: 'sails-mysql',
      url: businessDbUrl
    }
  },
  custom: {
    serviceName: process.env.SERVICE_NAME || 'cexie-client-business-service',
    serviceRole: process.env.SERVICE_ROLE || 'client',
    // 修复说明：默认填入当前客户端实际绑定客户的 Key，同时保留环境变量覆盖能力，避免 latest-monitor-task 因缺少 Key 直接失败。
    adminClientKey: defaultAdminClientKey,
    auth: {
      jwtSecret: process.env.JWT_SECRET || 'cexie-monitor-jwt-secret-2026',
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h'
    },
    adminCallback: {
      // 修复说明：管理端默认使用 admin-callback-secret 回调客户端；客户端这里若默认空串，会把合法回调全部判成 401。
      // 为了保持两端默认配置一致，这里改成与管理端相同的默认密钥，同时仍保留环境变量覆盖能力。
      secret: process.env.ADMIN_CALLBACK_SECRET || 'admin-callback-secret',
      headerName: process.env.ADMIN_CALLBACK_HEADER || 'x-admin-callback-secret'
    },
    // 修复说明：Node 18 原生 fetch 将 localhost 解析到 IPv6 ::1，而服务监听在 IPv4 0.0.0.0，导致 fetch failed。统一使用 127.0.0.1。
    adminApiBaseUrl: process.env.ADMIN_API_BASE_URL || 'http://127.0.0.1:3002/api',
    clientApiBaseUrl: process.env.CLIENT_API_BASE_URL || 'http://127.0.0.1:1337/api'
  },
  csrf: false,
  security: {
    cors: {
      allRoutes: true,
      allowOrigins: getAllowedOrigins(),
      allowCredentials: true,
      allowRequestMethods: 'GET, POST, PUT, DELETE, OPTIONS',
      allowRequestHeaders: 'content-type, authorization, x-admin-callback-secret, x-api-target'
    }
  }
};
