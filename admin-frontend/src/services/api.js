import axios from 'axios'

export const ADMIN_TOKEN_KEY = 'admin_frontend_token'
export const ADMIN_USER_KEY = 'admin_frontend_user'
export const ADMIN_SECRET_KEY = 'admin_frontend_secret'

const api = axios.create({
  // 修复说明：管理端默认接口地址改为直接读取 vite.config.js 注入值；若环境变量已配置，则继续以环境变量为准，减少多处端口硬编码风险。
  baseURL: import.meta.env.VITE_ADMIN_API_BASE_URL || __ADMIN_APP_API_BASE_URL__,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

function clearSessionAndRedirectToLogin() {
  localStorage.removeItem(ADMIN_TOKEN_KEY)
  localStorage.removeItem(ADMIN_USER_KEY)
  localStorage.removeItem(ADMIN_SECRET_KEY)

  const loginEntryPath = import.meta.env.DEV ? '/login' : '/admin'
  const isLoginEntry = window.location.pathname === loginEntryPath
    || (!import.meta.env.DEV && window.location.pathname === `${loginEntryPath}/`)
  if (!isLoginEntry) {
    window.location.replace(loginEntryPath)
  }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY)
  const adminSecret = localStorage.getItem(ADMIN_SECRET_KEY)

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  if (adminSecret) {
    config.headers['x-admin-secret'] = adminSecret
  }

  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const statusCode = error.response?.status
    const requestUrl = String(error.config?.url || '')
    const isLoginRequest = requestUrl.includes('/auth/login')

    if (statusCode === 401 && !isLoginRequest) {
      clearSessionAndRedirectToLogin()
    }

    return Promise.reject(error)
  }
)

export default api
