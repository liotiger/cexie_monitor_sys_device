import { onBeforeUnmount, ref } from 'vue'
import { upperDeviceApi } from '@/services/api'

const TASK_REFRESH_INTERVAL_MS = 10000

const TASK_TYPE_TEXT_MAP = Object.freeze({
  monitor_start: '监测',
  home_move: '归位',
  bottom_test: '底部检测',
  set_params: '参数配置',
  status_check: '状态检查'
})

const TASK_TYPE_BY_COMMAND = Object.freeze({
  MONITOR_START: 'monitor_start',
  HOME_MOVE: 'home_move',
  BOTTOM_TEST: 'bottom_test',
  SET_PARAMS: 'set_params',
  STATUS_CHECK: 'status_check'
})

const TASK_STATUS_TEXT_MAP = Object.freeze({
  created: '已创建',
  queued: '已下发',
  polling: '执行中',
  completed: '已完成',
  failed: '失败',
  timeout: '超时',
  skipped: '已跳过'
})

const TASK_STATUS_CLASS_MAP = Object.freeze({
  created: 'task-created',
  queued: 'task-queued',
  polling: 'task-polling',
  completed: 'task-completed',
  failed: 'task-failed',
  timeout: 'task-timeout',
  skipped: 'task-skipped'
})

function buildDeviceKey(deviceId) {
  return String(deviceId || '')
}

function getTaskType(task = {}) {
  const metadataType = String(task.metadata?.taskType || task.requestPayload?.taskType || '').trim()
  if (metadataType) {
    return metadataType
  }

  return TASK_TYPE_BY_COMMAND[String(task.commandText || '').trim()] || 'monitor_start'
}

function normalizeProjectPayload(project = null) {
  if (!project) {
    return null
  }

  return {
    projectId: project.id ?? project.project_id ?? null,
    projectCode: project.project_code || project.projectCode || null,
    projectName: project.project_name || project.projectName || null,
    location: project.location || null,
    clientName: project.client_name || project.clientName || null,
    contractor: project.contractor || null,
    supervisor: project.supervisor || null,
    startDate: project.start_date || project.startDate || null,
    endDate: project.end_date || project.endDate || null,
    status: project.status || null
  }
}

function normalizeHolePayload(hole = {}, deviceId) {
  return {
    holeId: hole.id ?? hole.hole_id ?? null,
    holeNumber: hole.hole_number || hole.holeNumber || null,
    holeName: hole.hole_name || hole.holeName || null,
    holeType: hole.hole_type || hole.holeType || null,
    locationDescription: hole.location_description || hole.locationDescription || null,
    depth: hole.depth ?? null,
    measurementInterval: hole.measurement_interval ?? hole.measurementInterval ?? null,
    // 修复说明：管理端开始监测前要用孔深、测量间隔、初始测量距离反算设备监测节点数，这里一并带上。
    initialMeasurementDistance: hole.initial_measurement_distance ?? hole.initialMeasurementDistance ?? null,
    upperDeviceId: deviceId || null
  }
}

export function useHoleMonitorActions({ resolveProjectSummary, onPrerequisiteRequired } = {}) {
  const monitorFeedback = ref({ type: '', text: '' })
  const monitorTaskLoadingMap = ref({})
  const monitorTaskListMap = ref({})
  const monitorStartingMap = ref({})
  const monitorCancellingMap = ref({})
  const showTaskDialog = ref(false)
  const taskDetailLoading = ref(false)
  const taskDetailHole = ref(null)
  const taskHistoryList = ref([])
  let trackedDeviceIds = []
  let taskRefreshTimer = null
  let taskRefreshInFlight = false

  function isRunningTaskStatus(status) {
    return ['created', 'queued', 'polling'].includes(String(status || ''))
  }

  function getMonitorTasks(deviceId) {
    return monitorTaskListMap.value[buildDeviceKey(deviceId)] || []
  }

  function getMonitorTaskPreview(deviceId) {
    return getMonitorTasks(deviceId).slice(0, 3)
  }

  // 修复说明：测孔列表"监测任务"列原先直接铺开前3条任务明细（含日志性内容），这里改为聚合统计，
  // 按状态口径返回总数/进行中/已完成/异常数量，明细与日志统一收到任务弹窗内查看。
  function getMonitorTaskStats(deviceId) {
    const tasks = getMonitorTasks(deviceId)
    return tasks.reduce((stats, task) => {
      const status = String(task?.status || '')
      stats.total += 1
      if (isRunningTaskStatus(status)) {
        stats.running += 1
      } else if (status === 'completed') {
        stats.completed += 1
      } else if (status === 'failed' || status === 'timeout') {
        stats.failed += 1
      } else if (status === 'skipped') {
        stats.skipped += 1
      }
      return stats
    }, { total: 0, running: 0, completed: 0, failed: 0, skipped: 0 })
  }

  // 修复说明：任务弹窗内查看任务日志，解析 resultPayload.taskLogs 中的执行日志消息（过滤 error 级别），
  // 口径与上位机工作台的日志面板保持一致。
  function getTaskResultLogMessages(task = {}) {
    const logs = task.resultPayload?.taskLogs
    return Array.isArray(logs)
      ? logs.filter(log => log?.level !== 'error' && log?.message).map(log => log.message)
      : []
  }

  function formatTaskPayload(value) {
    if (value === undefined || value === null || value === '') return '-'
    try {
      return JSON.stringify(value, null, 2)
    } catch (error) {
      return String(value)
    }
  }

  function getTaskTypeText(task) {
    const taskType = getTaskType(task)
    return TASK_TYPE_TEXT_MAP[taskType] || taskType || '-'
  }

  function getActiveMonitorTask(deviceId) {
    return getMonitorTasks(deviceId).find(task => (
      getTaskType(task) === 'monitor_start' && isRunningTaskStatus(task?.status)
    )) || null
  }

  function hasActiveMonitorTask(deviceId) {
    return Boolean(getActiveMonitorTask(deviceId))
  }

  function getTaskStatusText(status) {
    return TASK_STATUS_TEXT_MAP[String(status || '')] || status || '-'
  }

  function formatTaskHole(task = {}) {
    return task.holeNo || task.holeNumber || task.metadata?.holeNo || task.metadata?.holeNumber || task.metadata?.holeName || '-'
  }

  function getTaskErrorText(task = {}) {
    return task.errorMessage || task.error_message || task.details || task.message || '-'
  }

  async function loadMonitorTasksForDevice(deviceId, { silent = false, limit = 20 } = {}) {
    const safeDeviceId = Number(deviceId)
    if (!Number.isInteger(safeDeviceId) || safeDeviceId <= 0) {
      return []
    }

    const deviceKey = buildDeviceKey(safeDeviceId)
    if (!silent) {
      monitorTaskLoadingMap.value = {
        ...monitorTaskLoadingMap.value,
        [deviceKey]: true
      }
    }

    try {
      const response = await upperDeviceApi.getMonitorTasks(safeDeviceId, { limit })
      if (response.data.success) {
        const tasks = Array.isArray(response.data.data) ? response.data.data : []
        monitorTaskListMap.value = {
          ...monitorTaskListMap.value,
          [deviceKey]: tasks
        }
        return tasks
      }
    } catch (error) {
      console.error('Failed to load monitor tasks for hole device:', error)
    } finally {
      if (!silent) {
        monitorTaskLoadingMap.value = {
          ...monitorTaskLoadingMap.value,
          [deviceKey]: false
        }
      }
    }

    return []
  }

  async function loadMonitorTasksForHoles(holeList = []) {
    const deviceIds = [...new Set(
      (Array.isArray(holeList) ? holeList : [])
        .map(hole => Number(hole?.upper_device_id || hole?.upperDevice?.id))
        .filter(deviceId => Number.isInteger(deviceId) && deviceId > 0)
    )]

    trackedDeviceIds = deviceIds

    if (!deviceIds.length) {
      monitorTaskListMap.value = {}
      monitorTaskLoadingMap.value = {}
      stopTaskAutoRefresh()
      return
    }

    const taskEntries = await Promise.all(
      deviceIds.map(async (deviceId) => {
        const tasks = await loadMonitorTasksForDevice(deviceId, { silent: true })
        return [buildDeviceKey(deviceId), tasks]
      })
    )

    // 修复说明：测孔列表和工程详情都要按“绑定上位机”显示任务摘要，这里统一按设备维度预加载任务，
    // 避免两个页面各自重复请求和拼装状态，确保“开始监测/查看监测任务”展示口径一致。
    monitorTaskListMap.value = Object.fromEntries(taskEntries)
    startTaskAutoRefresh()
  }

  async function refreshTrackedMonitorTasks() {
    if (taskRefreshInFlight || !trackedDeviceIds.length) {
      return
    }

    taskRefreshInFlight = true
    try {
      await Promise.all(
        trackedDeviceIds.map(deviceId => loadMonitorTasksForDevice(deviceId, { silent: true, limit: 50 }))
      )

      const dialogDeviceId = Number(taskDetailHole.value?.upper_device_id || taskDetailHole.value?.upperDevice?.id)
      if (showTaskDialog.value && Number.isInteger(dialogDeviceId) && dialogDeviceId > 0) {
        taskHistoryList.value = getMonitorTasks(dialogDeviceId)
      }
    } finally {
      taskRefreshInFlight = false
    }
  }

  function startTaskAutoRefresh() {
    if (taskRefreshTimer || !trackedDeviceIds.length) {
      return
    }

    taskRefreshTimer = window.setInterval(refreshTrackedMonitorTasks, TASK_REFRESH_INTERVAL_MS)
  }

  function stopTaskAutoRefresh() {
    if (taskRefreshTimer) {
      window.clearInterval(taskRefreshTimer)
      taskRefreshTimer = null
    }
  }

  onBeforeUnmount(stopTaskAutoRefresh)

  async function startMonitorForHole(hole = {}) {
    const deviceId = Number(hole?.upper_device_id || hole?.upperDevice?.id)
    if (!Number.isInteger(deviceId) || deviceId <= 0) {
      const message = '当前测孔未绑定上位机，请先完成绑定后再开始监测'
      monitorFeedback.value = { type: 'error', text: message }
      if (typeof onPrerequisiteRequired === 'function') {
        await onPrerequisiteRequired({
          type: 'upper-device-binding',
          hole,
          message
        })
      }
      return
    }

    const activeTask = getActiveMonitorTask(deviceId)
    if (activeTask) {
      const message = `当前上位机已有进行中的监测任务 ${activeTask.taskId}，请先取消后再重试`
      monitorFeedback.value = { type: 'error', text: message }
      if (typeof onPrerequisiteRequired === 'function') {
        await onPrerequisiteRequired({
          type: 'active-monitor-task',
          hole,
          task: activeTask,
          message
        })
      }
      return
    }

    const deviceKey = buildDeviceKey(deviceId)
    monitorStartingMap.value = {
      ...monitorStartingMap.value,
      [deviceKey]: true
    }
    monitorFeedback.value = { type: '', text: '' }

    try {
      const projectSummary = typeof resolveProjectSummary === 'function' ? resolveProjectSummary(hole) : null
      const projectPayload = normalizeProjectPayload(projectSummary)
      const holePayload = normalizeHolePayload(hole, deviceId)
      const response = await upperDeviceApi.startMonitor(deviceId, {
        project: projectPayload,
        hole: holePayload,
        metadata: {
          // 修复说明：列表页发起监测时也要把工程/测孔上下文一并透传，便于管理端任务回查和后续查看任务时定位来源。
          triggerSource: 'hole-list',
          projectId: projectPayload?.projectId || null,
          projectCode: projectPayload?.projectCode || null,
          projectName: projectPayload?.projectName || null,
          holeId: holePayload.holeId,
          holeNo: holePayload.holeNumber,
          holeNumber: holePayload.holeNumber,
          holeName: holePayload.holeName,
          holeType: holePayload.holeType
        }
      })

      if (response.data.success) {
        monitorFeedback.value = {
          type: 'success',
          text: response.data.message || `测孔 ${holePayload.holeNumber || '-'} 已发起监测任务`
        }
        await loadMonitorTasksForDevice(deviceId, { limit: 50 })
        if (taskDetailHole.value?.id === hole.id) {
          taskHistoryList.value = getMonitorTasks(deviceId)
        }
      }
    } catch (error) {
      console.error('Failed to start monitor for hole:', error)
      monitorFeedback.value = {
        type: 'error',
        // 修复说明：优先展示客户端后端透传的 details，避免列表页只能看到泛化的失败提示。
        text: error.response?.data?.details || error.response?.data?.message || '开始监测失败'
      }
    } finally {
      monitorStartingMap.value = {
        ...monitorStartingMap.value,
        [deviceKey]: false
      }
    }
  }

  function closeTaskDialog() {
    showTaskDialog.value = false
    taskDetailHole.value = null
    taskHistoryList.value = []
    taskDetailLoading.value = false
  }

  async function openTaskDialog(hole = {}) {
    const deviceId = Number(hole?.upper_device_id || hole?.upperDevice?.id)
    if (!Number.isInteger(deviceId) || deviceId <= 0) {
      monitorFeedback.value = { type: 'error', text: '当前测孔未绑定上位机，暂无监测任务可查看' }
      return
    }

    taskDetailHole.value = hole
    taskHistoryList.value = getMonitorTasks(deviceId)
    taskDetailLoading.value = true
    showTaskDialog.value = true

    try {
      taskHistoryList.value = await loadMonitorTasksForDevice(deviceId, { limit: 50 })
    } catch (error) {
      console.error('Failed to open hole monitor task dialog:', error)
    } finally {
      taskDetailLoading.value = false
    }
  }

  async function cancelMonitorTask(task, hole = taskDetailHole.value) {
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
        monitorFeedback.value = {
          type: 'success',
          text: response.data.message || `任务 ${task.taskId} 已取消`
        }

        const deviceId = Number(hole?.upper_device_id || hole?.upperDevice?.id)
        if (Number.isInteger(deviceId) && deviceId > 0) {
          const refreshedTasks = await loadMonitorTasksForDevice(deviceId, { limit: 50 })
          if (taskDetailHole.value?.id === hole?.id) {
            taskHistoryList.value = refreshedTasks
          }
        }
      }
    } catch (error) {
      console.error('Failed to cancel hole monitor task:', error)
      monitorFeedback.value = {
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

  return {
    monitorFeedback,
    monitorTaskLoadingMap,
    monitorTaskListMap,
    monitorStartingMap,
    monitorCancellingMap,
    showTaskDialog,
    taskDetailLoading,
    taskDetailHole,
    taskHistoryList,
    taskStatusClassMap: TASK_STATUS_CLASS_MAP,
    getMonitorTasks,
    getMonitorTaskPreview,
    getMonitorTaskStats,
    getTaskResultLogMessages,
    formatTaskPayload,
    getTaskTypeText,
    getActiveMonitorTask,
    hasActiveMonitorTask,
    getTaskStatusText,
    formatTaskHole,
    getTaskErrorText,
    loadMonitorTasksForHoles,
    startMonitorForHole,
    openTaskDialog,
    closeTaskDialog,
    cancelMonitorTask
  }
}
