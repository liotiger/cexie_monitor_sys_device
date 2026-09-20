# 测斜监测移动端 H5

基于 uni-app + Vue 2 的现场调试移动端。本阶段只维护 H5，不发布 App 和小程序。

## 环境要求

- Node.js >= 18
- npm >= 9
- 客户端业务后端 `backend` 已启动，默认地址为 `http://127.0.0.1:1337`

## 安装

```bash
npm install
```

也可以在仓库根目录执行：

```bash
npm run install:mobile
```

## 本地开发

```bash
npm run dev:h5
```

默认访问地址为 `http://localhost:8080`。如果该端口已被占用，Vue CLI 会自动选择后续可用端口（例如 `8081`），请以终端中 `App running at` 显示的地址为准。开发服务器监听 `0.0.0.0`，手机与电脑处于同一局域网时可通过终端显示的 Network 地址访问。

开发服务器会将 `/api` 代理到客户端业务后端。可通过环境变量覆盖端口和代理目标：

```powershell
$env:MOBILE_H5_PORT="8080"
$env:MOBILE_API_PROXY_TARGET="http://127.0.0.1:1337"
npm run dev:h5
```

## 构建与预览

```bash
npm run build:h5
npm run start:h5
```

构建产物位于 `dist/build/h5/`。生产静态服务默认监听 `4202`，并把 `/api` 代理到 `http://127.0.0.1:1337`。

生产环境推荐由 Nginx 直接托管 `dist/build/h5/`，并配置：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:1337;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

## 主要页面

- 工程：现场工程筛选、测孔入口、设备调试入口
- 设备：工程和状态筛选、上位机列表
- 设备操作台：立即采集、归位、底部检测、任务回执
- 趋势分析：项目与测孔联动下拉筛选、日期范围查询、移动端成果趋势图
- 我的：监测总览、趋势分析、报表中心和账号信息

所有业务请求使用客户端接口前缀 `/api/app`。设备指令由 `backend` 代理到管理端任务服务，移动端不直接连接设备网关。

## 样式问题排查

uni-app 的页面业务样式由 JavaScript 热更新模块注入，但 `uni-view`、`uni-input`、`uni-button` 等 H5 基础组件样式来自 `/static/index.css`。项目的 `public/index.html` 必须保留以下引用：

```html
<link rel="stylesheet" href="<%= BASE_URL %>static/index.css">
```

如果页面表现为原生输入框、按钮或内容挤在左上角，请先在浏览器 Network 面板确认 `/static/index.css` 返回 `200`，再执行：

```bash
npm install
npm run dev:h5
```

并确认 `npm ls postcss --depth=0` 输出 `postcss@7.0.39`。当前 Vue CLI 4 构建链必须使用 PostCSS 7，`postcss.config.js` 中的 uni-app 插件负责将 `rpx` 转换为 H5 可识别的运行时单位；`manifest.json` 中的 `"transformPx": false` 用于保留设计稿中的固定 `px` 尺寸。新增或修改 `public/index.html`、`manifest.json` 后需要重启开发服务器，热更新不会完整刷新这两类配置。
