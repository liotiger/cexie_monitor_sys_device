<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const form = ref({ username: 'admin', password: 'admin123', secret: authStore.adminSecret || 'admin-bootstrap-key' })
const errorMessage = ref('')
const loading = ref(false)
const hasSecret = computed(() => Boolean(form.value.secret))

async function handleSubmit() {
  errorMessage.value = ''
  if (!form.value.username || !form.value.password || !form.value.secret) {
    errorMessage.value = '请输入管理员用户名、密码和管理密钥'
    return
  }

  loading.value = true
  try {
    await authStore.login(form.value.username, form.value.password, form.value.secret)
    router.push('/dashboard')
  } catch (error) {
    errorMessage.value = error.response?.data?.error || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <h1>管理端前端</h1>
      <p>面向设备、客户、原始数据和管理员用户管理</p>
      <form class="login-form" @submit.prevent="handleSubmit">
        <input v-model="form.username" placeholder="管理员用户名" />
        <input v-model="form.password" type="password" placeholder="管理员密码" />
        <input v-model="form.secret" type="password" placeholder="x-admin-secret 管理密钥" />
        <button type="submit" :disabled="loading || !hasSecret">{{ loading ? '登录中...' : '进入管理端' }}</button>
        <div v-if="errorMessage" class="error">{{ errorMessage }}</div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: linear-gradient(135deg, #0f172a, #1d4ed8); }
.login-card { width: 100%; max-width: 420px; background: #fff; border-radius: 16px; padding: 32px; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.28); }
.login-card h1 { font-size: 28px; margin-bottom: 8px; }
.login-card p { color: #6b7280; margin-bottom: 24px; }
.login-form { display: flex; flex-direction: column; gap: 14px; }
.login-form input { border: 1px solid #d1d5db; border-radius: 10px; padding: 12px 14px; }
.login-form button { border: none; border-radius: 10px; padding: 12px 14px; background: #2563eb; color: #fff; font-weight: 600; cursor: pointer; }
.login-form button:disabled { opacity: 0.7; cursor: not-allowed; }
.error { color: #b91c1c; font-size: 14px; }
</style>
