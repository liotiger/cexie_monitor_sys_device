<script setup>
import { ref, reactive, onMounted } from 'vue'
import api from '@/services/api'

const users = ref([])
const pagination = ref(null)
const searchTerm = ref('')
const showCreateDialog = ref(false)
const submitting = ref(false)
const errorMessage = ref('')

// 新增用户表单，字段与后端 POST /users 接收的字段保持一致
const form = reactive({
  username: '',
  password: '',
  email: '',
  real_name: '',
  phone: '',
  status: 'active'
})

function isAdminUser(user) {
  const roles = Array.isArray(user.roles) ? user.roles : []
  return roles.includes('admin') || roles.includes('system_admin') || user.role === 'admin'
}

function getRoleLabel(user) {
  return isAdminUser(user) ? '管理员' : '用户'
}

async function loadUsers(page = 1) {
  try {
    let url = `/users?page=${page}&limit=10`
    if (searchTerm.value) {
      url += `&search=${encodeURIComponent(searchTerm.value)}`
    }
    
    const response = await api.get(url)
    if (response.data.success) {
      users.value = response.data.data.list
      pagination.value = response.data.data.pagination
    }
  } catch (error) {
    console.error('Failed to load users:', error)
  }
}

function searchUsers() {
  loadUsers(1)
}

function changePage(page) {
  loadUsers(page)
}

function resetForm() {
  form.username = ''
  form.password = ''
  form.email = ''
  form.real_name = ''
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

// 修复说明：原来“添加用户”按钮未绑定任何事件，点击无反应；这里补齐新增用户弹窗与提交逻辑。
async function createUser() {
  const payload = {
    username: form.username.trim(),
    password: form.password,
    email: form.email.trim(),
    real_name: form.real_name.trim(),
    phone: form.phone.trim(),
    status: form.status
  }

  // 后端校验口径：用户名、邮箱、密码均为必填
  if (!payload.username || !payload.email || !payload.password) {
    errorMessage.value = '用户名、邮箱和密码不能为空'
    return
  }

  submitting.value = true
  errorMessage.value = ''
  try {
    await api.post('/users', payload)
    showCreateDialog.value = false
    resetForm()
    await loadUsers()
  } catch (error) {
    errorMessage.value = error.response?.data?.message || '添加用户失败'
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadUsers()
})
</script>

<template>
  <div class="users-page">
    <div class="page-header">
      <h1>用户管理</h1>
      <button class="btn-primary" @click="openCreateDialog">+ 添加用户</button>
    </div>
    
    <div class="search-bar">
      <input 
        type="text" 
        v-model="searchTerm"
        @keyup.enter="searchUsers"
        placeholder="搜索用户名或邮箱..."
      >
      <button class="btn-search" @click="searchUsers">搜索</button>
    </div>
    
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>用户名</th>
            <th>邮箱</th>
            <th>角色</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td>{{ user.id }}</td>
            <td>{{ user.username }}</td>
            <td>{{ user.email }}</td>
            <td>
              <span class="badge" :class="{ admin: isAdminUser(user) }">
                {{ getRoleLabel(user) }}
              </span>
            </td>
            <td>
              <span class="status-badge" :class="{ active: user.status === 'active' }">
                {{ user.status === 'active' ? '活跃' : '禁用' }}
              </span>
            </td>
            <td>
              <div class="actions">
                <button class="btn-icon" title="编辑">✏️</button>
                <button class="btn-icon" title="删除">🗑️</button>
              </div>
            </td>
          </tr>
          <tr v-if="users.length === 0">
            <td colspan="6" class="no-data">暂无数据</td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <div class="pagination" v-if="pagination">
      <span>共 {{ pagination.total }} 条记录</span>
      <div class="page-buttons">
        <button 
          :disabled="pagination.page === 1"
          @click="changePage(pagination.page - 1)"
        >上一页</button>
        <span>第 {{ pagination.page }} 页</span>
        <button 
          :disabled="pagination.page * pagination.limit >= pagination.total"
          @click="changePage(pagination.page + 1)"
        >下一页</button>
      </div>
    </div>

    <div class="dialog-overlay" v-if="showCreateDialog">
      <div class="dialog dialog-small">
        <div class="dialog-header">
          <h3>添加用户</h3>
          <button class="dialog-close" @click="closeCreateDialog">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="form-grid">
            <div class="form-group">
              <label>用户名 <span class="required">*</span></label>
              <input type="text" v-model="form.username" placeholder="请输入用户名">
            </div>
            <div class="form-group">
              <label>邮箱 <span class="required">*</span></label>
              <input type="email" v-model="form.email" placeholder="请输入邮箱">
            </div>
            <div class="form-group">
              <label>密码 <span class="required">*</span></label>
              <input type="password" v-model="form.password" placeholder="请输入密码">
            </div>
            <div class="form-group">
              <label>姓名</label>
              <input type="text" v-model="form.real_name" placeholder="请输入姓名">
            </div>
            <div class="form-group">
              <label>手机号</label>
              <input type="text" v-model="form.phone" placeholder="请输入手机号">
            </div>
            <div class="form-group">
              <label>状态</label>
              <select v-model="form.status">
                <option value="active">活跃</option>
                <option value="inactive">禁用</option>
                <option value="locked">锁定</option>
              </select>
            </div>
          </div>
          <p class="error-text" v-if="errorMessage">{{ errorMessage }}</p>
        </div>
        <div class="dialog-footer">
          <button class="btn-search" @click="closeCreateDialog">取消</button>
          <button class="btn-primary" :disabled="submitting" @click="createUser">{{ submitting ? '提交中...' : '确认添加' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.users-page {
  width: 100%;
  max-width: none;
  min-width: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-header h1 {
  font-size: 24px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.search-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.search-bar input {
  flex: 1;
  padding: 10px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
}

.search-bar input:focus {
  border-color: #667eea;
}

.btn-search {
  background: #f3f4f6;
  border: 2px solid #e5e7eb;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.table-container {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 14px 16px;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
}

.data-table th {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: #f9fafb;
}

.data-table td {
  font-size: 14px;
  color: #374151;
}

.badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  background: #e5e7eb;
  color: #374151;
}

.badge.admin {
  background: #fef3c7;
  color: #92400e;
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  background: #fee2e2;
  color: #991b1b;
}

.status-badge.active {
  background: #d1fae5;
  color: #065f46;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
}

.no-data {
  text-align: center;
  color: #6b7280;
  padding: 32px !important;
}

.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  padding: 16px;
  background: white;
  border-radius: 8px;
}

.page-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-buttons button {
  padding: 8px 16px;
  border: 1px solid #e5e7eb;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.page-buttons button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 新增用户弹窗：沿用客户端其他页面统一的 dialog / form-grid 结构 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 700px;
  max-height: 90vh;
  overflow-y: auto;
}

.dialog-small {
  max-width: 450px;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
}

.dialog-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #6b7280;
  padding: 0;
  line-height: 1;
}

.dialog-body {
  padding: 24px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.form-group .required {
  color: #ef4444;
}

.form-group input,
.form-group select {
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
}

.form-group input:focus,
.form-group select:focus {
  border-color: #667eea;
}

.error-text {
  margin: 16px 0 0;
  color: #ef4444;
  font-size: 14px;
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
