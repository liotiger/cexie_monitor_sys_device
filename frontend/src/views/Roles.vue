<script setup>
import { ref, onMounted, computed } from 'vue'
import { roleApi, permissionApi } from '@/services/api'

const roles = ref([])
const permissions = ref([])
const pagination = ref(null)
const searchTerm = ref('')
const loading = ref(false)

const showModal = ref(false)
const showPermissionModal = ref(false)
const showDeleteConfirm = ref(false)
const modalMode = ref('create')
const currentRole = ref({ role_code: '', role_name: '', role_type: 'system', description: '' })
const deleteTarget = ref(null)
const permissionTarget = ref(null)
const selectedPermissions = ref([])
const expandedModules = ref({})

const groupedPermissions = computed(() => {
  const groups = {}
  permissions.value.forEach(p => {
    const moduleName = getModuleName(p.module)
    if (!groups[moduleName]) {
      groups[moduleName] = []
    }
    groups[moduleName].push(p)
  })
  return groups
})

function getModuleName(module) {
  const moduleNames = {
    'user': '用户管理',
    'role': '角色管理',
    'permission': '权限管理',
    'project': '项目管理',
    'hole': '测孔管理',
    'device': '设备管理',
    'data': '数据管理',
    'report': '报表管理',
    'system': '系统管理'
  }
  return moduleNames[module] || module || '其他'
}

async function loadRoles(page = 1) {
  loading.value = true
  try {
    let params = { page, limit: 10 }
    if (searchTerm.value) {
      params.search = searchTerm.value
    }
    const response = await roleApi.getRoles(params)
    if (response.data.success) {
      roles.value = response.data.data.list
      pagination.value = response.data.data.pagination
    }
  } catch (error) {
    console.error('加载角色失败:', error)
  } finally {
    loading.value = false
  }
}

async function loadPermissions() {
  try {
    const response = await permissionApi.getPermissions({ limit: 100 })
    if (response.data.success) {
      permissions.value = response.data.data.list || response.data.data
    }
  } catch (error) {
    console.error('加载权限失败:', error)
  }
}

function searchRoles() {
  loadRoles(1)
}

function changePage(page) {
  loadRoles(page)
}

function openCreateModal() {
  modalMode.value = 'create'
  currentRole.value = { role_code: '', role_name: '', role_type: 'system', description: '' }
  showModal.value = true
}

function openEditModal(role) {
  modalMode.value = 'edit'
  currentRole.value = { 
    id: role.id,
    role_code: role.role_code,
    role_name: role.role_name,
    role_type: role.role_type || 'system',
    description: role.description || ''
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  currentRole.value = { role_code: '', role_name: '', role_type: 'system', description: '' }
}

async function saveRole() {
  if (!currentRole.value.role_code || !currentRole.value.role_name) {
    alert('角色编码和名称不能为空')
    return
  }
  try {
    if (modalMode.value === 'create') {
      const response = await roleApi.createRole(currentRole.value)
      if (response.data.success) {
        loadRoles()
        closeModal()
      }
    } else {
      const response = await roleApi.updateRole(currentRole.value.id, currentRole.value)
      if (response.data.success) {
        loadRoles()
        closeModal()
      }
    }
  } catch (error) {
    console.error('保存角色失败:', error)
    alert(error.response?.data?.message || '保存失败')
  }
}

function openDeleteConfirm(role) {
  deleteTarget.value = role
  showDeleteConfirm.value = true
}

function closeDeleteConfirm() {
  showDeleteConfirm.value = false
  deleteTarget.value = null
}

async function deleteRole() {
  try {
    const response = await roleApi.deleteRole(deleteTarget.value.id)
    if (response.data.success) {
      loadRoles()
      closeDeleteConfirm()
    }
  } catch (error) {
    console.error('删除角色失败:', error)
    alert(error.response?.data?.message || '删除失败')
  }
}

async function openPermissionModal(role) {
  permissionTarget.value = role
  await loadPermissions()
  try {
    const response = await roleApi.getRolePermissions(role.id)
    if (response.data.success) {
      selectedPermissions.value = response.data.data.map(p => p.id)
    }
  } catch (error) {
    selectedPermissions.value = []
  }
  showPermissionModal.value = true
}

function closePermissionModal() {
  showPermissionModal.value = false
  permissionTarget.value = null
  selectedPermissions.value = []
}

function toggleModule(module) {
  expandedModules.value[module] = !expandedModules.value[module]
}

function isModuleExpanded(module) {
  return expandedModules.value[module] !== false
}

function togglePermission(permissionId) {
  const index = selectedPermissions.value.indexOf(permissionId)
  if (index > -1) {
    selectedPermissions.value.splice(index, 1)
  } else {
    selectedPermissions.value.push(permissionId)
  }
}

function toggleAllInModule(module) {
  const modulePermissions = groupedPermissions.value[module]
  const allSelected = modulePermissions.every(p => selectedPermissions.value.includes(p.id))
  
  if (allSelected) {
    modulePermissions.forEach(p => {
      const index = selectedPermissions.value.indexOf(p.id)
      if (index > -1) {
        selectedPermissions.value.splice(index, 1)
      }
    })
  } else {
    modulePermissions.forEach(p => {
      if (!selectedPermissions.value.includes(p.id)) {
        selectedPermissions.value.push(p.id)
      }
    })
  }
}

async function savePermissions() {
  try {
    const response = await roleApi.assignPermissions(permissionTarget.value.id, selectedPermissions.value)
    if (response.data.success) {
      closePermissionModal()
      alert('权限分配成功')
    }
  } catch (error) {
    console.error('保存权限失败:', error)
    alert(error.response?.data?.message || '保存失败')
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

onMounted(() => {
  loadRoles()
})
</script>

<template>
  <div class="roles-page">
    <div class="page-header">
      <h1>角色管理</h1>
      <button class="btn-primary" @click="openCreateModal">+ 创建角色</button>
    </div>
    
    <div class="search-bar">
      <input 
        type="text" 
        v-model="searchTerm"
        @keyup.enter="searchRoles"
        placeholder="搜索角色名称..."
      >
      <button class="btn-search" @click="searchRoles">搜索</button>
    </div>
    
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>角色编码</th>
            <th>角色名称</th>
            <th>类型</th>
            <th>描述</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="role in roles" :key="role.id">
            <td>{{ role.id }}</td>
            <td><code class="role-code">{{ role.role_code }}</code></td>
            <td>{{ role.role_name }}</td>
            <td>
              <span class="type-badge" :class="role.role_type">
                {{ role.role_type === 'system' ? '系统' : '项目' }}
              </span>
            </td>
            <td>{{ role.description || '-' }}</td>
            <td>{{ formatDate(role.created_at) }}</td>
            <td>
              <div class="actions">
                <button class="btn-icon" title="编辑" @click="openEditModal(role)">✏️</button>
                <button class="btn-icon permission-btn" title="分配权限" @click="openPermissionModal(role)">🔐</button>
                <button class="btn-icon delete-btn" title="删除" @click="openDeleteConfirm(role)">🗑️</button>
              </div>
            </td>
          </tr>
          <tr v-if="roles.length === 0 && !loading">
            <td colspan="7" class="no-data">暂无数据</td>
          </tr>
          <tr v-if="loading">
            <td colspan="7" class="loading">加载中...</td>
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

    <div class="modal-overlay" v-if="showModal">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ modalMode === 'create' ? '创建角色' : '编辑角色' }}</h3>
          <button class="modal-close" @click="closeModal">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>角色编码 <span class="required">*</span></label>
            <input type="text" v-model="currentRole.role_code" placeholder="如: admin, user, operator" :disabled="modalMode === 'edit'">
            <span class="form-hint">角色编码唯一标识角色，创建后不可修改</span>
          </div>
          <div class="form-group">
            <label>角色名称 <span class="required">*</span></label>
            <input type="text" v-model="currentRole.role_name" placeholder="如: 管理员, 普通用户">
          </div>
          <div class="form-group">
            <label>角色类型</label>
            <select v-model="currentRole.role_type">
              <option value="system">系统角色</option>
              <option value="project">项目角色</option>
            </select>
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea v-model="currentRole.description" placeholder="请输入角色描述" rows="3"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="closeModal">取消</button>
          <button class="btn-primary" @click="saveRole">保存</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" v-if="showPermissionModal">
      <div class="modal permission-modal">
        <div class="modal-header">
          <h3>分配权限 - {{ permissionTarget?.role_name }}</h3>
          <button class="modal-close" @click="closePermissionModal">×</button>
        </div>
        <div class="modal-body">
          <div class="permission-tree">
            <div class="module-item" v-for="(perms, module) in groupedPermissions" :key="module">
              <div class="module-header" @click="toggleModule(module)">
                <span class="expand-icon">{{ isModuleExpanded(module) ? '▼' : '▶' }}</span>
                <span class="module-name">{{ module }}</span>
                <button class="btn-select-all" @click.stop="toggleAllInModule(module)">
                  {{ perms.every(p => selectedPermissions.includes(p.id)) ? '取消全选' : '全选' }}
                </button>
              </div>
              <div class="permission-list" v-show="isModuleExpanded(module)">
                <label class="permission-item" v-for="perm in perms" :key="perm.id">
                  <input 
                    type="checkbox" 
                    :checked="selectedPermissions.includes(perm.id)"
                    @change="togglePermission(perm.id)"
                  >
                  <span class="permission-name">{{ perm.permission_name }}</span>
                  <span class="permission-code">{{ perm.permission_code }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="closePermissionModal">取消</button>
          <button class="btn-primary" @click="savePermissions">保存</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" v-if="showDeleteConfirm">
      <div class="modal confirm-modal">
        <div class="modal-header">
          <h3>确认删除</h3>
          <button class="modal-close" @click="closeDeleteConfirm">×</button>
        </div>
        <div class="modal-body">
          <p>确定要删除角色 <strong>{{ deleteTarget?.role_name }}</strong> 吗？此操作不可恢复。</p>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="closeDeleteConfirm">取消</button>
          <button class="btn-danger" @click="deleteRole">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.roles-page {
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

.btn-primary:hover {
  opacity: 0.9;
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

.btn-search:hover {
  background: #e5e7eb;
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

.role-code {
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: #6b7280;
}

.type-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.type-badge.system {
  background: #dbeafe;
  color: #1d4ed8;
}

.type-badge.project {
  background: #fef3c7;
  color: #d97706;
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
  border-radius: 4px;
}

.btn-icon:hover {
  background: #f3f4f6;
}

.permission-btn:hover {
  background: #e0e7ff;
}

.delete-btn:hover {
  background: #fee2e2;
}

.no-data, .loading {
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

.modal-overlay {
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

.modal {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.permission-modal {
  max-width: 600px;
}

.confirm-modal {
  max-width: 400px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
}

.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #6b7280;
  padding: 0;
  line-height: 1;
}

.modal-close:hover {
  color: #1a1a2e;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.required {
  color: #ef4444;
}

.form-hint {
  display: block;
  font-size: 12px;
  color: #9ca3af;
  margin-top: 4px;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  border-color: #667eea;
}

.form-group input:disabled {
  background: #f3f4f6;
  cursor: not-allowed;
}

.btn-cancel {
  padding: 10px 20px;
  border: 1px solid #e5e7eb;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.btn-cancel:hover {
  background: #f3f4f6;
}

.btn-danger {
  background: #ef4444;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.btn-danger:hover {
  background: #dc2626;
}

.permission-tree {
  max-height: 400px;
  overflow-y: auto;
}

.module-item {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 8px;
}

.module-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: #f9fafb;
  cursor: pointer;
  gap: 8px;
}

.module-header:hover {
  background: #f3f4f6;
}

.expand-icon {
  font-size: 12px;
  color: #6b7280;
}

.module-name {
  flex: 1;
  font-weight: 500;
  color: #374151;
}

.btn-select-all {
  padding: 4px 12px;
  border: 1px solid #e5e7eb;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-select-all:hover {
  background: #f3f4f6;
}

.permission-list {
  padding: 8px 16px;
}

.permission-item {
  display: flex;
  align-items: center;
  padding: 8px 0;
  cursor: pointer;
  gap: 8px;
}

.permission-item:hover {
  background: #f9fafb;
}

.permission-item input {
  width: 16px;
  height: 16px;
}

.permission-name {
  flex: 1;
  font-size: 14px;
  color: #374151;
}

.permission-code {
  font-size: 12px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 4px;
}
</style>
