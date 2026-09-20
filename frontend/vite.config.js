import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 修复说明：将客户端前端涉及的接口主机和端口统一收口到 vite 配置，开发态固定走 localhost，构建/预览态固定走 10.20.0.44，减少 api.js 多处硬编码带来的错配风险。
const CLIENT_API_HOSTS = Object.freeze({
  development: '127.0.0.1',
  preview: ''
})

// 修复说明：客户端前端实际只访问客户端后端 1337 端口，这里统一由 vite 配置输出，避免页面代码重复拼接。
const CLIENT_API_PORT = 1337

// 修复说明：生产环境同域名部署时，客户端 API 统一走相对路径 /api，由 Nginx 转发到客户端后端。
function buildClientApiBaseUrl(host) {
  return host ? `http://${host}:${CLIENT_API_PORT}/api` : '/api'
}

export default defineConfig(({ command }) => {
  // 修复说明：vite dev 属于开发态，统一绑定 localhost；vite build 产物会被 preview 使用，因此构建阶段即固定为预览环境地址 10.20.0.44。
  const isDevelopmentServe = command === 'serve'
  // 修复说明：开发态代理目标需要去掉 /api 后缀；预览态地址则会直接注入到前端运行时代码中。
  const apiHost = isDevelopmentServe ? CLIENT_API_HOSTS.development : CLIENT_API_HOSTS.preview
  // 修复说明：导出给 api.js 使用的统一接口根地址，避免页面层再维护一份默认地址。
  const clientApiBaseUrl = buildClientApiBaseUrl(apiHost)
  // 修复说明：开发态 Vite 代理 target 只需要服务根地址，不需要 /api 路径。
  const clientApiProxyTarget = `http://${CLIENT_API_HOSTS.development}:${CLIENT_API_PORT}`

  return {
    plugins: [vue()],
    // base: '/frontend/',
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    define: {
      // 修复说明：将统一后的接口地址注入到前端运行时代码，客户端当前 admin/client 两个目标都落到同一客户端后端网关。
      __CLIENT_ADMIN_API_BASE_URL__: JSON.stringify(clientApiBaseUrl),
      // 修复说明：客户端页面切换 API 目标时继续复用同一根地址，只保留业务目标标识，不再拆出第二份默认主机配置。
      __CLIENT_APP_API_BASE_URL__: JSON.stringify(clientApiBaseUrl)
    },
    server: {
      // 修复说明：显式固定开发服务监听到 IPv4 本地回环地址，避免开发态在不同环境下漂移到 ::1 或 0.0.0.0，导致访问口径不一致。
      host: '127.0.0.1',
      port: 4200,
      allowedHosts: ["mg33tx11107.vicp.fun"],
      proxy: {
        '/api': {
          // 修复说明：开发态下所有 /api 请求统一代理到 localhost:1337，和本文件中注入的开发态默认地址保持同一来源。
          target: clientApiProxyTarget,
          changeOrigin: true
        }
      }
    }
  }
})
