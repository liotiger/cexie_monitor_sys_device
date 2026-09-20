# 测斜监测系统

测斜监测系统用于管理测斜项目、测孔、上下位机设备、监测任务、原始数据、成果数据和报表。当前仓库只保留管理端、客户端及其前后端业务代码；设备网关已经独立部署，不再维护本地 `tcp-server` 代码。

## 当前架构

```text
admin-frontend (:4201)        frontend (:4200)        mobile H5 (:4202)
        |                           |                        |
        v                           v                        v
admin-backend (:3002) <-----> backend (:1337)
        |
        | HTTP API / MySQL read
        v
独立设备网关
  - HTTP API: TCP_HTTP_API_BASE_URL
  - 网关库: ADMIN_GATEWAY_DB_*
        |
        v
现场上位机 / 下位机设备
```

### 服务职责

- `admin-frontend`: 管理端页面，包含客户、上位机、原始数据、任务和管理用户等功能。
- `admin-backend`: 管理端服务，负责客户鉴权、上位机绑定、任务创建、设备网关调用、网关结果轮询和客户端回调。
- `frontend`: 客户端页面，包含工程、测孔、设备、监测任务、原始数据、成果和报表等业务功能。
- `mobile-app`: 基于 uni-app 的移动端 H5，面向现场工程师，包含工程筛选、设备调试、立即采集、归位、底部检测和任务回执。当前只发布 H5，不构建 App 和小程序。
- `backend`: 客户端业务服务，负责业务库读写、客户端鉴权、管理端任务代理和管理端回调落库。
- 独立设备网关: 仓库外部服务，负责 TCP 设备接入、指令下发、执行结果和网关库维护。

### 设备同步

- 上位机、下位机统一在管理端入库和销售，客户端不提供本地新建设备入口。
- 管理端将设备售出给客户后，客户端按 `ADMIN_CLIENT_KEY` 对应客户同步已分配设备；上位机通过客户绑定关系同步，下位机通过已售库存的客户归属同步。
- 客户端设备页面首次打开时同步管理端，并每 20 秒自动同步一次，也支持手动同步。
- 下位机同步包含设备编号、名称、厂商、型号、序列号、K、β、校准日期、校准机构、有效期至、校准状态、设备状态及累计测量统计。
- 同步按上位机 IMEI、下位机设备编号更新或新增客户端本地镜像，不覆盖客户端测孔绑定主键。

## 目录结构

```text
cexie-monitor-sys/
├── admin-backend/      # 管理端服务，Express
├── admin-frontend/     # 管理端前端，Vue + Vite
├── backend/            # 客户端业务服务，Sails.js
├── frontend/           # 客户端前端，Vue + Vite
├── mobile-app/         # uni-app 移动端 H5
├── spec/               # 历史需求/任务文档
├── HTTPAPI.md          # 设备网关 HTTP API 对接文档
├── DEPLOY.md           # 部署说明
├── package.json        # 根脚本
└── README.md
```

> `tcp-server/` 已移除。设备网关不再作为本仓库的本地子项目启动、安装或部署。

## 环境要求

- Node.js >= 18
- MySQL >= 8.0
- npm >= 9
- 可访问的独立设备网关 HTTP API
- 可访问的设备网关数据库只读账号，供管理端查询在线状态和任务结果

## 安装依赖

```bash
npm run install:all
```

或分别安装：

```bash
npm run install:backend
npm run install:admin-backend
npm run install:admin-frontend
npm run install:frontend
npm run install:mobile
```

## 数据库初始化

创建管理库和业务库：

```sql
CREATE DATABASE cexie_monitor_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE cexie_monitor_business CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

初始化表结构：

```bash
mysql -u root -p cexie_monitor_admin < admin-backend/init-management.sql
mysql -u root -p cexie_monitor_business < backend/init-business.sql
```

## 关键配置

### 管理端服务 `admin-backend`

管理端通过以下配置访问管理库、设备网关库和设备网关 HTTP API：

```bash
ADMIN_BACKEND_HOST=0.0.0.0
ADMIN_BACKEND_PORT=3002
ADMIN_FRONTEND_ORIGIN=http://localhost:4201

ADMIN_DB_HOST=127.0.0.1
ADMIN_DB_PORT=3306
ADMIN_DB_USER=root
ADMIN_DB_PASSWORD=123456
ADMIN_DB_NAME=cexie_monitor_admin

ADMIN_GATEWAY_DB_HOST=8.138.194.3
ADMIN_GATEWAY_DB_PORT=3306
ADMIN_GATEWAY_DB_USER=device-gateway
ADMIN_GATEWAY_DB_PASSWORD=your-password
ADMIN_GATEWAY_DB_NAME=device-gateway

TCP_HTTP_API_BASE_URL=http://8.138.194.3:32771
TCP_HTTP_API_TIMEOUT_MS=5000

ADMIN_TASK_POLL_INTERVAL_MS=3000
ADMIN_TASK_MAX_POLL_INTERVAL_MS=10000
ADMIN_TASK_TIMEOUT_SECONDS=120
ADMIN_TASK_MAX_TIMEOUT_SECONDS=900

ADMIN_BOOTSTRAP_KEY=admin-bootstrap-key
ADMIN_JWT_SECRET=change-me
ADMIN_CALLBACK_HEADER=x-admin-callback-secret
ADMIN_CALLBACK_SECRET=change-me
ADMIN_SERVICE_NAME=admin-backend
```

### 客户端业务服务 `backend`

客户端业务服务只访问业务库和管理端 API。监测、归位、底部检测及任务日志均由管理端统一创建和查询，客户端不直接访问设备网关 HTTP API 或网关数据库。

```bash
NODE_ENV=development
PORT=1337

BUSINESS_DB_URL=mysql://root:123456@localhost:3306/cexie_monitor_business

JWT_SECRET=change-me
JWT_EXPIRES_IN=24h

ADMIN_API_BASE_URL=http://localhost:3002/api
ADMIN_CLIENT_KEY=<管理端客户 client_key>
CLIENT_API_BASE_URL=http://localhost:1337/api

ADMIN_CALLBACK_HEADER=x-admin-callback-secret
ADMIN_CALLBACK_SECRET=change-me
SERVICE_NAME=cexie-client-business-service
SERVICE_ROLE=client
```

### 前端

```bash
# admin-frontend
VITE_ADMIN_API_BASE_URL=http://localhost:3002/api

# frontend
VITE_CLIENT_API_BASE_URL=http://localhost:1337/api

# mobile-app
# 默认使用同源 /api/app；开发服务器和内置 H5 静态服务会代理到 backend:1337
MOBILE_H5_PORT=8080
MOBILE_API_PROXY_TARGET=http://127.0.0.1:1337
```

## 本地启动

分别启动：

```bash
npm run dev:admin-backend
npm run dev:backend
npm run dev:admin-frontend
npm run dev:frontend
npm run dev:mobile
```

或一键启动五个本地服务：

```bash
npm run dev
```

本地访问地址：

| 服务 | 地址 |
| --- | --- |
| 客户端 Web | `http://127.0.0.1:4200` |
| 管理端 Web | `http://127.0.0.1:4201` |
| 移动端 H5 | 默认 `http://localhost:8080`，端口占用时以终端 `App running at` 为准 |

手机联调时，使用电脑的局域网 IP 访问 `http://<电脑局域网IP>:8080`。移动端请求会由 H5 开发服务器代理到 `MOBILE_API_PROXY_TARGET`，无需把 API 地址写成手机端的 `localhost`。

本仓库不再提供设备网关相关的安装、开发或生产启动脚本。联调前请确认独立设备网关已经部署，并且 `admin-backend` 的 `TCP_HTTP_API_BASE_URL`、`ADMIN_GATEWAY_DB_*` 指向正确环境；客户端 `backend` 无需配置网关连接。

## 构建与生产启动

```bash
npm run build

npm run start:admin-backend
npm run start:backend
npm run start:admin-frontend
npm run start:frontend
npm run start:mobile
```

或：

```bash
npm start
```

`npm run build` 会生成以下三个前端产物：

- `admin-frontend/dist/`
- `frontend/dist/`
- `mobile-app/dist/build/h5/`

`npm run start:mobile` 使用内置静态服务器在 `4202` 端口托管 H5，并将 `/api` 代理到 `http://127.0.0.1:1337`。如需覆盖：

```powershell
$env:MOBILE_H5_PORT="4202"
$env:MOBILE_API_PROXY_TARGET="http://127.0.0.1:1337"
npm run start:mobile
```

## 监测任务链路

1. 客户端或管理端创建监测/快捷指令任务。
2. `admin-backend` 将任务写入 `admin_device_tasks`。
3. `admin-backend` 调用独立设备网关 HTTP API 下发任务。
4. `admin-backend` 轮询设备网关库中的 `dg_result` / `dg_result_point` 获取任务状态和结果。
5. 管理端任务列表展示状态、异常信息和结果。
6. 需要同步给客户端时，管理端通过客户配置的 `callback_url` 回调 `backend`。
7. `backend` 校验回调密钥并写入业务库，供客户端页面展示和后续成果计算。

快捷指令“归位”和“底部检测”同样会创建任务并进入任务列表；这类任务只依赖 `dg_result` 状态，不要求 `dg_result_point` 原始测量结果。

## 设备网关对接

设备网关已独立出本仓库，管理端只通过配置项对接：

- HTTP API 基地址：`TCP_HTTP_API_BASE_URL`
- HTTP 超时：`TCP_HTTP_API_TIMEOUT_MS`
- 网关库地址：`ADMIN_GATEWAY_DB_HOST`
- 网关库账号：`ADMIN_GATEWAY_DB_USER`
- 网关库密码：`ADMIN_GATEWAY_DB_PASSWORD`
- 网关库库名：`ADMIN_GATEWAY_DB_NAME`

设备网关 HTTP 接口说明见 [HTTPAPI.md](HTTPAPI.md)。

## 常用脚本

```bash
npm run install:all
npm run dev
npm run start
npm run build
npm run dev:mobile
npm run build:mobile
npm run start:mobile
npm run test:backend
```

## 默认管理账号

首次启动管理端时会初始化默认管理员：

| 用户名 | 密码 | 说明 |
| --- | --- | --- |
| `admin` | `admin123` | 默认系统管理员 |

生产环境请修改默认密码、JWT 密钥、回调密钥和客户 `client_key`。

## 故障排查

- 管理端无法同步上位机：检查 `ADMIN_GATEWAY_DB_*` 是否能访问独立设备网关库。
- 任务创建后下发失败：检查 `TCP_HTTP_API_BASE_URL`、网关 HTTP API 健康状态和网络连通性。
- 任务一直轮询中：检查网关库 `dg_result` 是否写入对应 `task_id`。
- 客户端收不到原始数据：检查管理端客户 `callback_url`、`ADMIN_CALLBACK_SECRET` 和客户端 `/api/admin/task-callback`。
- 前端接口异常：检查 `VITE_ADMIN_API_BASE_URL`、`VITE_CLIENT_API_BASE_URL` 和后端 CORS 配置。
- 移动端 H5 页面能打开但接口失败：确认 `backend` 已监听 `1337`，并检查 `MOBILE_API_PROXY_TARGET`；浏览器请求应访问 H5 同源的 `/api/app/*`。
- `npm run start:mobile` 提示找不到构建产物：先执行 `npm run build:mobile`。
- 移动端页面无样式、原生控件外观或浏览器提示 `rpx` 无效：确认 `/static/index.css` 返回 `200`，且 `mobile-app/public/index.html` 保留该样式引用；然后在 `mobile-app` 下重新执行 `npm install`，确认根 PostCSS 版本为 `7.0.39`，并重启开发服务器。

## 许可证

MIT License
