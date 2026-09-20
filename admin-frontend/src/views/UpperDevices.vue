<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'

const route = useRoute()
const loading = ref(false)
const syncing = ref(false)
const search = ref('')
const upperDevices = ref([])
const lastUpdatedAt = ref('')
const syncSummary = ref('')
const taskDialogVisible = ref(false)
const taskDialogLoading = ref(false)
const taskDialogDevice = ref(null)
const taskDialogTasks = ref([])
const taskDialogError = ref('')
const quickTaskLoading = ref('')
const quickTaskFeedback = ref({ type: '', text: '' })
const workbenchVisible = ref(false)
const workbenchDevice = ref(null)
const commandForm = ref({ format: 'hex', command: '' })
const commandSending = ref(false)
const commandFeedback = ref({ type: '', text: '' })
const commandLogs = ref([])
const commandLogsLoading = ref(false)
const commandLogsError = ref('')
const paramsSubmitting = ref(false)
const paramsFeedback = ref({ type: '', text: '' })
const paramsForm = ref({})
// 修复说明：参数读取相关状态，用于工作台打开时异步回填设备当前参数。
const paramsReading = ref(false)
const paramsReadInfo = ref('')
// 修复说明：任务日志相关状态，与客户端工作台保持一致，供快捷指令执行后即时查看任务结果。
const taskLogs = ref([])
const taskLogLoading = ref(false)
const taskLogError = ref('')
const mileageForm = ref({ wire_change_mileage: 0, inspection_mileage: 0 })
const mileageSaving = ref(false)
const mileageFeedback = ref({ type: '', text: '' })
const deletingUpperDeviceId = ref(null)
let refreshTimer = null
let commandLogTimer = null
let taskLogTimer = null
let lastCommandLogTimestamp = 0

const parameterGroups = [
  {
    title: '必要参数',
    fields: [
      { key: 'monitorNodesNum', label: '监测节点数', type: 'uint16', step: '1' }
    ]
  },
  {
    title: '默认参数',
    fields: [
      { key: 'deviceNode', label: '设备节点号', type: 'uint16', step: '1' },
      { key: 'monitorTestDis', label: '监测测试距离', type: 'float32', step: 'any' },
      { key: 'monitorClosetoDis', label: '监测接近距离', type: 'float32', step: 'any' },
      { key: 'monitorNodeOnDelayMs', label: '节点开启延迟（毫秒）', type: 'uint16', step: '1' },
      { key: 'monitorFromStartDis', label: '监测起始距离', type: 'float32', step: 'any' }
    ]
  },
  {
    title: '高级参数',
    fields: [
      { key: 'startSpd', label: '启动速度', type: 'float32', step: 'any' },
      { key: 'orgLowSpd', label: '原点低速', type: 'float32', step: 'any' },
      { key: 'orgAccSpd', label: '原点加速度', type: 'float32', step: 'any' },
      { key: 'manualSpd', label: '手动速度', type: 'float32', step: 'any' },
      { key: 'manualAccSpd', label: '手动加速度', type: 'float32', step: 'any' },
      { key: 'workSpd', label: '工作速度', type: 'float32', step: 'any' },
      { key: 'workAccSpd', label: '工作加速度', type: 'float32', step: 'any' },
      { key: 'spaceSpd', label: '空间速度', type: 'float32', step: 'any' }
    ]
  }
]

const taskTypeTextMap = {
  monitor_start: '监测',
  home_move: '归位',
  bottom_test: '底部检测',
  set_params: '参数配置',
  params_fetch: '参数读取',
  MONITOR_START: '监测',
  HOME_MOVE: '归位',
  BOTTOM_TEST: '底部检测',
  SET_PARAMS: '参数配置',
  PARAMS_FETCH: '参数读取',
  status_check: '状态检查',
  STATUS_CHECK: '状态检查'
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
  if (!value) return '--'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

async function loadUpperDevices() {
  loading.value = true
  try {
    const response = await api.get('/upper-devices', {
      params: { search: search.value, limit: 50 }
    })
    upperDevices.value = response.data.data.list || []
    lastUpdatedAt.value = new Date().toLocaleString()
  } finally {
    loading.value = false
  }
}

function getTaskStatusText(status) {
  return taskStatusTextMap[String(status || '')] || status || '--'
}

function getTaskTypeText(task = {}) {
  const metadataLabel = String(task.metadata?.taskLabel || '').trim()
  if (metadataLabel) return metadataLabel

  const commandText = String(task.commandText || '').trim()
  return taskTypeTextMap[commandText] || task.metadata?.taskType || commandText || '--'
}

function formatCommandLogTime(value) {
  if (!value) return '--'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString('zh-CN', { hour12: false })
}

function getLogTypeText(type) {
  if (type === 'send') return '发送'
  if (type === 'recv') return '接收'
  return '系统'
}

function formatTaskHole(task) {
  const holeName = task?.metadata?.holeName || ''
  const holeNo = task?.metadata?.holeNumber || task?.metadata?.holeNo || ''
  if (holeName && holeNo) {
    return `${holeName}（孔号 ${holeNo}）`
  }
  return holeName || holeNo || '--'
}

function getTaskResultLogMessages(task = {}) {
  const logs = task.resultPayload?.taskLogs
  return Array.isArray(logs)
    ? logs.filter(log => log?.level !== 'error' && log?.message).map(log => log.message)
    : []
}

// 修复说明：工作台任务日志需要展示异常原因，与客户端工作台口径保持一致（回落到网关返回的错误信息）。
function getTaskErrorText(task = {}) {
  return task.errorMessage || task.resultPayload?.gatewayResult?.err_message || ''
}

// 修复说明：任务日志详情需要展开请求/响应/结果原始报文，这里统一格式化 JSON。
function formatTaskPayload(value) {
  if (value === undefined || value === null || value === '') return '--'
  try {
    return JSON.stringify(value, null, 2)
  } catch (error) {
    return String(value)
  }
}

function closeTaskDialog() {
  taskDialogVisible.value = false
  taskDialogLoading.value = false
  taskDialogDevice.value = null
  taskDialogTasks.value = []
  taskDialogError.value = ''
}

function resetParamsForm() {
  paramsForm.value = Object.fromEntries(
    parameterGroups.flatMap(group => group.fields).map(field => [field.key, ''])
  )
}

function openWorkbench(device) {
  workbenchDevice.value = device
  workbenchVisible.value = true
  commandForm.value = { format: 'hex', command: '' }
  commandFeedback.value = { type: '', text: '' }
  quickTaskFeedback.value = { type: '', text: '' }
  paramsFeedback.value = { type: '', text: '' }
  paramsReadInfo.value = ''
  commandLogs.value = []
  commandLogsError.value = ''
  taskLogs.value = []
  taskLogError.value = ''
  lastCommandLogTimestamp = 0
  resetParamsForm()
  mileageForm.value = {
    wire_change_mileage: Number(device.wire_change_mileage) || 0,
    inspection_mileage: Number(device.inspection_mileage) || 0
  }
  mileageFeedback.value = { type: '', text: '' }
  refreshCommandLogs({ reset: true })
  startCommandLogPolling()
  // 修复说明：任务日志与快捷指令联动，打开工作台即开始轮询。
  refreshTaskLogs({ showLoading: true })
  startTaskLogPolling()
  // 修复说明：打开工作台只读取网关库已有参数快照回填表单，不下发设备任务；
  // 真正从设备读取最新参数需由用户点击“读取配置”触发，避免占用设备任务槽位。
  loadCachedDeviceParams(device?.id)
}

// 修复说明：读取网关库 dg_device_params 中已有的参数快照并回填表单。
// 该操作是纯查询，不会向设备下发任何指令。
async function loadCachedDeviceParams(targetDeviceId = workbenchDevice.value?.id) {
  if (!targetDeviceId) return
  try {
    const response = await api.get(`/upper-devices/${targetDeviceId}/params`)
    if (workbenchDevice.value?.id !== targetDeviceId) return
    const snapshot = response.data.data
    if (!snapshot) return
    const filled = applyDeviceParams(snapshot.params) || 0
    if (snapshot.collectedAt) {
      paramsReadInfo.value = `已载入设备参数快照（采集于 ${formatDateTime(snapshot.collectedAt)}），共 ${filled} 项；点击「读取配置」可从设备读取最新值`
    }
  } catch (error) {
    // 快照不存在属正常情况（设备尚未上报过参数），保持静默。
  }
}

function applyDeviceParams(params) {
  if (!params || typeof params !== 'object') return
  const next = { ...paramsForm.value }
  let filled = 0
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    next[key] = String(value)
    filled += 1
  }
  if (filled) {
    paramsForm.value = next
  }
  return filled
}

// 修复说明：主动从设备读取参数，对应 HTTPAPI 文档的 POST /params/fetch。
// 仅由「读取配置」按钮触发，避免打开工作台就占用设备任务槽位。
async function readDeviceParams() {
  const targetDeviceId = workbenchDevice.value?.id
  if (!targetDeviceId || paramsReading.value) return

  paramsReading.value = true
  paramsFeedback.value = { type: '', text: '' }

  try {
    const response = await api.post(`/upper-devices/${targetDeviceId}/params/fetch`)
    const taskId = response.data.data?.taskId
    if (!taskId) {
      throw new Error('参数读取任务创建失败')
    }
    paramsReadInfo.value = '正在从设备读取参数...'

    const params = await pollParamsFetchTask(targetDeviceId, taskId)
    if (workbenchDevice.value?.id !== targetDeviceId) return

    const filled = applyDeviceParams(params) || 0
    const text = filled
      ? `参数读取完成，已回填 ${filled} 个参数`
      : '参数读取完成，但设备未返回可识别的参数'
    paramsReadInfo.value = text
    paramsFeedback.value = { type: filled ? 'success' : 'error', text }
  } catch (error) {
    if (workbenchDevice.value?.id !== targetDeviceId) return
    const text = error.response?.data?.details || error.response?.data?.error || error.message || '读取配置失败'
    paramsReadInfo.value = text
    paramsFeedback.value = { type: 'error', text }
  } finally {
    paramsReading.value = false
  }
}

async function pollParamsFetchTask(targetDeviceId, taskId) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    await new Promise(resolve => window.setTimeout(resolve, 2000))
    if (workbenchDevice.value?.id !== targetDeviceId) {
      return null
    }

    const response = await api.get(`/upper-devices/${targetDeviceId}/tasks/${taskId}`)
    const task = response.data.data
    if (!task) {
      throw new Error('参数读取任务不存在')
    }
    if (!['completed', 'failed', 'timeout', 'skipped'].includes(task.status)) {
      continue
    }
    if (task.status !== 'completed') {
      throw new Error(task.errorMessage || `参数读取任务未完成（${getTaskStatusText(task.status)}）`)
    }

    const params = task.resultPayload?.deviceParams?.params
    if (params && Object.keys(params).length) {
      return params
    }
    // 任务成功但结果未携带参数时，退回读取网关库快照。
    const snapshot = await api.get(`/upper-devices/${targetDeviceId}/params`)
    return snapshot.data.data?.params || null
  }
  throw new Error('参数读取超时，请稍后重试')
}

// 修复说明：任务日志与客户端工作台保持一致，展示任务状态、结果日志与异常信息。
async function refreshTaskLogs({ showLoading = false } = {}) {
  const targetDeviceId = workbenchDevice.value?.id
  if (!targetDeviceId) return
  if (showLoading) taskLogLoading.value = true

  try {
    const response = await api.get(`/upper-devices/${targetDeviceId}/tasks`, { params: { limit: 50 } })
    if (workbenchDevice.value?.id !== targetDeviceId) return
    taskLogs.value = response.data.data?.list || []
    taskLogError.value = ''
  } catch (error) {
    if (workbenchDevice.value?.id !== targetDeviceId) return
    taskLogError.value = error.response?.data?.details || error.response?.data?.error || '任务日志获取失败'
  } finally {
    taskLogLoading.value = false
  }
}

function startTaskLogPolling() {
  stopTaskLogPolling()
  taskLogTimer = window.setInterval(refreshTaskLogs, 3000)
}

function stopTaskLogPolling() {
  if (taskLogTimer) {
    window.clearInterval(taskLogTimer)
    taskLogTimer = null
  }
}

async function saveMileageThresholds() {
  if (!workbenchDevice.value?.id) return
  const wireChangeMileage = Number(mileageForm.value.wire_change_mileage)
  const inspectionMileage = Number(mileageForm.value.inspection_mileage)
  if (![wireChangeMileage, inspectionMileage].every(value => Number.isFinite(value) && value >= 0)) {
    mileageFeedback.value = { type: 'error', text: '换线里程和检查里程必须是大于或等于 0 的数字' }
    return
  }
  mileageSaving.value = true
  mileageFeedback.value = { type: '', text: '' }
  try {
    const response = await api.put(`/upper-devices/${workbenchDevice.value.id}/mileage-thresholds`, {
      wire_change_mileage: wireChangeMileage,
      inspection_mileage: inspectionMileage
    })
    workbenchDevice.value = response.data.data
    const index = upperDevices.value.findIndex(item => item.id === workbenchDevice.value.id)
    if (index >= 0) upperDevices.value[index] = response.data.data
    mileageFeedback.value = { type: 'success', text: '里程预警值已保存' }
  } catch (error) {
    mileageFeedback.value = { type: 'error', text: error.response?.data?.details || error.response?.data?.error || '里程预警值保存失败' }
  } finally {
    mileageSaving.value = false
  }
}

function mileageWarnings(device) {
  return Array.isArray(device?.mileage_warnings) ? device.mileage_warnings : []
}

function closeWorkbench() {
  stopCommandLogPolling()
  stopTaskLogPolling()
  workbenchVisible.value = false
  workbenchDevice.value = null
  commandLogs.value = []
  commandLogsError.value = ''
  taskLogs.value = []
  taskLogError.value = ''
  paramsReadInfo.value = ''
  lastCommandLogTimestamp = 0
}

function startCommandLogPolling() {
  stopCommandLogPolling()
  commandLogTimer = window.setInterval(refreshCommandLogs, 2000)
}

function stopCommandLogPolling() {
  if (commandLogTimer) {
    window.clearInterval(commandLogTimer)
    commandLogTimer = null
  }
}

function appendCommandLogs(logs) {
  if (!Array.isArray(logs) || !logs.length) return

  const existingIds = new Set(commandLogs.value.map(item => String(item.id)))
  const merged = [...commandLogs.value]
  for (const log of logs) {
    if (!existingIds.has(String(log.id))) {
      merged.push(log)
      existingIds.add(String(log.id))
    }
    lastCommandLogTimestamp = Math.max(lastCommandLogTimestamp, Number(log.timestamp) || 0)
  }
  merged.sort((left, right) => (Number(left.timestamp) || 0) - (Number(right.timestamp) || 0))
  commandLogs.value = merged.slice(-200)
}

async function refreshCommandLogs({ reset = false } = {}) {
  if (!workbenchDevice.value?.id) return

  if (reset) {
    commandLogs.value = []
    commandLogsError.value = ''
    lastCommandLogTimestamp = 0
    commandLogsLoading.value = true
  }

  try {
    const response = await api.get(`/upper-devices/${workbenchDevice.value.id}/command-logs`, {
      params: { since: lastCommandLogTimestamp, limit: 100 }
    })
    if (response.data.success) {
      appendCommandLogs(response.data.data?.list || [])
    }
  } catch (error) {
    commandLogsError.value = error.response?.data?.details || error.response?.data?.error || '通信日志获取失败'
  } finally {
    commandLogsLoading.value = false
  }
}

function normalizeHexCommand(value) {
  const compact = String(value || '').replace(/[\s,]+/g, '')
  if (!compact) return null
  if (!/^[0-9a-fA-F]+$/.test(compact) || compact.length % 2 !== 0) return null
  return compact.match(/.{2}/g).join(' ').toUpperCase()
}

async function sendCustomCommand() {
  if (!workbenchDevice.value?.id) return

  const rawCommand = String(commandForm.value.command || '').trim()
  const normalizedCommand = commandForm.value.format === 'hex' ? normalizeHexCommand(rawCommand) : rawCommand
  if (!normalizedCommand) {
    commandFeedback.value = {
      type: 'error',
      text: commandForm.value.format === 'hex' ? '请输入偶数位有效十六进制指令' : '指令内容不能为空'
    }
    return
  }

  commandSending.value = true
  commandFeedback.value = { type: '', text: '' }
  try {
    const response = await api.post(`/upper-devices/${workbenchDevice.value.id}/send-command`, {
      command: normalizedCommand,
      format: commandForm.value.format
    })
    commandFeedback.value = {
      type: 'success',
      text: response.data.message || '指令发送成功'
    }
    commandForm.value.command = normalizedCommand
    await refreshCommandLogs()
  } catch (error) {
    commandFeedback.value = {
      type: 'error',
      text: error.response?.data?.details || error.response?.data?.error || '指令发送失败'
    }
  } finally {
    commandSending.value = false
  }
}

function buildParamsPayload() {
  const payload = {}
  for (const group of parameterGroups) {
    for (const field of group.fields) {
      const rawValue = paramsForm.value[field.key]
      if (rawValue === '' || rawValue === null || rawValue === undefined) {
        if (field.required) {
          throw new Error(`${field.label}不能为空`)
        }
        continue
      }

      const value = Number(rawValue)
      if (field.type === 'uint16') {
        if (!Number.isInteger(value) || value < 0 || value > 65535) {
          throw new Error(`${field.label}必须是 0 到 65535 的整数`)
        }
      } else if (!Number.isFinite(value)) {
        throw new Error(`${field.label}必须是数字`)
      }
      payload[field.key] = value
    }
  }

  if (!Object.keys(payload).length) {
    throw new Error('请至少填写一个参数')
  }
  return payload
}

async function submitParams() {
  if (!workbenchDevice.value?.id) return

  let params
  try {
    params = buildParamsPayload()
  } catch (error) {
    paramsFeedback.value = { type: 'error', text: error.message }
    return
  }

  paramsSubmitting.value = true
  paramsFeedback.value = { type: '', text: '' }
  try {
    const response = await api.post(`/upper-devices/${workbenchDevice.value.id}/set-params`, { params })
    paramsFeedback.value = {
      type: 'success',
      text: `参数配置任务已创建（任务ID: ${response.data.data?.taskId || '-'}）`
    }
  } catch (error) {
    paramsFeedback.value = {
      type: 'error',
      text: error.response?.data?.details || error.response?.data?.error || '参数配置任务创建失败'
    }
  } finally {
    paramsSubmitting.value = false
  }
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
  if (!device?.id) return
  if (!window.confirm(`确定删除上位机 ${device.imei} 吗？删除后会同时解除相关绑定关系。`)) {
    return
  }

  deletingUpperDeviceId.value = device.id
  try {
    await api.delete(`/upper-devices/${device.id}`)
    await loadUpperDevices()
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
      await loadUpperDevices()
    }
  } catch (error) {
    if (!silent) {
      syncSummary.value = error.response?.data?.details || error.response?.data?.error || '同步上位机状态失败'
    }
  } finally {
    syncing.value = false
  }
}

async function refreshUpperDevices(syncFirst = true, silentSync = false) {
  if (syncFirst) {
    await syncUpperDeviceStatus({ silent: silentSync, reload: false })
  }
  await loadUpperDevices()
}

async function executeQuickTask(device, taskType) {
  quickTaskLoading.value = taskType
  quickTaskFeedback.value = { type: '', text: '' }

  try {
    const taskConfig = {
      homeMove: { action: '/upper-devices/' + device.id + '/home-move', label: '归位' },
      bottomTest: { action: '/upper-devices/' + device.id + '/bottom-test', label: '底部检测' },
      statusCheck: { action: '/upper-devices/' + device.id + '/status-check', label: '状态检查' }
    }[taskType]
    if (!taskConfig) return
    const { action, label } = taskConfig
    const response = await api.post(action)

    if (response.data.success) {
      quickTaskFeedback.value = {
        type: 'success',
        text: `${label}任务已创建（任务ID: ${response.data.data?.taskId || '-'}）`
      }
      // 修复说明：快捷指令执行后立即刷新任务日志，与客户端工作台保持一致，便于即时查看任务结果。
      await refreshTaskLogs()
      await refreshCommandLogs()
    }
  } catch (error) {
    console.error(`Failed to execute ${taskType}:`, error)
    const label = taskType === 'homeMove' ? '归位' : taskType === 'bottomTest' ? '底部检测' : '状态检查'
    quickTaskFeedback.value = {
      type: 'error',
      text: error.response?.data?.error || error.response?.data?.message || `${label}任务创建失败`
    }
  } finally {
    quickTaskLoading.value = ''
  }
}

onMounted(() => {
  search.value = String(route.query.search || '')
  refreshUpperDevices(true, true)
  refreshTimer = window.setInterval(() => {
    refreshUpperDevices(true, true)
  }, 30000)
})

onBeforeUnmount(() => {
  stopCommandLogPolling()
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<template>
  <div class="page-stack">
    <div class="toolbar">
      <input v-model="search" placeholder="搜索 IMEI、名称或关联测孔" @keyup.enter="refreshUpperDevices(true, false)" />
      <button @click="refreshUpperDevices(true, false)">刷新</button>
      <button class="sync-button" :disabled="syncing" @click="syncUpperDeviceStatus">
        {{ syncing ? '同步中...' : '同步上位机状态' }}
      </button>
      <span class="toolbar-tip">每 30 秒自动刷新一次{{ lastUpdatedAt ? `，最近刷新：${lastUpdatedAt}` : '' }}</span>
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
            <th>换线里程(m)</th>
            <th>总里程(m)</th>
            <th>检查里程(m)</th>
            <th>预警</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in upperDevices" :key="item.id">
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
            <td>{{ Number(item.wire_change_mileage || 0).toFixed(2) }}</td>
            <td>{{ Number(item.total_mileage || 0).toFixed(2) }}</td>
            <td>{{ Number(item.inspection_mileage || 0).toFixed(2) }}</td>
            <td><span v-if="mileageWarnings(item).length" class="mileage-warning">{{ mileageWarnings(item).map(item => item.message).join(' ') }}</span><span v-else>--</span></td>
            <td class="action-cell">
              <button class="secondary" @click="openTaskDialog(item)">监测任务</button>
              <button class="workbench-button" @click="openWorkbench(item)">工作台</button>
              <button class="danger" :disabled="deletingUpperDeviceId === item.id" @click="removeUpperDevice(item)">
                {{ deletingUpperDeviceId === item.id ? '删除中...' : '删除' }}
              </button>
            </td>
          </tr>
          <tr v-if="!upperDevices.length && !loading"><td colspan="13">暂无上位机数据</td></tr>
        </tbody>
      </table>
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
              <span>任务类型：{{ getTaskTypeText(task) }}</span>
              <span>创建时间：{{ formatDateTime(task.createdAt) }}</span>
              <span>完成时间：{{ formatDateTime(task.completedAt) }}</span>
              <span>测孔：{{ formatTaskHole(task) }}</span>
              <span>客户：{{ task.customerName || '--' }}</span>
              <span
                v-for="(message, index) in getTaskResultLogMessages(task)"
                :key="`${task.taskId}-result-log-${index}`"
                class="task-result-log">
                {{ message }}
              </span>
              <span class="task-error">异常信息：{{ task.errorMessage || '--' }}</span>
            </div>
          </div>
        </div>
        <div v-else class="empty-text">当前上位机暂无监测任务</div>
      </div>
    </div>
  </div>

  <div v-if="workbenchVisible" class="dialog-overlay">
    <div class="dialog workbench-dialog">
      <div class="dialog-header">
        <div>
          <h3>上位机工作台</h3>
          <p class="dialog-subtitle">
            {{ workbenchDevice?.device_name || '未命名设备' }} · {{ workbenchDevice?.imei || '--' }}
          </p>
        </div>
        <button class="icon-btn" title="关闭" @click="closeWorkbench">&times;</button>
      </div>

      <div class="dialog-body workbench-body">
        <!-- 区域一：设备概览 -->
        <section class="wb-block">
          <header class="wb-block-head">
            <span class="wb-block-index">1</span>
            <div>
              <h4>设备概览</h4>
              <p>目标设备在线状态、里程统计与里程预警阈值</p>
            </div>
          </header>
          <div class="wb-block-body">
            <div class="workbench-device-bar">
              <div>
                <span class="device-label">目标设备</span>
                <strong>{{ workbenchDevice?.imei || '--' }}</strong>
                <span class="device-label">{{ workbenchDevice?.device_name || '未命名设备' }}</span>
              </div>
              <span class="network-badge" :class="getNetworkStatusClass(workbenchDevice?.network_status)">
                {{ getNetworkStatusText(workbenchDevice?.network_status) }}
              </span>
            </div>
            <div class="mileage-summary">
              <div><span>换线里程</span><strong>{{ Number(workbenchDevice?.wire_change_mileage || 0).toFixed(2) }} m</strong></div>
              <div><span>总里程</span><strong>{{ Number(workbenchDevice?.total_mileage || 0).toFixed(2) }} m</strong></div>
              <div><span>检查里程</span><strong>{{ Number(workbenchDevice?.inspection_mileage || 0).toFixed(2) }} m</strong></div>
            </div>
            <div v-if="mileageWarnings(workbenchDevice).length" class="mileage-warning workbench-warning">
              {{ mileageWarnings(workbenchDevice).map(item => item.message).join(' ') }}
            </div>
            <div class="mileage-settings">
              <label>换线预警里程(m)<input v-model="mileageForm.wire_change_mileage" type="number" min="0" step="0.01" /></label>
              <label>检查预警里程(m)<input v-model="mileageForm.inspection_mileage" type="number" min="0" step="0.01" /></label>
              <button class="secondary" :disabled="mileageSaving" @click="saveMileageThresholds">{{ mileageSaving ? '保存中...' : '保存里程预警值' }}</button>
            </div>
            <div v-if="mileageFeedback.text" class="inline-feedback" :class="mileageFeedback.type">{{ mileageFeedback.text }}</div>
          </div>
        </section>

        <!-- 区域二：快捷指令 + 任务日志 -->
        <section class="wb-block">
          <header class="wb-block-head">
            <span class="wb-block-index">2</span>
            <div>
              <h4>快捷指令与任务日志</h4>
              <p>同一设备同一时刻仅允许一个任务执行；下发指令后右侧任务日志每 3 秒自动刷新</p>
            </div>
          </header>
          <div class="wb-block-body wb-split">
            <div class="wb-col wb-panel">
              <div class="section-heading">
                <div>
                  <h5>快捷指令</h5>
                  <p>由管理端创建设备任务，执行结果见右侧任务日志</p>
                </div>
              </div>
              <div v-if="quickTaskFeedback.text" class="inline-feedback" :class="quickTaskFeedback.type">
                {{ quickTaskFeedback.text }}
              </div>
              <div class="quick-task-buttons">
                <button
                  class="btn-quick-task"
                  :disabled="workbenchDevice?.network_status !== 'online' || !!quickTaskLoading"
                  @click="executeQuickTask(workbenchDevice, 'homeMove')">
                  {{ quickTaskLoading === 'homeMove' ? '执行中...' : '归位' }}
                </button>
                <button
                  class="btn-quick-task"
                  :disabled="workbenchDevice?.network_status !== 'online' || !!quickTaskLoading"
                  @click="executeQuickTask(workbenchDevice, 'bottomTest')">
                  {{ quickTaskLoading === 'bottomTest' ? '执行中...' : '底部检测' }}
                </button>
                <button
                  class="btn-quick-task"
                  :disabled="workbenchDevice?.network_status !== 'online' || !!quickTaskLoading"
                  @click="executeQuickTask(workbenchDevice, 'statusCheck')">
                  {{ quickTaskLoading === 'statusCheck' ? '执行中...' : '状态检查' }}
                </button>
              </div>
            </div>

            <div class="wb-col wb-panel">
              <div class="section-heading log-heading">
                <div>
                  <h5>任务日志</h5>
                  <p>任务状态、异常信息及设备网关交互详情</p>
                </div>
                <button class="text-action" :disabled="taskLogLoading" @click="refreshTaskLogs({ showLoading: true })">
                  {{ taskLogLoading ? '刷新中...' : '刷新' }}
                </button>
              </div>
              <div v-if="taskLogError" class="inline-feedback error">{{ taskLogError }}</div>
              <div class="task-log-list">
                <div v-if="taskLogLoading && !taskLogs.length" class="empty-text">任务日志加载中...</div>
                <div v-else-if="!taskLogs.length" class="empty-text">当前设备暂无任务日志</div>
                <article v-for="task in taskLogs" :key="task.taskId" class="task-log-item">
                  <div class="task-log-summary">
                    <div>
                      <span class="task-log-status" :class="`status-${task.status}`">{{ getTaskStatusText(task.status) }}</span>
                      <strong>{{ getTaskTypeText(task) }}</strong>
                    </div>
                    <time>{{ formatDateTime(task.createdAt) }}</time>
                  </div>
                  <div class="task-log-id">任务 ID：{{ task.taskId || '--' }}</div>
                  <div
                    v-for="(message, index) in getTaskResultLogMessages(task)"
                    :key="`${task.taskId}-result-log-${index}`"
                    class="task-log-result">
                    {{ message }}
                  </div>
                  <div v-if="getTaskErrorText(task)" class="task-log-error">{{ getTaskErrorText(task) }}</div>
                  <details>
                    <summary>查看任务日志详情</summary>
                    <div class="detail-grid">
                      <div><span>网关任务 ID</span>{{ task.scheduledTaskId || task.sendResponse?.gatewayTaskId || '--' }}</div>
                      <div><span>下发时间</span>{{ formatDateTime(task.sentAt) }}</div>
                      <div><span>完成时间</span>{{ formatDateTime(task.completedAt) }}</div>
                      <div><span>回调状态</span>{{ task.callbackStatus || '--' }}</div>
                    </div>
                    <div class="payload-block"><span>请求参数</span><pre>{{ formatTaskPayload(task.requestPayload) }}</pre></div>
                    <div class="payload-block"><span>下发响应</span><pre>{{ formatTaskPayload(task.sendResponse) }}</pre></div>
                    <div class="payload-block"><span>执行结果</span><pre>{{ formatTaskPayload(task.resultPayload) }}</pre></div>
                  </details>
                </article>
              </div>
            </div>
          </div>
        </section>

        <!-- 区域三：参数配置 -->
        <section class="wb-block">
          <header class="wb-block-head">
            <span class="wb-block-index">3</span>
            <div>
              <h4>参数配置</h4>
              <p>打开工作台自动载入设备参数快照（纯查询）；点击「读取配置」才向设备下发 /params/fetch 读取最新值</p>
            </div>
          </header>
          <div class="wb-block-body">
            <div class="params-toolbar">
              <span class="params-read-info">{{ paramsReadInfo || '尚未读取设备参数' }}</span>
              <div class="params-toolbar-actions">
                <button
                  class="text-action"
                  :disabled="paramsReading || workbenchDevice?.network_status !== 'online'"
                  @click="readDeviceParams()">
                  {{ paramsReading ? '读取中...' : '读取配置' }}
                </button>
                <button class="text-action" :disabled="paramsSubmitting" @click="resetParamsForm">清空</button>
              </div>
            </div>
            <div v-if="paramsFeedback.text" class="inline-feedback" :class="paramsFeedback.type">
              {{ paramsFeedback.text }}
            </div>
            <div class="parameter-groups">
              <fieldset v-for="group in parameterGroups" :key="group.title" class="parameter-group">
                <legend>{{ group.title }}</legend>
                <div class="parameter-fields">
                  <label v-for="field in group.fields" :key="field.key" class="parameter-field">
                    <span>{{ field.label }}</span>
                    <input
                      v-model="paramsForm[field.key]"
                      type="number"
                      :step="field.step"
                      :min="field.type === 'uint16' ? 0 : undefined"
                      :max="field.type === 'uint16' ? 65535 : undefined"
                      :placeholder="field.key" />
                  </label>
                </div>
              </fieldset>
            </div>
            <div class="section-actions params-actions">
              <button
                class="primary-action"
                :disabled="workbenchDevice?.network_status !== 'online' || paramsSubmitting"
                @click="submitParams">
                {{ paramsSubmitting ? '任务创建中...' : '下发配置并创建任务' }}
              </button>
            </div>
          </div>
        </section>

        <!-- 区域四：自定义指令（置于工作台最底部） -->
        <section class="wb-block">
          <header class="wb-block-head">
            <span class="wb-block-index">4</span>
            <div>
              <h4>自定义指令</h4>
              <p>指令将直接发送到设备网关并等待设备响应，右侧为原始通信日志</p>
            </div>
          </header>
          <div class="wb-block-body wb-split">
            <div class="wb-col wb-panel">
              <div class="section-heading">
                <div>
                  <h5>指令内容</h5>
                  <p>十六进制支持空格分隔，例如 01 03 00 00 00 0E C4 0E</p>
                </div>
              </div>
              <label class="field-label" for="command-format">指令格式</label>
              <select id="command-format" v-model="commandForm.format" class="field-control">
                <option value="hex">十六进制</option>
                <option value="text">UTF-8 文本</option>
              </select>
              <label class="field-label" for="custom-command">指令内容</label>
              <textarea
                id="custom-command"
                v-model="commandForm.command"
                class="command-textarea"
                rows="6"
                :placeholder="commandForm.format === 'hex' ? '例如：01 03 00 00 00 0E C4 0E' : '请输入文本指令'"
                @keydown.ctrl.enter.prevent="sendCustomCommand"></textarea>
              <div v-if="commandFeedback.text" class="inline-feedback" :class="commandFeedback.type">
                {{ commandFeedback.text }}
              </div>
              <div class="section-actions">
                <button
                  class="primary-action"
                  :disabled="workbenchDevice?.network_status !== 'online' || commandSending"
                  @click="sendCustomCommand">
                  {{ commandSending ? '发送中...' : '发送指令' }}
                </button>
              </div>
            </div>

            <div class="wb-col wb-panel">
              <div class="section-heading log-heading">
                <div>
                  <h5>自定义指令通信日志</h5>
                  <p>每 2 秒自动刷新，最多展示最近 200 条</p>
                </div>
                <button class="text-action" :disabled="commandLogsLoading" @click="refreshCommandLogs({ reset: true })">
                  {{ commandLogsLoading ? '刷新中...' : '刷新' }}
                </button>
              </div>
              <div v-if="commandLogsError" class="inline-feedback error">{{ commandLogsError }}</div>
              <div class="command-log-list">
                <div v-if="commandLogsLoading && !commandLogs.length" class="empty-text">日志加载中...</div>
                <div v-else-if="!commandLogs.length" class="empty-text">暂无通信日志</div>
                <div v-for="log in commandLogs" :key="log.id" class="command-log-item">
                  <div class="command-log-meta">
                    <span class="log-direction" :class="log.direction || 'system'">
                      {{ getLogTypeText(log.direction) }}
                    </span>
                    <span>{{ formatCommandLogTime(log.createdAt || log.timestamp) }}</span>
                  </div>
                  <strong>{{ log.summary || '通信记录' }}</strong>
                  <code v-if="log.payloadHex">{{ log.payloadHex }}</code>
                  <p v-if="log.payloadText && log.payloadText !== log.payloadHex">{{ log.payloadText }}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
  </div>
</template>

<style scoped>
.page-stack { display: grid; gap: 18px; }
.toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.toolbar input { flex: 1; min-width: 260px; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; }
.toolbar button { border: none; border-radius: 10px; background: #2563eb; color: #fff; padding: 10px 16px; }
.toolbar button:disabled { opacity: 0.7; cursor: not-allowed; }
.sync-button { background: #0f766e; }
.toolbar-tip, .sync-summary { color: #64748b; font-size: 13px; }
.panel { background: #fff; border-radius: 14px; padding: 18px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }
.panel h3 { margin-bottom: 14px; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 14px; }
.network-badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 600; }
.network-badge.status-online { color: #166534; background: #dcfce7; }
.network-badge.status-offline { color: #991b1b; background: #fee2e2; }
.mileage-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 14px 0; }
.mileage-summary div, .mileage-settings { padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; }
.mileage-summary span, .mileage-settings label { display: block; color: #64748b; font-size: 12px; }
.mileage-summary strong { display: block; margin-top: 5px; font-size: 15px; color: #1e293b; }
.mileage-warning { color: #b45309; line-height: 1.5; }
.workbench-warning { margin-bottom: 12px; padding: 10px 12px; background: #fff7ed; border-radius: 8px; }
.mileage-settings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
.mileage-settings input { display: block; width: 100%; box-sizing: border-box; margin-top: 6px; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; }
.mileage-settings button { align-self: end; width: fit-content; }
.action-cell { display: flex; gap: 8px; flex-wrap: wrap; }
.secondary, .workbench-button, .danger { border: none; border-radius: 8px; color: #fff; padding: 8px 12px; cursor: pointer; }
.secondary { background: #2563eb; }
.workbench-button { background: #0f766e; }
.danger { background: #dc2626; }
.secondary:disabled, .workbench-button:disabled, .danger:disabled { opacity: 0.6; cursor: not-allowed; }
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
.task-result-log { color: #047857; font-weight: 600; }

.quick-task-buttons { display: flex; gap: 10px; }
.btn-quick-task { border: none; border-radius: 10px; padding: 10px 16px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
.btn-quick-task:first-child { background: #2563eb; color: #fff; }
.btn-quick-task:last-child { background: #0f766e; color: #fff; }
.btn-quick-task:hover:not(:disabled) { opacity: 0.9; }
.btn-quick-task:disabled { opacity: 0.6; cursor: not-allowed; }

.workbench-dialog { width: min(1180px, 96vw); max-height: 92vh; }
.workbench-body { display: grid; gap: 16px; background: #f8fafc; }

/* 修复说明：工作台按功能拆分为 4 个带编号标题的区块，区块之间用边框与间距明确区分。 */
.wb-block { border: 1px solid #cbd5e1; border-radius: 12px; background: #fff; overflow: hidden; }
.wb-block-head { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-bottom: 1px solid #e2e8f0; background: #f1f5f9; }
.wb-block-index { flex: 0 0 auto; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: #2563eb; color: #fff; font-size: 13px; font-weight: 700; }
.wb-block-head h4 { margin: 0; color: #0f172a; font-size: 15px; }
.wb-block-head p { margin: 4px 0 0; color: #64748b; font-size: 12px; line-height: 1.5; }
.wb-block-body { display: grid; gap: 12px; padding: 16px; }
.wb-split { grid-template-columns: minmax(300px, 0.9fr) minmax(400px, 1.1fr); align-items: start; }
.wb-col { min-width: 0; }
.wb-panel { padding: 14px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fcfcfd; }

.workbench-device-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; }
.workbench-device-bar > div { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.workbench-device-bar strong { overflow-wrap: anywhere; }
.device-label { color: #64748b; font-size: 13px; }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.section-heading h4 { margin: 0; color: #0f172a; font-size: 15px; }
.section-heading h5 { margin: 0; color: #0f172a; font-size: 14px; }
.section-heading p { margin: 4px 0 0; color: #64748b; font-size: 12px; line-height: 1.5; }
.field-label { display: block; margin: 12px 0 6px; color: #334155; font-size: 13px; font-weight: 600; }
.field-control, .command-textarea, .parameter-field input { width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #0f172a; padding: 9px 10px; font: inherit; }
.field-control:focus, .command-textarea:focus, .parameter-field input:focus { outline: 2px solid #bfdbfe; border-color: #2563eb; }
.command-textarea { resize: vertical; min-height: 118px; font-family: Consolas, 'Courier New', monospace; line-height: 1.5; }
.section-actions { display: flex; justify-content: flex-end; margin-top: 12px; }
.primary-action { border: none; border-radius: 8px; background: #2563eb; color: #fff; padding: 9px 16px; cursor: pointer; }
.primary-action:disabled, .text-action:disabled { opacity: 0.55; cursor: not-allowed; }
.text-action { flex: 0 0 auto; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #334155; padding: 6px 10px; cursor: pointer; }
.inline-feedback { margin: 10px 0; padding: 9px 11px; border-radius: 6px; font-size: 13px; }
.inline-feedback.success { background: #dcfce7; color: #166534; }
.inline-feedback.error { background: #fee2e2; color: #991b1b; }
.log-heading { flex: 0 0 auto; }
.command-log-list { min-height: 330px; max-height: 470px; overflow: auto; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; }

/* 修复说明：任务日志样式与客户端工作台保持一致，突出任务状态、结果日志与异常信息。
   注意：徽章类名用 task-log-status，避免与监测任务弹窗的 .task-status 样式互相覆盖。 */
.task-log-list { display: flex; flex-direction: column; gap: 10px; height: 330px; overflow-y: auto; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; }
.task-log-item { padding: 11px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; }
.task-log-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.task-log-summary > div { display: flex; align-items: center; gap: 8px; }
.task-log-summary strong { font-size: 13px; color: #374151; }
.task-log-summary time,
.task-log-id { font-size: 12px; color: #64748b; }
.task-log-id { margin-top: 8px; overflow-wrap: anywhere; }
.task-log-result { margin-top: 8px; padding: 8px 10px; border-radius: 6px; background: #ecfdf5; color: #047857; font-size: 13px; overflow-wrap: anywhere; }
.task-log-error { margin-top: 8px; color: #b91c1c; font-size: 13px; overflow-wrap: anywhere; }
.task-log-status { padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.status-created { background: #e0e7ff; color: #3730a3; }
.status-queued,
.status-polling { background: #dbeafe; color: #1d4ed8; }
.status-completed { background: #dcfce7; color: #166534; }
.status-failed,
.status-timeout,
.status-skipped { background: #fee2e2; color: #991b1b; }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; margin-top: 12px; padding: 10px; border-radius: 6px; background: #f3f4f6; font-size: 12px; }
.detail-grid div { overflow-wrap: anywhere; }
.detail-grid span { display: block; margin-bottom: 3px; color: #64748b; }
.payload-block { margin-top: 10px; font-size: 12px; color: #374151; }
.payload-block pre { max-height: 220px; margin: 5px 0 0; padding: 10px; overflow: auto; border-radius: 6px; background: #111827; color: #f9fafb; font: 12px/1.5 Consolas, Monaco, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.task-log-item details { margin-top: 10px; }
.task-log-item summary { color: #2563eb; font-size: 13px; cursor: pointer; }
.command-log-item { display: grid; gap: 6px; padding: 10px; border-bottom: 1px solid #e2e8f0; color: #334155; font-size: 12px; }
.command-log-item:last-child { border-bottom: none; }
.command-log-item strong { color: #1e293b; font-size: 13px; }
.command-log-item code { display: block; overflow-wrap: anywhere; white-space: pre-wrap; color: #0f172a; font-family: Consolas, 'Courier New', monospace; }
.command-log-item p { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.command-log-meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: #64748b; }
.log-direction { display: inline-flex; border-radius: 4px; padding: 2px 6px; background: #e2e8f0; color: #475569; font-weight: 600; }
.log-direction.send { background: #dbeafe; color: #1d4ed8; }
.log-direction.recv { background: #dcfce7; color: #166534; }
/* 修复说明：参数配置工具栏，左侧展示读取状态，右侧为“读取配置/清空”操作。 */
.params-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; }
.params-read-info { color: #475569; font-size: 13px; overflow-wrap: anywhere; }
.params-toolbar-actions { display: flex; flex: 0 0 auto; gap: 8px; }
.parameter-groups { display: grid; grid-template-columns: minmax(180px, 0.55fr) minmax(320px, 1.2fr) minmax(320px, 1.25fr); gap: 12px; align-items: start; }
.parameter-group { min-width: 0; margin: 0; padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px; }
.parameter-group legend { padding: 0 6px; color: #334155; font-size: 13px; font-weight: 700; }
.parameter-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.parameter-group:first-child .parameter-fields { grid-template-columns: 1fr; }
.parameter-field { display: grid; gap: 5px; min-width: 0; color: #475569; font-size: 12px; }
.parameter-field span { overflow-wrap: anywhere; }
.parameter-field input { min-width: 0; padding: 8px 9px; }
.params-actions { margin-top: 0; }

@media (max-width: 1100px) {
  .workbench-dialog { width: 96vw; }
  .wb-split { grid-template-columns: 1fr; }
  .parameter-groups { grid-template-columns: 1fr; }
  .task-log-list { height: min(360px, 45vh); }
  .command-log-list { min-height: 260px; }
}

@media (max-width: 600px) {
  .dialog-overlay { align-items: flex-start; padding: 12px 0; overflow: auto; }
  .workbench-dialog { max-height: none; }
  .dialog-header, .dialog-body { padding: 14px; }
  .wb-block-body { padding: 12px; }
  .params-toolbar { flex-direction: column; align-items: stretch; }
  .workbench-device-bar, .workbench-device-bar > div { align-items: flex-start; flex-direction: column; gap: 6px; }
  .parameter-fields { grid-template-columns: 1fr; }
  .quick-task-buttons { flex-direction: column; }
  .btn-quick-task { width: 100%; }
}
</style>
