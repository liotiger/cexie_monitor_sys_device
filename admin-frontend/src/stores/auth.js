import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import api, { ADMIN_SECRET_KEY, ADMIN_TOKEN_KEY, ADMIN_USER_KEY } from '@/services/api'

export const useAuthStore = defineStore('admin-auth', () => {
  const token = ref(localStorage.getItem(ADMIN_TOKEN_KEY) || '')
  const user = ref(null)
  const adminSecret = ref(localStorage.getItem(ADMIN_SECRET_KEY) || '')

  const isAuthenticated = computed(() => Boolean(token.value))

  function init() {
    const savedUser = localStorage.getItem(ADMIN_USER_KEY)
    if (savedUser) {
      try {
        user.value = JSON.parse(savedUser)
      } catch {
        user.value = null
      }
    }
  }

  async function login(username, password, secret) {
    if (secret) {
      adminSecret.value = secret
      localStorage.setItem(ADMIN_SECRET_KEY, secret)
    }

    const response = await api.post('/auth/login', { username, password })
    if (response.data.success) {
      token.value = response.data.data.token
      user.value = response.data.data.user
      localStorage.setItem(ADMIN_TOKEN_KEY, token.value)
      localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user.value))
      return response.data
    }

    return response.data
  }

  function logout() {
    token.value = ''
    user.value = null
    adminSecret.value = ''
    localStorage.removeItem(ADMIN_TOKEN_KEY)
    localStorage.removeItem(ADMIN_USER_KEY)
    localStorage.removeItem(ADMIN_SECRET_KEY)
  }

  return {
    token,
    user,
    adminSecret,
    isAuthenticated,
    init,
    login,
    logout
  }
})
