<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import api, { lowerDeviceApi } from '@/services/api'

const devices = ref([])
const projects = ref([])
const holes = ref([])
const loading = ref(false)
const syncingFromAdmin = ref(false)
const syncFeedback = ref({ type: '', text: '' })
const pagination = ref({ total: 0, page: 1, limit: 10 })
const filters = ref({ calibration_status: '', keyword: '' })
const AUTO_REFRESH_INTERVAL_MS = 20000
let refreshTimer = null

const showEditDialog = ref(false)
const showDeleteConfirm = ref(false)
const showBindHoleDialog = ref(false)
const editingDevice = ref(null)
const deleteTarget = ref(null)
const bindingDevice = ref(null)

const formData = ref({
  device_code: '',
  device_name: ''
})

const bindForm = ref({
  hole_id: null
})

const calibrationStatusOptions = [
  { value: '', label: '全部' },
  { value: 'valid', label: '有效' },
  { value: 'expired', label: '已过期' },
  { value: 'pending', label: '待校准' }
]

const statusTextMap = {
  idle: '空闲',
  measuring: '测量中',
  maintenance: '维护中',
  fault: '故障',
  calibrating: '校准中'
}

const statusClassMap = {
  idle: 'status-idle',
  measuring: 'status-measuring',
  maintenance: 'status-maintenance',
  fault: 'status-fault',
  calibrating: 'status-calibrating'
}

const calibrationStatusTextMap = {
  valid: '有效',
  expired: '已过期',
  pending: '待校准'
}

onMounted(() => {
  syncFromAdmin({ silent: true })
  loadProjects()
  refreshTimer = setInterval(() => syncFromAdmin({ silent: true }), AUTO_REFRESH_INTERVAL_MS)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

async function syncFromAdmin({ silent = false } = {}) {
  if (syncingFromAdmin.value) return
  syncingFromAdmin.value = true
  if (!silent) syncFeedback.value = { type: '', text: '' }
  try {
    const response = await lowerDeviceApi.syncFromAdmin()
    if (response.data.success && !silent) {
      syncFeedback.value = { type: 'success', text: response.data.message || '同步成功' }
    }
  } catch (error) {
    console.error('Failed to sync admin lower devices:', error)
    syncFeedback.value = {
      type: 'error',
      text: error.response?.data?.message || '同步管理端下位机失败'
    }
  } finally {
    await loadDevices()
    syncingFromAdmin.value = false
  }
}

async function loadDevices() {
  loading.value = true
  try {
    const params = {
      page: pagination.value.page,
      limit: pagination.value.limit,
      ...filters.value
    }
    const response = await api.get('/lower-devices', { params })
    if (response.data.success) {
      devices.value = response.data.data.list
      pagination.value.total = response.data.data.total
    }
  } catch (error) {
    console.error('Failed to load devices:', error)
  } finally {
    loading.value = false
  }
}

async function loadProjects() {
  try {
    const response = await api.get('/projects', { params: { limit: 100 } })
    if (response.data.success) {
      projects.value = response.data.data.list
    }
  } catch (error) {
    console.error('Failed to load projects:', error)
  }
}

async function loadHoles(projectId) {
  if (!projectId) {
    holes.value = []
    return
  }
  try {
    const response = await api.get(`/monitoring-holes`, { params: { project_id: projectId, limit: 100 } })
    if (response.data.success) {
      holes.value = response.data.data.list
    }
  } catch (error) {
    console.error('Failed to load holes:', error)
  }
}

function handlePageChange(page) {
  pagination.value.page = page
  loadDevices()
}

function filterDevices() {
  pagination.value.page = 1
  loadDevices()
}

function resetFilters() {
  filters.value = { calibration_status: '', keyword: '' }
  pagination.value.page = 1
  loadDevices()
}

function openEditDialog(device) {
  editingDevice.value = device
  formData.value = {
    device_code: device.device_code,
    device_name: device.device_name || '',
    manufacturer: device.manufacturer || '',
    model: device.model || '',
    serial_number: device.serial_number || '',
    status: device.status || 'idle'
  }
  showEditDialog.value = true
}

function openDeleteConfirm(device) {
  deleteTarget.value = device
  showDeleteConfirm.value = true
}

function openBindHoleDialog(device) {
  bindingDevice.value = device
  bindForm.value = { hole_id: null }
  holes.value = []
  showBindHoleDialog.value = true
}

function closeDialogs() {
  showEditDialog.value = false
  showDeleteConfirm.value = false
  showBindHoleDialog.value = false
  editingDevice.value = null
  deleteTarget.value = null
  bindingDevice.value = null
}

async function updateDevice() {
  if (!formData.value.device_name.trim()) {
    alert('设备名称不能为空')
    return
  }
  try {
    // 修复说明：厂商/型号/序列号由管理端同步、状态随监测任务变化，客户端编辑仅允许修改设备名称。
    const payload = { device_name: formData.value.device_name.trim() }
    const response = await api.put(`/lower-devices/${editingDevice.value.id}`, payload)
    if (response.data.success) {
      closeDialogs()
      loadDevices()
    }
  } catch (error) {
    console.error('Failed to update device:', error)
    alert(error.response?.data?.message || '更新失败')
  }
}

async function deleteDevice() {
  try {
    const response = await api.delete(`/lower-devices/${deleteTarget.value.id}`)
    if (response.data.success) {
      closeDialogs()
      loadDevices()
    }
  } catch (error) {
    console.error('Failed to delete device:', error)
    alert(error.response?.data?.message || '删除失败')
  }
}

async function bindHole() {
  if (!bindForm.value.hole_id) {
    alert('请选择测孔')
    return
  }
  try {
    const response = await api.put(`/lower-devices/${bindingDevice.value.id}/bind-hole`, {
      hole_id: bindForm.value.hole_id
    })
    if (response.data.success) {
      closeDialogs()
      loadDevices()
    }
  } catch (error) {
    console.error('Failed to bind hole:', error)
    alert(error.response?.data?.message || '绑定失败')
  }
}

async function unbindHole(device) {
  if (!confirm('确定要解绑测孔吗？')) return
  try {
    const response = await api.put(`/lower-devices/${device.id}/unbind-hole`)
    if (response.data.success) {
      loadDevices()
    }
  } catch (error) {
    console.error('Failed to unbind hole:', error)
    alert(error.response?.data?.message || '解绑失败')
  }
}

function formatDate(date) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('zh-CN')
}

function formatDateTime(dateTime) {
  if (!dateTime) return '-'
  return new Date(dateTime).toLocaleString('zh-CN')
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <h1>下位机管理</h1>
        <p v-if="syncFeedback.text" class="sync-feedback" :class="syncFeedback.type">{{ syncFeedback.text }}</p>
      </div>
      <button class="btn-primary" :disabled="syncingFromAdmin" @click="syncFromAdmin()">
        {{ syncingFromAdmin ? '同步中...' : '从管理端同步' }}
      </button>
    </div>

    <div class="filter-bar">
      <div class="filter-group">
        <label>校准状态</label>
        <select v-model="filters.calibration_status" @change="filterDevices">
          <option v-for="opt in calibrationStatusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
      <div class="filter-group">
        <label>搜索</label>
        <input type="text" v-model="filters.keyword" placeholder="设备编号/设备名称" @keyup.enter="filterDevices">
      </div>
      <button class="btn-secondary" @click="filterDevices">搜索</button>
      <button class="btn-text" @click="resetFilters">重置</button>
    </div>

    <div class="table-container" v-if="!loading">
      <table class="data-table">
        <thead>
          <tr>
            <th>设备编号</th>
            <th>设备名称</th>
            <th>校准状态</th>
            <th>K值</th>
            <th>β值</th>
            <th>校准日期</th>
            <th>校准机构</th>
            <th>有效期至</th>
            <th>绑定测孔</th>
            <th>累计测量</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="device in devices" :key="device.id">
            <td>{{ device.device_code }}</td>
            <td>{{ device.device_name || '-' }}</td>
            <td>
              <span class="status-badge" :class="device.calibration_status">
                {{ calibrationStatusTextMap[device.calibration_status] }}
              </span>
            </td>
            <td>{{ device.k_value ?? '-' }}</td>
            <td>{{ device.beta_value ?? '-' }}</td>
            <td>{{ formatDate(device.calibration_date) }}</td>
            <td>{{ device.calibration_org || '-' }}</td>
            <td>{{ formatDate(device.valid_until) }}</td>
            <td>
              <span v-if="device.hole">
                {{ device.hole.hole_number }} ({{ device.project?.project_name || '-' }})
              </span>
              <span v-else class="text-muted">未绑定</span>
            </td>
            <td>
              下位机累计 {{ device.total_measurement_count || 0 }}次 /
              {{ (device.total_measurement_depth || 0).toFixed(1) }}m
            </td>
            <td>
              <div class="action-buttons">
                <button class="btn-icon" title="绑定测孔" @click="openBindHoleDialog(device)">📍</button>
                <button class="btn-icon" title="解绑测孔" @click="unbindHole(device)" v-if="device.hole">🔓</button>
                <button class="btn-icon" title="编辑" @click="openEditDialog(device)">✏️</button>
                <button class="btn-icon delete-btn" title="删除" @click="openDeleteConfirm(device)">🗑️</button>
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

    <div class="dialog-overlay" v-if="showEditDialog">
      <div class="dialog dialog-large">
        <div class="dialog-header">
          <h3>编辑下位机</h3>
          <button class="dialog-close" @click="closeDialogs">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="form-grid">
            <div class="form-group">
              <label>设备编号 <span class="required">*</span></label>
              <input type="text" v-model="formData.device_code" disabled>
            </div>
            <div class="form-group">
              <label>设备名称</label>
              <input type="text" v-model="formData.device_name" placeholder="请输入设备名称">
            </div>
            <!-- 修复说明：厂商/型号/序列号由管理端同步维护，这里改为只读展示，客户端不可编辑。 -->
            <div class="form-group">
              <label>生产厂商 <span class="readonly-tag">管理端同步</span></label>
              <input type="text" :value="editingDevice?.manufacturer || '-'" disabled>
            </div>
            <div class="form-group">
              <label>设备型号 <span class="readonly-tag">管理端同步</span></label>
              <input type="text" :value="editingDevice?.model || '-'" disabled>
            </div>
            <div class="form-group">
              <label>序列号 <span class="readonly-tag">管理端同步</span></label>
              <input type="text" :value="editingDevice?.serial_number || '-'" disabled>
            </div>
            <!-- 修复说明：设备状态随监测任务自动变化，这里只读展示当前状态。 -->
            <div class="form-group">
              <label>设备状态 <span class="readonly-tag">随任务变化</span></label>
              <div class="status-readonly">
                <span class="status-badge" :class="statusClassMap[editingDevice?.status] || 'status-idle'">
                  {{ statusTextMap[editingDevice?.status] || editingDevice?.status || '未知' }}
                </span>
              </div>
            </div>
          </div>
          <p class="edit-hint">仅设备名称支持在客户端修改，其他基础信息由管理端同步，设备状态随监测任务自动更新。</p>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="closeDialogs">取消</button>
          <button class="btn-primary" @click="updateDevice">保存</button>
        </div>
      </div>
    </div>

    <div class="dialog-overlay" v-if="showBindHoleDialog">
      <div class="dialog">
        <div class="dialog-header">
          <h3>绑定测孔</h3>
          <button class="dialog-close" @click="closeDialogs">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>选择项目</label>
            <select @change="loadHoles($event.target.value); bindForm.hole_id = null">
              <option value="">请选择项目</option>
              <option v-for="project in projects" :key="project.id" :value="project.id">
                {{ project.project_name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>选择测孔</label>
            <select v-model="bindForm.hole_id">
              <option :value="null">请选择测孔</option>
              <option v-for="hole in holes" :key="hole.id" :value="hole.id">
                {{ hole.hole_number }} - {{ hole.hole_name || '未命名' }}
              </option>
            </select>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="closeDialogs">取消</button>
          <button class="btn-primary" @click="bindHole" :disabled="!bindForm.hole_id">绑定</button>
        </div>
      </div>
    </div>

    <div class="dialog-overlay" v-if="showDeleteConfirm">
      <div class="dialog dialog-small">
        <div class="dialog-header">
          <h3>确认删除</h3>
          <button class="dialog-close" @click="closeDialogs">&times;</button>
        </div>
        <div class="dialog-body">
          <p>确定要删除下位机 <strong>{{ deleteTarget?.device_code }}</strong> 吗？此操作不可恢复。</p>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="closeDialogs">取消</button>
          <button class="btn-danger" @click="deleteDevice">删除</button>
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

.sync-feedback {
  margin: 6px 0 0;
  font-size: 13px;
}

.sync-feedback.success {
  color: #047857;
}

.sync-feedback.error {
  color: #b91c1c;
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

.filter-group select,
.filter-group input {
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

.btn-text {
  background: transparent;
  color: #3b82f6;
  padding: 10px;
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

.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.valid {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.expired {
  background: #fee2e2;
  color: #991b1b;
}

.status-badge.pending {
  background: #fef3c7;
  color: #92400e;
}

.status-idle {
  background: #e5e7eb;
  color: #374151;
}

.status-measuring {
  background: #dbeafe;
  color: #1e40af;
}

.status-maintenance {
  background: #fef3c7;
  color: #92400e;
}

.status-fault {
  background: #fee2e2;
  color: #991b1b;
}

.status-calibrating {
  background: #e0e7ff;
  color: #6b21a8;
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

.dialog-large {
  width: 700px;
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

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 14px;
  color: #374151;
}

.form-group input,
.form-group select {
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
}

.form-group input:disabled {
  background: #f3f4f6;
}

.required {
  color: #ef4444;
}

/* 只读字段标签提示 */
.readonly-tag {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #f3f4f6;
  color: #9ca3af;
  font-size: 11px;
  font-weight: 400;
}

.status-readonly {
  display: flex;
  align-items: center;
  min-height: 42px;
}

.edit-hint {
  margin-top: 14px;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.6;
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
