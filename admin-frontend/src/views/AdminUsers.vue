<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import api from '@/services/api'

const loading = ref(false)
const submitting = ref(false)
const rows = ref([])
const errorMessage = ref('')
const showCreateDialog = ref(false)
// 用户列表搜索关键字：对用户名、姓名、邮箱做模糊匹配
const searchKeyword = ref('')

const form = reactive({ username: '', password: '', real_name: '', email: '', phone: '', status: 'active' })

const statusText = {
  active: '启用',
  inactive: '停用',
  locked: '锁定'
}

// 按关键字过滤用户列表，空关键字返回全量
const filteredRows = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return rows.value
  return rows.value.filter(item =>
    [item.username, item.real_name, item.email]
      .some(field => String(field || '').toLowerCase().includes(keyword))
  )
})

async function loadUsers() {
  loading.value = true
  try {
    const response = await api.get('/admin-users', { params: { limit: 50 } })
    rows.value = response.data.data.list
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.username = ''
  form.password = ''
  form.real_name = ''
  form.email = ''
  form.phone = ''
  form.status = 'active'
}

function openCreateDialog() {
  resetForm()
  errorMessage.value = ''
  showCreateDialog.value = true
}

function closeCreateDialog() {
  if (submitting.value) return
  showCreateDialog.value = false
}

async function createUser() {
  const payload = {
    username: form.username.trim(),
    password: form.password,
    real_name: form.real_name.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    status: form.status,
    roles: ['admin']
  }

  if (!payload.username || !payload.password) {
    errorMessage.value = '用户名和密码不能为空'
    return
  }

  submitting.value = true
  errorMessage.value = ''
  try {
    await api.post('/admin-users', payload)
    resetForm()
    showCreateDialog.value = false
    await loadUsers()
  } catch (error) {
    errorMessage.value = error.response?.data?.details || error.response?.data?.error || '新增用户失败'
  } finally {
    submitting.value = false
  }
}

async function removeUser(id) {
  await api.delete(`/admin-users/${id}`)
  await loadUsers()
}

onMounted(loadUsers)
</script>

<template>
  <div class="page-stack">
    <div class="panel">
      <div class="panel-heading">
        <div>
          <h3>系统用户列表</h3>
          <p>共 {{ rows.length }} 个用户{{ searchKeyword.trim() ? `，匹配 ${filteredRows.length} 个` : '' }}</p>
        </div>
        <button class="primary" @click="openCreateDialog">新增用户</button>
      </div>
      <div class="toolbar">
        <input v-model="searchKeyword" class="search-input" placeholder="搜索用户名、姓名或邮箱" />
        <button v-if="searchKeyword" class="secondary" @click="searchKeyword = ''">清空</button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>ID</th><th>用户名</th><th>姓名</th><th>邮箱</th><th>角色</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="item in filteredRows" :key="item.id">
              <td>{{ item.id }}</td><td>{{ item.username }}</td><td>{{ item.real_name || '--' }}</td><td>{{ item.email || '--' }}</td><td>{{ (item.roles || []).join(', ') }}</td>
              <td><span class="status" :class="item.status">{{ statusText[item.status] || item.status }}</span></td>
              <td><button class="danger" @click="removeUser(item.id)">删除</button></td>
            </tr>
            <tr v-if="!filteredRows.length && !loading"><td colspan="7" class="empty-cell">{{ searchKeyword.trim() ? '未找到匹配的用户' : '暂无系统用户' }}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="showCreateDialog" class="dialog-overlay">
      <div class="dialog dialog-compact">
        <div class="dialog-header">
          <h3>新增用户</h3>
          <button class="icon-btn" @click="closeCreateDialog">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="create-form">
            <label>用户名<input v-model="form.username" placeholder="请输入用户名" /></label>
            <label>密码<input v-model="form.password" type="password" placeholder="请输入密码" /></label>
            <label>姓名<input v-model="form.real_name" placeholder="请输入姓名" /></label>
            <label>邮箱<input v-model="form.email" placeholder="请输入邮箱" /></label>
            <label>手机号<input v-model="form.phone" placeholder="请输入手机号" /></label>
            <label>状态
              <select v-model="form.status">
                <option value="active">启用</option>
                <option value="inactive">停用</option>
                <option value="locked">锁定</option>
              </select>
            </label>
          </div>
          <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
        </div>
        <div class="dialog-footer">
          <button class="secondary" @click="closeCreateDialog">取消</button>
          <button class="primary" :disabled="submitting" @click="createUser">{{ submitting ? '提交中...' : '确认新增' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-stack { display: grid; gap: 18px; }
.panel { background: #fff; border-radius: 14px; padding: 18px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }
.panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; }
.panel-heading h3 { color: #1f2937; font-size: 16px; }
.panel-heading p { margin-top: 5px; color: #64748b; font-size: 13px; }

/* 搜索工具栏 */
.toolbar { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; margin: 14px 0 4px; }
.search-input { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; }

.primary, .secondary, .danger { border: none; border-radius: 10px; color: #fff; padding: 10px 14px; cursor: pointer; }
.primary { background: #2563eb; }
.secondary { background: #64748b; }
.danger { background: #dc2626; }
.primary:disabled { opacity: 0.7; cursor: not-allowed; }

/* 新增用户弹窗表单：两列栅格 */
.create-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.create-form label { display: grid; gap: 6px; color: #334155; font-size: 13px; }
.create-form input, .create-form select { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; background: #fff; }

.error-text { margin-top: 12px; color: #dc2626; font-size: 14px; }
.table-wrap { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; margin-top: 10px; }
.table th, .table td { padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 14px; white-space: nowrap; }
.table th { color: #475569; font-weight: 600; background: #f8fafc; }
.table td .danger { padding: 6px 10px; font-size: 12px; }
.empty-cell { padding: 22px; color: #64748b; text-align: center; }

/* 状态徽章 */
.status { display: inline-flex; padding: 4px 10px; border-radius: 999px; font-size: 12px; }
.status.active { color: #166534; background: #dcfce7; }
.status.inactive { color: #475569; background: #e2e8f0; }
.status.locked { color: #92400e; background: #fef3c7; }

.dialog-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.35); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.dialog { width: 560px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px); overflow: auto; background: #fff; border-radius: 16px; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.2); }
.dialog-header, .dialog-footer { display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; }
.dialog-header { border-bottom: 1px solid #e5e7eb; }
.dialog-header h3 { color: #1f2937; }
.dialog-body { padding: 18px; }
.icon-btn { border: none; background: transparent; font-size: 24px; cursor: pointer; color: #64748b; }
.dialog-footer { border-top: 1px solid #e5e7eb; justify-content: flex-end; gap: 8px; }
@media (max-width: 560px) { .create-form { grid-template-columns: 1fr; } }
</style>
