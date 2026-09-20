<script setup>
import { ref, onMounted, computed } from 'vue'
import { permissionApi } from '@/services/api'

const permissions = ref([])
const pagination = ref(null)
const searchTerm = ref('')
const filterModule = ref('')
const loading = ref(false)

const showModal = ref(false)
const showDeleteConfirm = ref(false)
const modalMode = ref('create')
const currentPermission = ref({ permission_name: '', permission_code: '', module: '', description: '' })
const deleteTarget = ref(null)

const groupedPermissions = computed(() => {
  const groups = {}
  let filtered = permissions.value
  
  if (filterModule.value) {
    filtered = filtered.filter(p => p.module === filterModule.value)
  }
  
  filtered.forEach(p => {
    if (!groups[p.module]) {
      groups[p.module] = []
    }
    groups[p.module].push(p)
  })
  return groups
})

const moduleList = computed(() => {
  const modules = new Set()
  permissions.value.forEach(p => modules.add(p.module))
  return Array.from(modules)
})

async function loadPermissions(page = 1) {
  loading.value = true
  try {
    let params = { page, limit: 50 }
    if (searchTerm.value) {
      params.search = searchTerm.value
    }
    const response = await permissionApi.getPermissions(params)
    if (response.data.success) {
      permissions.value = response.data.data.list || response.data.data
      if (response.data.data.pagination) {
        pagination.value = response.data.data.pagination
      }
    }
  } catch (error) {
    console.error('加载权限失败:', error)
  } finally {
    loading.value = false
  }
}

function searchPermissions() {
  loadPermissions(1)
}

function openCreateModal() {
  modalMode.value = 'create'
  currentPermission.value = { permission_name: '', permission_code: '', module: '', description: '' }
  showModal.value = true
}

function openEditModal(permission) {
  modalMode.value = 'edit'
  currentPermission.value = { ...permission }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  currentPermission.value = { permission_name: '', permission_code: '', module: '', description: '' }
}

async function savePermission() {
  try {
    if (modalMode.value === 'create') {
      const response = await permissionApi.createPermission(currentPermission.value)
      if (response.data.success) {
        loadPermissions()
        closeModal()
      }
    } else {
      const response = await permissionApi.updatePermission(currentPermission.value.id, currentPermission.value)
      if (response.data.success) {
        loadPermissions()
        closeModal()
      }
    }
  } catch (error) {
    console.error('保存权限失败:', error)
  }
}

function openDeleteConfirm(permission) {
  deleteTarget.value = permission
  showDeleteConfirm.value = true
}

function closeDeleteConfirm() {
  showDeleteConfirm.value = false
  deleteTarget.value = null
}

async function deletePermission() {
  try {
    const response = await permissionApi.deletePermission(deleteTarget.value.id)
    if (response.data.success) {
      loadPermissions()
      closeDeleteConfirm()
    }
  } catch (error) {
    console.error('删除权限失败:', error)
  }
}

onMounted(() => {
  loadPermissions()
})
</script>

<template>
  <div class="permissions-page">
    <div class="page-header">
      <h1>权限管理</h1>
      <button class="btn-primary" @click="openCreateModal">+ 创建权限</button>
    </div>
    
    <div class="search-bar">
      <input 
        type="text" 
        v-model="searchTerm"
        @keyup.enter="searchPermissions"
        placeholder="搜索权限名称或代码..."
      >
      <select v-model="filterModule" class="filter-select">
        <option value="">全部模块</option>
        <option v-for="module in moduleList" :key="module" :value="module">{{ module }}</option>
      </select>
      <button class="btn-search" @click="searchPermissions">搜索</button>
    </div>
    
    <div class="permissions-container">
      <div class="module-section" v-for="(perms, module) in groupedPermissions" :key="module">
        <div class="module-header">
          <h3 class="module-title">{{ module }}</h3>
          <span class="permission-count">{{ perms.length }} 个权限</span>
        </div>
        <div class="permission-grid">
          <div class="permission-card" v-for="perm in perms" :key="perm.id">
            <div class="permission-info">
              <h4 class="permission-name">{{ perm.permission_name }}</h4>
              <span class="permission-code">{{ perm.permission_code }}</span>
            </div>
            <p class="permission-desc">{{ perm.description || '暂无描述' }}</p>
            <div class="permission-actions">
              <button class="btn-icon" title="编辑" @click="openEditModal(perm)">✏️</button>
              <button class="btn-icon delete-btn" title="删除" @click="openDeleteConfirm(perm)">🗑️</button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="no-data" v-if="Object.keys(groupedPermissions).length === 0 && !loading">
        暂无权限数据
      </div>
      
      <div class="loading" v-if="loading">
        加载中...
      </div>
    </div>

    <div class="modal-overlay" v-if="showModal">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ modalMode === 'create' ? '创建权限' : '编辑权限' }}</h3>
          <button class="modal-close" @click="closeModal">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>权限名称 <span class="required">*</span></label>
            <input type="text" v-model="currentPermission.permission_name" placeholder="请输入权限名称">
          </div>
          <div class="form-group">
            <label>权限代码 <span class="required">*</span></label>
            <input type="text" v-model="currentPermission.permission_code" placeholder="如：user:create">
          </div>
          <div class="form-group">
            <label>所属模块 <span class="required">*</span></label>
            <input type="text" v-model="currentPermission.module" placeholder="如：用户管理" list="module-list">
            <datalist id="module-list">
              <option v-for="module in moduleList" :key="module" :value="module" />
            </datalist>
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea v-model="currentPermission.description" placeholder="请输入权限描述" rows="3"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="closeModal">取消</button>
          <button class="btn-primary" @click="savePermission">保存</button>
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
          <p>确定要删除权限 <strong>{{ deleteTarget?.permission_name }}</strong> 吗？此操作不可恢复。</p>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="closeDeleteConfirm">取消</button>
          <button class="btn-danger" @click="deletePermission">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.permissions-page {
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

.filter-select {
  padding: 10px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: white;
  min-width: 150px;
}

.filter-select:focus {
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

.permissions-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.module-section {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.module-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.module-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
}

.permission-count {
  font-size: 12px;
  color: #6b7280;
  background: #e5e7eb;
  padding: 4px 12px;
  border-radius: 20px;
}

.permission-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  padding: 16px;
}

.permission-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s;
}

.permission-card:hover {
  border-color: #667eea;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.permission-info {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.permission-name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
}

.permission-code {
  font-size: 11px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: monospace;
}

.permission-desc {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
}

.permission-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
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

.delete-btn:hover {
  background: #fee2e2;
}

.no-data, .loading {
  text-align: center;
  color: #6b7280;
  padding: 48px;
  background: white;
  border-radius: 12px;
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
</style>
