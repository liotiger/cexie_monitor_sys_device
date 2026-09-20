// PM2 生产环境进程配置
// 使用方式：
//   首次启动：npm run prod          （等价于 pm2 start ecosystem.config.js）
//   查看日志：npm run prod:logs
//   重启全部：npm run prod:restart
//   停止全部：npm run prod:stop
//   删除进程：npm run prod:delete
//
// 前置条件：
//   1. 全局安装 PM2：npm install -g pm2
//   2. 安装依赖：npm run install:all
//   3. 构建前端：npm run build
//   4. 修改下方 env 中的数据库密码、JWT 密钥、ADMIN_CLIENT_KEY 等敏感配置
//
// 注意：
// - Sails.js 后端必须设置 cwd，否则会从项目根目录找 config/ 报 session secret 错误
// - Web 前端通过 vite preview 托管 dist/，移动端 H5 由 mobile-app/scripts/serve-h5.js 托管
// - 所有前端和移动端 H5 都必须先执行 npm run build
module.exports = {
  apps: [
    {
      name: 'cexie-backend',
      cwd: 'backend',
      script: 'app.js',
      env: {
        NODE_ENV: 'production',
        PORT: '1337',
        BUSINESS_DB_URL: 'mysql://cexie_monitor_business:y3bz6tJFHe2XjMwy@127.0.0.1:3306/cexie_monitor_business',
        ADMIN_API_BASE_URL: 'http://127.0.0.1:3002/api',
        CLIENT_API_BASE_URL: 'http://127.0.0.1:1337/api',
        ADMIN_CALLBACK_SECRET: 'admin-callback-secret',
        JWT_SECRET: 'cexie-monitor-jwt-secret-2026',
        ADMIN_CLIENT_KEY: '<从管理端获取的实际 client_key>'
      }
    },
    {
      name: 'cexie-admin-backend',
      cwd: 'admin-backend',
      script: 'app.js',
      env: {
        ADMIN_BACKEND_HOST: '0.0.0.0',
        ADMIN_BACKEND_PORT: '3002',
        ADMIN_DB_HOST: '127.0.0.1',
        ADMIN_DB_PORT: '3306',
        ADMIN_DB_USER: 'cexie_monitor_admin',
        ADMIN_DB_PASSWORD: 'BRj8nZFayT53Wtbb',
        ADMIN_DB_NAME: 'cexie_monitor_admin',
        ADMIN_GATEWAY_DB_HOST: '47.109.39.41',
        ADMIN_GATEWAY_DB_PORT: '3306',
        ADMIN_GATEWAY_DB_USER: 'root',
        ADMIN_GATEWAY_DB_PASSWORD: '123456',
        ADMIN_GATEWAY_DB_NAME: 'device_gateway',
        TCP_HTTP_API_BASE_URL: 'http://47.109.39.41:32771',
        ADMIN_FRONTEND_ORIGIN: 'http://43.139.3.200,http://43.139.3.200:4201,http://127.0.0.1:4201',
        ADMIN_JWT_SECRET: 'cexie-admin-jwt-secret-2026',
        ADMIN_CALLBACK_SECRET: 'admin-callback-secret'
      }
    },
    {
      name: 'cexie-frontend',
      cwd: 'frontend',
      script: 'node_modules/vite/bin/vite.js',
      args: 'preview --host 0.0.0.0 --port 4200',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'cexie-admin-frontend',
      cwd: 'admin-frontend',
      script: 'node_modules/vite/bin/vite.js',
      args: 'preview --host 0.0.0.0 --port 4201',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'cexie-mobile-h5',
      cwd: 'mobile-app',
      script: 'scripts/serve-h5.js',
      env: {
        NODE_ENV: 'production',
        MOBILE_H5_HOST: '0.0.0.0',
        MOBILE_H5_PORT: '4202',
        MOBILE_API_PROXY_TARGET: 'http://127.0.0.1:1337'
      }
    }
  ]
};
