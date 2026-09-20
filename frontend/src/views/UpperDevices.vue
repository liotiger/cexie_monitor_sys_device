<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import api, { upperDeviceApi } from '@/services/api'

const AUTO_REFRESH_INTERVAL_MS = 20000

const devices = ref([])
const loading = ref(false)
const syncingFromAdmin = ref(false)
const syncFeedback = ref({ type: '', text: '' })
const pagination = ref({ total: 0, page: 1, limit: 10 })
const filters = ref({ network_status: '', keyword: '' })
const autoRefresh = ref(true)
let refreshTimer = null

const showEditDialog = ref(false)
const showDeleteConfirm = ref(false)
const showCommandDialog = ref(false)
const editingDevice = ref(null)
const deleteTarget = ref(null)
const commandDevice = ref(null)
const taskLogs = ref([])
const taskLogError = ref('')
const taskLogLoading = ref(false)
const quickTaskLoading = ref('')
const quickTaskFeedback = ref({ type: '', text: '' })
const monitorTaskListMap = ref({})
const monitorTaskLoadingMap = ref({})
const monitorStartingMap = ref({})
const monitorCancellingMap = ref({})
const showTaskDialog = ref(false)
const taskDetailDevice = ref(null)
const taskHistoryList = ref([])
const taskDetailLoading = ref(false)
const showMonitorBindingDialog = ref(false)
const monitorBindingDevice = ref(null)
const monitorBindingHoles = ref([])
const monitorBindingHoleId = ref(null)
const monitorBindingLoading = ref(false)
const monitorBindingSubmitting = ref(false)
const monitorBindingError = ref('')
let taskLogTimer = null

// 修复说明：上位机管理新增独立的"绑定/解绑测孔"操作，与"立即监测前自动绑定"逻辑分离，绑定后不自动发起监测。
const showHoleBindDialog = ref(false)
const holeBindDevice = ref(null)
const holeBindOptions = ref([])
const holeBindHoleId = ref(null)
const holeBindLoading = ref(false)
const holeBindSubmitting = ref(false)
const holeBindError = ref('')
const showHoleUnbindConfirm = ref(false)
const unbindHoleTarget = ref(null)
const unbindHoleSubmitting = ref(false)

const formData = ref({
  imei: '',
  device_name: '',
  manufacturer: '',
  model: '',
  serial_number: '',
  firmware_version: '',
  wire_change_mileage: 0,
  inspection_mileage: 0,
  status: 'idle'
})

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'idle', label: '空闲' },
  { value: 'active', label: '使用中' },
  { value: 'fault', label: '故障' },
  { value: 'calibration_expired', label: '校准过期' }
]

const networkStatusOptions = [
  { value: '', label: '全部' },
  { value: 'online', label: '在线' },
  { value: 'offline', label: '离线' }
]

const statusTextMap = {
  idle: '空闲',
  active: '使用中',
  fault: '故障',
  calibration_expired: '校准过期',
  maintenance: '校准过期'
}

const statusClassMap = {
  idle: 'status-idle',
  active: 'status-active',
  fault: 'status-fault',
  calibration_expired: 'status-maintenance',
  maintenance: 'status-maintenance'
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

const taskStatusClassMap = {
  created: 'task-created',
  queued: 'task-queued',
  polling: 'task-polling',
  completed: 'task-completed',
  failed: 'task-failed',
  timeout: 'task-timeout',
  skipped: 'task-skipped'
}

const taskTypeTextMap = {
  monitor_start: '监测',
  home_move: '归位',
  bottom_test: '底部检测',
  set_params: '参数配置',
  status_check: '状态检查'
}

const taskTypeByCommand = {
  MONITOR_START: 'monitor_start',
  HOME_MOVE: 'home_move',
  BOTTOM_TEST: 'bottom_test',
  SET_PARAMS: 'set_params',
  STATUS_CHECK: 'status_check'
}

onMounted(() => {
  syncFromAdmin({ silent: true })
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
  stopTaskLogPolling()
})

function startAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
  if (autoRefresh.value) {
    refreshTimer = setInterval(() => {
      syncFromAdmin({ silent: true })
    }, AUTO_REFRESH_INTERVAL_MS)
  }
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

function toggleAutoRefresh() {
  if (autoRefresh.value) {
    syncFromAdmin({ silent: true })
    startAutoRefresh()
  } else {
    stopAutoRefresh()
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
    const response = await api.get('/upper-devices', { params })
    if (response.data.success) {
      devices.value = response.data.data.list
      pagination.value.total = response.data.data.total
      await loadMonitorTasksForDevices(devices.value)
    }
  } catch (error) {
    console.error('Failed to load devices:', error)
  } finally {
    loading.value = false
  }
}

function isRunningTaskStatus(status) {
  return ['created', 'queued', 'polling'].includes(String(status || ''))
}

async function loadMonitorTasksForDevice(deviceId, { silent = false, limit = 20 } = {}) {
  if (!deviceId) return null

  if (!silent) {
    monitorTaskLoadingMap.value = {
      ...monitorTaskLoadingMap.value,
      [deviceId]: true
    }
  }

  try {
    const response = await upperDeviceApi.getMonitorTasks(deviceId, { limit })
    if (response.data.success) {
      const tasks = Array.isArray(response.data.data) ? response.data.data : []
      const normalizedTasks = await Promise.all(tasks.map(async (task) => {
        if (!task?.taskId || !isRunningTaskStatus(task.status)) {
          return task
        }

        try {
          // 修复说明：进行中的任务单靠列表接口可能略滞后，这里补一次详情读取，确保页面能展示更接近实时的状态和异常信息。
          const detailResponse = await upperDeviceApi.getMonitorTask(task.taskId)
          if (detailResponse.data.success && detailResponse.data.data) {
            return detailResponse.data.data
          }
        } catch (error) {
          console.error('Failed to refresh running monitor task detail:', error)
        }

        return task
      }))

      monitorTaskListMap.value = {
        ...monitorTaskListMap.value,
        [deviceId]: normalizedTasks
      }
      return normalizedTasks
    }
  } catch (error) {
    console.error('Failed to load monitor tasks:', error)
  } finally {
    if (!silent) {
      monitorTaskLoadingMap.value = {
        ...monitorTaskLoadingMap.value,
        [deviceId]: false
      }
    }
  }

  return []
}

function buildMonitorPayload(device, hole = {}) {
  const project = hole.project || {}
  return {
    project: {
      projectId: project.id || hole.project_id || null,
      projectCode: project.project_code || null,
      projectName: project.project_name || null,
      location: project.location || null,
      clientName: project.client_name || null,
      contractor: project.contractor || null,
      supervisor: project.supervisor || null,
      startDate: project.start_date || null,
      endDate: project.end_date || null,
      status: project.status || null
    },
    hole: {
      holeId: hole.id,
      holeNumber: hole.hole_number,
      holeName: hole.hole_name || null,
      holeType: hole.hole_type || null,
      locationDescription: hole.location_description || null,
      depth: hole.depth,
      measurementInterval: hole.measurement_interval,
      // 修复说明：管理端开始监测前要用孔深、测量间隔、初始测量距离反算设备监测节点数。
      initialMeasurementDistance: hole.initial_measurement_distance ?? hole.initialMeasurementDistance ?? null,
      upperDeviceId: device.id
    },
    metadata: {
      triggerSource: 'upper-device-list',
      upperDeviceId: device.id,
      upperDeviceImei: device.imei,
      upperDeviceName: device.device_name || null,
      projectId: project.id || hole.project_id || null,
      holeId: hole.id,
      holeNo: hole.hole_number,
      holeNumber: hole.hole_number,
      holeName: hole.hole_name || null
    }
  }
}

async function dispatchMonitorForDevice(device, hole) {
  monitorStartingMap.value = {
    ...monitorStartingMap.value,
    [device.id]: true
  }
  syncFeedback.value = { type: '', text: '' }

  try {
    const response = await upperDeviceApi.startMonitor(device.id, buildMonitorPayload(device, hole))

    if (response.data.success) {
      syncFeedback.value = {
        type: 'success',
        text: `测孔 ${hole.hole_number || '-'} 已通过上位机 ${device.imei} 发起监测任务`
      }
      await loadMonitorTasksForDevice(device.id)
    }
  } catch (error) {
    console.error('Failed to start monitor for upper device:', error)
    syncFeedback.value = {
      type: 'error',
      // 修复说明：优先展示客户端后端透传的 details，列表页才能直接看到管理端真实失败原因。
      text: error.response?.data?.details || error.response?.data?.message || `上位机 ${device.imei} 启动监测失败`
    }
  } finally {
    monitorStartingMap.value = {
      ...monitorStartingMap.value,
      [device.id]: false
    }
  }
}

async function findBoundHoleForDevice(deviceId) {
  const response = await api.get('/monitoring-holes', {
    params: { upper_device_id: deviceId, page: 1, limit: 1 }
  })
  return response.data.success ? response.data.data?.list?.[0] || null : null
}

async function openMonitorBindingGuide(device) {
  monitorBindingDevice.value = device
  monitorBindingHoleId.value = null
  monitorBindingHoles.value = []
  monitorBindingError.value = ''
  monitorBindingLoading.value = true
  showMonitorBindingDialog.value = true

  try {
    const response = await api.get('/monitoring-holes', { params: { page: 1, limit: 1000 } })
    if (response.data.success) {
      monitorBindingHoles.value = (response.data.data?.list || []).filter(hole => !hole.upper_device_id)
    }
  } catch (error) {
    monitorBindingError.value = error.response?.data?.message || '可绑定测孔加载失败'
  } finally {
    monitorBindingLoading.value = false
  }
}

function closeMonitorBindingGuide() {
  if (monitorBindingSubmitting.value) return
  showMonitorBindingDialog.value = false
  monitorBindingDevice.value = null
  monitorBindingHoles.value = []
  monitorBindingHoleId.value = null
  monitorBindingError.value = ''
}

async function bindHoleAndStartMonitor() {
  const device = monitorBindingDevice.value
  const hole = monitorBindingHoles.value.find(item => Number(item.id) === Number(monitorBindingHoleId.value))
  if (!device || !hole) {
    monitorBindingError.value = '请选择需要绑定的测孔'
    return
  }

  monitorBindingSubmitting.value = true
  monitorBindingError.value = ''
  try {
    const response = await api.post(`/monitoring-holes/${hole.id}/bind-device`, {
      upper_device_id: device.id,
      bind_type: 'manual',
      bind_reason: '上位机管理立即监测前绑定测孔'
    })
    if (response.data.success) {
      showMonitorBindingDialog.value = false
      monitorBindingDevice.value = null
      monitorBindingHoles.value = []
      monitorBindingHoleId.value = null
      await dispatchMonitorForDevice(device, { ...hole, upper_device_id: device.id, upperDevice: device })
    }
  } catch (error) {
    monitorBindingError.value = error.response?.data?.message || '绑定测孔失败'
  } finally {
    monitorBindingSubmitting.value = false
  }
}

async function startMonitorForDevice(device) {
  if (!device?.id) {
    syncFeedback.value = { type: 'error', text: '上位机不存在，无法启动监测' }
    return
  }

  const activeTask = getActiveMonitorTask(device.id)
  if (activeTask) {
    syncFeedback.value = {
      type: 'error',
      text: `上位机 ${device.imei} 已存在进行中的监测任务 ${activeTask.taskId}，请先取消后再重试`
    }
    return
  }

  monitorStartingMap.value = { ...monitorStartingMap.value, [device.id]: true }
  syncFeedback.value = { type: '', text: '' }
  try {
    const hole = await findBoundHoleForDevice(device.id)
    if (!hole) {
      monitorStartingMap.value = { ...monitorStartingMap.value, [device.id]: false }
      await openMonitorBindingGuide(device)
      return
    }
    await dispatchMonitorForDevice(device, hole)
  } catch (error) {
    console.error('Failed to check upper device hole binding:', error)
    syncFeedback.value = {
      type: 'error',
      text: error.response?.data?.message || '测孔绑定关系检查失败'
    }
    monitorStartingMap.value = { ...monitorStartingMap.value, [device.id]: false }
  }
}

async function loadMonitorTasksForDevices(deviceList = []) {
  const entries = Array.isArray(deviceList) ? deviceList : []
  if (!entries.length) {
    monitorTaskListMap.value = {}
    return
  }

  const taskEntries = await Promise.all(
    entries.map(async (device) => {
      const taskList = await loadMonitorTasksForDevice(device.id, { silent: true })
      return [device.id, taskList]
    })
  )

  monitorTaskListMap.value = Object.fromEntries(taskEntries)
}

function getMonitorTasks(deviceId) {
  return monitorTaskListMap.value[deviceId] || []
}

function getTaskType(task = {}) {
  const metadataType = String(task.metadata?.taskType || task.requestPayload?.taskType || '').trim()
  if (metadataType) {
    return metadataType
  }

  return taskTypeByCommand[String(task.commandText || '').trim()] || 'monitor_start'
}

function getTaskTypeText(task) {
  const taskType = getTaskType(task)
  return taskTypeTextMap[taskType] || taskType || '-'
}

function getActiveMonitorTask(deviceId) {
  return getMonitorTasks(deviceId).find(task => (
    getTaskType(task) === 'monitor_start' && isRunningTaskStatus(task?.status)
  )) || null
}

function hasActiveMonitorTask(deviceId) {
  return Boolean(getActiveMonitorTask(deviceId))
}

function closeTaskDialog() {
  showTaskDialog.value = false
  taskDetailDevice.value = null
  taskHistoryList.value = []
  taskDetailLoading.value = false
}

async function openTaskDialog(device) {
  taskDetailDevice.value = device
  taskHistoryList.value = getMonitorTasks(device.id)
  taskDetailLoading.value = true
  showTaskDialog.value = true

  try {
    taskHistoryList.value = await loadMonitorTasksForDevice(device.id, { limit: 50 })
  } catch (error) {
    console.error('Failed to open monitor task detail:', error)
  } finally {
    taskDetailLoading.value = false
  }
}

async function cancelMonitorTask(task, device = taskDetailDevice.value) {
  if (!task?.taskId) {
    return
  }

  monitorCancellingMap.value = {
    ...monitorCancellingMap.value,
    [task.taskId]: true
  }

  try {
    const response = await upperDeviceApi.cancelMonitorTask(task.taskId)
    if (response.data.success) {
      syncFeedback.value = {
        type: 'success',
        text: response.data.message || `任务 ${task.taskId} 已取消`
      }

      if (device?.id) {
        const refreshedTasks = await loadMonitorTasksForDevice(device.id, { limit: 50 })
        if (taskDetailDevice.value?.id === device.id) {
          taskHistoryList.value = refreshedTasks
        }
      }
    }
  } catch (error) {
    console.error('Failed to cancel monitor task:', error)
    syncFeedback.value = {
      type: 'error',
      text: error.response?.data?.details || error.response?.data?.message || `任务 ${task.taskId} 取消失败`
    }
  } finally {
    monitorCancellingMap.value = {
      ...monitorCancellingMap.value,
      [task.taskId]: false
    }
  }
}

async function syncFromAdmin({ silent = false } = {}) {
  if (syncingFromAdmin.value) {
    return
  }

  syncingFromAdmin.value = true
  if (!silent) {
    syncFeedback.value = { type: '', text: '' }
  }

  try {
    const response = await upperDeviceApi.syncFromAdmin()
    if (response.data.success) {
      if (!silent) {
        syncFeedback.value = {
          type: 'success',
          text: response.data.message || '同步成功'
        }
      }
    }
  } catch (error) {
    console.error('Failed to sync admin devices:', error)
    if (!silent) {
      syncFeedback.value = {
        type: 'error',
        text: error.response?.data?.message || '同步管理端上位机失败'
      }
    }
  } finally {
    await loadDevices()
    syncingFromAdmin.value = false
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
  filters.value = { network_status: '', keyword: '' }
  pagination.value.page = 1
  loadDevices()
}

function openEditDialog(device) {
  editingDevice.value = device
  formData.value = {
    imei: device.imei,
    device_name: device.device_name || '',
    manufacturer: device.manufacturer || '',
    model: device.model || '',
    serial_number: device.serial_number || '',
    firmware_version: device.firmware_version || '',
    wire_change_mileage: Number(device.wire_change_mileage) || 0,
    inspection_mileage: Number(device.inspection_mileage) || 0,
    status: device.status || 'idle'
  }
  showEditDialog.value = true
}

function openDeleteConfirm(device) {
  deleteTarget.value = device
  showDeleteConfirm.value = true
}

function closeDialogs() {
  showEditDialog.value = false
  showDeleteConfirm.value = false
  editingDevice.value = null
  deleteTarget.value = null
}

function formatBoundHoles(device) {
  const holes = Array.isArray(device.bound_holes) ? device.bound_holes : []
  if (!holes.length) {
    return '未绑定'
  }
  return holes.map(hole => hole.hole_name || hole.hole_number || '-').join('、')
}

async function openHoleBindDialog(device) {
  holeBindDevice.value = device
  holeBindHoleId.value = null
  holeBindOptions.value = []
  holeBindError.value = ''
  holeBindLoading.value = true
  showHoleBindDialog.value = true

  try {
    const response = await api.get('/monitoring-holes', { params: { page: 1, limit: 1000 } })
    if (response.data.success) {
      // 修复说明：可绑定的测孔仅指尚未绑定任何上位机的测孔。
      holeBindOptions.value = (response.data.data?.list || []).filter(hole => !hole.upper_device_id)
    }
  } catch (error) {
    holeBindError.value = error.response?.data?.message || '可绑定测孔加载失败'
  } finally {
    holeBindLoading.value = false
  }
}

function closeHoleBindDialog() {
  if (holeBindSubmitting.value) return
  showHoleBindDialog.value = false
  holeBindDevice.value = null
  holeBindOptions.value = []
  holeBindHoleId.value = null
  holeBindError.value = ''
}

async function bindHole() {
  const device = holeBindDevice.value
  const hole = holeBindOptions.value.find(item => Number(item.id) === Number(holeBindHoleId.value))
  if (!device || !hole) {
    holeBindError.value = '请选择需要绑定的测孔'
    return
  }

  holeBindSubmitting.value = true
  holeBindError.value = ''
  try {
    const response = await api.post(`/monitoring-holes/${hole.id}/bind-device`, {
      upper_device_id: device.id,
      bind_type: 'manual',
      bind_reason: '上位机管理手动绑定测孔'
    })
    if (response.data.success) {
      closeHoleBindDialog()
      await loadDevices()
    }
  } catch (error) {
    holeBindError.value = error.response?.data?.message || '绑定测孔失败'
  } finally {
    holeBindSubmitting.value = false
  }
}

function openHoleUnbindConfirm(hole) {
  unbindHoleTarget.value = hole
  showHoleUnbindConfirm.value = true
}

function closeHoleUnbindConfirm() {
  if (unbindHoleSubmitting.value) return
  showHoleUnbindConfirm.value = false
  unbindHoleTarget.value = null
}

async function unbindHole() {
  const hole = unbindHoleTarget.value
  if (!hole?.id) return

  unbindHoleSubmitting.value = true
  try {
    const response = await api.post(`/monitoring-holes/${hole.id}/unbind-device`)
    if (response.data.success) {
      closeHoleUnbindConfirm()
      await loadDevices()
    }
  } catch (error) {
    alert(error.response?.data?.message || '解绑测孔失败')
  } finally {
    unbindHoleSubmitting.value = false
  }
}

function openCommandDialog(device) {
  commandDevice.value = device
  taskLogs.value = getMonitorTasks(device.id)
  taskLogError.value = ''
  quickTaskLoading.value = ''
  quickTaskFeedback.value = { type: '', text: '' }
  showCommandDialog.value = true
  startTaskLogPolling()
}

function closeCommandDialog() {
  stopTaskLogPolling()
  showCommandDialog.value = false
  commandDevice.value = null
  taskLogs.value = []
  taskLogError.value = ''
  taskLogLoading.value = false
  quickTaskLoading.value = ''
  quickTaskFeedback.value = { type: '', text: '' }
}

function stopTaskLogPolling() {
  if (taskLogTimer) {
    clearInterval(taskLogTimer)
    taskLogTimer = null
  }
}

function startTaskLogPolling() {
  stopTaskLogPolling()
  refreshTaskLogs({ showLoading: true })
  taskLogTimer = setInterval(refreshTaskLogs, 3000)
}

async function refreshTaskLogs({ showLoading = false } = {}) {
  if (!commandDevice.value) return

  if (showLoading) {
    taskLogLoading.value = true
  }
  taskLogError.value = ''

  try {
    const deviceId = commandDevice.value.id
    const response = await upperDeviceApi.getMonitorTasks(deviceId, { limit: 50 })
    if (response.data.success && commandDevice.value?.id === deviceId) {
      const logs = Array.isArray(response.data.data) ? response.data.data : []
      taskLogs.value = logs
      monitorTaskListMap.value = {
        ...monitorTaskListMap.value,
        [deviceId]: logs
      }
    }
  } catch (error) {
    console.error('Failed to load task logs:', error)
    taskLogError.value = error.response?.data?.message || '任务日志获取失败'
  } finally {
    taskLogLoading.value = false
  }
}

function formatTaskPayload(value) {
  if (value === undefined || value === null || value === '') return '-'
  try {
    return JSON.stringify(value, null, 2)
  } catch (error) {
    return String(value)
  }
}

async function executeQuickTask(taskType) {
  if (!commandDevice.value) return

  const taskConfig = {
    homeMove: { action: upperDeviceApi.homeMove, label: '归位' },
    bottomTest: { action: upperDeviceApi.bottomTest, label: '底部检测' },
    statusCheck: { action: upperDeviceApi.statusCheck, label: '状态检查' }
  }[taskType]
  if (!taskConfig) return

  quickTaskLoading.value = taskType
  quickTaskFeedback.value = { type: '', text: '' }

  try {
    const { action, label } = taskConfig
    const response = await action(commandDevice.value.id)

    if (response.data.success) {
      quickTaskFeedback.value = {
        type: 'success',
        text: `${label}任务已创建（任务ID: ${response.data.data?.taskId || '-'}）`
      }
      await refreshTaskLogs()
      const refreshedTasks = taskLogs.value
      if (taskDetailDevice.value?.id === commandDevice.value.id) {
        taskHistoryList.value = refreshedTasks
      }
    }
  } catch (error) {
    console.error(`Failed to execute ${taskType}:`, error)
    quickTaskFeedback.value = {
      type: 'error',
      text: error.response?.data?.message || `${taskConfig.label}任务创建失败`
    }
  } finally {
    quickTaskLoading.value = ''
  }
}

async function updateDevice() {
  try {
    const response = await api.put(`/upper-devices/${editingDevice.value.id}`, formData.value)
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
    const response = await api.delete(`/upper-devices/${deleteTarget.value.id}`)
    if (response.data.success) {
      closeDialogs()
      loadDevices()
    }
  } catch (error) {
    console.error('Failed to delete device:', error)
    alert(error.response?.data?.message || '删除失败')
  }
}

function formatDateTime(dateTime) {
  if (!dateTime) return '-'
  return new Date(dateTime).toLocaleString('zh-CN')
}

function formatTaskHole(task) {
  const holeName = task?.metadata?.holeName || ''
  const holeNo = task?.metadata?.holeNumber || task?.metadata?.holeNo || ''
  if (holeName && holeNo) {
    return `${holeName}（孔号 ${holeNo}）`
  }
  return holeName || holeNo || '-'
}

function getTaskErrorText(task) {
  return task?.errorMessage || task?.resultPayload?.gatewayResult?.err_message || '-'
}

function getTaskResultLogMessages(task = {}) {
  const logs = task.resultPayload?.taskLogs
  return Array.isArray(logs)
    ? logs.filter(log => log?.level !== 'error' && log?.message).map(log => log.message)
    : []
}

function getTaskStatusText(status) {
  return taskStatusTextMap[status] || status || '暂无'
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <div>
        <h1>上位机管理</h1>
        <p v-if="syncFeedback.text" class="sync-feedback" :class="syncFeedback.type">{{ syncFeedback.text }}</p>
      </div>
      <div class="header-actions">
        <label class="auto-refresh-toggle">
          <input type="checkbox" v-model="autoRefresh" @change="toggleAutoRefresh">
          <span class="toggle-slider"></span>
          <span class="toggle-label">自动刷新</span>
        </label>
        <button class="btn-secondary" :disabled="syncingFromAdmin" @click="syncFromAdmin">
          {{ syncingFromAdmin ? '同步中...' : '同步管理端' }}
        </button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="filter-group">
        <label>网络状态</label>
        <select v-model="filters.network_status" @change="filterDevices">
          <option v-for="opt in networkStatusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
      <div class="filter-group">
        <label>搜索</label>
        <input type="text" v-model="filters.keyword" placeholder="IMEI/设备名称" @keyup.enter="filterDevices">
      </div>
      <button class="btn-secondary" @click="filterDevices">搜索</button>
      <button class="btn-text" @click="resetFilters">重置</button>
    </div>

    <div class="table-container" v-if="!loading">
      <table class="data-table">
        <thead>
          <tr>
            <th>IMEI</th>
            <th>设备名称</th>
            <th>网络状态</th>
            <th>设备状态</th>
            <th>里程统计(m)</th>
            <th>绑定测孔</th>
            <th>最后在线时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="device in devices" :key="device.id">
            <td>{{ device.imei }}</td>
            <td>{{ device.device_name || '-' }}</td>
            <td>
              <span class="status-badge" :class="device.network_status === 'online' ? 'online' : 'offline'">
                {{ device.network_status === 'online' ? '在线' : '离线' }}
              </span>
            </td>
            <td>
              <span class="status-badge" :class="statusClassMap[device.status]">
                {{ statusTextMap[device.status] }}
              </span>
            </td>
            <td class="mileage-cell">
              <div>换线：{{ Number(device.wire_change_mileage || 0).toFixed(2) }}</div>
              <div>总计：{{ Number(device.total_mileage || 0).toFixed(2) }}</div>
              <div>检查：{{ Number(device.inspection_mileage || 0).toFixed(2) }}</div>
              <div v-if="device.mileage_warnings?.length" class="mileage-warning">{{ device.mileage_warnings.map(item => item.message).join(' ') }}</div>
            </td>
            <td>
              <span :class="device.bound_holes?.length ? 'bound-hole-text' : 'text-muted'">
                {{ formatBoundHoles(device) }}
              </span>
            </td>
            <td>{{ formatDateTime(device.last_online_time) }}</td>
            <td>
              <div class="action-buttons">
                <button
                  class="btn-icon"
                  title="绑定测孔"
                  @click="openHoleBindDialog(device)">🔗</button>
                <button
                  v-if="device.bound_holes?.length"
                  class="btn-icon"
                  title="解绑测孔"
                  @click="openHoleUnbindConfirm(device.bound_holes[0])">🔓</button>
                <button
                  class="btn-icon"
                  title="查看监测任务"
                  @click="openTaskDialog(device)">📋</button>
                <button
                  class="btn-icon"
                  :disabled="monitorStartingMap[device.id] || hasActiveMonitorTask(device.id)"
                  :title="hasActiveMonitorTask(device.id) ? '当前已有进行中的监测任务，请先取消' : '立即监测'"
                  @click="startMonitorForDevice(device)">{{ monitorStartingMap[device.id] ? '⏳' : '▶️' }}</button>
                <button 
                  class="btn-icon" 
                  title="工作台"
                  @click="openCommandDialog(device)">⚙</button>
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
      <div class="dialog">
        <div class="dialog-header">
          <h3>编辑上位机</h3>
          <button class="dialog-close" @click="closeDialogs">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="form-grid">
            <div class="form-group">
              <label>IMEI <span class="required">*</span></label>
              <input type="text" v-model="formData.imei" disabled>
            </div>
            <div class="form-group">
              <label>设备名称</label>
              <input type="text" v-model="formData.device_name" placeholder="请输入设备名称">
            </div>
            <div class="form-group">
              <label>生产厂商</label>
              <input type="text" v-model="formData.manufacturer" placeholder="请输入生产厂商">
            </div>
            <div class="form-group">
              <label>设备型号</label>
              <input type="text" v-model="formData.model" placeholder="请输入设备型号">
            </div>
            <div class="form-group">
              <label>序列号</label>
              <input type="text" v-model="formData.serial_number" placeholder="请输入序列号">
            </div>
            <div class="form-group">
              <label>固件版本</label>
              <input type="text" v-model="formData.firmware_version" placeholder="请输入固件版本">
            </div>
            <div class="form-group">
              <label>换线预警里程(m)</label>
              <input type="number" v-model="formData.wire_change_mileage" min="0" step="0.01">
            </div>
            <div class="form-group">
              <label>检查预警里程(m)</label>
              <input type="number" v-model="formData.inspection_mileage" min="0" step="0.01">
            </div>
            <div class="form-group">
              <label>设备状态</label>
              <select v-model="formData.status">
                <option value="idle">空闲</option>
                <option value="active">使用中</option>
                <option value="fault">故障</option>
                <option value="calibration_expired">校准过期</option>
              </select>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="closeDialogs">取消</button>
          <button class="btn-primary" @click="updateDevice">保存</button>
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
          <p>确定要删除上位机 <strong>{{ deleteTarget?.imei }}</strong> 吗？此操作不可恢复。</p>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="closeDialogs">取消</button>
          <button class="btn-danger" @click="deleteDevice">删除</button>
        </div>
      </div>
    </div>

    <div class="dialog-overlay" v-if="showHoleBindDialog">
      <div class="dialog dialog-small">
        <div class="dialog-header">
          <div>
            <h3>绑定测孔</h3>
            <p class="dialog-subtitle">{{ holeBindDevice?.device_name || holeBindDevice?.imei || '--' }}</p>
          </div>
          <button class="dialog-close" :disabled="holeBindSubmitting" @click="closeHoleBindDialog">&times;</button>
        </div>
        <div class="dialog-body">
          <p class="hole-bind-tip">选择需要与该上位机绑定的测孔，绑定后不会自动发起监测任务。</p>
          <div v-if="holeBindError" class="monitor-binding-error">{{ holeBindError }}</div>
          <div v-if="holeBindLoading" class="monitor-binding-empty">正在加载可绑定测孔...</div>
          <div v-else-if="!holeBindOptions.length" class="monitor-binding-empty">暂无可绑定的空闲测孔</div>
          <div v-else class="form-group">
            <label>选择测孔 <span class="required">*</span></label>
            <select v-model="holeBindHoleId" :disabled="holeBindSubmitting">
              <option :value="null">请选择测孔</option>
              <option v-for="hole in holeBindOptions" :key="hole.id" :value="hole.id">
                {{ hole.hole_number }} - {{ hole.hole_name || '未命名' }}
              </option>
            </select>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" :disabled="holeBindSubmitting" @click="closeHoleBindDialog">取消</button>
          <button class="btn-primary" :disabled="holeBindLoading || holeBindSubmitting || !holeBindHoleId" @click="bindHole">
            {{ holeBindSubmitting ? '绑定中...' : '绑定' }}
          </button>
        </div>
      </div>
    </div>

    <div class="dialog-overlay" v-if="showHoleUnbindConfirm">
      <div class="dialog dialog-small">
        <div class="dialog-header">
          <h3>确认解绑</h3>
          <button class="dialog-close" :disabled="unbindHoleSubmitting" @click="closeHoleUnbindConfirm">&times;</button>
        </div>
        <div class="dialog-body">
          <p>确定要解绑测孔 <strong>{{ unbindHoleTarget?.hole_name || unbindHoleTarget?.hole_number }}</strong> 吗？</p>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" :disabled="unbindHoleSubmitting" @click="closeHoleUnbindConfirm">取消</button>
          <button class="btn-danger" :disabled="unbindHoleSubmitting" @click="unbindHole">
            {{ unbindHoleSubmitting ? '解绑中...' : '解绑' }}
          </button>
        </div>
      </div>
    </div>

    <div class="dialog-overlay" v-if="showMonitorBindingDialog">
      <div class="dialog dialog-small">
        <div class="dialog-header">
          <div>
            <h3>绑定测孔并开始监测</h3>
            <p class="dialog-subtitle">{{ monitorBindingDevice?.device_name || monitorBindingDevice?.imei || '--' }}</p>
          </div>
          <button class="dialog-close" :disabled="monitorBindingSubmitting" @click="closeMonitorBindingGuide">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="monitor-binding-tip">
            当前上位机尚未绑定测孔。请选择空闲测孔，绑定成功后将自动发起监测任务。
          </div>
          <div v-if="monitorBindingError" class="monitor-binding-error">{{ monitorBindingError }}</div>
          <div v-if="monitorBindingLoading" class="monitor-binding-empty">正在加载可绑定测孔...</div>
          <div v-else-if="!monitorBindingHoles.length" class="monitor-binding-empty">
            暂无空闲测孔，请先在工程管理中新增测孔或解绑已有设备。
          </div>
          <div v-else class="form-group">
            <label>选择测孔 <span class="required">*</span></label>
            <select v-model="monitorBindingHoleId" :disabled="monitorBindingSubmitting">
              <option :value="null">请选择测孔</option>
              <option v-for="hole in monitorBindingHoles" :key="hole.id" :value="hole.id">
                {{ hole.project?.project_name || '未命名工程' }} / {{ hole.hole_name || hole.hole_number || `测孔#${hole.id}` }}（{{ hole.hole_number || '-' }}）
              </option>
            </select>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" :disabled="monitorBindingSubmitting" @click="closeMonitorBindingGuide">取消</button>
          <button
            class="btn-primary"
            :disabled="monitorBindingLoading || monitorBindingSubmitting || !monitorBindingHoles.length"
            @click="bindHoleAndStartMonitor">
            {{ monitorBindingSubmitting ? '处理中...' : '绑定并开始监测' }}
          </button>
        </div>
      </div>
    </div>

    <div class="dialog-overlay" v-if="showCommandDialog">
      <div class="dialog dialog-command">
        <div class="dialog-header">
          <div>
            <h3>工作台</h3>
            <p class="dialog-subtitle">{{ commandDevice?.imei || '--' }}</p>
          </div>
          <button class="dialog-close" @click="closeCommandDialog">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="command-layout">
            <div class="command-panel">
              <div class="command-device-card">
                <div>
                  <div class="command-device-title">目标设备</div>
                  <div class="command-device-imei">{{ commandDevice?.imei || '--' }}</div>
                </div>
                <span class="status-badge" :class="commandDevice?.network_status === 'online' ? 'online' : 'offline'">
                  {{ commandDevice?.network_status === 'online' ? '在线' : '离线' }}
                </span>
              </div>

              <div class="quick-task-section">
                <div class="quick-task-header">
                  <span class="quick-task-title">快捷指令</span>
                  <span class="quick-task-hint">一键下发异步任务，同一设备同一时刻仅允许一个任务</span>
                </div>
                <div class="quick-task-feedback" v-if="quickTaskFeedback.text" :class="quickTaskFeedback.type">
                  {{ quickTaskFeedback.text }}
                </div>
                <div class="quick-task-buttons">
                  <button
                    class="btn-quick-task"
                    :disabled="commandDevice?.network_status !== 'online' || !!quickTaskLoading"
                    @click="executeQuickTask('homeMove')">
                    {{ quickTaskLoading === 'homeMove' ? '执行中...' : '归位' }}
                  </button>
                  <button
                    class="btn-quick-task"
                    :disabled="commandDevice?.network_status !== 'online' || !!quickTaskLoading"
                    @click="executeQuickTask('bottomTest')">
                    {{ quickTaskLoading === 'bottomTest' ? '执行中...' : '底部检测' }}
                  </button>
                  <button
                    class="btn-quick-task"
                    :disabled="commandDevice?.network_status !== 'online' || !!quickTaskLoading"
                    @click="executeQuickTask('statusCheck')">
                    {{ quickTaskLoading === 'statusCheck' ? '执行中...' : '状态检查' }}
                  </button>
                </div>
              </div>
            </div>

            <div class="command-log-panel">
              <div class="command-log-header">
                <div>
                  <div class="command-log-title">任务日志</div>
                  <div class="command-log-tip">展示管理端任务状态、异常信息及交互详情</div>
                </div>
                <button class="btn-text btn-inline" :disabled="taskLogLoading" @click="refreshTaskLogs({ showLoading: true })">刷新</button>
              </div>

              <div class="command-log-error" v-if="taskLogError">
                {{ taskLogError }}
              </div>

              <div class="command-log-list task-log-list">
                <div class="command-log-empty" v-if="!taskLogLoading && !taskLogs.length">
                  当前设备暂无任务日志
                </div>

                <div class="command-log-empty" v-if="taskLogLoading && !taskLogs.length">
                  正在加载任务日志...
                </div>

                <div class="task-log-item" v-for="task in taskLogs" :key="task.taskId">
                  <div class="task-log-summary">
                    <div>
                      <span class="task-status-badge" :class="taskStatusClassMap[task.status]">
                        {{ getTaskStatusText(task.status) }}
                      </span>
                      <span class="task-log-type">{{ getTaskTypeText(task) }}</span>
                    </div>
                    <span class="command-log-time">{{ formatDateTime(task.createdAt) }}</span>
                  </div>
                  <div class="task-log-id">任务 ID：{{ task.taskId || '-' }}</div>
                  <div
                    class="task-log-result"
                    v-for="(message, index) in getTaskResultLogMessages(task)"
                    :key="`${task.taskId}-result-log-${index}`">
                    {{ message }}
                  </div>
                  <div class="task-log-error" v-if="getTaskErrorText(task) !== '-'">
                    {{ getTaskErrorText(task) }}
                  </div>
                  <details class="task-log-details">
                    <summary>查看任务日志详情</summary>
                    <div class="task-log-fields">
                      <div><span>网关任务 ID</span>{{ task.scheduledTaskId || task.sendResponse?.gatewayTaskId || '-' }}</div>
                      <div><span>下发时间</span>{{ formatDateTime(task.sentAt) }}</div>
                      <div><span>完成时间</span>{{ formatDateTime(task.completedAt) }}</div>
                      <div><span>回调状态</span>{{ task.callbackStatus || '-' }}</div>
                    </div>
                    <div class="task-payload-block">
                      <div>请求参数</div>
                      <pre>{{ formatTaskPayload(task.requestPayload) }}</pre>
                    </div>
                    <div class="task-payload-block">
                      <div>下发响应</div>
                      <pre>{{ formatTaskPayload(task.sendResponse) }}</pre>
                    </div>
                    <div class="task-payload-block">
                      <div>执行结果</div>
                      <pre>{{ formatTaskPayload(task.resultPayload) }}</pre>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="closeCommandDialog">关闭</button>
        </div>
      </div>
    </div>

    <div class="dialog-overlay" v-if="showTaskDialog">
      <div class="dialog dialog-task-history">
        <div class="dialog-header">
          <div>
            <h3>监测任务列表</h3>
            <p class="dialog-subtitle">{{ taskDetailDevice?.imei || '--' }}</p>
          </div>
          <button class="dialog-close" @click="closeTaskDialog">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="loading-container" v-if="taskDetailLoading">
            <span class="loading-text">加载中...</span>
          </div>
          <div v-else-if="taskHistoryList.length" class="task-history-list">
            <div v-for="task in taskHistoryList" :key="task.taskId" class="task-history-card">
              <div class="task-history-header">
                <div class="task-history-main">
                  <span class="task-status-badge" :class="taskStatusClassMap[task.status]">
                    {{ getTaskStatusText(task.status) }}
                  </span>
                  <span class="task-history-id">{{ task.taskId || '-' }}</span>
                </div>
                <button
                  v-if="isRunningTaskStatus(task.status)"
                  class="btn-danger btn-task-cancel"
                  :disabled="monitorCancellingMap[task.taskId]"
                  @click="cancelMonitorTask(task, taskDetailDevice)">
                  {{ monitorCancellingMap[task.taskId] ? '取消中...' : '取消任务' }}
                </button>
              </div>

              <div class="task-detail-list">
                <div class="task-detail-item">
                  <span class="task-detail-label">任务类型</span>
                  <span class="task-detail-value">{{ getTaskTypeText(task) }}</span>
                </div>
                <div class="task-detail-item">
                  <span class="task-detail-label">创建时间</span>
                  <span class="task-detail-value">{{ formatDateTime(task.createdAt) }}</span>
                </div>
                <div class="task-detail-item">
                  <span class="task-detail-label">完成时间</span>
                  <span class="task-detail-value">{{ formatDateTime(task.completedAt) }}</span>
                </div>
                <div class="task-detail-item">
                  <span class="task-detail-label">钻孔</span>
                  <span class="task-detail-value">{{ formatTaskHole(task) }}</span>
                </div>
                <div class="task-detail-item">
                  <span class="task-detail-label">任务状态</span>
                  <span class="task-detail-value">{{ getTaskStatusText(task.status) }}</span>
                </div>
                <div class="task-detail-item">
                  <span class="task-detail-label">异常信息</span>
                  <span class="task-detail-value task-detail-error">{{ getTaskErrorText(task) }}</span>
                </div>
              </div>

              <details class="task-log-details">
                <summary>查看任务日志</summary>
                <div class="task-log-content">
                  <div v-if="getTaskResultLogMessages(task).length" class="task-log-messages">
                    <p v-for="(message, index) in getTaskResultLogMessages(task)" :key="index" class="task-log-line">{{ message }}</p>
                  </div>
                  <p v-else class="task-log-empty">暂无执行日志</p>
                  <div class="task-log-meta">
                    <span>网关任务ID：{{ task.scheduledTaskId || task.sendResponse?.gatewayTaskId || '-' }}</span>
                    <span>回调状态：{{ task.callbackStatus || '-' }}</span>
                  </div>
                  <details class="task-payload-details">
                    <summary>查看原始报文</summary>
                    <div class="task-payload-block">
                      <span class="task-payload-label">requestPayload</span>
                      <pre>{{ formatTaskPayload(task.requestPayload) }}</pre>
                    </div>
                    <div class="task-payload-block">
                      <span class="task-payload-label">sendResponse</span>
                      <pre>{{ formatTaskPayload(task.sendResponse) }}</pre>
                    </div>
                    <div class="task-payload-block">
                      <span class="task-payload-label">resultPayload</span>
                      <pre>{{ formatTaskPayload(task.resultPayload) }}</pre>
                    </div>
                  </details>
                </div>
              </details>
            </div>
          </div>
          <div v-else class="command-log-empty">
            当前设备暂无监测任务记录
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="closeTaskDialog">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mileage-cell { min-width: 190px; line-height: 1.65; }
.mileage-warning { margin-top: 4px; color: #b45309; font-size: 12px; line-height: 1.5; }
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
  margin-top: 6px;
  font-size: 14px;
}

.sync-feedback.success {
  color: #047857;
}

.sync-feedback.error {
  color: #dc2626;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.auto-refresh-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.auto-refresh-toggle input {
  display: none;
}

.toggle-slider {
  position: relative;
  width: 44px;
  height: 24px;
  background: #d1d5db;
  border-radius: 12px;
  transition: background 0.3s;
}

.toggle-slider::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  transition: transform 0.3s;
}

.auto-refresh-toggle input:checked + .toggle-slider {
  background: #10b981;
}

.auto-refresh-toggle input:checked + .toggle-slider::after {
  transform: translateX(20px);
}

.toggle-label {
  font-size: 14px;
  color: #4b5563;
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

.status-badge.online {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.offline {
  background: #fee2e2;
  color: #991b1b;
}

.status-idle {
  background: #e5e7eb;
  color: #374151;
}

.status-active {
  background: #d1fae5;
  color: #065f46;
}

.status-maintenance {
  background: #fef3c7;
  color: #92400e;
}

.status-fault {
  background: #fee2e2;
  color: #991b1b;
}

.task-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.task-created {
  background: #e0e7ff;
  color: #3730a3;
}

.task-queued,
.task-polling {
  background: #dbeafe;
  color: #1d4ed8;
}

.task-completed {
  background: #dcfce7;
  color: #166534;
}

.task-failed,
.task-timeout,
.task-skipped {
  background: #fee2e2;
  color: #991b1b;
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

.btn-icon:disabled {
  opacity: 0.3;
  cursor: not-allowed;
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
  width: 600px;
  max-width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.dialog-small {
  width: 400px;
}

.dialog-command {
  width: 1120px;
}

.dialog-task-history {
  width: 760px;
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

.dialog-subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: #6b7280;
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

.monitor-binding-tip,
.hole-bind-tip,
.monitor-binding-error,
.monitor-binding-empty {
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.6;
}

.monitor-binding-tip,
.hole-bind-tip {
  background: #eff6ff;
  color: #1d4ed8;
}

.bound-hole-text {
  color: #065f46;
  font-size: 13px;
  font-weight: 500;
}

.monitor-binding-error {
  background: #fef2f2;
  color: #b91c1c;
}

.monitor-binding-empty {
  border: 1px dashed #d1d5db;
  color: #6b7280;
  text-align: center;
}

.command-layout {
  display: grid;
  grid-template-columns: minmax(260px, 0.65fr) minmax(420px, 1.35fr);
  gap: 20px;
  align-items: start;
}

.command-panel,
.command-log-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.command-device-card,
.command-log-panel {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}

.command-device-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: linear-gradient(135deg, #eff6ff, #f8fafc);
}

.command-device-title {
  font-size: 12px;
  color: #6b7280;
}

.command-device-imei {
  margin-top: 4px;
  font-size: 20px;
  font-weight: 600;
  color: #111827;
}

.quick-task-section {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px 16px;
  background: #f9fafb;
}

.quick-task-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
}

.quick-task-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}

.quick-task-hint {
  font-size: 12px;
  color: #6b7280;
}

.quick-task-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-quick-task {
  padding: 8px 20px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  color: #374151;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-quick-task:hover:not(:disabled) {
  border-color: #3b82f6;
  color: #3b82f6;
  background: #eff6ff;
}

.btn-quick-task:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.quick-task-feedback {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
}

.quick-task-feedback.success {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #86efac;
}

.quick-task-feedback.error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}

.command-log-panel {
  min-height: 100%;
  padding: 16px;
  background: #fcfcfd;
}

.command-log-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.command-log-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.command-log-tip {
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
}

.btn-inline {
  padding: 4px 8px;
}

.command-log-error {
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff7ed;
  color: #c2410c;
  font-size: 13px;
}

.command-log-list {
  height: 520px;
  overflow-y: auto;
  padding-right: 4px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.command-log-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  padding: 20px;
  border: 1px dashed #d1d5db;
  border-radius: 10px;
  color: #6b7280;
  text-align: center;
  font-size: 13px;
  background: #fff;
}

.task-log-item {
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.task-log-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.task-log-type {
  margin-left: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.command-log-time {
  font-size: 12px;
  color: #6b7280;
}

.task-log-id {
  margin-bottom: 8px;
  color: #6b7280;
  font-size: 13px;
  word-break: break-all;
}

.task-log-result {
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #ecfdf5;
  color: #047857;
  font-size: 13px;
  word-break: break-word;
}

.task-log-error {
  margin-bottom: 8px;
  color: #b91c1c;
  font-size: 13px;
  word-break: break-word;
}

.task-log-details summary {
  cursor: pointer;
  color: #2563eb;
  font-size: 13px;
}

/* 任务弹窗内的日志查看区 */
.task-log-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.task-log-messages {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
}

.task-log-line {
  font-size: 12px;
  color: #334155;
  line-height: 1.6;
  word-break: break-word;
  font-family: Consolas, Monaco, monospace;
}

.task-log-empty {
  font-size: 12px;
  color: #9ca3af;
}

.task-log-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
  word-break: break-all;
}

.task-payload-details summary {
  cursor: pointer;
  color: #6b7280;
  font-size: 12px;
  user-select: none;
}

.task-payload-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.task-log-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  margin-top: 12px;
  padding: 10px;
  background: #f3f4f6;
  border-radius: 6px;
  font-size: 12px;
  color: #111827;
}

.task-log-fields div {
  word-break: break-word;
}

.task-log-fields span {
  display: block;
  margin-bottom: 3px;
  color: #6b7280;
}

.task-payload-block {
  margin-top: 10px;
  color: #374151;
  font-size: 12px;
}

.task-payload-block pre {
  max-height: 220px;
  margin: 5px 0 0;
  padding: 10px;
  overflow: auto;
  border-radius: 6px;
  background: #111827;
  color: #f9fafb;
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
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

.task-detail-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-history-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.task-history-card {
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}

.task-history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.task-history-main {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.task-history-id {
  font-size: 13px;
  color: #374151;
  word-break: break-all;
}

.btn-task-cancel {
  padding: 8px 14px;
  font-size: 13px;
}

.task-detail-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.task-detail-label {
  min-width: 84px;
  font-size: 13px;
  color: #6b7280;
}

.task-detail-value {
  flex: 1;
  text-align: right;
  font-size: 14px;
  color: #111827;
  word-break: break-word;
}

.task-detail-error {
  color: #b91c1c;
}

.required {
  color: #ef4444;
}

.loading-container {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.loading-text {
  color: #6b7280;
}

@media (max-width: 1100px) {
  .dialog-command {
    width: 96vw;
  }

  .command-layout {
    grid-template-columns: 1fr;
  }

  .task-log-fields {
    grid-template-columns: 1fr;
  }
}
</style>
