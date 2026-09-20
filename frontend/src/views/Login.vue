<script setup>
import { computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getApiBaseUrl } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const form = ref({ username: '', password: '', rememberMe: false })
const isLoading = ref(false)
const errorMessage = ref('')
const currentApiBaseUrl = computed(() => getApiBaseUrl('client'))

async function handleSubmit() {
  if (!form.value.username || !form.value.password) {
    errorMessage.value = '请填写用户名和密码'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const result = await authStore.login(form.value.username, form.value.password, 'client')
    if (result.success) {
      const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
      router.push(redirect)
    } else {
      errorMessage.value = result.message || '登录失败'
    }
  } catch (error) {
    errorMessage.value = error.response?.data?.message || '登录失败，请检查用户名和密码'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <h1>客户端前端登录</h1>
        <p>保留原有用户管理、设备管理、工程管理等界面功能</p>
      </div>

      <form @submit.prevent="handleSubmit" class="login-form">
        <div class="form-group">
          <label>当前接口地址</label>
          <small class="form-tip">当前地址：{{ currentApiBaseUrl }}</small>
        </div>

        <div class="form-group">
          <label for="username">用户名</label>
          <input id="username" v-model="form.username" type="text" placeholder="请输入用户名">
        </div>

        <div class="form-group">
          <label for="password">密码</label>
          <input id="password" v-model="form.password" type="password" placeholder="请输入密码">
        </div>

        <div class="form-options">
          <label class="remember-me">
            <input v-model="form.rememberMe" type="checkbox">
            <span>记住我</span>
          </label>
        </div>

        <button type="submit" class="login-btn" :disabled="isLoading">
          <span v-if="!isLoading">登录</span>
          <span v-else>登录中...</span>
        </button>

        <div v-if="errorMessage" class="error-alert">{{ errorMessage }}</div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-container { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; }
.login-card { background: white; border-radius: 16px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3); width: 100%; max-width: 420px; padding: 40px; }
.login-header { text-align: center; margin-bottom: 32px; }
.login-header h1 { font-size: 28px; font-weight: 700; color: #1a1a2e; margin: 0 0 8px 0; }
.login-header p { color: #6b7280; margin: 0; font-size: 14px; }
.login-form { display: flex; flex-direction: column; gap: 20px; }
.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-group label { font-size: 14px; font-weight: 500; color: #374151; }
.form-group input { padding: 12px 16px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 14px; transition: all 0.2s; outline: none; background: white; }
.form-group input:focus { border-color: #667eea; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1); }
.form-tip { color: #6b7280; }
.form-options { display: flex; justify-content: space-between; align-items: center; }
.remember-me { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #6b7280; cursor: pointer; }
.login-btn { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 14px; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.login-btn:disabled { opacity: 0.7; cursor: not-allowed; }
.error-alert { background: #fef2f2; color: #dc2626; padding: 12px; border-radius: 8px; font-size: 14px; text-align: center; }
</style>
