<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { upperDeviceApi } from '@/services/api'

const props = defineProps({
  device: {
    type: Object,
    required: true
  },
  hole: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'task-created'])

const taskLogs = ref([])
const taskLogLoading = ref(false)
const taskLogError = ref('')
const quickTaskLoading = ref('')
const quickTaskFeedback = ref({ type: '', text: '' })
let taskLogTimer = null

const deviceId = computed(() => Number(props.device?.id || props.hole?.upper_device_id))
const deviceOnline = computed(() => String(props.device?.network_status || '').toLowerCase() === 'online')

const taskStatusTextMap = {
  created: '已创建',
  queued: '已下发',
  polling: '执行中',
  completed: '已完成',
  failed: '失败',
  timeout: '超时',
  skipped: '已取消'
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

function getTaskType(task = {}) {
  const metadataType = String(task.metadata?.taskType || task.requestPayload?.taskType || '').trim()
  return metadataType || taskTypeByCommand[String(task.commandText || '').trim()] || 'monitor_start'
}

function getTaskTypeText(task) {
  const type = getTaskType(task)
  return taskTypeTextMap[type] || type || '-'
}

function getTaskStatusText(status) {
  return taskStatusTextMap[status] || status || '-'
}

function getTaskErrorText(task = {}) {
  return task.errorMessage || task.resultPayload?.gatewayResult?.err_message || '-'
}

function getTaskResultLogMessages(task = {}) {
  const logs = task.resultPayload?.taskLogs
  return Array.isArray(logs)
    ? logs.filter(log => log?.level !== 'error' && log?.message).map(log => log.message)
    : []
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN')
}

function formatTaskPayload(value) {
  if (value === undefined || value === null || value === '') return '-'
  try {
    return JSON.stringify(value, null, 2)
  } catch (error) {
    return String(value)
  }
}

async function refreshTaskLogs({ showLoading = false } = {}) {
  const requestedDeviceId = deviceId.value
  if (!Number.isInteger(requestedDeviceId) || requestedDeviceId <= 0) return

  if (showLoading) taskLogLoading.value = true
  taskLogError.value = ''

  try {
    const response = await upperDeviceApi.getMonitorTasks(requestedDeviceId, { limit: 50 })
    if (response.data.success && deviceId.value === requestedDeviceId) {
      taskLogs.value = Array.isArray(response.data.data) ? response.data.data : []
    }
  } catch (error) {
    console.error('Failed to load workbench task logs:', error)
    taskLogError.value = error.response?.data?.message || '任务日志获取失败'
  } finally {
    taskLogLoading.value = false
  }
}

async function executeQuickTask(taskType) {
  if (!deviceOnline.value || quickTaskLoading.value) return

  const taskConfig = {
    homeMove: { label: '归位', action: upperDeviceApi.homeMove },
    bottomTest: { label: '底部检测', action: upperDeviceApi.bottomTest },
    statusCheck: { label: '状态检查', action: upperDeviceApi.statusCheck }
  }[taskType]
  if (!taskConfig) return

  const label = taskConfig.label
  const action = taskConfig.action
  quickTaskLoading.value = taskType
  quickTaskFeedback.value = { type: '', text: '' }

  try {
    const bottomTestPayload = taskType === 'bottomTest' && props.hole ? {
      hole: props.hole,
      metadata: {
        triggerSource: 'client-hole-workbench',
        holeId: props.hole.id ?? props.hole.hole_id ?? null,
        holeNo: props.hole.hole_number || props.hole.holeNumber || null,
        holeNumber: props.hole.hole_number || props.hole.holeNumber || null,
        holeName: props.hole.hole_name || props.hole.holeName || null
      }
    } : undefined
    const response = taskType === 'bottomTest'
      ? await action(deviceId.value, bottomTestPayload)
      : await action(deviceId.value)
    if (response.data.success) {
      quickTaskFeedback.value = {
        type: 'success',
        text: `${label}任务已创建（任务ID: ${response.data.data?.taskId || '-'}）`
      }
      await refreshTaskLogs()
      emit('task-created', { deviceId: deviceId.value, taskType })
    }
  } catch (error) {
    console.error(`Failed to execute ${taskType} from workbench:`, error)
    quickTaskFeedback.value = {
      type: 'error',
      text: error.response?.data?.details || error.response?.data?.message || `${label}任务创建失败`
    }
  } finally {
    quickTaskLoading.value = ''
  }
}

onMounted(() => {
  refreshTaskLogs({ showLoading: true })
  taskLogTimer = window.setInterval(refreshTaskLogs, 3000)
})

onBeforeUnmount(() => {
  if (taskLogTimer) window.clearInterval(taskLogTimer)
})
</script>

<template>
  <div class="workbench-overlay">
    <div class="workbench-dialog">
      <header class="workbench-header">
        <div>
          <h2>工作台</h2>
          <p>
            {{ hole?.hole_number ? `测孔 ${hole.hole_number} · ` : '' }}{{ device?.imei || `上位机#${deviceId}` }}
          </p>
        </div>
        <button class="icon-button close-button" title="关闭" @click="emit('close')">×</button>
      </header>

      <div class="workbench-body">
        <section class="device-panel">
          <div class="device-summary">
            <div>
              <span class="section-label">绑定上位机</span>
              <strong>{{ device?.device_name || device?.imei || `上位机#${deviceId}` }}</strong>
              <small>{{ device?.imei || '-' }}</small>
            </div>
            <span class="network-status" :class="deviceOnline ? 'online' : 'offline'">
              {{ deviceOnline ? '在线' : '离线' }}
            </span>
          </div>

          <div class="quick-section">
            <div class="section-heading">
              <strong>快捷指令</strong>
              <span>通过管理端创建设备任务</span>
            </div>
            <div v-if="quickTaskFeedback.text" class="feedback" :class="quickTaskFeedback.type">
              {{ quickTaskFeedback.text }}
            </div>
            <div class="quick-actions">
              <button
                :disabled="!deviceOnline || !!quickTaskLoading"
                @click="executeQuickTask('homeMove')">
                {{ quickTaskLoading === 'homeMove' ? '执行中...' : '归位' }}
              </button>
              <button
                :disabled="!deviceOnline || !!quickTaskLoading"
                @click="executeQuickTask('bottomTest')">
                {{ quickTaskLoading === 'bottomTest' ? '执行中...' : '底部检测' }}
              </button>
              <button
                :disabled="!deviceOnline || !!quickTaskLoading"
                @click="executeQuickTask('statusCheck')">
                {{ quickTaskLoading === 'statusCheck' ? '执行中...' : '状态检查' }}
              </button>
            </div>
          </div>
        </section>

        <section class="task-panel">
          <div class="task-panel-header">
            <div>
              <strong>任务日志</strong>
              <span>任务状态、异常信息及设备网关交互详情</span>
            </div>
            <button class="text-button" :disabled="taskLogLoading" @click="refreshTaskLogs({ showLoading: true })">刷新</button>
          </div>

          <div v-if="taskLogError" class="log-error">{{ taskLogError }}</div>
          <div class="task-list">
            <div v-if="taskLogLoading && !taskLogs.length" class="empty-state">正在加载任务日志...</div>
            <div v-else-if="!taskLogs.length" class="empty-state">当前设备暂无任务日志</div>

            <article v-for="task in taskLogs" :key="task.taskId" class="task-item">
              <div class="task-summary">
                <div>
                  <span class="task-status" :class="`status-${task.status}`">{{ getTaskStatusText(task.status) }}</span>
                  <strong>{{ getTaskTypeText(task) }}</strong>
                </div>
                <time>{{ formatDateTime(task.createdAt) }}</time>
              </div>
              <div class="task-id">任务 ID：{{ task.taskId || '-' }}</div>
              <div
                v-for="(message, index) in getTaskResultLogMessages(task)"
                :key="`${task.taskId}-result-log-${index}`"
                class="task-result-log">
                {{ message }}
              </div>
              <div v-if="getTaskErrorText(task) !== '-'" class="task-error">{{ getTaskErrorText(task) }}</div>

              <details>
                <summary>查看任务日志详情</summary>
                <div class="detail-grid">
                  <div><span>网关任务 ID</span>{{ task.scheduledTaskId || task.sendResponse?.gatewayTaskId || '-' }}</div>
                  <div><span>下发时间</span>{{ formatDateTime(task.sentAt) }}</div>
                  <div><span>完成时间</span>{{ formatDateTime(task.completedAt) }}</div>
                  <div><span>回调状态</span>{{ task.callbackStatus || '-' }}</div>
                </div>
                <div class="payload-block"><span>请求参数</span><pre>{{ formatTaskPayload(task.requestPayload) }}</pre></div>
                <div class="payload-block"><span>下发响应</span><pre>{{ formatTaskPayload(task.sendResponse) }}</pre></div>
                <div class="payload-block"><span>执行结果</span><pre>{{ formatTaskPayload(task.resultPayload) }}</pre></div>
              </details>
            </article>
          </div>
        </section>
      </div>

      <footer class="workbench-footer">
        <button class="secondary-button" @click="emit('close')">关闭</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.workbench-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.5);
}

.workbench-dialog {
  width: min(1120px, 96vw);
  max-height: 92vh;
  overflow: hidden;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 20px 50px rgba(17, 24, 39, 0.24);
}

.workbench-header,
.workbench-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
}

.workbench-header { border-bottom: 1px solid #e5e7eb; }
.workbench-footer { justify-content: flex-end; border-top: 1px solid #e5e7eb; }
.workbench-header h2 { margin: 0; font-size: 18px; color: #111827; }
.workbench-header p { margin: 4px 0 0; font-size: 13px; color: #6b7280; }

.icon-button {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.close-button { font-size: 24px; color: #6b7280; }

.workbench-body {
  display: grid;
  grid-template-columns: minmax(260px, 0.65fr) minmax(420px, 1.35fr);
  gap: 20px;
  max-height: calc(92vh - 132px);
  padding: 20px;
  overflow: auto;
}

.device-panel { display: flex; flex-direction: column; gap: 16px; }
.device-summary,
.quick-section,
.task-panel { border: 1px solid #e5e7eb; border-radius: 8px; }
.device-summary { display: flex; justify-content: space-between; gap: 12px; padding: 16px; background: #f8fafc; }
.device-summary div { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.device-summary strong { overflow-wrap: anywhere; font-size: 16px; color: #111827; }
.device-summary small,
.section-label { font-size: 12px; color: #6b7280; }

.network-status { align-self: flex-start; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
.network-status.online { background: #d1fae5; color: #065f46; }
.network-status.offline { background: #fee2e2; color: #991b1b; }

.quick-section { padding: 16px; background: #f9fafb; }
.section-heading { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
.section-heading strong { font-size: 14px; color: #111827; }
.section-heading span { font-size: 12px; color: #6b7280; }
.quick-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.quick-actions button,
.secondary-button { padding: 9px 18px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; color: #374151; cursor: pointer; }
.quick-actions button:disabled,
.text-button:disabled { opacity: 0.5; cursor: not-allowed; }

.feedback,
.log-error { margin-bottom: 12px; padding: 10px 12px; border-radius: 6px; font-size: 13px; }
.feedback.success { background: #dcfce7; color: #166534; }
.feedback.error { background: #fee2e2; color: #991b1b; }
.log-error { background: #fff7ed; color: #c2410c; }

.task-panel { min-width: 0; padding: 16px; background: #fcfcfd; }
.task-panel-header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.task-panel-header div { display: flex; flex-direction: column; gap: 4px; }
.task-panel-header strong { font-size: 16px; color: #111827; }
.task-panel-header span { font-size: 12px; color: #6b7280; }
.text-button { align-self: flex-start; padding: 4px 8px; border: 0; background: transparent; color: #2563eb; cursor: pointer; }

.task-list { display: flex; flex-direction: column; gap: 12px; height: 500px; overflow-y: auto; padding-right: 4px; }
.empty-state { display: flex; align-items: center; justify-content: center; min-height: 120px; border: 1px dashed #d1d5db; border-radius: 8px; color: #6b7280; font-size: 13px; }
.task-item { padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; }
.task-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.task-summary div { display: flex; align-items: center; gap: 8px; }
.task-summary strong { font-size: 13px; color: #374151; }
.task-summary time,
.task-id { font-size: 12px; color: #6b7280; }
.task-id { margin-top: 8px; overflow-wrap: anywhere; }
.task-result-log { margin-top: 8px; padding: 8px 10px; border-radius: 6px; background: #ecfdf5; color: #047857; font-size: 13px; overflow-wrap: anywhere; }
.task-error { margin-top: 8px; color: #b91c1c; font-size: 13px; overflow-wrap: anywhere; }
.task-status { padding: 4px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.status-created { background: #e0e7ff; color: #3730a3; }
.status-queued,
.status-polling { background: #dbeafe; color: #1d4ed8; }
.status-completed { background: #dcfce7; color: #166534; }
.status-failed,
.status-timeout,
.status-skipped { background: #fee2e2; color: #991b1b; }

details { margin-top: 10px; }
summary { color: #2563eb; font-size: 13px; cursor: pointer; }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; margin-top: 12px; padding: 10px; border-radius: 6px; background: #f3f4f6; font-size: 12px; }
.detail-grid div { overflow-wrap: anywhere; }
.detail-grid span { display: block; margin-bottom: 3px; color: #6b7280; }
.payload-block { margin-top: 10px; font-size: 12px; color: #374151; }
.payload-block pre { max-height: 220px; margin: 5px 0 0; padding: 10px; overflow: auto; border-radius: 6px; background: #111827; color: #f9fafb; font: 12px/1.5 Consolas, Monaco, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }

@media (max-width: 900px) {
  .workbench-overlay { padding: 12px; }
  .workbench-body { grid-template-columns: 1fr; }
  .task-list { height: min(480px, 55vh); }
}

@media (max-width: 560px) {
  .workbench-body { padding: 14px; }
  .task-summary { align-items: flex-start; flex-direction: column; }
  .detail-grid { grid-template-columns: 1fr; }
}
</style>
