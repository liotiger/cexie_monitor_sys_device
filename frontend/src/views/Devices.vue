<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'

const router = useRouter()

const devices = ref([])
const projects = ref([])
const holes = ref([])
const pagination = ref(null)
const searchTerm = ref('')
const filters = ref({
  status: '',
  device_type: '',
  network_status: ''
})

const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const showDeleteConfirm = ref(false)
const showBindDialog = ref(false)
const editingDevice = ref(null)
const deletingDevice = ref(null)
const bindingDevice = ref(null)

const formData = ref({
  device_id: '',
  device_name: '',
  device_type: '',
  manufacturer: '',
  model: '',
  serial_number: '',
  purchase_date: '',
  dtu_id: '',
  ip_address: '',
  communication_protocol: '',
  K_value: null,
  beta_value: null,
  calibration_date: '',
  calibration_org: '',
  valid_until: ''
})

const bindFormData = ref({
  hole_id: null,
  project_id: null
})

const formErrors = ref({})

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'idle', label: '空闲' },
  { value: 'measuring', label: '测量中' },
  { value: 'maintenance', label: '维护中' },
  { value: 'fault', label: '故障' },
  { value: 'calibrating', label: '标定中' },
  { value: 'charging', label: '充电中' }
]

const networkStatusOptions = [
  { value: '', label: '全部网络状态' },
  { value: 'online', label: '在线' },
  { value: 'offline', label: '离线' }
]

const deviceTypeOptions = [
  { value: '', label: '全部类型' },
  { value: 'inclinometer', label: '测斜仪' },
  { value: 'sensor', label: '传感器' },
  { value: 'data_logger', label: '数据采集器' }
]

const statusTextMap = {
  idle: '空闲',
  measuring: '测量中',
  maintenance: '维护中',
  fault: '故障',
  calibrating: '标定中',
  charging: '充电中'
}

const statusClassMap = {
  idle: 'status-idle',
  measuring: 'status-measuring',
  maintenance: 'status-maintenance',
  fault: 'status-fault',
  calibrating: 'status-calibrating',
  charging: 'status-charging'
}

const calibrationStatusTextMap = {
  valid: '有效',
  expired: '已过期',
  pending: '待标定'
}

const calibrationStatusClassMap = {
  valid: 'calibration-valid',
  expired: 'calibration-expired',
  pending: 'calibration-pending'
}

async function loadDevices(page = 1) {
  try {
    let url = `/devices?page=${page}&limit=10`
    
    if (searchTerm.value) {
      url += `&search=${encodeURIComponent(searchTerm.value)}`
    }
    if (filters.value.status) {
      url += `&status=${filters.value.status}`
    }
    if (filters.value.device_type) {
      url += `&device_type=${filters.value.device_type}`
    }
    if (filters.value.network_status) {
      url += `&network_status=${filters.value.network_status}`
    }
    
    const response = await api.get(url)
    if (response.data.success) {
      devices.value = response.data.data.list
      pagination.value = response.data.data.pagination
    }
  } catch (error) {
    console.error('Failed to load devices:', error)
  }
}

function searchDevices() {
  loadDevices(1)
}

function filterDevices() {
  loadDevices(1)
}

function changePage(page) {
  loadDevices(page)
}

function openCreateDialog() {
  formData.value = {
    device_id: '',
    device_name: '',
    device_type: '',
    manufacturer: '',
    model: '',
    serial_number: '',
    purchase_date: '',
    dtu_id: '',
    ip_address: '',
    communication_protocol: '',
    K_value: null,
    beta_value: null,
    calibration_date: '',
    calibration_org: '',
    valid_until: ''
  }
  formErrors.value = {}
  showCreateDialog.value = true
}

function openEditDialog(device) {
  editingDevice.value = device
  formData.value = {
    device_id: device.device_id,
    device_name: device.device_name || '',
    device_type: device.device_type || '',
    manufacturer: device.manufacturer || '',
    model: device.model || '',
    serial_number: device.serial_number || '',
    purchase_date: device.purchase_date || '',
    dtu_id: device.dtu_id || '',
    ip_address: device.ip_address || '',
    communication_protocol: device.communication_protocol || '',
    K_value: device.K_value,
    beta_value: device.beta_value,
    calibration_date: device.calibration_date || '',
    calibration_org: device.calibration_org || '',
    valid_until: device.valid_until || ''
  }
  formErrors.value = {}
  showEditDialog.value = true
}

function validateDeviceForm() {
  formErrors.value = {}
  let isValid = true
  
  if (!formData.value.device_id || formData.value.device_id.trim() === '') {
    formErrors.value.device_id = '设备ID不能为空'
    isValid = false
  } else if (formData.value.device_id.length > 50) {
    formErrors.value.device_id = '设备ID不能超过50个字符'
    isValid = false
  }
  
  if (formData.value.ip_address && !/^(\d{1,3}\.){3}\d{1,3}$/.test(formData.value.ip_address)) {
    formErrors.value.ip_address = 'IP地址格式不正确'
    isValid = false
  }
  
  return isValid
}

function openDeleteConfirm(device) {
  deletingDevice.value = device
  showDeleteConfirm.value = true
}

function openBindDialog(device) {
  bindingDevice.value = device
  bindFormData.value = {
    hole_id: null,
    project_id: null
  }
  loadProjects()
  holes.value = []
  showBindDialog.value = true
}

async function loadProjects() {
  try {
    const response = await api.get('/projects?limit=100')
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
    const response = await api.get(`/monitoring-holes?project_id=${projectId}&limit=100`)
    if (response.data.success) {
      holes.value = response.data.data.list
    }
  } catch (error) {
    console.error('Failed to load holes:', error)
  }
}

async function createDevice() {
  if (!validateDeviceForm()) {
    return
  }
  try {
    const payload = { ...formData.value }
    if (payload.purchase_date === '') payload.purchase_date = null
    if (payload.calibration_date === '') payload.calibration_date = null
    if (payload.valid_until === '') payload.valid_until = null
    const response = await api.post('/devices', payload)
    if (response.data.success) {
      showCreateDialog.value = false
      loadDevices()
    }
  } catch (error) {
    console.error('Failed to create device:', error)
    alert(error.response?.data?.message || '创建设备失败')
  }
}

async function updateDevice() {
  if (!validateDeviceForm()) {
    return
  }
  try {
    const payload = { ...formData.value }
    if (payload.purchase_date === '') payload.purchase_date = null
    if (payload.calibration_date === '') payload.calibration_date = null
    if (payload.valid_until === '') payload.valid_until = null
    const response = await api.put(`/devices/${editingDevice.value.id}`, payload)
    if (response.data.success) {
      showEditDialog.value = false
      loadDevices()
    }
  } catch (error) {
    console.error('Failed to update device:', error)
    alert(error.response?.data?.message || '更新设备失败')
  }
}

async function deleteDevice() {
  try {
    const response = await api.delete(`/devices/${deletingDevice.value.id}`)
    if (response.data.success) {
      showDeleteConfirm.value = false
      loadDevices()
    }
  } catch (error) {
    console.error('Failed to delete device:', error)
    alert(error.response?.data?.message || '删除设备失败')
  }
}

async function bindDevice() {
  try {
    const response = await api.post(`/devices/${bindingDevice.value.id}/bind`, bindFormData.value)
    if (response.data.success) {
      showBindDialog.value = false
      loadDevices()
    }
  } catch (error) {
    console.error('Failed to bind device:', error)
    alert(error.response?.data?.message || '绑定设备失败')
  }
}

async function unbindDevice(device) {
  try {
    const response = await api.post(`/devices/${device.id}/unbind`)
    if (response.data.success) {
      loadDevices()
    }
  } catch (error) {
    console.error('Failed to unbind device:', error)
    alert(error.response?.data?.message || '解绑设备失败')
  }
}

function viewDeviceDetail(device) {
  router.push(`/devices/${device.id}`)
}

function formatDateTime(timestamp) {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN')
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return dateStr
}

onMounted(() => {
  loadDevices()
})
</script>

<template>
  <div class="devices-page">
    <div class="page-header">
      <h1>设备管理</h1>
      <button class="btn-primary" @click="openCreateDialog">+ 添加设备</button>
    </div>
    
    <div class="search-filter-bar">
      <div class="search-bar">
        <input 
          type="text" 
          v-model="searchTerm"
          @keyup.enter="searchDevices"
          placeholder="搜索设备ID、名称或序列号..."
        >
        <button class="btn-search" @click="searchDevices">搜索</button>
      </div>
      
      <div class="filter-bar">
        <select v-model="filters.status" @change="filterDevices">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <select v-model="filters.device_type" @change="filterDevices">
          <option v-for="opt in deviceTypeOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <select v-model="filters.network_status" @change="filterDevices">
          <option v-for="opt in networkStatusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
    </div>
    
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>设备ID</th>
            <th>设备名称</th>
            <th>设备类型</th>
            <th>状态</th>
            <th>网络状态</th>
            <th>标定状态</th>
            <th>绑定测孔</th>
            <th>最后在线</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="device in devices" :key="device.id" @click="viewDeviceDetail(device)" class="clickable-row">
            <td>{{ device.device_id }}</td>
            <td>{{ device.device_name || '-' }}</td>
            <td>{{ device.device_type || '-' }}</td>
            <td>
              <span class="status-badge" :class="statusClassMap[device.status]">
                {{ statusTextMap[device.status] }}
              </span>
            </td>
            <td>
              <span class="network-indicator" :class="{ online: device.network_status === 'online' }">
                <span class="network-dot"></span>
                {{ device.network_status === 'online' ? '在线' : '离线' }}
              </span>
            </td>
            <td>
              <span class="calibration-badge" :class="calibrationStatusClassMap[device.calibration_status]">
                {{ calibrationStatusTextMap[device.calibration_status] }}
              </span>
            </td>
            <td>{{ device.current_hole_id || '-' }}</td>
            <td>{{ formatDateTime(device.last_online_time) }}</td>
            <td>
              <div class="actions" @click.stop>
                <button class="btn-icon" title="编辑" @click="openEditDialog(device)">✏️</button>
                <button 
                  v-if="!device.current_hole_id" 
                  class="btn-icon" 
                  title="绑定测孔" 
                  @click="openBindDialog(device)"
                >🔗</button>
                <button 
                  v-else 
                  class="btn-icon" 
                  title="解绑测孔" 
                  @click="unbindDevice(device)"
                >🔓</button>
                <button class="btn-icon btn-danger" title="删除" @click="openDeleteConfirm(device)">🗑️</button>
              </div>
            </td>
          </tr>
          <tr v-if="devices.length === 0">
            <td colspan="9" class="no-data">暂无数据</td>
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
    
    <div class="dialog-overlay" v-if="showCreateDialog || showEditDialog">
      <div class="dialog">
        <div class="dialog-header">
          <h3>{{ showEditDialog ? '编辑设备' : '添加设备' }}</h3>
          <button class="dialog-close" @click="showCreateDialog = false; showEditDialog = false">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="form-grid">
            <div class="form-group">
              <label>设备ID <span class="required">*</span></label>
              <input type="text" v-model="formData.device_id" placeholder="请输入设备ID" :class="{ 'input-error': formErrors.device_id }">
              <span class="error-text" v-if="formErrors.device_id">{{ formErrors.device_id }}</span>
            </div>
            <div class="form-group">
              <label>设备名称</label>
              <input type="text" v-model="formData.device_name" placeholder="请输入设备名称">
            </div>
            <div class="form-group">
              <label>设备类型</label>
              <select v-model="formData.device_type">
                <option value="">请选择</option>
                <option value="inclinometer">测斜仪</option>
                <option value="sensor">传感器</option>
                <option value="data_logger">数据采集器</option>
              </select>
            </div>
            <div class="form-group">
              <label>制造商</label>
              <input type="text" v-model="formData.manufacturer" placeholder="请输入制造商">
            </div>
            <div class="form-group">
              <label>型号</label>
              <input type="text" v-model="formData.model" placeholder="请输入型号">
            </div>
            <div class="form-group">
              <label>序列号</label>
              <input type="text" v-model="formData.serial_number" placeholder="请输入序列号">
            </div>
            <div class="form-group">
              <label>购买日期</label>
              <input type="date" v-model="formData.purchase_date">
            </div>
            <div class="form-group">
              <label>DTU ID</label>
              <input type="text" v-model="formData.dtu_id" placeholder="请输入DTU ID">
            </div>
            <div class="form-group">
              <label>IP地址</label>
              <input type="text" v-model="formData.ip_address" placeholder="请输入IP地址">
            </div>
            <div class="form-group">
              <label>通信协议</label>
              <input type="text" v-model="formData.communication_protocol" placeholder="请输入通信协议">
            </div>
            <div class="form-group">
              <label>标定系数K</label>
              <input type="number" step="0.0001" v-model="formData.K_value" placeholder="请输入标定系数K">
            </div>
            <div class="form-group">
              <label>标定系数β</label>
              <input type="number" step="0.0001" v-model="formData.beta_value" placeholder="请输入标定系数β">
            </div>
            <div class="form-group">
              <label>标定日期</label>
              <input type="date" v-model="formData.calibration_date">
            </div>
            <div class="form-group">
              <label>标定机构</label>
              <input type="text" v-model="formData.calibration_org" placeholder="请输入标定机构">
            </div>
            <div class="form-group">
              <label>有效期至</label>
              <input type="date" v-model="formData.valid_until">
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="showCreateDialog = false; showEditDialog = false">取消</button>
          <button class="btn-primary" @click="showEditDialog ? updateDevice() : createDevice()">
            {{ showEditDialog ? '保存' : '创建' }}
          </button>
        </div>
      </div>
    </div>
    
    <div class="dialog-overlay" v-if="showDeleteConfirm">
      <div class="dialog dialog-small">
        <div class="dialog-header">
          <h3>确认删除</h3>
          <button class="dialog-close" @click="showDeleteConfirm = false">&times;</button>
        </div>
        <div class="dialog-body">
          <p>确定要删除设备 <strong>{{ deletingDevice?.device_id }}</strong> 吗？此操作不可恢复。</p>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="showDeleteConfirm = false">取消</button>
          <button class="btn-danger" @click="deleteDevice">删除</button>
        </div>
      </div>
    </div>
    
    <div class="dialog-overlay" v-if="showBindDialog">
      <div class="dialog dialog-small">
        <div class="dialog-header">
          <h3>绑定测孔</h3>
          <button class="dialog-close" @click="showBindDialog = false">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>选择项目 <span class="required">*</span></label>
            <select v-model="bindFormData.project_id" @change="loadHoles(bindFormData.project_id); bindFormData.hole_id = null">
              <option :value="null">请选择项目</option>
              <option v-for="project in projects" :key="project.id" :value="project.id">
                {{ project.project_name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>选择测孔 <span class="required">*</span></label>
            <select v-model="bindFormData.hole_id" :disabled="!bindFormData.project_id">
              <option :value="null">请选择测孔</option>
              <option v-for="hole in holes" :key="hole.id" :value="hole.id">
                {{ hole.hole_number }} - {{ hole.hole_name || '未命名' }}
              </option>
            </select>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="showBindDialog = false">取消</button>
          <button class="btn-primary" @click="bindDevice" :disabled="!bindFormData.hole_id">绑定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.devices-page {
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

.btn-secondary {
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
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

.search-filter-bar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}

.search-bar {
  display: flex;
  gap: 12px;
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

.filter-bar {
  display: flex;
  gap: 12px;
}

.filter-bar select {
  padding: 10px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: white;
  min-width: 150px;
}

.filter-bar select:focus {
  border-color: #667eea;
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

.clickable-row {
  cursor: pointer;
  transition: background 0.2s;
}

.clickable-row:hover {
  background: #f9fafb;
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
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
  color: #3730a3;
}

.status-charging {
  background: #d1fae5;
  color: #065f46;
}

.network-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #6b7280;
}

.network-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
}

.network-indicator.online .network-dot {
  background: #10b981;
}

.calibration-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.calibration-valid {
  background: #d1fae5;
  color: #065f46;
}

.calibration-expired {
  background: #fee2e2;
  color: #991b1b;
}

.calibration-pending {
  background: #fef3c7;
  color: #92400e;
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

.btn-icon.btn-danger:hover {
  background: #fee2e2;
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

.input-error {
  border-color: #ef4444 !important;
}

.error-text {
  color: #ef4444;
  font-size: 12px;
  margin-top: 4px;
  display: block;
}
</style>
