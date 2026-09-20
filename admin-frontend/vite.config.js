import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 修复说明：将管理端前端涉及的接口主机和端口统一收口到 vite 配置，开发态固定走 127.0.0.1，避免多处配置出错。
const ADMIN_API_HOSTS = Object.freeze({
  development: '127.0.0.1',
  preview: ''
})

// 修复说明：管理端前端实际直连管理端后端 3002 端口，这里统一收口，避免 api.js 再单独维护默认端口。
const ADMIN_API_PORT = 3002

// 修复说明：同域名 /admin/ 子路径部署（方案 B）使用的固定 base。
const ADMIN_SUBPATH_BASE = '/admin/'

// 修复说明：
// - 开发态 / 子域名部署：前端请求 /api，由 Vite 代理或 Nginx 同域 /api 转到管理端后端 3002
// - 同域名 /admin/ 部署：前端请求 /admin-api，由 Nginx rewrite 到 admin-backend 的 /api，避免与客户端 /api 冲突
function buildAdminApiBaseUrl(host, base) {
  if (host) return `http://${host}:${ADMIN_API_PORT}/api`
  return base === ADMIN_SUBPATH_BASE ? '/admin-api' : '/api'
}

export default defineConfig(({ command, mode }) => {
  // 修复说明：base 改由构建 mode 驱动，替代原先手敲环境变量的方式。
  // 原方式的问题：DEPLOY.md 给出的 `VITE_ADMIN_BASE=/admin/ npm ...` 是 bash 语法，在 Windows PowerShell 下会被
  // 当成命令解析而静默失效，构建产物仍是 base='/'，导致浏览器请求 /assets/* 命中客户端前端目录而 404。
  // 现在：
  //   - `vite build`              → base='/'，用于本地 preview 与子域名部署（方案 A）
  //   - `vite build --mode admin` → base='/admin/'，用于同域名 /admin/ 子路径部署（方案 B，见 build:subpath 脚本）
  //   - 环境变量 VITE_ADMIN_BASE 保持最高优先级，用于非常规自定义子路径
  const adminBasePath = process.env.VITE_ADMIN_BASE || (mode === 'admin' ? ADMIN_SUBPATH_BASE : '/')
  // 修复说明：vite dev 视为开发态；vite build / vite preview 都按 production 形态使用构建期注入的 base 和 API 地址。
  const isDevelopmentServe = command === 'serve'
  // 修复说明：根据运行阶段选择统一主机，避免管理端开发态和预览态地址来源分散。
  const apiHost = isDevelopmentServe ? ADMIN_API_HOSTS.development : ADMIN_API_HOSTS.preview
  // 修复说明：统一注入给管理端 api.js 使用的默认接口地址。
  const adminApiBaseUrl = buildAdminApiBaseUrl(apiHost, adminBasePath)
  // 修复说明：开发态代理 target 只保留服务根地址，不带 /api 前缀。
  const adminApiProxyTarget = `http://${ADMIN_API_HOSTS.development}:${ADMIN_API_PORT}`

  return {
    plugins: [vue()],
    // 修复说明：base 由 mode / VITE_ADMIN_BASE 决定；默认 '/'，使 localhost:4201/ 根路径本地 preview 和子域名部署都能命中 /assets/*。
    base: adminBasePath,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    define: {
      // 修复说明：统一将管理端默认接口地址从 vite 配置注入前端，避免 api.js 再维护第二份默认地址。
      __ADMIN_APP_API_BASE_URL__: JSON.stringify(adminApiBaseUrl)
    },
    server: {
      // 修复说明：显式固定开发服务监听到 IPv4 本地回环地址，避免开发态在不同环境下漂移到 ::1 或 0.0.0.0，导致访问口径不一致。
      host: '127.0.0.1',
      port: 4201,
      proxy: {
        '/api': {
          // 修复说明：开发态下若页面走相对 /api 地址，统一代理到 127.0.0.1:3002，与同文件注入的开发态地址保持一致。
          target: adminApiProxyTarget,
          changeOrigin: true
        }
      }
    },
    preview: {
      // 修复说明：vite preview 直接读取顶层 base 托管 dist，此处无需也无法重复声明 base
      // （Vite 的 PreviewOptions 仅继承 CommonServerOptions，并不包含 base 字段，原配置的 preview.base 是无效项）。
      //   - base='/'        → http://host:4201/ 命中 dist/index.html 与 dist/assets/*
      //   - base='/admin/'  → http://host:4201/admin/ 命中同一份产物
      host: '0.0.0.0',
      port: 4201
    }
  }
})
