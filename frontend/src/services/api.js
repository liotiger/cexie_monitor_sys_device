import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const DEFAULT_API_TARGET = 'client'
const API_TARGET_STORAGE_KEY = 'api_target'

export const API_TARGETS = Object.freeze({
  admin: 'admin',
  client: 'client'
})

const API_BASE_URLS = {
  // 修复说明：客户端 admin 目标默认地址改为直接读取 vite.config.js 注入值；若环境变量显式覆盖，则仍优先尊重环境变量配置。
  admin: import.meta.env.VITE_ADMIN_API_BASE_URL || __CLIENT_ADMIN_API_BASE_URL__,
  // 修复说明：客户端 client 目标默认地址改为直接读取 vite.config.js 注入值，避免在 api.js 中再次硬编码主机和端口。
  client: import.meta.env.VITE_CLIENT_API_BASE_URL || __CLIENT_APP_API_BASE_URL__
}

function getStorage() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

function redirectToLogin() {
  if (typeof window === 'undefined') {
    return
  }

  if (window.location.pathname !== '/login') {
    window.location.replace('/login')
  }
}

export function isValidApiTarget(target) {
  return Object.values(API_TARGETS).includes(target)
}

export function getApiTarget() {
  const savedTarget = getStorage()?.getItem(API_TARGET_STORAGE_KEY)
  return isValidApiTarget(savedTarget) ? savedTarget : DEFAULT_API_TARGET
}

export function setApiTarget(target) {
  const normalizedTarget = isValidApiTarget(target) ? target : DEFAULT_API_TARGET
  getStorage()?.setItem(API_TARGET_STORAGE_KEY, normalizedTarget)
  return normalizedTarget
}

export function getApiBaseUrl(target = getApiTarget()) {
  return API_BASE_URLS[target] || API_BASE_URLS[DEFAULT_API_TARGET]
}

export function getTokenStorageKey(target = getApiTarget()) {
  return `token:${target}`
}

export function getUserStorageKey(target = getApiTarget()) {
  return `user:${target}`
}

function createApiClient(target) {
  const instance = axios.create({
    baseURL: getApiBaseUrl(target),
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json'
    }
  })

  instance.interceptors.request.use(
    (config) => {
      const token = getStorage()?.getItem(getTokenStorageKey(target))
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      config.headers['X-Api-Target'] = target
      return config
    },
    (error) => Promise.reject(error)
  )

  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      const statusCode = error.response?.status
      const isTimeout = error.code === 'ECONNABORTED' || String(error.message || '').toLowerCase().includes('timeout')
      const requestUrl = String(error.config?.url || '')
      const isAuthRequest = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register')

      if ((statusCode === 401 && !isAuthRequest) || isTimeout) {
        const authStore = useAuthStore()
        authStore.logout(target, { silent: true })
        redirectToLogin()
      }
      return Promise.reject(error)
    }
  )

  return instance
}

export const apiClients = {
  admin: createApiClient(API_TARGETS.admin),
  client: createApiClient(API_TARGETS.client)
}

function getActiveApiClient() {
  return apiClients[getApiTarget()] || apiClients[DEFAULT_API_TARGET]
}

const api = new Proxy(apiClients[DEFAULT_API_TARGET], {
  get(_, prop) {
    const client = getActiveApiClient()
    const value = client[prop]
    return typeof value === 'function' ? value.bind(client) : value
  }
})

export default api

export const roleApi = {
  getRoles: (params) => api.get('/roles', { params }),
  getRole: (id) => api.get(`/roles/${id}`),
  createRole: (data) => api.post('/roles', data),
  updateRole: (id, data) => api.put(`/roles/${id}`, data),
  deleteRole: (id) => api.delete(`/roles/${id}`),
  getRolePermissions: (roleId) => api.get(`/role-permissions/role/${roleId}`),
  assignPermissions: (roleId, permissionIds) => api.post('/role-permissions/assign', { role_id: roleId, permission_ids: permissionIds }),
  removePermission: (roleId, permissionId) => api.post('/role-permissions/remove', { role_id: roleId, permission_id: permissionId })
}

export const permissionApi = {
  getPermissions: (params) => api.get('/permissions', { params }),
  getPermission: (id) => api.get(`/permissions/${id}`),
  createPermission: (data) => api.post('/permissions', data),
  updatePermission: (id, data) => api.put(`/permissions/${id}`, data),
  deletePermission: (id) => api.delete(`/permissions/${id}`)
}

export const projectApi = {
  getProjects: (params) => api.get('/projects', { params }),
  getProject: (id) => api.get(`/projects/${id}`),
  createProject: (data) => api.post('/projects', data),
  updateProject: (id, data) => api.put(`/projects/${id}`, data),
  deleteProject: (id) => api.delete(`/projects/${id}`)
}

export const progressApi = {
  getProgress: (projectId, params) => api.get(`/projects/${projectId}/progress`, { params }),
  getProgressDetail: (id) => api.get(`/project-progress/${id}`),
  createProgress: (projectId, data) => api.post(`/projects/${projectId}/progress`, data),
  updateProgress: (id, data) => api.put(`/project-progress/${id}`, data),
  deleteProgress: (id) => api.delete(`/project-progress/${id}`)
}

export const memberApi = {
  getMembers: (projectId, params) => api.get(`/projects/${projectId}/members`, { params }),
  addMember: (projectId, data) => api.post(`/projects/${projectId}/members`, data),
  updateMember: (id, data) => api.put(`/project-members/${id}`, data),
  removeMember: (id) => api.delete(`/project-members/${id}`),
  getUserProjects: (userId, params) => api.get(`/users/${userId}/projects`, { params })
}

export const deviceApi = {
  getDevices: (params) => api.get('/devices', { params }),
  getDevice: (id) => api.get(`/devices/${id}`),
  createDevice: (data) => api.post('/devices', data),
  updateDevice: (id, data) => api.put(`/devices/${id}`, data),
  deleteDevice: (id) => api.delete(`/devices/${id}`),
  bindDevice: (id, data) => api.post(`/devices/${id}/bind`, data),
  unbindDevice: (id) => api.post(`/devices/${id}/unbind`)
}

export const deviceUsageLogApi = {
  getLogs: (params) => api.get('/device-usage-logs', { params }),
  getLog: (id) => api.get(`/device-usage-logs/${id}`),
  getDeviceLogs: (deviceId, params) => api.get(`/device-usage-logs/device/${deviceId}`, { params }),
  createLog: (data) => api.post('/device-usage-logs', data),
  endLog: (id, data) => api.put(`/device-usage-logs/${id}/end`, data),
  getStats: (params) => api.get('/device-usage-logs/stats', { params })
}

export const deviceCalibrationLogApi = {
  getLogs: (params) => api.get('/device-calibration-logs', { params }),
  getLog: (id) => api.get(`/device-calibration-logs/${id}`),
  getDeviceLogs: (deviceId, params) => api.get(`/device-calibration-logs/device/${deviceId}`, { params }),
  createLog: (data) => api.post('/device-calibration-logs', data),
  updateLog: (id, data) => api.put(`/device-calibration-logs/${id}`, data),
  reviewLog: (id, data) => api.put(`/device-calibration-logs/${id}/review`, data)
}

export const holeBindingHistoryApi = {
  getHistories: (params) => api.get('/hole-binding-histories', { params }),
  getHistory: (id) => api.get(`/hole-binding-histories/${id}`)
}

export const rawDataApi = {
  getRawData: (params) => api.get('/raw-data', { params }),
  getRawDataDetail: (id) => api.get(`/raw-data/${id}`),
  updateDataStatus: (id, data) => api.put(`/raw-data/${id}/status`, data),
  setInitialPipe: (data) => api.post('/raw-data/set-initial-pipe', data),
  exportData: (params) => api.get('/raw-data/export', { params, responseType: 'blob' })
}

export const resultsApi = {
  getResults: (params) => api.get('/results', { params }),
  // 修复说明：统一封装成果趋势图接口，页面直接按测孔和监测时间范围取曲线数据，避免各页面重复拼接查询字符串。
  getTrendData: (params) => api.get('/results/trends', { params }),
  getResult: (id) => api.get(`/results/${id}`),
  processData: (id) => api.post(`/results/${id}/process`)
}

export const curvesApi = {
  getCurves: (holeId) => api.get(`/curves/${holeId}`),
  generateCurve: (data) => api.post('/curves/generate', data)
}

export const reportsApi = {
  getReports: (params) => api.get('/reports', { params }),
  getReport: (id) => api.get(`/reports/${id}`),
  createReport: (data) => api.post('/reports', data),
  generateReport: (id) => api.post(`/reports/${id}/generate`),
  reviewReport: (id, data) => api.put(`/reports/${id}/review`, data),
  downloadReport: (id) => api.get(`/reports/${id}/download`, { responseType: 'blob' }),
  deleteReport: (id) => api.delete(`/reports/${id}`)
}

export const upperDeviceApi = {
  getDevices: (params) => api.get('/upper-devices', { params }),
  getDevice: (id) => api.get(`/upper-devices/${id}`),
  syncFromAdmin: () => api.post('/upper-devices/sync-admin'),
  // 修复说明：统一封装客户端后端新增的监测代理接口，页面无需直接拼接管理端任务地址。
  startMonitor: (id, data) => api.post(`/upper-devices/${id}/start-monitor`, data),
  getLatestMonitorTask: (id) => api.get(`/upper-devices/${id}/latest-monitor-task`),
  getMonitorTasks: (id, params) => api.get(`/upper-devices/${id}/monitor-tasks`, { params }),
  getMonitorTask: (taskId) => api.get(`/monitor-tasks/${taskId}`),
  cancelMonitorTask: (taskId) => api.post(`/monitor-tasks/${taskId}/cancel`),
  homeMove: (id) => api.post(`/upper-devices/${id}/home-move`),
  bottomTest: (id, data = {}) => api.post(`/upper-devices/${id}/bottom-test`, data),
  statusCheck: (id, data = {}) => api.post(`/upper-devices/${id}/status-check`, data)
}

export const lowerDeviceApi = {
  getDevices: (params) => api.get('/lower-devices', { params }),
  syncFromAdmin: () => api.post('/lower-devices/sync-admin')
}

export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
  getRecentDevices: (params) => api.get('/dashboard/recent-devices', { params }),
  getRecentMeasurements: (params) => api.get('/dashboard/recent-measurements', { params }),
  getAlerts: (params) => api.get('/dashboard/alerts', { params })
}
