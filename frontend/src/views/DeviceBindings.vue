<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'

const bindings = ref([])
const upperDevices = ref([])
const lowerDevices = ref([])
const loading = ref(false)
const pagination = ref({ total: 0, page: 1, limit: 10 })
const filters = ref({ status: 'active' })

const showCreateDialog = ref(false)
const showDeleteConfirm = ref(false)
const deleteTarget = ref(null)

const formData = ref({
  upper_device_id: null,
  lower_device_id: null
})

const statusOptions = [
  { value: '', label: '全部' },
  { value: 'active', label: '活跃' },
  { value: 'inactive', label: '已解绑' }
]

onMounted(() => {
  loadBindings()
  loadUpperDevices()
  loadLowerDevices()
})

async function loadBindings() {
  loading.value = true
  try {
    const params = {
      page: pagination.value.page,
      limit: pagination.value.limit,
      ...filters.value
    }
    const response = await api.get('/device-bindings', { params })
    if (response.data.success) {
      bindings.value = response.data.data.list
      pagination.value.total = response.data.data.total
    }
  } catch (error) {
    console.error('Failed to load bindings:', error)
  } finally {
    loading.value = false
  }
}

async function loadUpperDevices() {
  try {
    const response = await api.get('/upper-devices', { params: { limit: 100 } })
    if (response.data.success) {
      upperDevices.value = response.data.data.list
    }
  } catch (error) {
    console.error('Failed to load upper devices:', error)
  }
}

async function loadLowerDevices() {
  try {
    const response = await api.get('/lower-devices', { params: { limit: 100 } })
    if (response.data.success) {
      lowerDevices.value = response.data.data.list
    }
  } catch (error) {
    console.error('Failed to load lower devices:', error)
  }
}

function handlePageChange(page) {
  pagination.value.page = page
  loadBindings()
}

function filterBindings() {
  pagination.value.page = 1
  loadBindings()
}

function openCreateDialog() {
  formData.value = {
    upper_device_id: null,
    lower_device_id: null
  }
  showCreateDialog.value = true
}

function openDeleteConfirm(binding) {
  deleteTarget.value = binding
  showDeleteConfirm.value = true
}

function closeDialogs() {
  showCreateDialog.value = false
  showDeleteConfirm.value = false
  deleteTarget.value = null
}

async function createBinding() {
  if (!formData.value.upper_device_id || !formData.value.lower_device_id) {
    alert('请选择上位机和下位机')
    return
  }
  try {
    const response = await api.post('/device-bindings', formData.value)
    if (response.data.success) {
      closeDialogs()
      loadBindings()
    }
  } catch (error) {
    console.error('Failed to create binding:', error)
    alert(error.response?.data?.message || '创建失败')
  }
}

async function deleteBinding() {
  try {
    const response = await api.delete(`/device-bindings/${deleteTarget.value.id}`)
    if (response.data.success) {
      closeDialogs()
      loadBindings()
    }
  } catch (error) {
    console.error('Failed to delete binding:', error)
    alert(error.response?.data?.message || '解绑失败')
  }
}

function formatDateTime(dateTime) {
  if (!dateTime) return '-'
  return new Date(dateTime).toLocaleString('zh-CN')
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h1>设备绑定管理</h1>
      <button class="btn-primary" @click="openCreateDialog">+ 新增绑定</button>
    </div>

    <div class="filter-bar">
      <div class="filter-group">
        <label>绑定状态</label>
        <select v-model="filters.status" @change="filterBindings">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
    </div>

    <div class="table-container" v-if="!loading">
      <table class="data-table">
        <thead>
          <tr>
            <th>上位机 (DTU)</th>
            <th>下位机 (测斜仪)</th>
            <th>绑定类型</th>
            <th>绑定状态</th>
            <th>绑定时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="binding in bindings" :key="binding.id">
            <td>
              <div v-if="binding.upperDevice">
                <div class="device-info">
                  <span class="device-name">{{ binding.upperDevice.device_name || '-' }}</span>
                  <span class="device-code">IMEI: {{ binding.upperDevice.imei }}</span>
                </div>
              </div>
              <span v-else class="text-muted">-</span>
            </td>
            <td>
              <div v-if="binding.lowerDevice">
                <div class="device-info">
                  <span class="device-name">{{ binding.lowerDevice.device_name || '-' }}</span>
                  <span class="device-code">编号: {{ binding.lowerDevice.device_code }}</span>
                </div>
              </div>
              <span v-else class="text-muted">-</span>
            </td>
            <td>
              <span class="type-badge" :class="binding.binding_type">
                {{ binding.binding_type === 'permanent' ? '永久绑定' : '临时绑定' }}
              </span>
            </td>
            <td>
              <span class="status-badge" :class="binding.status">
                {{ binding.status === 'active' ? '活跃' : '已解绑' }}
              </span>
            </td>
            <td>{{ formatDateTime(binding.bind_time) }}</td>
            <td>
              <div class="action-buttons">
                <button 
                  class="btn-icon delete-btn" 
                  title="解绑" 
                  @click="openDeleteConfirm(binding)"
                  v-if="binding.status === 'active'">
                  🔓
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="loading-container" v-else>
      <span class="loading-text">加载中...</span>
    </div>

    <div class="pagination" v-if="pagination.total > pagination.limit">
      <button 
        class="btn-page" 
        :disabled="pagination.page === 1" 
        @click="handlePageChange(pagination.page - 1)">
        上一页
      </button>
      <span class="page-info">第 {{ pagination.page }} 页 / 共 {{ Math.ceil(pagination.total / pagination.limit) }} 页</span>
      <button 
        class="btn-page" 
        :disabled="pagination.page >= Math.ceil(pagination.total / pagination.limit)" 
        @click="handlePageChange(pagination.page + 1)">
        下一页
      </button>
    </div>

    <div class="dialog-overlay" v-if="showCreateDialog">
      <div class="dialog">
        <div class="dialog-header">
          <h3>新增设备绑定</h3>
          <button class="dialog-close" @click="closeDialogs">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>选择上位机 (DTU) <span class="required">*</span></label>
            <select v-model="formData.upper_device_id">
              <option :value="null">请选择上位机</option>
              <option v-for="device in upperDevices" :key="device.id" :value="device.id">
                {{ device.device_name || device.imei }} ({{ device.imei }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>选择下位机 (测斜仪) <span class="required">*</span></label>
            <select v-model="formData.lower_device_id">
              <option :value="null">请选择下位机</option>
              <option v-for="device in lowerDevices" :key="device.id" :value="device.id">
                {{ device.device_name || device.device_code }} ({{ device.device_code }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>绑定类型</label>
            <select v-model="formData.binding_type">
              <option value="permanent">永久绑定</option>
              <option value="temporary">临时绑定</option>
            </select>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="closeDialogs">取消</button>
          <button class="btn-primary" @click="createBinding">创建绑定</button>
        </div>
      </div>
    </div>

    <div class="dialog-overlay" v-if="showDeleteConfirm">
      <div class="dialog dialog-small">
        <div class="dialog-header">
          <h3>确认解绑</h3>
          <button class="dialog-close" @click="closeDialogs">&times;</button>
        </div>
        <div class="dialog-body">
          <p>确定要解绑以下设备吗？</p>
          <div class="binding-info" v-if="deleteTarget">
            <p><strong>上位机:</strong> {{ deleteTarget.upperDevice?.device_name || deleteTarget.upperDevice?.imei }}</p>
            <p><strong>下位机:</strong> {{ deleteTarget.lowerDevice?.device_name || deleteTarget.lowerDevice?.device_code }}</p>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="closeDialogs">取消</button>
          <button class="btn-danger" @click="deleteBinding">解绑</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-container {
  width: 100%;
  max-width: none;
  min-width: 0;
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h1 {
  font-size: 24px;
  font-weight: 600;
  color: #1f2937;
}

.filter-bar {
  display: flex;
  gap: 16px;
  align-items: flex-end;
  margin-bottom: 20px;
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-group label {
  font-size: 12px;
  color: #6b7280;
}

.filter-group select {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  min-width: 150px;
}

.btn-primary {
  background: #3b82f6;
  color: white;
  padding: 10px 20px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
}

.btn-secondary {
  background: #e5e7eb;
  color: #374151;
  padding: 10px 20px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
}

.btn-danger {
  background: #ef4444;
  color: white;
  padding: 10px 20px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
}

.table-container {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
}

.data-table th {
  background: #f9fafb;
  font-weight: 600;
  color: #374151;
}

.data-table tbody tr:hover {
  background: #f9fafb;
}

.device-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.device-name {
  font-weight: 500;
}

.device-code {
  font-size: 12px;
  color: #6b7280;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.active {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.inactive {
  background: #fee2e2;
  color: #991b1b;
}

.text-muted {
  color: #9ca3af;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.btn-icon {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
}

.btn-icon.delete-btn:hover {
  background: #fee2e2;
  border-radius: 4px;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
}

.btn-page {
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  cursor: pointer;
}

.btn-page:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  color: #6b7280;
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.dialog {
  background: white;
  border-radius: 8px;
  width: 500px;
  max-width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.dialog-small {
  width: 400px;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-header h3 {
  font-size: 18px;
  font-weight: 600;
}

.dialog-close {
  background: transparent;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #6b7280;
}

.dialog-body {
  padding: 20px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.form-group label {
  font-size: 14px;
  color: #374151;
}

.form-group select {
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}

.required {
  color: #ef4444;
}

.binding-info {
  background: #f9fafb;
  padding: 12px;
  border-radius: 6px;
  margin-top: 12px;
}

.binding-info p {
  margin: 4px 0;
}

.loading-container {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.loading-text {
  color: #6b7280;
}
</style>
