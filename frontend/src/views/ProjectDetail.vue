<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api, { memberApi } from '@/services/api'
import { useHoleMonitorActions } from '@/composables/useHoleMonitorActions'
import UpperDeviceWorkbench from '@/components/UpperDeviceWorkbench.vue'

const route = useRoute()
const router = useRouter()

const projectId = computed(() => route.params.id)

const project = ref(null)
const progressList = ref([])
const members = ref([])
const holes = ref([])
const activeTab = ref('info')
const upperDevices = ref([])

const showAddProgressDialog = ref(false)
const showAddMemberDialog = ref(false)
const showCreateHoleDialog = ref(false)
const showEditHoleDialog = ref(false)
const showDeleteHoleConfirm = ref(false)
const showBindHoleDialog = ref(false)
const editingProgress = ref(null)
const editingMember = ref(null)
const editingHole = ref(null)
const deletingHole = ref(null)
const bindingHole = ref(null)
const bindSubmitting = ref(false)
const bindError = ref('')
const startMonitorAfterBind = ref(false)
const openWorkbenchAfterBind = ref(false)
const showWorkbench = ref(false)
const workbenchHole = ref(null)
const showTimerDialog = ref(false)
const timerHole = ref(null)
const timerSubmitting = ref(false)
const timerError = ref('')
const holeSearchTerm = ref('')
const holeStatusFilter = ref('')
const holeTypeFilter = ref('')
const holeCurrentPage = ref(1)
const holePageSize = 10

const progressForm = ref({
  progress_description: '',
  progress_date: ''
})

const progressFormErrors = ref({})

const memberForm = ref({
  user_id: '',
  project_role: 'member'
})

const holeForm = ref({
  hole_number: '',
  hole_name: '',
  hole_type: '',
  location_description: '',
  depth: null,
  measurement_interval: 0.5,
  initial_measurement_distance: 0.05,
  calculation_reference: 'bottom',
  warning_yellow_threshold: null,
  warning_red_threshold: null,
  collection_method: 'manual',
  status: 'active'
})

const bindForm = ref({
  upper_device_id: null,
  bind_type: 'manual',
  bind_reason: ''
})

const timerForm = ref({
  timer_enabled: false,
  timer_type: 'interval',
  timer_interval_minutes: 60,
  fixed_times_text: '',
  timer_start_date: '',
  timer_end_date: ''
})

const allUsers = ref([])
const holeFormErrors = ref({})

const statusMap = {
  planning: { label: '规划中', class: 'planning' },
  ongoing: { label: '进行中', class: 'in-progress' },
  completed: { label: '已完成', class: 'completed' },
  paused: { label: '已暂停', class: 'paused' }
}

const holeStatusTextMap = {
  active: '监测中',
  inactive: '停测',
  completed: '已完成',
  warning: '监测中'
}

const holeStatusClassMap = {
  active: 'active',
  inactive: 'inactive',
  completed: 'completed',
  warning: 'active'
}

const holeTypeTextMap = {
  retaining_structure: '围护结构',
  soil_body: '土体'
}

const holeStatusOptions = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '监测中' },
  { value: 'inactive', label: '停测' },
  { value: 'completed', label: '已完成' }
]

const holeTypeOptions = [
  { value: '', label: '全部类型' },
  { value: 'retaining_structure', label: '围护结构' },
  { value: 'soil_body', label: '土体' }
]

const filteredHoles = computed(() => {
  const keyword = holeSearchTerm.value.trim().toLowerCase()

  return holes.value.filter(hole => {
    const matchesKeyword = !keyword || [hole.hole_number, hole.hole_name]
      .some(value => String(value || '').toLowerCase().includes(keyword))
    const matchesStatus = !holeStatusFilter.value || hole.status === holeStatusFilter.value
    const matchesType = !holeTypeFilter.value || hole.hole_type === holeTypeFilter.value
    return matchesKeyword && matchesStatus && matchesType
  })
})

const holeTotalPages = computed(() => Math.max(1, Math.ceil(filteredHoles.value.length / holePageSize)))

const paginatedHoles = computed(() => {
  const start = (holeCurrentPage.value - 1) * holePageSize
  return filteredHoles.value.slice(start, start + holePageSize)
})

watch([holeSearchTerm, holeStatusFilter, holeTypeFilter], () => {
  holeCurrentPage.value = 1
})

watch(holeTotalPages, totalPages => {
  if (holeCurrentPage.value > totalPages) {
    holeCurrentPage.value = totalPages
  }
})

const {
  monitorFeedback,
  monitorStartingMap,
  monitorCancellingMap,
  showTaskDialog,
  taskDetailLoading,
  taskDetailHole,
  taskHistoryList,
  taskStatusClassMap,
  getMonitorTasks,
  getTaskResultLogMessages,
  formatTaskPayload,
  hasActiveMonitorTask,
  getTaskTypeText,
  getTaskStatusText,
  getTaskErrorText,
  loadMonitorTasksForHoles,
  startMonitorForHole,
  openTaskDialog,
  closeTaskDialog,
  cancelMonitorTask
} = useHoleMonitorActions({
  // 工程详情页的测孔列表直接复用监测任务能力，并使用当前详情页的工程主档作为任务上下文。
  resolveProjectSummary: () => project.value || null,
  onPrerequisiteRequired: async ({ type, hole }) => {
    if (type === 'upper-device-binding') {
      await openBindHoleDialog(hole, { startAfterBind: true })
    } else if (type === 'active-monitor-task') {
      await openTaskDialog(hole)
    }
  }
})

async function loadProjectDetail() {
  try {
    const response = await api.get(`/projects/${projectId.value}`)
    if (response.data.success) {
      project.value = response.data.data
    }
  } catch (error) {
    console.error('Failed to load project:', error)
  }
}

async function loadProgress() {
  try {
    const response = await api.get(`/projects/${projectId.value}/progress`)
    if (response.data.success) {
      progressList.value = response.data.data.list || []
    }
  } catch (error) {
    console.error('Failed to load progress:', error)
  }
}

async function loadMembers() {
  try {
    const response = await memberApi.getMembers(projectId.value)
    if (response.data.success) {
      members.value = response.data.data
    }
  } catch (error) {
    console.error('Failed to load members:', error)
  }
}

async function loadAllUsers() {
  try {
    const response = await api.get('/users', { params: { limit: 1000 } })
    if (response.data.success) {
      allUsers.value = response.data.data.list || []
    }
  } catch (error) {
    console.error('Failed to load users:', error)
  }
}

async function loadAvailableUpperDevices() {
  try {
    const response = await api.get('/upper-devices?available_for_hole=true&limit=100')
    if (response.data.success) {
      upperDevices.value = response.data.data.list || []
    }
  } catch (error) {
    console.error('Failed to load available upper devices:', error)
  }
}

async function loadHoles() {
  try {
    const response = await api.get(`/projects/${projectId.value}/holes`)
    if (response.data.success) {
      holes.value = response.data.data || []
      // 修复说明：工程详情的测孔列表需要同步显示任务摘要，因此项目内测孔加载完成后统一预取已绑定上位机的任务列表。
      await loadMonitorTasksForHoles(holes.value)
    }
  } catch (error) {
    console.error('Failed to load holes:', error)
  }
}

function formatWarningThresholds(hole) {
  const yellow = hole?.warning_yellow_threshold ?? null
  const red = hole?.warning_red_threshold ?? null
  return `黄:${yellow ?? '-'} / 红:${red ?? '-'}`
}

function formatTimerText(hole) {
  if (!hole?.timer_enabled) {
    return '未设置'
  }

  if (hole.timer_type === 'fixed_time') {
    const fixedTimes = normalizeFixedTimes(hole.fixed_times)
    return fixedTimes.length ? fixedTimes.join('、') : '固定时间'
  }

  return hole.timer_interval_minutes ? `每${hole.timer_interval_minutes}分钟` : '间隔执行'
}

function normalizeFixedTimes(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean)
  }
  if (!value) {
    return []
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.map(item => String(item).trim()).filter(Boolean)
      }
    } catch {
      // Non-JSON values are accepted as a comma-separated list for legacy records.
    }
    return value.split(/[,，]/).map(item => item.trim()).filter(Boolean)
  }
  return []
}

function resetHoleFilters() {
  holeSearchTerm.value = ''
  holeStatusFilter.value = ''
  holeTypeFilter.value = ''
}

function openTimerDialog(hole) {
  timerHole.value = hole
  timerError.value = hole.collection_method === 'auto'
    ? ''
    : '只有采集方式为“自动”的测孔才能设置定时器，请先编辑测孔并调整采集方式。'
  timerForm.value = {
    timer_enabled: hole.timer_enabled === true,
    timer_type: hole.timer_type || 'interval',
    timer_interval_minutes: hole.timer_interval_minutes || 60,
    fixed_times_text: normalizeFixedTimes(hole.fixed_times).join(', '),
    timer_start_date: hole.timer_start_date ? String(hole.timer_start_date).slice(0, 10) : '',
    timer_end_date: hole.timer_end_date ? String(hole.timer_end_date).slice(0, 10) : ''
  }
  showTimerDialog.value = true
}

function closeTimerDialog() {
  showTimerDialog.value = false
  timerHole.value = null
  timerError.value = ''
}

async function saveTimer() {
  if (!timerHole.value?.id || timerHole.value.collection_method !== 'auto') {
    return
  }

  timerError.value = ''
  const form = timerForm.value
  const fixedTimes = normalizeFixedTimes(form.fixed_times_text)

  if (form.timer_enabled && form.timer_type === 'interval' && Number(form.timer_interval_minutes) <= 0) {
    timerError.value = '执行间隔必须大于 0 分钟。'
    return
  }
  if (form.timer_enabled && form.timer_type === 'fixed_time' && fixedTimes.length === 0) {
    timerError.value = '请至少填写一个固定执行时间。'
    return
  }
  if (form.timer_start_date && form.timer_end_date && form.timer_start_date > form.timer_end_date) {
    timerError.value = '结束日期不能早于开始日期。'
    return
  }

  const payload = {
    timer_enabled: form.timer_enabled,
    timer_type: form.timer_type,
    timer_start_date: form.timer_start_date || null,
    timer_end_date: form.timer_end_date || null
  }
  if (form.timer_type === 'interval') {
    payload.timer_interval_minutes = Number(form.timer_interval_minutes)
  } else {
    payload.fixed_times = fixedTimes
  }

  timerSubmitting.value = true
  try {
    const response = await api.put(`/monitoring-holes/${timerHole.value.id}/timer`, payload)
    if (response.data.success) {
      closeTimerDialog()
      await loadHoles()
    }
  } catch (error) {
    console.error('Failed to set timer in project detail:', error)
    timerError.value = error.response?.data?.message || '设置定时器失败'
  } finally {
    timerSubmitting.value = false
  }
}

function openEditHoleDialog(hole) {
  editingHole.value = hole
  holeForm.value = {
    hole_number: hole.hole_number || '',
    hole_name: hole.hole_name || '',
    hole_type: hole.hole_type || '',
    location_description: hole.location_description || '',
    depth: hole.depth,
    measurement_interval: hole.measurement_interval ?? 0.5,
    initial_measurement_distance: hole.initial_measurement_distance ?? 0.05,
    calculation_reference: hole.calculation_reference || 'bottom',
    warning_yellow_threshold: hole.warning_yellow_threshold,
    warning_red_threshold: hole.warning_red_threshold,
    collection_method: hole.collection_method || 'manual',
    status: hole.status || 'active'
  }
  holeFormErrors.value = {}
  showCreateHoleDialog.value = false
  showEditHoleDialog.value = true
}

function openCreateHoleDialog() {
  editingHole.value = null
  holeForm.value = {
    hole_number: '',
    hole_name: '',
    hole_type: '',
    location_description: '',
    depth: null,
    measurement_interval: 0.5,
    initial_measurement_distance: 0.05,
    calculation_reference: 'bottom',
    warning_yellow_threshold: null,
    warning_red_threshold: null,
    collection_method: 'manual',
    status: 'active'
  }
  holeFormErrors.value = {}
  showEditHoleDialog.value = false
  showCreateHoleDialog.value = true
}

function closeHoleFormDialog() {
  showCreateHoleDialog.value = false
  showEditHoleDialog.value = false
  editingHole.value = null
  holeFormErrors.value = {}
}

function openDeleteHoleConfirm(hole) {
  deletingHole.value = hole
  showDeleteHoleConfirm.value = true
}

async function openBindHoleDialog(hole, { startAfterBind = false, workbenchAfterBind = false } = {}) {
  bindingHole.value = hole
  startMonitorAfterBind.value = startAfterBind
  openWorkbenchAfterBind.value = workbenchAfterBind
  bindError.value = ''
  bindForm.value = {
    upper_device_id: null,
    bind_type: 'manual',
    bind_reason: startAfterBind
      ? '开始监测前绑定上位机'
      : workbenchAfterBind ? '打开工作台前绑定上位机' : ''
  }
  // 工程详情页直接在测孔列表内完成绑定，沿用统一的可绑定上位机查询口径。
  await loadAvailableUpperDevices()
  showBindHoleDialog.value = true
}

function closeBindHoleDialog() {
  showBindHoleDialog.value = false
  bindingHole.value = null
  startMonitorAfterBind.value = false
  openWorkbenchAfterBind.value = false
  bindError.value = ''
}

function getSelectedUpperDevice() {
  return upperDevices.value.find(device => Number(device.id) === Number(bindForm.value.upper_device_id)) || null
}

function getHoleUpperDevice(hole = {}) {
  if (!hole?.upper_device_id) return null
  return hole.upperDevice || {
    id: hole.upper_device_id,
    imei: `上位机#${hole.upper_device_id}`,
    network_status: 'offline'
  }
}

async function openHoleWorkbench(hole = {}) {
  if (!hole?.upper_device_id) {
    await openBindHoleDialog(hole, { workbenchAfterBind: true })
    return
  }

  workbenchHole.value = hole
  showWorkbench.value = true
}

function closeHoleWorkbench() {
  showWorkbench.value = false
  workbenchHole.value = null
}

function handleWorkbenchTaskCreated() {
  loadMonitorTasksForHoles(holes.value)
}

function validateHoleForm() {
  holeFormErrors.value = {}
  let isValid = true

  if (!holeForm.value.hole_number || holeForm.value.hole_number.trim() === '') {
    holeFormErrors.value.hole_number = '测孔编号不能为空'
    isValid = false
  } else if (holeForm.value.hole_number.length > 50) {
    holeFormErrors.value.hole_number = '测孔编号不能超过50个字符'
    isValid = false
  }

  if (!holeForm.value.hole_type) {
    holeFormErrors.value.hole_type = '请选择测孔类型'
    isValid = false
  }

  if (holeForm.value.depth === null || holeForm.value.depth === undefined || holeForm.value.depth === '') {
    holeFormErrors.value.depth = '深度不能为空'
    isValid = false
  } else if (Number(holeForm.value.depth) < 0) {
    holeFormErrors.value.depth = '深度不能为负数'
    isValid = false
  }

  if (holeForm.value.warning_yellow_threshold !== null && holeForm.value.warning_yellow_threshold !== '' && Number(holeForm.value.warning_yellow_threshold) < 0) {
    holeFormErrors.value.warning_yellow_threshold = '黄色预警最大变形值不能为负数'
    isValid = false
  }

  if (holeForm.value.warning_red_threshold !== null && holeForm.value.warning_red_threshold !== '' && Number(holeForm.value.warning_red_threshold) < 0) {
    holeFormErrors.value.warning_red_threshold = '红色预警最大变形值不能为负数'
    isValid = false
  }

  if (
    holeForm.value.warning_yellow_threshold !== null && holeForm.value.warning_yellow_threshold !== '' &&
    holeForm.value.warning_red_threshold !== null && holeForm.value.warning_red_threshold !== '' &&
    Number(holeForm.value.warning_red_threshold) < Number(holeForm.value.warning_yellow_threshold)
  ) {
    holeFormErrors.value.warning_red_threshold = '红色预警最大变形值不能小于黄色预警最大变形值'
    isValid = false
  }

  return isValid
}

async function updateHole() {
  if (!editingHole.value?.id || !validateHoleForm()) {
    return
  }

  try {
    const payload = {
      ...holeForm.value,
      // 修复说明：工程详情页中的编辑弹窗只允许维护当前工程下的测孔，因此提交时固定 project_id，避免弹窗编辑误改所属工程。
      project_id: project.value?.id || editingHole.value.project_id
    }
    const response = await api.put(`/monitoring-holes/${editingHole.value.id}`, payload)
    if (response.data.success) {
      closeHoleFormDialog()
      await loadHoles()
    }
  } catch (error) {
    console.error('Failed to update hole in project detail:', error)
    alert(error.response?.data?.message || '更新测孔失败')
  }
}

async function createHole() {
  if (!validateHoleForm()) {
    return
  }

  try {
    const response = await api.post('/monitoring-holes', {
      ...holeForm.value,
      project_id: Number(projectId.value)
    })
    if (response.data.success) {
      closeHoleFormDialog()
      await Promise.all([loadHoles(), loadProjectDetail()])
    }
  } catch (error) {
    console.error('Failed to create hole in project detail:', error)
    alert(error.response?.data?.message || '创建测孔失败')
  }
}

async function deleteHole() {
  if (!deletingHole.value?.id) {
    return
  }

  try {
    const response = await api.delete(`/monitoring-holes/${deletingHole.value.id}`)
    if (response.data.success) {
      showDeleteHoleConfirm.value = false
      await loadHoles()
    }
  } catch (error) {
    console.error('Failed to delete hole in project detail:', error)
    alert(error.response?.data?.message || '删除测孔失败')
  }
}

async function bindHoleDevice() {
  if (!bindingHole.value?.id) {
    return
  }

  const selectedDevice = getSelectedUpperDevice()
  if (!selectedDevice) {
    bindError.value = '请选择需要绑定的上位机'
    return
  }

  if (startMonitorAfterBind.value && String(selectedDevice.network_status || '').toLowerCase() !== 'online') {
    bindError.value = '开始监测需要在线上位机，请选择在线设备'
    return
  }

  const targetHole = bindingHole.value
  const shouldStartMonitor = startMonitorAfterBind.value
  const shouldOpenWorkbench = openWorkbenchAfterBind.value
  bindSubmitting.value = true
  bindError.value = ''
  try {
    const response = await api.post(`/monitoring-holes/${targetHole.id}/bind-device`, bindForm.value)
    if (response.data.success) {
      closeBindHoleDialog()
      await loadHoles()

      const refreshedHole = holes.value.find(hole => Number(hole.id) === Number(targetHole.id)) || {
        ...targetHole,
        upper_device_id: selectedDevice.id,
        upperDevice: selectedDevice
      }
      if (shouldStartMonitor) {
        await startMonitorForHole(refreshedHole)
      } else if (shouldOpenWorkbench) {
        await openHoleWorkbench(refreshedHole)
      }
    }
  } catch (error) {
    console.error('Failed to bind hole device in project detail:', error)
    bindError.value = error.response?.data?.message || '绑定设备失败'
  } finally {
    bindSubmitting.value = false
  }
}

async function unbindHoleDevice(hole) {
  if (!hole?.id) {
    return
  }

  try {
    const response = await api.post(`/monitoring-holes/${hole.id}/unbind-device`)
    if (response.data.success) {
      await loadHoles()
    }
  } catch (error) {
    console.error('Failed to unbind hole device in project detail:', error)
    alert(error.response?.data?.message || '解绑设备失败')
  }
}

function openAddProgressDialog() {
  progressForm.value = {
    progress_description: '',
    progress_date: new Date().toISOString().split('T')[0]
  }
  progressFormErrors.value = {}
  editingProgress.value = null
  showAddProgressDialog.value = true
}

function openEditProgressDialog(progress) {
  editingProgress.value = progress
  progressForm.value = {
    progress_description: progress.progress_description || '',
    progress_date: progress.progress_date ? progress.progress_date.split('T')[0] : ''
  }
  progressFormErrors.value = {}
  showAddProgressDialog.value = true
}

function validateProgressForm() {
  progressFormErrors.value = {}
  let isValid = true
  
  if (!progressForm.value.progress_date) {
    progressFormErrors.value.progress_date = '进度日期不能为空'
    isValid = false
  }
  
  return isValid
}

function openAddMemberDialog() {
  memberForm.value = {
    user_id: '',
    project_role: 'member'
  }
  editingMember.value = null
  showAddMemberDialog.value = true
}

async function createProgress() {
  if (!validateProgressForm()) {
    return
  }
  try {
    const payload = {
      progress_description: progressForm.value.progress_description,
      progress_date: progressForm.value.progress_date
    }
    const response = await api.post(`/projects/${projectId.value}/progress`, payload)
    if (response.data.success) {
      showAddProgressDialog.value = false
      loadProgress()
    }
  } catch (error) {
    console.error('Failed to create progress:', error)
    alert(error.response?.data?.message || '创建进度失败')
  }
}

async function updateProgress() {
  if (!validateProgressForm()) {
    return
  }
  try {
    const payload = {
      progress_description: progressForm.value.progress_description,
      progress_date: progressForm.value.progress_date
    }
    const response = await api.put(`/projects/${projectId.value}/progress/${editingProgress.value.id}`, payload)
    if (response.data.success) {
      showAddProgressDialog.value = false
      loadProgress()
    }
  } catch (error) {
    console.error('Failed to update progress:', error)
    alert(error.response?.data?.message || '更新进度失败')
  }
}

async function deleteProgress(progressId) {
  if (!confirm('确定要删除此进度记录吗？')) return
  try {
    const response = await api.delete(`/projects/${projectId.value}/progress/${progressId}`)
    if (response.data.success) {
      loadProgress()
    }
  } catch (error) {
    console.error('Failed to delete progress:', error)
  }
}

async function addMember() {
  if (!memberForm.value.user_id) {
    alert('请选择用户')
    return
  }
  try {
    const payload = {
      user_id: parseInt(memberForm.value.user_id),
      project_role: memberForm.value.project_role
    }
    const response = await memberApi.addMember(projectId.value, payload)
    if (response.data.success) {
      showAddMemberDialog.value = false
      loadMembers()
    }
  } catch (error) {
    console.error('Failed to add member:', error)
    alert(error.response?.data?.message || '添加成员失败')
  }
}

async function removeMember(memberId) {
  if (!confirm('确定要移除此成员吗？')) return
  try {
    const response = await memberApi.removeMember(memberId)
    if (response.data.success) {
      loadMembers()
    }
  } catch (error) {
    console.error('Failed to remove member:', error)
  }
}

function goBack() {
  router.push('/projects')
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN')
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN')
}

function handleStartMonitor(hole) {
  startMonitorForHole(hole)
}

onMounted(() => {
  loadProjectDetail()
  loadProgress()
  loadMembers()
  loadHoles()
  loadAllUsers()
})
</script>

<template>
  <div class="project-detail">
    <div class="page-header">
      <div class="header-left">
        <button class="btn-back" @click="goBack">← 返回</button>
        <h1>{{ project?.project_name || '项目详情' }}</h1>
        <span class="status-badge" :class="statusMap[project?.status]?.class" v-if="project">
          {{ statusMap[project?.status]?.label }}
        </span>
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
        :class="{ active: activeTab === 'progress' }"
        @click="activeTab = 'progress'"
      >项目进度</button>
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'members' }"
        @click="activeTab = 'members'"
      >项目成员</button>
      <button 
        class="tab-btn" 
        :class="{ active: activeTab === 'holes' }"
        @click="activeTab = 'holes'"
      >测孔列表</button>
    </div>
    
    <div class="tab-content" v-if="activeTab === 'info'">
      <div class="info-card">
        <h2>项目信息</h2>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">项目编号</span>
            <span class="info-value">{{ project?.project_code || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">项目名称</span>
            <span class="info-value">{{ project?.project_name || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">项目位置</span>
            <span class="info-value">{{ project?.location || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">建设单位</span>
            <span class="info-value">{{ project?.client_name || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">施工单位</span>
            <span class="info-value">{{ project?.contractor || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">监理单位</span>
            <span class="info-value">{{ project?.supervisor || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">开始日期</span>
            <span class="info-value">{{ formatDate(project?.start_date) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">结束日期</span>
            <span class="info-value">{{ formatDate(project?.end_date) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">测孔数量</span>
            <span class="info-value">{{ project?.hole_count || 0 }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">成员数量</span>
            <span class="info-value">{{ project?.member_count || 0 }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">创建时间</span>
            <span class="info-value">{{ formatDateTime(project?.created_at) }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <div class="tab-content" v-if="activeTab === 'progress'">
      <div class="section-header">
        <h2>进度时间线</h2>
        <button class="btn-primary" @click="openAddProgressDialog">+ 添加进度</button>
      </div>
      
      <div class="timeline" v-if="progressList.length > 0">
        <div class="timeline-item" v-for="(progress, index) in progressList" :key="progress.id">
          <div class="timeline-marker">
            <div class="marker-dot"></div>
            <div class="marker-line" v-if="index < progressList.length - 1"></div>
          </div>
          <div class="timeline-content">
            <div class="timeline-header">
              <h3>{{ formatDate(progress.progress_date) }}</h3>
            </div>
            <p class="timeline-description" v-if="progress.progress_description">{{ progress.progress_description }}</p>
            <div class="timeline-actions">
              <button class="btn-small" @click="openEditProgressDialog(progress)">编辑</button>
              <button class="btn-small btn-danger" @click="deleteProgress(progress.id)">删除</button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="no-data" v-else>
        <span class="no-data-icon">📋</span>
        <p>暂无进度记录</p>
        <button class="btn-primary" @click="openAddProgressDialog">添加第一条进度</button>
      </div>
    </div>
    
    <div class="tab-content" v-if="activeTab === 'members'">
      <div class="section-header">
        <h2>项目成员</h2>
        <button class="btn-primary" @click="openAddMemberDialog">+ 添加成员</button>
      </div>
      
      <div class="members-grid" v-if="members.length > 0">
        <div class="member-card" v-for="member in members" :key="member.id">
          <div class="member-avatar">
            {{ member.user?.username?.charAt(0).toUpperCase() || 'U' }}
          </div>
          <div class="member-info">
            <h3>{{ member.user?.real_name || member.user?.username || '未知用户' }}</h3>
            <span class="member-role" :class="{ manager: member.project_role === 'manager', viewer: member.project_role === 'viewer' }">
              {{ member.project_role === 'manager' ? '管理员' : member.project_role === 'viewer' ? '查看者' : '成员' }}
            </span>
          </div>
          <button class="btn-icon" title="移除" @click="removeMember(member.id)">🗑️</button>
        </div>
      </div>
      
      <div class="no-data" v-else>
        <span class="no-data-icon">👥</span>
        <p>暂无项目成员</p>
        <button class="btn-primary" @click="openAddMemberDialog">添加第一位成员</button>
      </div>
    </div>
    
    <div class="tab-content" v-if="activeTab === 'holes'">
      <div class="section-header">
        <h2>测孔列表</h2>
        <button class="btn-primary" @click="openCreateHoleDialog">+ 增加测孔</button>
      </div>

      <div class="hole-toolbar">
        <div class="hole-search">
          <input v-model="holeSearchTerm" type="search" placeholder="搜索测孔编号或名称">
        </div>
        <div class="hole-filters">
          <select v-model="holeStatusFilter">
            <option v-for="option in holeStatusOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <select v-model="holeTypeFilter">
            <option v-for="option in holeTypeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <button
            v-if="holeSearchTerm || holeStatusFilter || holeTypeFilter"
            class="btn-secondary"
            @click="resetHoleFilters">
            清除筛选
          </button>
        </div>
      </div>

      <div class="monitor-feedback" v-if="monitorFeedback.text" :class="monitorFeedback.type">
        {{ monitorFeedback.text }}
      </div>
      
      <div class="table-container" v-if="filteredHoles.length > 0">
        <table class="data-table">
          <thead>
            <tr>
              <th>编号</th>
              <th>名称</th>
              <th>测孔类型</th>
              <th>深度(m)</th>
              <th>预警值(mm)</th>
              <th>绑定上位机</th>
              <th>定时器</th>
              <th>状态</th>
              <th>最后测量</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="hole in paginatedHoles" :key="hole.id">
              <td>{{ hole.hole_number }}</td>
              <td>{{ hole.hole_name || '-' }}</td>
              <td>{{ holeTypeTextMap[hole.hole_type] || hole.hole_type || '-' }}</td>
              <td>{{ hole.depth || '-' }}</td>
              <td>{{ formatWarningThresholds(hole) }}</td>
              <td>{{ hole.upperDevice?.device_name || hole.upperDevice?.imei || '未绑定' }}</td>
              <td>{{ formatTimerText(hole) }}</td>
              <td>
                <span class="status-badge" :class="holeStatusClassMap[hole.status] || 'inactive'">
                  {{ holeStatusTextMap[hole.status] || hole.status || '-' }}
                </span>
              </td>
              <td>{{ formatDateTime(hole.last_measurement_time) }}</td>
              <td>
                <div class="hole-action-buttons">
                  <button
                    v-if="hole.upper_device_id"
                    class="btn-icon"
                    title="查看监测任务"
                    @click="openTaskDialog(hole)">📋</button>
                  <button
                    class="btn-icon"
                    :title="hole.upper_device_id ? '工作台' : '工作台（需先绑定上位机）'"
                    @click="openHoleWorkbench(hole)">⚙</button>
                  <button
                    class="btn-icon"
                    :disabled="!!hole.upper_device_id && monitorStartingMap[hole.upper_device_id]"
                    :title="!hole.upper_device_id ? '开始监测（需先绑定上位机）' : hasActiveMonitorTask(hole.upper_device_id) ? '当前已有进行中的监测任务，点击查看并处理' : '开始监测'"
                    @click="handleStartMonitor(hole)">
                    {{ monitorStartingMap[hole.upper_device_id] ? '⏳' : '▶️' }}
                  </button>
                  <button class="btn-icon" title="编辑测孔" @click="openEditHoleDialog(hole)">✏️</button>
                  <button
                    v-if="!hole.upper_device_id"
                    class="btn-icon"
                    title="绑定设备"
                    @click="openBindHoleDialog(hole)">🔗</button>
                  <button
                    v-else
                    class="btn-icon"
                    title="解绑设备"
                    @click="unbindHoleDevice(hole)">🔓</button>
                  <button
                    class="btn-icon"
                    :title="hole.collection_method === 'auto' ? '定时器设置' : '定时器设置（需先将采集方式设为自动）'"
                    @click="openTimerDialog(hole)">⏱️</button>
                  <button class="btn-icon" title="删除测孔" @click="openDeleteHoleConfirm(hole)">🗑️</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="hole-pagination" v-if="filteredHoles.length > 0">
        <span>共 {{ filteredHoles.length }} 条记录</span>
        <div class="page-buttons">
          <button :disabled="holeCurrentPage === 1" @click="holeCurrentPage--">上一页</button>
          <span>第 {{ holeCurrentPage }} / {{ holeTotalPages }} 页</span>
          <button :disabled="holeCurrentPage === holeTotalPages" @click="holeCurrentPage++">下一页</button>
        </div>
      </div>
      
      <div class="no-data" v-if="filteredHoles.length === 0">
        <span class="no-data-icon">🕳️</span>
        <p>{{ holes.length ? '没有符合筛选条件的测孔' : '暂无测孔数据' }}</p>
        <button v-if="holes.length" class="btn-secondary" @click="resetHoleFilters">清除筛选</button>
        <button v-else class="btn-primary" @click="openCreateHoleDialog">增加测孔</button>
      </div>
    </div>

    <div class="dialog-overlay" v-if="showCreateHoleDialog || showEditHoleDialog">
      <div class="dialog dialog-hole">
        <div class="dialog-header">
          <h2>{{ showEditHoleDialog ? '编辑测孔' : '增加测孔' }}</h2>
          <button class="dialog-close" @click="closeHoleFormDialog">×</button>
        </div>
        <div class="dialog-body">
          <div class="form-grid">
            <div class="form-group">
              <label>测孔编号 <span class="required">*</span></label>
              <input type="text" v-model="holeForm.hole_number" :class="{ 'input-error': holeFormErrors.hole_number }" placeholder="请输入测孔编号">
              <span class="error-text" v-if="holeFormErrors.hole_number">{{ holeFormErrors.hole_number }}</span>
            </div>
            <div class="form-group">
              <label>测孔名称</label>
              <input type="text" v-model="holeForm.hole_name" placeholder="请输入测孔名称">
            </div>
            <div class="form-group">
              <label>测孔类型 <span class="required">*</span></label>
              <select v-model="holeForm.hole_type" :class="{ 'input-error': holeFormErrors.hole_type }">
                <option value="">请选择</option>
                <option value="retaining_structure">围护结构</option>
                <option value="soil_body">土体</option>
              </select>
              <span class="error-text" v-if="holeFormErrors.hole_type">{{ holeFormErrors.hole_type }}</span>
            </div>
            <div class="form-group">
              <label>深度(m) <span class="required">*</span></label>
              <input type="number" step="0.1" v-model="holeForm.depth" :class="{ 'input-error': holeFormErrors.depth }" placeholder="请输入深度">
              <span class="error-text" v-if="holeFormErrors.depth">{{ holeFormErrors.depth }}</span>
            </div>
            <div class="form-group">
              <label>测量间隔(m)</label>
              <input type="number" step="0.1" v-model="holeForm.measurement_interval" placeholder="请输入测量间隔">
            </div>
            <div class="form-group">
              <label>初始测量距离(m)</label>
              <input type="number" step="0.01" v-model="holeForm.initial_measurement_distance" placeholder="默认为 0.05">
            </div>
            <div class="form-group">
              <label>计算基准</label>
              <select v-model="holeForm.calculation_reference">
                <option value="bottom">底部</option>
                <option value="top">顶部</option>
              </select>
            </div>
            <div class="form-group">
              <label>黄色预警最大变形值(mm)</label>
              <input type="number" step="0.01" v-model="holeForm.warning_yellow_threshold" :class="{ 'input-error': holeFormErrors.warning_yellow_threshold }" placeholder="请输入黄色预警值">
              <span class="error-text" v-if="holeFormErrors.warning_yellow_threshold">{{ holeFormErrors.warning_yellow_threshold }}</span>
            </div>
            <div class="form-group">
              <label>红色预警最大变形值(mm)</label>
              <input type="number" step="0.01" v-model="holeForm.warning_red_threshold" :class="{ 'input-error': holeFormErrors.warning_red_threshold }" placeholder="请输入红色预警值">
              <span class="error-text" v-if="holeFormErrors.warning_red_threshold">{{ holeFormErrors.warning_red_threshold }}</span>
            </div>
            <div class="form-group">
              <label>采集方式</label>
              <select v-model="holeForm.collection_method">
                <option value="manual">手动</option>
                <option value="auto">自动</option>
              </select>
            </div>
            <div class="form-group">
              <label>测孔状态</label>
              <select v-model="holeForm.status">
                <option value="active">监测中</option>
                <option value="inactive">停测</option>
                <option value="completed">已完成</option>
              </select>
            </div>
            <div class="form-group full-width">
              <label>位置描述</label>
              <textarea v-model="holeForm.location_description" rows="2" placeholder="请输入位置描述"></textarea>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-cancel" @click="closeHoleFormDialog">取消</button>
          <button class="btn-primary" @click="showEditHoleDialog ? updateHole() : createHole()">
            {{ showEditHoleDialog ? '保存' : '创建' }}
          </button>
        </div>
      </div>
    </div>

    <div class="dialog-overlay" v-if="showBindHoleDialog">
      <div class="dialog dialog-small">
        <div class="dialog-header">
          <h2>{{ startMonitorAfterBind ? '绑定上位机并开始监测' : openWorkbenchAfterBind ? '绑定上位机并打开工作台' : '绑定设备' }}</h2>
          <button class="dialog-close" @click="closeBindHoleDialog">×</button>
        </div>
        <div class="dialog-body">
          <div v-if="startMonitorAfterBind" class="monitor-prerequisite-tip">
            测孔 {{ bindingHole?.hole_number || '-' }} 尚未绑定上位机。请选择在线上位机，绑定成功后将自动发起监测任务。
          </div>
          <div v-else-if="openWorkbenchAfterBind" class="monitor-prerequisite-tip">
            测孔 {{ bindingHole?.hole_number || '-' }} 尚未绑定上位机。完成绑定后将自动打开该设备工作台。
          </div>
          <div
            v-if="startMonitorAfterBind && !upperDevices.some(device => String(device.network_status || '').toLowerCase() === 'online')"
            class="monitor-prerequisite-error">
            当前没有可绑定的在线上位机，请先确认设备在线且未绑定其他测孔，然后重新打开绑定引导。
          </div>
          <div v-if="bindError" class="monitor-prerequisite-error">{{ bindError }}</div>
          <div class="form-group">
            <label>选择上位机 <span class="required">*</span></label>
            <select v-model="bindForm.upper_device_id">
              <option :value="null">请选择上位机</option>
              <option
                v-for="device in upperDevices"
                :key="device.id"
                :value="device.id"
                :disabled="startMonitorAfterBind && String(device.network_status || '').toLowerCase() !== 'online'">
                {{ device.device_name || '未命名上位机' }} - {{ device.imei }}（{{ String(device.network_status || '').toLowerCase() === 'online' ? '在线' : '离线' }}）
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>绑定类型</label>
            <select v-model="bindForm.bind_type">
              <option value="manual">手动</option>
              <option value="auto">自动</option>
              <option value="scheduled">定时</option>
            </select>
          </div>
          <div class="form-group">
            <label>绑定原因</label>
            <input type="text" v-model="bindForm.bind_reason" placeholder="请输入绑定原因">
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-cancel" :disabled="bindSubmitting" @click="closeBindHoleDialog">取消</button>
          <button class="btn-primary" :disabled="bindSubmitting" @click="bindHoleDevice">
            {{ bindSubmitting ? '处理中...' : startMonitorAfterBind ? '绑定并开始监测' : openWorkbenchAfterBind ? '绑定并打开工作台' : '绑定' }}
          </button>
        </div>
      </div>
    </div>

    <div class="dialog-overlay" v-if="showDeleteHoleConfirm">
      <div class="dialog dialog-small">
        <div class="dialog-header">
          <h2>确认删除</h2>
          <button class="dialog-close" @click="showDeleteHoleConfirm = false">×</button>
        </div>
        <div class="dialog-body">
          <p>确定要删除测孔 <strong>{{ deletingHole?.hole_number }}</strong> 吗？此操作不可恢复。</p>
        </div>
        <div class="dialog-footer">
          <button class="btn-cancel" @click="showDeleteHoleConfirm = false">取消</button>
          <button class="btn-danger" @click="deleteHole">删除</button>
        </div>
      </div>
    </div>

    <div class="dialog-overlay" v-if="showTimerDialog">
      <div class="dialog dialog-small">
        <div class="dialog-header">
          <div>
            <h2>定时器设置</h2>
            <p class="dialog-subtitle">{{ timerHole?.hole_name || timerHole?.hole_number || '-' }}</p>
          </div>
          <button class="dialog-close" @click="closeTimerDialog">×</button>
        </div>
        <div class="dialog-body">
          <div v-if="timerError" class="monitor-prerequisite-error">{{ timerError }}</div>
          <label class="checkbox-field">
            <input v-model="timerForm.timer_enabled" type="checkbox">
            <span>启用定时器</span>
          </label>
          <template v-if="timerForm.timer_enabled">
            <div class="form-group">
              <label>执行方式</label>
              <select v-model="timerForm.timer_type">
                <option value="interval">间隔执行</option>
                <option value="fixed_time">固定时间执行</option>
              </select>
            </div>
            <div v-if="timerForm.timer_type === 'interval'" class="form-group">
              <label>执行间隔（分钟）</label>
              <input v-model.number="timerForm.timer_interval_minutes" type="number" min="1" step="1">
            </div>
            <div v-else class="form-group">
              <label>固定执行时间</label>
              <input v-model="timerForm.fixed_times_text" type="text" placeholder="例如：08:00, 12:00, 18:00">
              <span class="field-tip">多个时间使用逗号分隔</span>
            </div>
            <div class="form-grid timer-date-grid">
              <div class="form-group">
                <label>开始日期</label>
                <input v-model="timerForm.timer_start_date" type="date">
              </div>
              <div class="form-group">
                <label>结束日期</label>
                <input v-model="timerForm.timer_end_date" type="date">
              </div>
            </div>
          </template>
        </div>
        <div class="dialog-footer">
          <button class="btn-cancel" :disabled="timerSubmitting" @click="closeTimerDialog">取消</button>
          <button
            class="btn-primary"
            :disabled="timerSubmitting || timerHole?.collection_method !== 'auto'"
            @click="saveTimer">
            {{ timerSubmitting ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <div class="dialog-overlay" v-if="showTaskDialog">
      <div class="dialog dialog-task-history">
        <div class="dialog-header">
          <div>
            <h2>监测任务列表</h2>
            <p class="dialog-subtitle">
              {{ taskDetailHole?.hole_name || taskDetailHole?.hole_number || '--' }}
              <span v-if="taskDetailHole?.upperDevice?.imei"> / {{ taskDetailHole.upperDevice.imei }}</span>
            </p>
          </div>
          <button class="dialog-close" @click="closeTaskDialog">×</button>
        </div>
        <div class="dialog-body">
          <div v-if="taskDetailLoading" class="loading-text">加载中...</div>
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
                  v-if="['created', 'queued', 'polling'].includes(String(task.status || ''))"
                  class="btn-danger btn-task-cancel"
                  :disabled="monitorCancellingMap[task.taskId]"
                  @click="cancelMonitorTask(task)">
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
          <div v-else class="no-data">当前测孔暂无监测任务记录</div>
        </div>
        <div class="dialog-footer">
          <button class="btn-cancel" @click="closeTaskDialog">关闭</button>
        </div>
      </div>
    </div>

    <UpperDeviceWorkbench
      v-if="showWorkbench && workbenchHole"
      :device="getHoleUpperDevice(workbenchHole)"
      :hole="workbenchHole"
      @close="closeHoleWorkbench"
      @task-created="handleWorkbenchTaskCreated"
    />
    
    <div class="dialog-overlay" v-if="showAddProgressDialog">
      <div class="dialog">
        <div class="dialog-header">
          <h2>{{ editingProgress ? '编辑进度' : '添加进度' }}</h2>
          <button class="dialog-close" @click="showAddProgressDialog = false">×</button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>日期 <span class="required">*</span></label>
            <input type="date" v-model="progressForm.progress_date" :class="{ 'input-error': progressFormErrors.progress_date }">
            <span class="error-text" v-if="progressFormErrors.progress_date">{{ progressFormErrors.progress_date }}</span>
          </div>
          <div class="form-group">
            <label>进度描述</label>
            <textarea v-model="progressForm.progress_description" placeholder="请输入进度描述" rows="4"></textarea>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-cancel" @click="showAddProgressDialog = false">取消</button>
          <button class="btn-primary" @click="editingProgress ? updateProgress() : createProgress()">
            {{ editingProgress ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>
    
    <div class="dialog-overlay" v-if="showAddMemberDialog">
      <div class="dialog">
        <div class="dialog-header">
          <h2>添加成员</h2>
          <button class="dialog-close" @click="showAddMemberDialog = false">×</button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>选择用户 <span class="required">*</span></label>
            <select v-model="memberForm.user_id">
              <option value="">请选择用户</option>
              <option v-for="user in allUsers" :key="user.id" :value="user.id">
                {{ user.username }} ({{ user.real_name || user.email || user.username }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>项目角色</label>
            <select v-model="memberForm.project_role">
              <option value="member">成员</option>
              <option value="manager">管理员</option>
              <option value="viewer">查看者</option>
            </select>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-cancel" @click="showAddMemberDialog = false">取消</button>
          <button class="btn-primary" @click="addMember">添加</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.project-detail {
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

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.planning {
  background: #e0e7ff;
  color: #3730a3;
}

.status-badge.in-progress {
  background: #fef3c7;
  color: #92400e;
}

.status-badge.completed {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.paused {
  background: #fee2e2;
  color: #991b1b;
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 0;
}

.tab-btn {
  padding: 12px 24px;
  border: none;
  background: none;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
}

.tab-btn:hover {
  color: #374151;
}

.tab-btn.active {
  color: #667eea;
  border-bottom-color: #667eea;
}

.tab-content {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.info-card h2 {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0 0 20px 0;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
}

.info-value {
  font-size: 15px;
  color: #1a1a2e;
  font-weight: 500;
}

.description-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #e5e7eb;
}

.description-section h3 {
  font-size: 14px;
  color: #6b7280;
  margin: 0 0 8px 0;
}

.description-section p {
  font-size: 14px;
  color: #374151;
  line-height: 1.6;
  margin: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.section-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
}

.monitor-feedback {
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 14px;
}

.hole-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.hole-search {
  flex: 1;
  min-width: 220px;
  max-width: 420px;
}

.hole-search input,
.hole-filters select {
  width: 100%;
  height: 38px;
  box-sizing: border-box;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #111827;
  font-size: 14px;
}

.hole-search input {
  padding: 0 12px;
}

.hole-filters {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hole-filters select {
  min-width: 128px;
  padding: 0 10px;
}

.monitor-feedback.success {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #86efac;
}

.monitor-feedback.error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}

.monitor-prerequisite-tip,
.monitor-prerequisite-error {
  margin-bottom: 16px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
}

.monitor-prerequisite-tip {
  color: #1e40af;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}

.monitor-prerequisite-error {
  color: #991b1b;
  background: #fef2f2;
  border: 1px solid #fecaca;
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
  text-decoration: none;
}

.btn-text {
  background: transparent;
  color: #2563eb;
  border: none;
  cursor: pointer;
  text-decoration: none;
}

.btn-secondary {
  min-height: 38px;
  padding: 8px 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  font-size: 14px;
  cursor: pointer;
}

.btn-secondary:hover {
  background: #f3f4f6;
}

.btn-inline {
  padding: 0;
  width: fit-content;
}

.timeline {
  position: relative;
}

.timeline-item {
  display: flex;
  gap: 20px;
  margin-bottom: 24px;
}

.timeline-item:last-child {
  margin-bottom: 0;
}

.timeline-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20px;
}

.marker-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #667eea;
  border: 3px solid #e0e7ff;
  flex-shrink: 0;
}

.marker-line {
  width: 2px;
  flex: 1;
  background: #e5e7eb;
  margin-top: 8px;
}

.timeline-content {
  flex: 1;
  background: #f9fafb;
  border-radius: 8px;
  padding: 16px;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.timeline-header h3 {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
}

.timeline-date {
  font-size: 12px;
  color: #6b7280;
}

.timeline-description {
  font-size: 14px;
  color: #374151;
  line-height: 1.5;
  margin: 0 0 12px 0;
}

.timeline-actions {
  display: flex;
  gap: 8px;
}

.btn-small {
  padding: 4px 12px;
  border: 1px solid #e5e7eb;
  background: white;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.btn-small.btn-danger {
  border-color: #fecaca;
  color: #dc2626;
}

.members-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.member-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
}

.member-avatar {
  width: 44px;
  height: 44px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 18px;
}

.member-info {
  flex: 1;
}

.member-info h3 {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0 0 4px 0;
}

.member-role {
  font-size: 12px;
  color: #6b7280;
  padding: 2px 8px;
  background: #e5e7eb;
  border-radius: 10px;
}

.member-role.manager {
  background: #fef3c7;
  color: #92400e;
}

.member-role.viewer {
  background: #e0e7ff;
  color: #3730a3;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
}

.hole-action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hole-action-buttons .btn-icon {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
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

.task-status-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hole-pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 18px;
  color: #6b7280;
  font-size: 13px;
}

.page-buttons {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-buttons button {
  padding: 7px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  cursor: pointer;
}

.page-buttons button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.status-badge.active {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.inactive {
  background: #fee2e2;
  color: #991b1b;
}

.status-badge.completed {
  background: #dbeafe;
  color: #1d4ed8;
}

.status-badge.warning {
  background: #fef3c7;
  color: #92400e;
}

.no-data {
  text-align: center;
  padding: 40px 20px;
}

.no-data-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 16px;
}

.no-data p {
  color: #6b7280;
  font-size: 16px;
  margin: 0 0 16px 0;
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
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.dialog-task-history {
  max-width: 760px;
}

.dialog-hole {
  max-width: 760px;
}

.dialog-header {
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialog-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
}

.dialog-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: #6b7280;
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

.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 8px;
}

.required {
  color: #ef4444;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  border-color: #667eea;
}

.dialog-footer {
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.checkbox-field {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  color: #374151;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.checkbox-field input {
  width: 16px;
  height: 16px;
  margin: 0;
}

.field-tip {
  display: block;
  margin-top: 6px;
  color: #6b7280;
  font-size: 12px;
}

.timer-date-grid .form-group {
  margin-bottom: 0;
}

.full-width {
  grid-column: 1 / -1;
}

.btn-cancel {
  background: #f3f4f6;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
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

.btn-danger {
  background: #ef4444;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.btn-primary:disabled,
.btn-cancel:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

.task-detail-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
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

/* 任务弹窗内的日志查看区 */
.task-log-details {
  margin-top: 12px;
  border-top: 1px dashed #e5e7eb;
  padding-top: 10px;
}

.task-log-details > summary {
  cursor: pointer;
  font-size: 13px;
  color: #2563eb;
  user-select: none;
}

.task-log-details[open] > summary {
  margin-bottom: 10px;
}

.task-log-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
  font-family: 'JetBrains Mono', Consolas, monospace;
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

.task-payload-details > summary {
  cursor: pointer;
  font-size: 12px;
  color: #6b7280;
  user-select: none;
}

.task-payload-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.task-payload-label {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.task-payload-block pre {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: #0f172a;
  color: #cbd5e1;
  font-size: 12px;
  line-height: 1.6;
  max-height: 260px;
  overflow: auto;
  word-break: break-all;
  white-space: pre-wrap;
}

.loading-text {
  color: #6b7280;
  text-align: center;
  padding: 24px 0;
}

@media (max-width: 760px) {
  .hole-toolbar,
  .hole-filters,
  .hole-pagination {
    align-items: stretch;
    flex-direction: column;
  }

  .hole-search {
    max-width: none;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .full-width {
    grid-column: auto;
  }
}
</style>
