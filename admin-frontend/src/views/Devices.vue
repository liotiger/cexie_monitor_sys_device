<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import api from '@/services/api'

const loading = ref(false)
const syncing = ref(false)
const search = ref('')
const upperDevices = ref([])
const lowerDevices = ref([])
const lastUpdatedAt = ref('')
const syncSummary = ref('')
const taskDialogVisible = ref(false)
const taskDialogLoading = ref(false)
const taskDialogDevice = ref(null)
const taskDialogTasks = ref([])
const taskDialogError = ref('')
const deletingUpperDeviceId = ref(null)
const calibrationDialogVisible = ref(false)
const calibrationSubmitting = ref(false)
const calibrationDevice = ref(null)
const calibrationError = ref('')
const calibrationForm = ref({
  k_value: null,
  beta_value: null,
  calibration_date: '',
  calibration_org: '',
  valid_until: '',
  calibration_status: 'valid'
})
let refreshTimer = null

const calibrationStatusTextMap = {
  valid: '有效',
  expired: '已过期',
  pending: '待校准'
}

const taskStatusTextMap = {
  created: '已创建',
  queued: '已下发',
  polling: '执行中',
  completed: '已完成',
  failed: '失败',
  timeout: '超时',
  skipped: '已取消'
}

function getNetworkStatusText(status) {
  return String(status || '').toLowerCase() === 'online' ? '在线' : '离线'
}

function getNetworkStatusClass(status) {
  return String(status || '').toLowerCase() === 'online' ? 'status-online' : 'status-offline'
}

function formatDateTime(value) {
  if (!value) {
    return '--'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

function formatDate(value) {
  if (!value) {
    return '--'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10)
  }
  return date.toLocaleDateString()
}

async function loadDevices() {
  loading.value = true
  try {
    const [upperResponse, lowerResponse] = await Promise.all([
      api.get('/upper-devices', { params: { search: search.value, limit: 50 } }),
      api.get('/lower-devices', { params: { search: search.value, limit: 50 } })
    ])
    upperDevices.value = upperResponse.data.data.list
    lowerDevices.value = lowerResponse.data.data.list
    lastUpdatedAt.value = new Date().toLocaleString()
  } finally {
    loading.value = false
  }
}

function getTaskStatusText(status) {
  return taskStatusTextMap[String(status || '')] || status || '--'
}

function formatTaskHole(task) {
  const holeName = task?.metadata?.holeName || ''
  const holeNo = task?.metadata?.holeNumber || task?.metadata?.holeNo || ''
  if (holeName && holeNo) {
    return `${holeName}（孔号 ${holeNo}）`
  }
  return holeName || holeNo || '--'
}

function formatRelatedUpperDevice(item) {
  return item?.related_upper_device || '--'
}

function openCalibrationDialog(device) {
  calibrationDevice.value = device
  calibrationError.value = ''
  calibrationForm.value = {
    k_value: device.k_value ?? null,
    beta_value: device.beta_value ?? null,
    calibration_date: device.calibration_date ? String(device.calibration_date).slice(0, 10) : '',
    calibration_org: device.calibration_org || '',
    valid_until: device.valid_until ? String(device.valid_until).slice(0, 10) : '',
    calibration_status: device.calibration_status || 'valid'
  }
  calibrationDialogVisible.value = true
}

function closeCalibrationDialog() {
  calibrationDialogVisible.value = false
  calibrationSubmitting.value = false
  calibrationDevice.value = null
  calibrationError.value = ''
}

async function saveCalibration() {
  if (!calibrationDevice.value?.id) {
    return
  }

  calibrationSubmitting.value = true
  calibrationError.value = ''
  try {
    await api.put(`/lower-devices/${calibrationDevice.value.id}/calibration`, {
      ...calibrationForm.value,
      calibration_date: calibrationForm.value.calibration_date || null,
      valid_until: calibrationForm.value.valid_until || null
    })
    closeCalibrationDialog()
    await loadDevices()
  } catch (error) {
    calibrationError.value = error.response?.data?.details || error.response?.data?.error || '保存下位机校准信息失败'
  } finally {
    calibrationSubmitting.value = false
  }
}

function closeTaskDialog() {
  taskDialogVisible.value = false
  taskDialogLoading.value = false
  taskDialogDevice.value = null
  taskDialogTasks.value = []
  taskDialogError.value = ''
}

async function openTaskDialog(device) {
  taskDialogVisible.value = true
  taskDialogLoading.value = true
  taskDialogDevice.value = device
  taskDialogTasks.value = []
  taskDialogError.value = ''

  try {
    const response = await api.get(`/upper-devices/${device.id}/tasks`, { params: { limit: 50 } })
    taskDialogTasks.value = response.data.data?.list || []
  } catch (error) {
    taskDialogError.value = error.response?.data?.details || error.response?.data?.error || '监测任务获取失败'
  } finally {
    taskDialogLoading.value = false
  }
}

async function removeUpperDevice(device) {
  if (!device?.id) {
    return
  }
  if (!window.confirm(`确定删除上位机 ${device.imei} 吗？删除后会同时解除相关绑定关系。`)) {
    return
  }

  deletingUpperDeviceId.value = device.id
  try {
    // 修复说明：管理端设备页需要直接提供上位机删除入口，删除后立即刷新列表，避免页面继续展示已失效设备。
    await api.delete(`/upper-devices/${device.id}`)
    await loadDevices()
  } finally {
    deletingUpperDeviceId.value = null
  }
}

async function syncUpperDeviceStatus({ silent = false, reload = true } = {}) {
  syncing.value = true
  if (!silent) {
    syncSummary.value = ''
  }
  try {
    const response = await api.post('/upper-devices/sync-status')
    const result = response.data.data || {}
    const unmatchedCount = Array.isArray(result.unmatched) ? result.unmatched.length : 0
    const createdCount = Number(result.created || 0)
    if (!silent) {
      syncSummary.value = `同步完成：会话 ${result.gatewayTotal || 0} 条，匹配 ${result.matched || 0} 台，自动创建 ${createdCount} 台，更新 ${result.updated || 0} 台，在线 ${result.online || 0} 台，离线 ${result.offline || 0} 台${unmatchedCount ? `，未匹配 ${unmatchedCount} 台` : ''}`
    }
    if (reload) {
      await loadDevices()
    }
  } catch (error) {
    if (!silent) {
      syncSummary.value = error.response?.data?.details || error.response?.data?.error || '同步上位机状态失败'
    }
  } finally {
    syncing.value = false
  }
}

async function refreshDevices(syncFirst = true, silentSync = false) {
  if (syncFirst) {
    await syncUpperDeviceStatus({ silent: silentSync, reload: false })
  }
  await loadDevices()
}

onMounted(() => {
  refreshDevices(true, true)
  refreshTimer = window.setInterval(() => {
    refreshDevices(true, true)
  }, 30000)
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<template>
  <div class="page-stack">
    <div class="toolbar">
      <input v-model="search" placeholder="搜索 IMEI、设备编号或名称" @keyup.enter="refreshDevices(true, false)" />
      <button @click="refreshDevices(true, false)">刷新</button>
      <button class="sync-button" :disabled="syncing" @click="syncUpperDeviceStatus">
        {{ syncing ? '同步中...' : '同步上位机状态' }}
      </button>
      <span class="toolbar-tip">每 30 秒自动刷新一次，且先同步上位机状态再拉列表{{ lastUpdatedAt ? `，最近刷新：${lastUpdatedAt}` : '' }}</span>
      <span v-if="syncSummary" class="sync-summary">{{ syncSummary }}</span>
    </div>
    <div class="panel">
      <h3>上位机列表</h3>
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>IMEI</th>
            <th>名称</th>
            <th>关联测孔</th>
            <th>在线状态</th>
            <th>连接时间</th>
            <th>最后在线时间</th>
            <th>IP 地址</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in upperDevices" :key="`upper-${item.id}`">
            <td>{{ item.id }}</td>
            <td>{{ item.imei }}</td>
            <td>{{ item.device_name || '--' }}</td>
            <td>{{ item.related_hole || '--' }}</td>
            <td>
              <span class="network-badge" :class="getNetworkStatusClass(item.network_status)">
                {{ getNetworkStatusText(item.network_status) }}
              </span>
            </td>
            <td>{{ formatDateTime(item.connected_at) }}</td>
            <td>{{ formatDateTime(item.last_online_time) }}</td>
            <td>{{ item.ip_address || '--' }}</td>
            <td class="action-cell">
              <button class="secondary" @click="openTaskDialog(item)">监测任务</button>
              <button class="danger" :disabled="deletingUpperDeviceId === item.id" @click="removeUpperDevice(item)">
                {{ deletingUpperDeviceId === item.id ? '删除中...' : '删除' }}
              </button>
            </td>
          </tr>
          <tr v-if="!upperDevices.length && !loading"><td colspan="9">暂无上位机数据</td></tr>
        </tbody>
      </table>
    </div>
    <div class="panel">
      <h3>下位机列表</h3>
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>编号</th>
            <th>名称</th>
            <th>K值</th>
            <th>β值</th>
            <th>校准日期</th>
            <th>校准机构</th>
            <th>有效期至</th>
            <th>校准状态</th>
            <th>关联上位机</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in lowerDevices" :key="`lower-${item.id}`">
            <td>{{ item.id }}</td>
            <td>{{ item.device_code }}</td>
            <td>{{ item.device_name || '--' }}</td>
            <td>{{ item.k_value ?? '--' }}</td>
            <td>{{ item.beta_value ?? '--' }}</td>
            <td>{{ formatDate(item.calibration_date) }}</td>
            <td>{{ item.calibration_org || '--' }}</td>
            <td>{{ formatDate(item.valid_until) }}</td>
            <td>{{ calibrationStatusTextMap[item.calibration_status] || '--' }}</td>
            <td>{{ formatRelatedUpperDevice(item) }}</td>
            <td class="action-cell">
              <button class="secondary" @click="openCalibrationDialog(item)">编辑校准</button>
            </td>
          </tr>
          <tr v-if="!lowerDevices.length && !loading"><td colspan="11">暂无下位机数据</td></tr>
        </tbody>
      </table>
    </div>

    <div v-if="calibrationDialogVisible" class="dialog-overlay">
      <div class="dialog calibration-dialog">
        <div class="dialog-header">
          <div>
            <h3>编辑下位机校准信息</h3>
            <p class="dialog-subtitle">{{ calibrationDevice?.device_code || '--' }}</p>
          </div>
          <button class="icon-btn" @click="closeCalibrationDialog">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="calibration-form">
            <label>
              <span>K值</span>
              <input type="number" step="0.000001" v-model="calibrationForm.k_value" />
            </label>
            <label>
              <span>β值</span>
              <input type="number" step="0.000001" v-model="calibrationForm.beta_value" />
            </label>
            <label>
              <span>校准日期</span>
              <input type="date" v-model="calibrationForm.calibration_date" />
            </label>
            <label>
              <span>校准机构</span>
              <input type="text" v-model="calibrationForm.calibration_org" />
            </label>
            <label>
              <span>校准有效期</span>
              <input type="date" v-model="calibrationForm.valid_until" />
            </label>
            <label>
              <span>校准状态</span>
              <select v-model="calibrationForm.calibration_status">
                <option value="valid">有效</option>
                <option value="expired">已过期</option>
                <option value="pending">待校准</option>
              </select>
            </label>
          </div>
          <p v-if="calibrationError" class="error-text">{{ calibrationError }}</p>
        </div>
        <div class="dialog-footer">
          <button class="secondary muted" @click="closeCalibrationDialog">取消</button>
          <button class="secondary" :disabled="calibrationSubmitting" @click="saveCalibration">
            {{ calibrationSubmitting ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="taskDialogVisible" class="dialog-overlay">
      <div class="dialog">
        <div class="dialog-header">
          <div>
            <h3>监测任务列表</h3>
            <p class="dialog-subtitle">{{ taskDialogDevice?.imei || '--' }}</p>
          </div>
          <button class="icon-btn" @click="closeTaskDialog">&times;</button>
        </div>
        <div class="dialog-body">
          <div v-if="taskDialogLoading" class="empty-text">加载中...</div>
          <div v-else-if="taskDialogError" class="error-text">{{ taskDialogError }}</div>
          <div v-else-if="taskDialogTasks.length" class="task-list">
            <div v-for="task in taskDialogTasks" :key="task.taskId" class="task-card">
              <div class="task-card-header">
                <strong>{{ task.taskId }}</strong>
                <span class="task-status">{{ getTaskStatusText(task.status) }}</span>
              </div>
              <div class="task-card-grid">
                <span>创建时间：{{ formatDateTime(task.createdAt) }}</span>
                <span>完成时间：{{ formatDateTime(task.completedAt) }}</span>
                <span>钻孔：{{ formatTaskHole(task) }}</span>
                <span>客户：{{ task.customerName || '--' }}</span>
                <span class="task-error">异常信息：{{ task.errorMessage || '--' }}</span>
              </div>
            </div>
          </div>
          <div v-else class="empty-text">当前上位机暂无监测任务</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-stack { display: grid; gap: 18px; }
.toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.toolbar input { flex: 1; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; }
.toolbar button { border: none; border-radius: 10px; background: #2563eb; color: #fff; padding: 10px 16px; }
.toolbar button:disabled { opacity: 0.7; cursor: not-allowed; }
.sync-button { background: #0f766e; }
.toolbar-tip { color: #64748b; font-size: 13px; }
.sync-summary { color: #0f172a; font-size: 13px; }
.panel { background: #fff; border-radius: 14px; padding: 18px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }
.panel h3 { margin-bottom: 14px; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 14px; }
.network-badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 600; }
.network-badge.status-online { color: #166534; background: #dcfce7; }
.network-badge.status-offline { color: #991b1b; background: #fee2e2; }
.action-cell { display: flex; gap: 8px; }
.secondary, .danger { border: none; border-radius: 10px; color: #fff; padding: 8px 12px; }
.secondary { background: #2563eb; }
.danger { background: #dc2626; }
.dialog-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.dialog { width: min(820px, 92vw); max-height: 85vh; overflow: auto; background: #fff; border-radius: 16px; box-shadow: 0 24px 64px rgba(15, 23, 42, 0.18); }
.dialog-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid #e5e7eb; }
.dialog-subtitle { margin-top: 4px; color: #64748b; font-size: 13px; }
.icon-btn { border: none; background: transparent; font-size: 24px; cursor: pointer; color: #475569; }
.dialog-body { padding: 18px 20px; }
.empty-text { color: #64748b; }
.error-text { color: #dc2626; }
.task-list { display: grid; gap: 12px; }
.task-card { border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px 16px; background: #f8fafc; }
.task-card-header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.task-status { color: #1d4ed8; font-weight: 600; }
.task-card-grid { display: grid; gap: 8px; font-size: 13px; color: #334155; }
.task-error { color: #b91c1c; }
.calibration-dialog { width: min(680px, 92vw); }
.calibration-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.calibration-form label { display: grid; gap: 6px; color: #334155; font-size: 13px; }
.calibration-form input, .calibration-form select { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; }
.dialog-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 0 20px 18px; }
.secondary.muted { background: #64748b; }
</style>
