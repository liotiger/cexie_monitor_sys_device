<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'

const route = useRoute()
const router = useRouter()

const device = ref(null)
const usageLogs = ref([])
const usagePagination = ref(null)
const calibrationLogs = ref([])
const calibrationPagination = ref(null)
const bindingHistory = ref([])
const bindingPagination = ref(null)

const activeTab = ref('info')

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

const reviewStatusTextMap = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回'
}

const reviewStatusClassMap = {
  pending: 'review-pending',
  approved: 'review-approved',
  rejected: 'review-rejected'
}

async function loadDevice() {
  try {
    const response = await api.get(`/devices/${route.params.id}`)
    if (response.data.success) {
      device.value = response.data.data
    }
  } catch (error) {
    console.error('Failed to load device:', error)
  }
}

async function loadUsageLogs(page = 1) {
  try {
    const response = await api.get(`/device-usage-logs/device/${route.params.id}?page=${page}&limit=10`)
    if (response.data.success) {
      usageLogs.value = response.data.data.list
      usagePagination.value = response.data.data.pagination
    }
  } catch (error) {
    console.error('Failed to load usage logs:', error)
  }
}

async function loadCalibrationLogs(page = 1) {
  try {
    const response = await api.get(`/device-calibration-logs/device/${route.params.id}?page=${page}&limit=10`)
    if (response.data.success) {
      calibrationLogs.value = response.data.data.list
      calibrationPagination.value = response.data.data.pagination
    }
  } catch (error) {
    console.error('Failed to load calibration logs:', error)
  }
}

async function loadBindingHistory(page = 1) {
  try {
    const response = await api.get(`/hole-binding-histories?device_id=${route.params.id}&page=${page}&limit=10`)
    if (response.data.success) {
      bindingHistory.value = response.data.data.list
      bindingPagination.value = response.data.data.pagination
    }
  } catch (error) {
    console.error('Failed to load binding history:', error)
  }
}

function changeUsagePage(page) {
  loadUsageLogs(page)
}

function changeCalibrationPage(page) {
  loadCalibrationLogs(page)
}

function changeBindingPage(page) {
  loadBindingHistory(page)
}

function goBack() {
  router.push('/upper-devices')
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

function formatDuration(startTime, endTime) {
  if (!startTime || !endTime) return '-'
  const duration = endTime - startTime
  const minutes = Math.floor(duration / 60000)
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0) {
    return `${hours}小时${mins}分钟`
  }
  return `${mins}分钟`
}

onMounted(() => {
  loadDevice()
  loadUsageLogs()
  loadCalibrationLogs()
  loadBindingHistory()
})
</script>

<template>
  <div class="device-detail-page">
    <div class="page-header">
      <div class="header-left">
        <button class="btn-back" @click="goBack">← 返回</button>
        <h1>设备详情</h1>
      </div>
    </div>
    
    <div class="device-summary" v-if="device">
      <div class="summary-card">
        <div class="summary-icon">📱</div>
        <div class="summary-info">
          <h2>{{ device.device_name || device.device_id }}</h2>
          <p>{{ device.device_type || '未知类型' }}</p>
        </div>
      </div>
      
      <div class="summary-stats">
        <div class="stat-item">
          <span class="stat-label">设备状态</span>
          <span class="status-badge" :class="statusClassMap[device.status]">
            {{ statusTextMap[device.status] }}
          </span>
        </div>
        <div class="stat-item">
          <span class="stat-label">网络状态</span>
          <span class="network-indicator" :class="{ online: device.network_status === 'online' }">
            <span class="network-dot"></span>
            {{ device.network_status === 'online' ? '在线' : '离线' }}
          </span>
        </div>
        <div class="stat-item">
          <span class="stat-label">标定状态</span>
          <span class="calibration-badge" :class="calibrationStatusClassMap[device.calibration_status]">
            {{ calibrationStatusTextMap[device.calibration_status] }}
          </span>
        </div>
        <div class="stat-item">
          <span class="stat-label">绑定测孔</span>
          <span>{{ device.current_hole_id || '未绑定' }}</span>
        </div>
      </div>
      
      <div class="summary-stats">
        <div class="stat-item">
          <span class="stat-label">总使用时长</span>
          <span>{{ device.total_usage_hours || 0 }} 小时</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">总测量次数</span>
          <span>{{ device.total_measurement_count || 0 }} 次</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">总测量深度</span>
          <span>{{ device.total_measurement_depth || 0 }} m</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">电池电量</span>
          <span>{{ device.battery_level !== null ? device.battery_level + '%' : '-' }}</span>
        </div>
      </div>
    </div>
    
    <div class="tabs">
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'info' }"
        @click="activeTab = 'info'"
      >基本信息</button>
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'calibration' }"
        @click="activeTab = 'calibration'"
      >标定参数</button>
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'usage' }"
        @click="activeTab = 'usage'"
      >使用记录</button>
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'calibration-logs' }"
        @click="activeTab = 'calibration-logs'"
      >标定记录</button>
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'binding' }"
        @click="activeTab = 'binding'"
      >绑定历史</button>
    </div>
    
    <div class="tab-content">
      <div v-if="activeTab === 'info'" class="info-section">
        <div class="info-grid" v-if="device">
          <div class="info-card">
            <h3>基础信息</h3>
            <div class="info-list">
              <div class="info-item">
                <span class="info-label">设备ID</span>
                <span class="info-value">{{ device.device_id }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">设备名称</span>
                <span class="info-value">{{ device.device_name || '-' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">设备类型</span>
                <span class="info-value">{{ device.device_type || '-' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">制造商</span>
                <span class="info-value">{{ device.manufacturer || '-' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">型号</span>
                <span class="info-value">{{ device.model || '-' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">序列号</span>
                <span class="info-value">{{ device.serial_number || '-' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">购买日期</span>
                <span class="info-value">{{ formatDate(device.purchase_date) }}</span>
              </div>
            </div>
          </div>
          
          <div class="info-card">
            <h3>网络信息</h3>
            <div class="info-list">
              <div class="info-item">
                <span class="info-label">DTU ID</span>
                <span class="info-value">{{ device.dtu_id || '-' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">IP地址</span>
                <span class="info-value">{{ device.ip_address || '-' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">通信协议</span>
                <span class="info-value">{{ device.communication_protocol || '-' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">信号强度</span>
                <span class="info-value">{{ device.signal_strength !== null ? device.signal_strength + ' dBm' : '-' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">最后在线时间</span>
                <span class="info-value">{{ formatDateTime(device.last_online_time) }}</span>
              </div>
            </div>
          </div>
          
          <div class="info-card">
            <h3>运行状态</h3>
            <div class="info-list">
              <div class="info-item">
                <span class="info-label">当前状态</span>
                <span class="info-value">
                  <span class="status-badge" :class="statusClassMap[device.status]">
                    {{ statusTextMap[device.status] }}
                  </span>
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">电池电量</span>
                <span class="info-value">{{ device.battery_level !== null ? device.battery_level + '%' : '-' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">温度</span>
                <span class="info-value">{{ device.temperature !== null ? device.temperature + '°C' : '-' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">绑定测孔</span>
                <span class="info-value">{{ device.current_hole_id || '-' }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">绑定项目</span>
                <span class="info-value">{{ device.current_project_id || '-' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div v-if="activeTab === 'calibration'" class="calibration-section">
        <div class="info-card" v-if="device">
          <h3>当前标定参数</h3>
          <div class="info-list">
            <div class="info-item">
              <span class="info-label">标定系数K</span>
              <span class="info-value">{{ device.K_value !== null ? device.K_value : '-' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">标定系数β</span>
              <span class="info-value">{{ device.beta_value !== null ? device.beta_value : '-' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">标定日期</span>
              <span class="info-value">{{ formatDate(device.calibration_date) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">标定机构</span>
              <span class="info-value">{{ device.calibration_org || '-' }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">有效期至</span>
              <span class="info-value">{{ formatDate(device.valid_until) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">标定状态</span>
              <span class="info-value">
                <span class="calibration-badge" :class="calibrationStatusClassMap[device.calibration_status]">
                  {{ calibrationStatusTextMap[device.calibration_status] }}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div v-if="activeTab === 'usage'" class="usage-section">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>使用人ID</th>
                <th>项目ID</th>
                <th>测孔ID</th>
                <th>开始时间</th>
                <th>结束时间</th>
                <th>持续时长</th>
                <th>测量次数</th>
                <th>测量深度</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in usageLogs" :key="log.id">
                <td>{{ log.user_id }}</td>
                <td>{{ log.project_id }}</td>
                <td>{{ log.hole_id }}</td>
                <td>{{ formatDateTime(log.start_time) }}</td>
                <td>{{ formatDateTime(log.end_time) }}</td>
                <td>{{ formatDuration(log.start_time, log.end_time) }}</td>
                <td>{{ log.measurement_count || 0 }}</td>
                <td>{{ log.total_measurement_depth ? log.total_measurement_depth + ' m' : '-' }}</td>
              </tr>
              <tr v-if="usageLogs.length === 0">
                <td colspan="8" class="no-data">暂无使用记录</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div class="pagination" v-if="usagePagination">
          <span>共 {{ usagePagination.total }} 条记录</span>
          <div class="page-buttons">
            <button 
              :disabled="usagePagination.page === 1"
              @click="changeUsagePage(usagePagination.page - 1)"
            >上一页</button>
            <span>第 {{ usagePagination.page }} 页</span>
            <button 
              :disabled="usagePagination.page * usagePagination.limit >= usagePagination.total"
              @click="changeUsagePage(usagePagination.page + 1)"
            >下一页</button>
          </div>
        </div>
      </div>
      
      <div v-if="activeTab === 'calibration-logs'" class="calibration-logs-section">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>标定日期</th>
                <th>标定机构</th>
                <th>标定系数K</th>
                <th>标定系数β</th>
                <th>有效期至</th>
                <th>标定状态</th>
                <th>审核状态</th>
                <th>证书编号</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in calibrationLogs" :key="log.id">
                <td>{{ formatDate(log.calibration_date) }}</td>
                <td>{{ log.calibration_org }}</td>
                <td>{{ log.K_value }}</td>
                <td>{{ log.beta_value }}</td>
                <td>{{ formatDate(log.valid_until) }}</td>
                <td>
                  <span class="calibration-badge" :class="log.calibration_status === 'passed' ? 'calibration-valid' : 'calibration-expired'">
                    {{ log.calibration_status === 'passed' ? '合格' : '不合格' }}
                  </span>
                </td>
                <td>
                  <span class="review-badge" :class="reviewStatusClassMap[log.review_status]">
                    {{ reviewStatusTextMap[log.review_status] }}
                  </span>
                </td>
                <td>{{ log.certificate_number || '-' }}</td>
              </tr>
              <tr v-if="calibrationLogs.length === 0">
                <td colspan="8" class="no-data">暂无标定记录</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div class="pagination" v-if="calibrationPagination">
          <span>共 {{ calibrationPagination.total }} 条记录</span>
          <div class="page-buttons">
            <button 
              :disabled="calibrationPagination.page === 1"
              @click="changeCalibrationPage(calibrationPagination.page - 1)"
            >上一页</button>
            <span>第 {{ calibrationPagination.page }} 页</span>
            <button 
              :disabled="calibrationPagination.page * calibrationPagination.limit >= calibrationPagination.total"
              @click="changeCalibrationPage(calibrationPagination.page + 1)"
            >下一页</button>
          </div>
        </div>
      </div>
      
      <div v-if="activeTab === 'binding'" class="binding-section">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>测孔ID</th>
                <th>绑定时间</th>
                <th>解绑时间</th>
                <th>绑定类型</th>
                <th>绑定原因</th>
                <th>解绑原因</th>
                <th>测量次数</th>
                <th>测量时长</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="history in bindingHistory" :key="history.id">
                <td>{{ history.hole_id }}</td>
                <td>{{ formatDateTime(history.bind_time) }}</td>
                <td>{{ formatDateTime(history.unbind_time) }}</td>
                <td>
                  <span class="bind-type-badge">
                    {{ history.bind_type === 'manual' ? '手动' : history.bind_type === 'auto' ? '自动' : '定时' }}
                  </span>
                </td>
                <td>{{ history.bind_reason || '-' }}</td>
                <td>{{ history.unbind_reason || '-' }}</td>
                <td>{{ history.measurement_count || 0 }}</td>
                <td>{{ history.total_measurement_time ? Math.round(history.total_measurement_time / 60000) + ' 分钟' : '-' }}</td>
              </tr>
              <tr v-if="bindingHistory.length === 0">
                <td colspan="8" class="no-data">暂无绑定历史</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div class="pagination" v-if="bindingPagination">
          <span>共 {{ bindingPagination.total }} 条记录</span>
          <div class="page-buttons">
            <button 
              :disabled="bindingPagination.page === 1"
              @click="changeBindingPage(bindingPagination.page - 1)"
            >上一页</button>
            <span>第 {{ bindingPagination.page }} 页</span>
            <button 
              :disabled="bindingPagination.page * bindingPagination.limit >= bindingPagination.total"
              @click="changeBindingPage(bindingPagination.page + 1)"
            >下一页</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.device-detail-page {
  width: 100%;
  max-width: none;
  min-width: 0;
}

.page-header {
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.btn-back {
  background: none;
  border: 1px solid #e5e7eb;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #374151;
}

.btn-back:hover {
  background: #f3f4f6;
}

.page-header h1 {
  font-size: 24px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
}

.device-summary {
  background: white;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.summary-card {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #e5e7eb;
}

.summary-icon {
  width: 64px;
  height: 64px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
}

.summary-info h2 {
  margin: 0 0 4px 0;
  font-size: 22px;
  font-weight: 600;
  color: #1a1a2e;
}

.summary-info p {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
}

.summary-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
  margin-bottom: 16px;
}

.summary-stats:last-child {
  margin-bottom: 0;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 12px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-item > span:last-child {
  font-size: 16px;
  font-weight: 500;
  color: #1a1a2e;
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  background: white;
  padding: 8px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.tab-btn {
  padding: 10px 20px;
  border: none;
  background: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: #f3f4f6;
}

.tab-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.tab-content {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
}

.info-card {
  background: #f9fafb;
  border-radius: 8px;
  padding: 20px;
}

.info-card h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-label {
  font-size: 14px;
  color: #6b7280;
}

.info-value {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a2e;
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

.review-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.review-pending {
  background: #fef3c7;
  color: #92400e;
}

.review-approved {
  background: #d1fae5;
  color: #065f46;
}

.review-rejected {
  background: #fee2e2;
  color: #991b1b;
}

.bind-type-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  background: #e5e7eb;
  color: #374151;
}

.table-container {
  overflow-x: auto;
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
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.data-table td {
  font-size: 14px;
  color: #374151;
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
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
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
</style>
