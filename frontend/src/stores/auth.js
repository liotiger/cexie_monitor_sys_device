import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api, {
  apiClients,
  getApiTarget,
  getTokenStorageKey,
  getUserStorageKey,
  setApiTarget
} from '@/services/api'

export const useAuthStore = defineStore('auth', () => {
  const apiTarget = ref(getApiTarget())
  const user = ref(null)
  const token = ref(null)

  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const isAdmin = computed(() => {
    const roles = Array.isArray(user.value?.roles) ? user.value.roles : []
    return roles.includes('admin') || roles.includes('system_admin') || user.value?.role === 'admin'
  })

  function normalizeUser(payload) {
    if (!payload) {
      return null
    }

    const roles = Array.isArray(payload.roles)
      ? payload.roles
      : payload.role
        ? [payload.role]
        : []

    const role = payload.role || roles[0] || 'user'
    return { ...payload, role, roles }
  }

  function syncFromStorage() {
    token.value = localStorage.getItem(getTokenStorageKey(apiTarget.value)) || null

    const savedUser = localStorage.getItem(getUserStorageKey(apiTarget.value))
    if (!savedUser || !token.value) {
      user.value = null
      return
    }

    try {
      user.value = normalizeUser(JSON.parse(savedUser))
    } catch {
      logout(apiTarget.value, { silent: true })
    }
  }

  function selectApiTarget(target) {
    apiTarget.value = setApiTarget(target)
    syncFromStorage()
  }

  function init() {
    syncFromStorage()
  }

  async function login(username, password, target = apiTarget.value) {
    selectApiTarget(target)
    const response = await apiClients[apiTarget.value].post('/auth/login', { username, password })

    if (response.data.success) {
      token.value = response.data.data.token
      user.value = normalizeUser(response.data.data.user)

      localStorage.setItem(getTokenStorageKey(apiTarget.value), token.value)
      localStorage.setItem(getUserStorageKey(apiTarget.value), JSON.stringify(user.value))
    }

    return response.data
  }

  async function register(username, email, password, target = apiTarget.value) {
    selectApiTarget(target)
    const response = await apiClients[apiTarget.value].post('/auth/register', { username, email, password })

    if (response.data.success) {
      token.value = response.data.data.token
      user.value = normalizeUser(response.data.data.user)

      localStorage.setItem(getTokenStorageKey(apiTarget.value), token.value)
      localStorage.setItem(getUserStorageKey(apiTarget.value), JSON.stringify(user.value))
    }

    return response.data
  }

  function logout(target = apiTarget.value) {
    localStorage.removeItem(getTokenStorageKey(target))
    localStorage.removeItem(getUserStorageKey(target))

    if (target === apiTarget.value) {
      user.value = null
      token.value = null
    }
  }

  async function fetchUser() {
    const response = await api.get('/auth/me')
    if (response.data.success) {
      user.value = normalizeUser(response.data.data)
      localStorage.setItem(getUserStorageKey(apiTarget.value), JSON.stringify(user.value))
    }
    return response.data
  }

  return {
    apiTarget,
    user,
    token,
    isAuthenticated,
    isAdmin,
    init,
    selectApiTarget,
    login,
    register,
    logout,
    fetchUser
  }
})
