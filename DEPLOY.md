# 测斜监测系统部署文档（客户端 + 管理端 + 移动端 H5）

> 本文档覆盖**管理端**、**客户端 Web**和**移动端 H5**的部署，不包含 TCP 通讯服务（tcp-server）的部署。移动端基于 uni-app，本阶段仅发布 H5，不构建 App 和小程序。

---

## 一、部署架构总览

```
┌───────────────────────────────┐    ┌───────────────────────────────┐
│ 管理端前端                    │    │ 客户端前端                    │
│ admin-frontend (:4201)        │    │ frontend (:4200)              │
│ 静态产物由 vite preview 托管  │    │ 静态产物由 vite preview 托管  │
└───────────────┬───────────────┘    └───────────────┬───────────────┘
                │ HTTP                               │ HTTP
                ▼                                    ▼
┌───────────────────────────────┐    ┌───────────────────────────────┐
│ 管理端服务                    │    │ 客户端业务服务                │
│ admin-backend (:3002)         │    │ backend (:1337)               │
│ Express + mysql2              │    │ Sails.js + sails-mysql        │
│ 鉴权 | 任务编排 | 客户管理    │    │ 查询 | 成果处理 | 报表        │
└───────┬───────────────┬───────┘    └───────────────┬───────────────┘
        │               │                            │
        │               │                            ▼
        │               │            ┌───────────────────────────────┐
        │               │            │ 业务库                        │
        │               │            │ cexie_monitor_business        │
        │               │            └───────────────────────────────┘
        ▼               ▼
┌──────────────┐  ┌───────────────────────────────┐
│ 管理库       │  │ 云端 TCP 通讯服务（已部署）   │
│ cexie_       │  │ http://8.138.194.3:32771      │
│ monitor_admin│  │ 网关库 device-gateway         │
└──────────────┘  │ (8.138.194.3:3306)            │
                  └───────────────────────────────┘
```

### 端口规划

| 服务 | 端口 | 说明 |
|------|------|------|
| admin-frontend | 4201 | 管理端前端（vite preview） |
| frontend | 4200 | 客户端前端（vite preview） |
| mobile H5 | 4202 | 移动端 H5（内置静态服务） |
| admin-backend | 3002 | 管理端后端（Express） |
| backend | 1337 | 客户端业务后端（Sails.js） |
| MySQL | 3306 | 本地数据库 |

### 数据库规划

| 数据库 | 访问者 | 用途 |
|--------|--------|------|
| `cexie_monitor_admin` | admin-backend | 客户鉴权、任务编排、管理员用户 |
| `cexie_monitor_business` | backend | 业务查询、成果数据、报表 |
| `device-gateway` | admin-backend（只读） | 设备在线状态、指令结果（云端） |

---

## 二、环境要求

| 软件 | 最低版本 | 说明 |
|------|----------|------|
| Node.js | 18.x | 推荐 18.x LTS 或 20.x LTS |
| npm | 9.x | 随 Node.js 安装 |
| MySQL | 8.0 | 需启用 `mysql_native_password` |
| 操作系统 | - | Windows / Linux 均可 |

---

## 三、部署步骤

### 步骤 1：获取代码

```bash
git clone <仓库地址> cexie-monitor-sys
cd cexie-monitor-sys
```

### 步骤 2：安装依赖

```bash
# 安装根目录工具依赖
npm install

# 安装五个子项目依赖
npm run install:backend
npm run install:admin-backend
npm run install:frontend
npm run install:admin-frontend
npm run install:mobile
```

### 步骤 3：创建并初始化数据库

#### 3.1 创建两个数据库

```sql
CREATE DATABASE cexie_monitor_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE cexie_monitor_business CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

#### 3.2 MySQL 8.0 兼容设置（如遇认证报错）

```sql
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '123456';
FLUSH PRIVILEGES;
```

#### 3.3 初始化管理库

```bash
mysql -u root -p cexie_monitor_admin < admin-backend/init-management.sql
```

初始化后管理库自带：
- 管理员账号：`admin` / `admin123`
- 5 个默认角色 + 全量权限
- 客户表 `admin_customers`、任务表 `admin_device_tasks` 等管理端专用表

#### 3.4 初始化业务库

```bash
mysql -u root -p cexie_monitor_business < backend/init-business.sql
```

初始化后业务库自带：
- 管理员账号：`admin` / `admin123`（由 Sails.js 启动时 seed）
- 19 张业务表 + 默认角色、权限、系统配置

> **注意**：业务库的 `admin` 用户由 `backend/app.js` 启动时自动创建/重置密码，无需手动插入。

### 步骤 4：配置环境变量

> **重要说明**：两个后端服务（`admin-backend` 和 `backend`）**均未内置 dotenv**，`.env` 文件不会被自动加载。下列环境变量必须通过以下方式之一注入：
> 1. **系统环境变量**（推荐生产环境）：在启动前通过 `set`（Windows）或 `export`（Linux）注入
> 2. **PM2 ecosystem 配置**（推荐生产环境）：在 `ecosystem.config.js` 的 `env` 字段中声明
> 3. **手动加载 dotenv**：先 `npm install dotenv`，再用 `node -r dotenv/config app.js` 启动
>
> 下面给出的 `.env` 文件内容仅作为变量清单参考，实际使用时需按上述方式之一注入。

#### 4.1 管理端后端 `admin-backend`

在 `admin-backend/` 目录下创建 `.env` 文件（或通过系统环境变量注入）：

```bash
# 服务监听
ADMIN_BACKEND_HOST=0.0.0.0
ADMIN_BACKEND_PORT=3002

# CORS 白名单（管理端前端访问地址，逗号分隔）
ADMIN_FRONTEND_ORIGIN=http://localhost:4201

# 管理库连接
ADMIN_DB_HOST=127.0.0.1
ADMIN_DB_PORT=3306
ADMIN_DB_USER=root
ADMIN_DB_PASSWORD=123456
ADMIN_DB_NAME=cexie_monitor_admin

# 云端网关库连接（只读，查询设备在线状态）
ADMIN_GATEWAY_DB_HOST=8.138.194.3
ADMIN_GATEWAY_DB_PORT=3306
ADMIN_GATEWAY_DB_USER=device-gateway
ADMIN_GATEWAY_DB_PASSWORD=T4xyidTRZmKFCfHM
ADMIN_GATEWAY_DB_NAME=device-gateway

# 云端 TCP 通讯服务 HTTP API（已部署，无需本地启动）
TCP_HTTP_API_BASE_URL=http://8.138.194.3:32771
TCP_HTTP_API_TIMEOUT_MS=5000

# 任务轮询
ADMIN_TASK_POLL_INTERVAL_MS=3000
ADMIN_TASK_MAX_POLL_INTERVAL_MS=10000
ADMIN_TASK_TIMEOUT_SECONDS=120
ADMIN_TASK_MAX_TIMEOUT_SECONDS=900

# 安全配置
ADMIN_BOOTSTRAP_KEY=admin-bootstrap-key
ADMIN_JWT_SECRET=cexie-admin-jwt-secret-2026
ADMIN_JWT_EXPIRES_IN_SECONDS=86400
ADMIN_CALLBACK_HEADER=x-admin-callback-secret
ADMIN_CALLBACK_SECRET=admin-callback-secret
ADMIN_SERVICE_NAME=admin-backend
```

#### 4.2 客户端业务后端 `backend`

在 `backend/` 目录下创建 `.env` 文件（或通过系统环境变量注入）：

```bash
# 服务监听
NODE_ENV=production
PORT=1337

# 业务库连接
BUSINESS_DB_URL=mysql://root:123456@localhost:3306/cexie_monitor_business

# JWT
JWT_SECRET=cexie-monitor-jwt-secret-2026
JWT_EXPIRES_IN=24h

# 管理端回调鉴权（必须与 admin-backend 的 ADMIN_CALLBACK_SECRET 一致）
ADMIN_CALLBACK_HEADER=x-admin-callback-secret
ADMIN_CALLBACK_SECRET=admin-callback-secret

# 管理端 API 地址（客户端后端代理调用管理端时使用）
# 注意：必须使用 127.0.0.1 而非 localhost，Node 18+ 原生 fetch 会优先解析到 IPv6 ::1 导致连接失败
ADMIN_API_BASE_URL=http://127.0.0.1:3002/api

# 客户端 API 地址（同样必须使用 127.0.0.1）
CLIENT_API_BASE_URL=http://127.0.0.1:1337/api

# 客户端绑定的客户 Key（从管理端 admin_customers 表获取）
# 代码内置默认值：9b0bc242de2accf99b6a390d63af688389fd46168a471454（仅用于当前已绑定客户，生产环境务必覆盖）
ADMIN_CLIENT_KEY=<从管理端获取的实际 client_key>

# 服务标识
SERVICE_NAME=cexie-client-business-service
SERVICE_ROLE=client

# CORS 白名单（客户端前端访问地址，逗号分隔）
CORS_ALLOW_ORIGINS=http://localhost:4200,http://127.0.0.1:4200,http://localhost:4202,http://127.0.0.1:4202
```

> **重要**：`ADMIN_CLIENT_KEY` 必须填写管理端 `admin_customers` 表中该客户对应的 `client_key`，否则客户端后端代理管理端接口时会鉴权失败。

#### 4.3 移动端 H5 `mobile-app`

移动端默认请求同源 `/api/app/*`。开发服务器和内置生产静态服务器都会把 `/api` 代理到客户端业务后端：

```bash
MOBILE_H5_HOST=0.0.0.0
MOBILE_H5_PORT=4202
MOBILE_API_PROXY_TARGET=http://127.0.0.1:1337
```

如果由 Nginx 直接托管 `mobile-app/dist/build/h5`，Nginx 必须将 `/api/` 转发到 `backend:1337`。只有确需跨域直连时，才在构建前设置 `VUE_APP_CLIENT_API_BASE_URL`。

### 步骤 5：构建前端产物

```bash
# 构建管理端前端
#   同域名 /admin/ 子路径部署（方案 B）：用 build:subpath，产出 /admin/assets/*
#   子域名 / 本地 preview 部署（方案 A）：用 build，产出 /assets/*
cd admin-frontend
npm run build:subpath
cd ..

# 构建客户端前端
cd frontend
npm run build
cd ..

# 构建移动端 H5
cd mobile-app
npm run build:h5
cd ..
```

构建产物分别在：
- `admin-frontend/dist/`
- `frontend/dist/`
- `mobile-app/dist/build/h5/`

> **注意**：两个前端的生产 API 地址由 `vite.config.js` 按运行阶段自动注入。当 `preview` 主机留空时：
> - 客户端前端默认生成相对路径 `/api`（由 Nginx 同域转发到 1337）
> - 管理端前端根据构建 mode 决定：
>   - 默认构建 `npm run build`（base='/'）→ 相对路径 `/api`（子域名或 PM2 preview 直连时由 Nginx/代理转发到 3002）
>   - 子路径构建 `npm run build:subpath`（base='/admin/'）→ 相对路径 `/admin-api`（需由 Nginx rewrite 到 3002）
>
> 如果部署服务器 IP 不同或需要独立域名直连后端端口，可通过环境变量覆盖。

#### 管理端前端构建模式切换

管理端前端支持两种构建模式，由构建 mode 控制，无需手动修改 `vite.config.js` 或 `router/index.js`：

| 场景 | 构建命令 | 访问入口 | JS 资源路径 | API 基础路径 |
|------|---------|----------|------------|-------------|
| 本地 PM2 preview / 子域名部署 | `npm --prefix admin-frontend run build` | `http://host:4201/`、`admin.example.com/` | `/assets/*.js` | `/api` |
| 同域名 /admin/ 子路径部署 | `npm --prefix admin-frontend run build:subpath` | `http://yourdomain.com/admin/` | `/admin/assets/*.js` | `/admin-api` |

> `build:subpath` 等价于 `vite build --mode admin`，同域名 `/admin/` 部署请使用它。
> 该写法在 Windows 与 Linux 下完全一致，不再依赖环境变量。
> 原先文档给出的 `VITE_ADMIN_BASE=/admin/ npm ...` 是 bash 语法，在 PowerShell 下会静默失效并产出 base='/' 的产物，进而导致浏览器请求 `/assets/*` 命中客户端前端目录而 404。

`base` 会同时同步到 Vue Router 的 `createWebHistory()`，因此路由与静态资源的 base 永远一致，不会出现访问 `/admin/` 时 JS 返回 HTML/MIME 404 的情况。

> 如需自定义非 `/admin/` 的部署子路径，仍可用环境变量 `VITE_ADMIN_BASE` 覆盖（优先级最高）。

#### 单独覆盖前端 API 地址（如需直连后端端口而非同源代理）

默认构建（API 用相对路径）适用于 Nginx 同域名 / 子域名 + 同源代理部署。若需要前端直连后端具体 IP:Port，构建时注入环境变量：

```bash
VITE_ADMIN_API_BASE_URL=http://你的IP:3002/api npm --prefix admin-frontend run build
VITE_CLIENT_API_BASE_URL=http://你的IP:1337/api npm --prefix frontend run build
```

### 步骤 6：启动服务

#### 启动顺序

必须按以下顺序启动，否则服务间调用会失败：

1. **客户端业务后端**（backend）
2. **管理端后端**（admin-backend）
3. **管理端前端**（admin-frontend）
4. **客户端前端**（frontend）
5. **移动端 H5**（mobile-app）

#### 启动命令

> 以下示例使用 Windows PowerShell 语法注入环境变量；Linux 请改用 `export VAR=value`。

```bash
# 1. 启动客户端业务后端
cd backend
$env:NODE_ENV="production"
$env:BUSINESS_DB_URL="mysql://root:123456@localhost:3306/cexie_monitor_business"
$env:ADMIN_API_BASE_URL="http://127.0.0.1:3002/api"
$env:CLIENT_API_BASE_URL="http://127.0.0.1:1337/api"
npm start
# 如已安装 dotenv 也可： node -r dotenv/config app.js

# 2. 启动管理端后端
cd admin-backend
$env:ADMIN_DB_HOST="127.0.0.1"
$env:ADMIN_DB_PASSWORD="123456"
npm start

# 3. 启动管理端前端
cd admin-frontend
npm start

# 4. 启动客户端前端
cd frontend
npm start

# 5. 启动移动端 H5（需先执行 npm run build:h5）
cd mobile-app
$env:MOBILE_H5_PORT="4202"
$env:MOBILE_API_PROXY_TARGET="http://127.0.0.1:1337"
npm run start:h5
```

#### 验证服务启动

| 服务 | 验证方式 | 预期结果 |
|------|----------|----------|
| backend | 访问 `http://localhost:1337` | 返回 JSON，包含 `service_role: "client"` |
| admin-backend | 访问 `http://localhost:3002/health` | 返回 `{ "success": true, ... }` |
| admin-frontend | 访问 `http://localhost:4201` | 显示管理端登录页 |
| frontend | 访问 `http://localhost:4200` | 显示客户端登录页 |
| mobile H5 | 访问 `http://localhost:4202` | 显示移动端登录页 |

---

## 四、首次配置

### 4.1 登录管理端

1. 打开 `http://localhost:4201`
2. 使用管理员账号登录：
   - 用户名：`admin`
   - 密码：`admin123`
   - 管理密钥：`admin-bootstrap-key`
3. **立即修改默认密码**

### 4.2 创建客户并配置回调地址

在管理端创建客户后，需将回调地址配置为客户端业务服务的回调接口：

```
http://127.0.0.1:1337/api/admin/task-callback
```

> **注意**：此地址由 `admin-backend` 内部通过 HTTP 调用，必须使用 `127.0.0.1` 而非 `localhost`（避免 IPv6 解析问题）。若 `admin-backend` 与 `backend` 部署在不同服务器，请替换为 `backend` 所在服务器的实际内网 IP。

### 4.3 获取客户 Key 并配置到客户端后端

1. 在管理端客户列表中找到该客户的 `client_key`
2. 将该值填入客户端后端环境变量 `ADMIN_CLIENT_KEY`
3. 重启客户端业务后端

### 4.4 登录客户端

1. 打开 `http://localhost:4200`
2. 使用客户端账号登录：
   - 用户名：`admin`
   - 密码：`admin123`
3. **立即修改默认密码**

### 4.5 登录移动端 H5

1. 电脑浏览器打开 `http://localhost:4202`
2. 手机与服务器在同一局域网时，打开 `http://<服务器局域网IP>:4202`
3. 使用客户端业务库账号登录；移动端和客户端 Web 共用 `backend` 鉴权及业务数据

移动端默认请求同源 `/api/app/*`，由 `mobile-app/scripts/serve-h5.js` 代理到 `MOBILE_API_PROXY_TARGET`。不要把生产构建固定为 `http://localhost:1337`，否则手机会访问自身的回环地址。

---

## 五、生产环境建议

### 5.1 使用进程管理器

推荐使用 `pm2` 管理后端进程，并通过 `ecosystem.config.js` 统一注入环境变量（无需依赖 dotenv）：

```bash
npm install -g pm2
```

在项目根目录已有 `ecosystem.config.js`（仓库自带），按需修改其中的数据库密码、JWT 密钥、`ADMIN_CLIENT_KEY` 等敏感配置后即可使用。

```js
module.exports = {
  apps: [
    {
      name: 'cexie-backend',
      // 关键：必须设置 cwd，否则 Sails.js 从项目根目录找 config/ 目录会找不到，
      // 导致 "Session secret should be manually specified in production!" 错误
      cwd: 'backend',
      script: 'app.js',
      env: {
        NODE_ENV: 'production',
        PORT: '1337',
        BUSINESS_DB_URL: 'mysql://root:123456@127.0.0.1:3306/cexie_monitor_business',
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
        ADMIN_DB_PORT:'3306',
        ADMIN_DB_USER:'cexie_monitor_admin',
        ADMIN_DB_PASSWORD: 'BRj8nZFayT53Wtbb',
        ADMIN_DB_NAME: 'cexie_monitor_admin',
        ADMIN_GATEWAY_DB_HOST: '8.138.194.3',
        ADMIN_GATEWAY_DB_PASSWORD: 'T4xyidTRZmKFCfHM',
        TCP_HTTP_API_BASE_URL: 'http://8.138.194.3:32771',
        ADMIN_JWT_SECRET: 'cexie-admin-jwt-secret-2026',
        ADMIN_CALLBACK_SECRET: 'admin-callback-secret'
      }
    },
    // 三个前端：先 build 生成静态产物
    // 前端进程不依赖 dotenv，无需注入后端环境变量
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
```

移动端 H5 对应的 PM2 进程为 `cexie-mobile-h5`，由 `mobile-app/scripts/serve-h5.js` 托管 `dist/build/h5`，默认监听 `4202`，并代理 `/api` 到 `backend:1337`。根目录 `ecosystem.config.js` 已包含该进程。

> **前置步骤**：启动前端前必须先构建产物，否则 `vite preview` 或移动端静态服务器找不到构建目录会报错：
> ```bash
> npm run build
> ```
> 构建产物分别在 `frontend/dist/`、`admin-frontend/dist/` 和 `mobile-app/dist/build/h5/`。
>
> 注意：根目录 `npm run build` 中的管理端已按同域名 `/admin/` 子路径模式构建（产出 `/admin/assets/*`）。若需要子域名 / 本地 preview 模式的管理端产物（`/assets/*`），请单独执行 `npm --prefix admin-frontend run build`。

启动并保存（项目已内置 `npm run prod` 等便捷脚本）：

```bash
# 一条命令启动 5 个进程
npm run prod

# 查看日志
npm run prod:logs

# 重启 / 停止 / 删除
npm run prod:restart
npm run prod:stop
npm run prod:delete

# 持久化进程列表 + 开机自启
npm run prod:save
pm2 startup
```

查看五个进程状态：

```bash
pm2 list
pm2 logs
```

#### 修改 ecosystem.config.js 后让环境变量生效

PM2 进程启动后会缓存环境变量。修改 `ecosystem.config.js` 中的环境变量（例如客户端后端的 `ADMIN_CLIENT_KEY` / `CLIENT_KEY`、数据库密码、JWT 密钥等）后，普通 `pm2 restart` 可能不会刷新旧环境变量，必须带 `--update-env`。

只更新客户端后端环境变量时：

```bash
pm2 restart cexie-backend --update-env
pm2 save
```

按 `ecosystem.config.js` 重新加载全部进程环境变量时：

```bash
pm2 reload ecosystem.config.js --update-env
pm2 save
```

如果仍不生效，可删除对应进程后重新按配置启动：

```bash
pm2 delete cexie-backend
pm2 start ecosystem.config.js --only cexie-backend
pm2 save
```

验证客户端后端是否已读取新的 `ADMIN_CLIENT_KEY`：

```bash
pm2 show cexie-backend
pm2 logs cexie-backend
```

客户端后端优先读取 `ADMIN_CLIENT_KEY`，也兼容 `CLIENT_KEY`。生产环境推荐在 `ecosystem.config.js` 中配置从管理端客户列表复制的 `client_key`：

```js
ADMIN_CLIENT_KEY: '从管理端客户列表复制的 client_key'
```

### 5.2 使用 Nginx 反向代理（客户端 + 管理端同服务器部署）

客户端、管理端和移动端 H5 部署在同一台服务器时，可选择两种方案：**子域名方式（推荐）**，或使用单个 Nginx `server` 的**同域名不同路径方式**。方案 A 将移动端部署在 `mobile.yourdomain.com`；方案 B 将移动端集成到 `/mobile/`。两种方案都只需对外暴露 Nginx 的 80/443 端口，后端真实端口（1337/3002）无需直接开放。

#### 方案 A：子域名方式（推荐，改动最小）

为客户端和管理端分别分配子域名，例如：
- `client.yourdomain.com` → 客户端前端 + 客户端后端
- `admin.yourdomain.com` → 管理端前端 + 管理端后端

**Nginx 配置**：

```nginx
# 管理端
server {
    listen 80;
    server_name admin.yourdomain.com;

    # 管理端前端静态产物
    location / {
        proxy_pass http://127.0.0.1:4201;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 管理端 API → admin-backend (3002)
    location /api/ {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# 客户端
server {
    listen 80;
    server_name client.yourdomain.com;

    # 客户端前端静态产物
    location / {
        proxy_pass http://127.0.0.1:4200;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 客户端 API → backend (1337)
    # 注意：客户端前端可能切换到 admin 目标调用管理端接口，
    # 此时请求会带 X-Api-Target: admin 头，Nginx 不识别该头，
    # 所以客户端前端的 API 地址必须指向客户端后端 (1337)，
    # 由客户端后端内部代理转发到管理端后端（已内置实现）。
    location /api/ {
        proxy_pass http://127.0.0.1:1337;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# 移动端 H5
server {
    listen 80;
    server_name mobile.yourdomain.com;

    root /www/cexie-monitor-sys/mobile-app/dist/build/h5;

    location /api/ {
        proxy_pass http://127.0.0.1:1337;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**前端构建**：两个前端默认构建（`npm run build`）已自动生成子域名部署所需的相对路径：
- 客户端前端：`base='/'`、API=`/api`
- 管理端前端：`base='/'`、API=`/api`

Nginx 的 `server` 块中分别配置各自的 `/api` 代理到对应后端即可，无需修改 `vite.config.js`。执行：

```bash
npm run build
pm2 restart cexie-backend cexie-admin-backend
nginx -t
systemctl reload nginx
```

> 使用 Nginx 直托管时，PM2 不需要启动 `cexie-frontend`、`cexie-admin-frontend` 和 `cexie-mobile-h5`，静态产物由 Nginx 读取 `dist` 目录。如果仍保留 PM2 跑前端 preview，访问 `http://服务器IP:4201/` 必须用默认构建（`npm --prefix admin-frontend run build`），否则 base 为 `/admin/` 时根路径访问会导致 JS 404 返回 HTML。

#### 前端访问异常：MIME 类型为 text/html / JS 资源 404

如果访问管理端（无论是 `http://localhost:4201/` 直接预览，还是通过 Nginx `/admin/` 子路径）时看到：

```text
Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html"
```

说明浏览器请求的 JS 文件实际返回了 SPA `index.html`（Vite preview 或 Nginx 的 SPA fallback），根本原因是**构建时的 base 与访问入口路径不匹配**。请按当前部署方式核对：

**场景 1：PM2 / vite preview 直连 4201 端口（访问 `http://host:4201/`）**

1. `admin-frontend/dist/index.html` 中的 JS 引用必须是 `/assets/*.js`（**不带** `/admin/` 前缀）
2. 构建时用默认命令 `npm --prefix admin-frontend run build`（base='/'），不要用 `build:subpath`；并确认 ecosystem.config.js 中未设置 `VITE_ADMIN_BASE`
3. 进程重启后环境变量才生效：`pm2 restart cexie-admin-frontend --update-env`

**场景 2：Nginx 同域名 `/admin/` 子路径部署**

1. 必须使用 `npm --prefix admin-frontend run build:subpath` 重新构建
2. 确认 `admin-frontend/dist/index.html` 中资源路径是 `/admin/assets/xxx.js`
3. Nginx 必须存在 `location ^~ /admin/assets/`，并且 `alias` 指向 `admin-frontend/dist/assets/`
4. 不要配置会抢走 `/admin/assets/*.js` 的通用正则，例如 `location ~* \.(js|css|png|jpg)$ { proxy_pass http://127.0.0.1:4200; }`
5. 修改后执行：`npm --prefix admin-frontend run build:subpath && nginx -t && systemctl reload nginx`

无论哪种场景，用以下命令验证 JS 是否返回正确 MIME：

```bash
# 场景 1 (直连 4201)
curl -I http://你的服务器IP:4201/assets/index-xxxx.js

# 场景 2 (Nginx /admin/)
curl -I http://你的域名或IP/admin/assets/index-xxxx.js
```

正确结果应包含 `Content-Type: application/javascript` 或 `Content-Type: text/javascript`；如果是 `Content-Type: text/html`，说明构建 base 与入口路径不一致，或 Nginx location 优先级错误把 JS 请求 fallback 到了首页。

#### 方案 B：同域名不同路径方式（仅需一个域名）

客户端走根路径 `/`，管理端走 `/admin/` 子路径，移动端 H5 走 `/mobile/` 子路径。三个前端共用同一个 Nginx `server`：

| 应用 | 访问路径 | 静态产物目录 |
|------|----------|--------------|
| 客户端 Web | `/` | `/www/cexie-monitor-sys/frontend/dist/` |
| 管理端 Web | `/admin/` | `/www/cexie-monitor-sys/admin-frontend/dist/` |
| 移动端 H5 | `/mobile/` | `/www/cexie-monitor-sys/mobile-app/dist/build/h5/` |

**Nginx 配置文件路径**：

- CentOS、Rocky Linux 或通用 `conf.d` 安装：`/etc/nginx/conf.d/cexie-monitor-sys.conf`
- Ubuntu、Debian 使用站点目录时：`/etc/nginx/sites-available/cexie-monitor-sys`，并软链接到 `/etc/nginx/sites-enabled/cexie-monitor-sys`

推荐直接创建：

```bash
sudo vi /etc/nginx/conf.d/cexie-monitor-sys.conf
```

**Nginx 配置（推荐：Nginx 直接托管前端 dist，不代理 vite preview）**：

> 将下方 `/www/cexie-monitor-sys` 替换为你的项目实际部署目录，例如 `/opt/cexie-monitor-sys`。

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # ===== 客户端 API（必须放在 location / 前面）=====
    location /api/ {
        proxy_pass http://127.0.0.1:1337;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ===== 管理端 API（必须放在 location /admin/ 前面）=====
    location /admin-api/ {
        rewrite ^/admin-api/(.*)$ /api/$1 break;
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ===== 子路径补全尾部斜杠 =====
    location = /admin {
        return 301 /admin/;
    }

    location = /mobile {
        return 301 /mobile/;
    }

    # ===== 管理端静态资源：/admin/assets/*.js =====
    # 注意必须用 ^~，避免被下面的通用静态资源正则或根路径 SPA fallback 抢走。
    location ^~ /admin/assets/ {
        alias /www/cexie-monitor-sys/admin-frontend/dist/assets/;
        try_files $uri =404;
        access_log off;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # ===== 管理端 SPA：/admin/ =====
    location ^~ /admin/ {
        alias /www/cexie-monitor-sys/admin-frontend/dist/;
        try_files $uri $uri/ /admin/index.html;
    }

    # ===== 移动端 H5 静态资源：/mobile/static/* =====
    # mobile-app/src/manifest.json 已配置 h5.router.base=./，静态资源使用相对路径。
    location ^~ /mobile/static/ {
        alias /www/cexie-monitor-sys/mobile-app/dist/build/h5/static/;
        access_log off;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # ===== 移动端 H5：/mobile/ =====
    # uni-app H5 使用 hash 路由，仍保留 index.html fallback，兼容直接访问和刷新。
    location ^~ /mobile/ {
        alias /www/cexie-monitor-sys/mobile-app/dist/build/h5/;
        try_files $uri $uri/ /mobile/index.html;
    }

    # ===== 客户端静态资源 =====
    location ^~ /assets/ {
        alias /www/cexie-monitor-sys/frontend/dist/assets/;
        try_files $uri =404;
        access_log off;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # ===== 客户端 SPA：根路径 / =====
    location / {
        root /www/cexie-monitor-sys/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

> 不推荐生产环境通过 Nginx 代理 `vite preview` 托管前端。`vite preview` 更适合本地预览构建产物；生产环境由 Nginx 直接托管 `dist` 更稳定，也能避免 `/admin/assets/*.js` 被错误回退成 `index.html`。

**管理端前端同域名 /admin/ 子路径构建**

管理端前端的 base、Vue Router 和 API 前缀由构建 mode 一次同步，**无需**手动修改 `vite.config.js` 或 `router/index.js`。执行：

```bash
npm --prefix admin-frontend run build:subpath
```

执行后：
- 构建产物引用路径自动变为 `/admin/assets/*.js`
- Vue Router 自动使用 `createWebHistory('/admin/')`
- 管理端前端 API 默认前缀由 `/api` 切换为 `/admin-api`（避免与同域名下客户端的 `/api` 冲突），与上方 Nginx 的 `location /admin-api/` rewrite 规则对应

> 如果浏览器控制台出现 `Origin http://服务器IP is not allowed by CORS`，说明当前构建产物仍在直连 `http://服务器IP:3002/api`，没有走 `/admin-api` 同源代理。请确认是用 `npm run build:admin-frontend`（根目录脚本，已内置子路径模式）或 `npm --prefix admin-frontend run build:subpath` 构建的，并清理浏览器缓存后再访问。

**客户端前端**与**移动端 H5** 在方案 B 中无需额外构建参数：
- 客户端默认构建即使用 `base='/'`、API=`/api`
- 移动端 `mobile-app/src/manifest.json` 已配置 `h5.router.base='./'`（相对路径 + hash 路由），天然兼容 `/mobile/` 子路径

移动端构建命令：

```bash
npm run build:mobile
```

构建完成后可确认 `mobile-app/dist/build/h5/index.html` 中的资源地址是相对的 `static/...` 或 `./static/...`：

```bash
grep -o '\./\?static/[^" ]*' mobile-app/dist/build/h5/index.html
```

如果仍然显示以 `/static/` 开头的绝对路径，说明构建没有读取 `h5.router.base`，此时通过 `/mobile/` 访问会出现 CSS 或 JavaScript 资源 404。

按部署模式分别构建前端，然后只重启两个后端进程（前端静态由 Nginx 直托管无需 PM2）：

```bash
# 客户端 & 移动端默认构建
npm run build:frontend
npm run build:mobile
# 管理端同域名子路径模式构建
npm run build:admin-frontend

pm2 restart cexie-backend cexie-admin-backend
nginx -t
systemctl reload nginx
```

> 使用 Nginx 直托管方案时，PM2 不需要启动 `cexie-frontend`、`cexie-admin-frontend` 和 `cexie-mobile-h5`；静态产物由 Nginx 直接读取对应的 `dist` 目录。

#### 两种方案对比

| 维度 | 方案 A：子域名 | 方案 B：同域名不同路径 |
|------|---------------|----------------------|
| 域名需求 | 推荐两个或三个子域名（客户端、管理端、可选移动端） | 只需一个域名 |
| 前端构建命令 | `npm run build` 默认即可 | 管理端需用 `npm run build:admin-frontend`（即 `build:subpath`） |
| Nginx 管理端 API 代理 | `location /api/` → 3002 | `location /admin-api/` rewrite → 3002 |
| Cookie 隔离 | 天然隔离（不同域名） | 需注意 localStorage 可能串扰 |
| 推荐场景 | 有域名解析权限，改动最少 | 只有一个域名或内网部署 |

> **重要**：无论哪种方案，客户端前端切换到 "admin" API 目标时，请求实际由客户端后端（1337）内部代理转发到管理端后端（3002），**不直接访问管理端后端**。因此 Nginx 只需暴露客户端后端的 `/api`，无需为客户端前端单独配置管理端 API 路由。

#### Nginx 完整配置注意事项

1. **WebSocket 支持**（如有需要）：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:1337;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

2. **静态资源缓存**（可选优化）：

```nginx
location ~* \.(js|css|png|jpg|svg|woff2?)$ {
    proxy_pass http://127.0.0.1:4200;  # 或 4201
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

3. **HTTPS 配置**（生产环境强烈推荐）：

```nginx
server {
    listen 443 ssl http2;
    server_name admin.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # ... 其余 location 配置与上方相同
}

# 80 端口重定向到 HTTPS
server {
    listen 80;
    server_name admin.yourdomain.com;
    return 301 https://$host$request_uri;
}
```

### 5.3 安全加固清单

- [ ] 修改所有默认密码（admin-backend 和 backend 的 admin 账号）
- [ ] 修改 `ADMIN_BOOTSTRAP_KEY`、`JWT_SECRET`、`ADMIN_JWT_SECRET`、`SESSION_SECRET`
- [ ] 修改 `ADMIN_CALLBACK_SECRET`（两端必须一致）
- [ ] 修改 MySQL root 密码
- [ ] 为管理库和业务库创建独立数据库账号，不使用 root
- [ ] 配置防火墙，仅开放 80/443 端口（通过 Nginx）
- [ ] 配置 HTTPS 证书

---

## 六、环境变量速查表

### admin-backend

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `ADMIN_BACKEND_HOST` | `0.0.0.0` | 监听地址 |
| `ADMIN_BACKEND_PORT` | `3002` | 监听端口 |
| `ADMIN_FRONTEND_ORIGIN` | `http://localhost:4201,http://10.20.0.44:4201` | 管理端后端 CORS 白名单，多个来源用英文逗号分隔。生产环境如直连 3002，需加入 `http://43.139.3.200`；推荐通过 Nginx `/admin-api` 同源代理避免跨域 |
| `ADMIN_DB_HOST` | `127.0.0.1` | 管理库地址 |
| `ADMIN_DB_PORT` | `3306` | 管理库端口 |
| `ADMIN_DB_USER` | `root` | 管理库用户 |
| `ADMIN_DB_PASSWORD` | `123456` | 管理库密码 |
| `ADMIN_DB_NAME` | `cexie_monitor_admin` | 管理库名 |
| `ADMIN_GATEWAY_DB_HOST` | `8.138.194.3` | 网关库地址 |
| `ADMIN_GATEWAY_DB_USER` | `device-gateway` | 网关库用户 |
| `ADMIN_GATEWAY_DB_PASSWORD` | `T4xyidTRZmKFCfHM` | 网关库密码 |
| `ADMIN_GATEWAY_DB_NAME` | `device-gateway` | 网关库名 |
| `TCP_HTTP_API_BASE_URL` | `http://8.138.194.3:32771` | 云端 TCP 服务地址 |
| `ADMIN_BOOTSTRAP_KEY` | `admin-bootstrap-key` | 管理密钥 |
| `ADMIN_JWT_SECRET` | `cexie-admin-jwt-secret-2026` | JWT 密钥 |
| `ADMIN_JWT_EXPIRES_IN_SECONDS` | `86400` | JWT 过期时间（秒） |
| `ADMIN_CALLBACK_SECRET` | `admin-callback-secret` | 回调鉴权密钥 |

### backend

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `NODE_ENV` | `development` | 运行环境 |
| `PORT` | `1337` | 监听端口 |
| `BUSINESS_DB_URL` | `mysql://root:123456@localhost:3306/cexie_monitor_business` | 业务库连接串 |
| `JWT_SECRET` | `cexie-monitor-jwt-secret-2026` | JWT 密钥 |
| `JWT_EXPIRES_IN` | `24h` | JWT 过期时间 |
| `ADMIN_CALLBACK_SECRET` | `admin-callback-secret` | 回调鉴权密钥（须与 admin-backend 一致） |
| `ADMIN_API_BASE_URL` | `http://127.0.0.1:3002/api` | 管理端 API 地址（必须用 127.0.0.1） |
| `ADMIN_CLIENT_KEY` | `9b0bc242de2accf99b6a390d63af688389fd46168a471454` | 客户端绑定的客户 Key（生产环境必须覆盖） |
| `CORS_ALLOW_ORIGINS` | （内置白名单） | CORS 白名单，逗号分隔 |
| `SESSION_SECRET` | `cexie-monitor-client-session-secret-2026` | Session 密钥 |

---

## 七、常见问题排查

### Q1：管理端前端登录提示 CORS 错误

**原因**：管理端后端 CORS 白名单未包含前端访问地址。

**解决**：设置 `ADMIN_FRONTEND_ORIGIN` 环境变量，包含实际访问地址（逗号分隔，建议同时带上 `localhost` 和 `127.0.0.1` 两种形式）：

```bash
ADMIN_FRONTEND_ORIGIN=http://10.20.0.44:4201,http://localhost:4201,http://127.0.0.1:4201
```

### Q2：客户端前端请求接口提示 CORS 错误

**原因**：客户端后端 CORS 白名单未包含前端访问地址。

**解决**：设置 `CORS_ALLOW_ORIGINS` 环境变量（同样建议同时带上 `localhost` 和 `127.0.0.1`）：

```bash
CORS_ALLOW_ORIGINS=http://10.20.0.44:4200,http://localhost:4200,http://127.0.0.1:4200
```

### Q3：客户端后端代理管理端接口返回 401

**原因**：`ADMIN_CLIENT_KEY` 未配置或与管理端 `admin_customers` 表中的 `client_key` 不一致。

**解决**：
1. 在管理端查看客户列表，获取对应 `client_key`
2. 将该值配置到客户端后端的 `ADMIN_CLIENT_KEY` 环境变量
3. 重启客户端后端

### Q4：管理端回调客户端失败

**原因**：回调地址配置错误，或 `ADMIN_CALLBACK_SECRET` 两端不一致。

**解决**：
1. 确认管理端客户配置的回调地址为 `http://<客户端后端IP>:1337/api/admin/task-callback`
2. 确认 `admin-backend` 的 `ADMIN_CALLBACK_SECRET` 与 `backend` 的 `ADMIN_CALLBACK_SECRET` 完全一致

### Q5：前端页面显示正常但接口报 404

**原因**：前端构建时注入的 API 地址与实际后端地址不匹配。

**解决**：修改 `vite.config.js` 中的 `preview` 主机地址，或通过环境变量覆盖后重新构建：

```bash
VITE_CLIENT_API_BASE_URL=http://你的IP:1337/api npm --prefix frontend run build
VITE_ADMIN_API_BASE_URL=http://你的IP:3002/api npm --prefix admin-frontend run build
```

### Q6：MySQL 连接报错 `ER_NOT_SUPPORTED_AUTH_MODE`

**原因**：MySQL 8.0 默认使用 `caching_sha2_password`。

**解决**：

```sql
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '123456';
FLUSH PRIVILEGES;
```

### Q7：端口被占用

```bash
# Windows
netstat -ano | findstr :1337
taskkill /PID <进程ID> /F

# Linux
lsof -i:1337
kill -9 <进程ID>
```

### Q8：客户端后端代理管理端接口报 `fetch failed` 或 `ECONNREFUSED ::1`

**原因**：Node.js 18+ 原生 fetch 在解析 `localhost` 时优先返回 IPv6 地址 `::1`，而后端服务监听在 IPv4 `0.0.0.0`，导致连接被拒绝。

**解决**：将 `ADMIN_API_BASE_URL`、`CLIENT_API_BASE_URL` 等服务间调用地址中的 `localhost` 全部改为 `127.0.0.1`：

```bash
# 错误写法（会解析到 IPv6）
ADMIN_API_BASE_URL=http://localhost:3002/api

# 正确写法
ADMIN_API_BASE_URL=http://127.0.0.1:3002/api
```

> 同理，PM2 ecosystem 配置、Nginx upstream、数据库连接串中的 `localhost` 也应替换为 `127.0.0.1`。

### Q9：PM2 启动 backend 报 `Session secret should be manually specified in production!`

**原因**：Sails.js 通过 `process.cwd()` 定位 `config/` 目录。如果 PM2 从项目根目录启动 `backend/app.js`，工作目录是项目根目录而非 `backend/`，Sails.js 找不到 `backend/config/`，所有配置（包括 session secret）都不会加载。

**解决**：在 PM2 ecosystem.config.js 中设置 `cwd`：

```js
{
  name: 'cexie-backend',
  cwd: 'backend',      // ← 关键：让 PM2 切换到 backend/ 目录后再启动
  script: 'app.js',    // ← 对应 backend/app.js
  env: { ... }
}
```

或直接从 backend 目录启动：

```bash
cd backend
pm2 start app.js --name cexie-backend
```

修改后需先删除旧进程再重启：

```bash
pm2 delete cexie-backend
pm2 start ecosystem.config.js
pm2 save
```

---

## 八、服务停止

### 手动启动的进程

直接在对应终端按 `Ctrl + C`。

### pm2 管理的进程

```bash
# 停止全部五个进程
pm2 stop cexie-backend cexie-admin-backend cexie-frontend cexie-admin-frontend cexie-mobile-h5

# 删除进程（停止并从 PM2 进程列表移除）
pm2 delete cexie-backend cexie-admin-backend cexie-frontend cexie-admin-frontend cexie-mobile-h5

# 或一键停止/删除所有 PM2 进程
pm2 stop all
pm2 delete all
```
