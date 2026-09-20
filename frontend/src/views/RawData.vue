<script setup>
import { ref, onMounted, watch } from 'vue'
import api, { projectApi, rawDataApi } from '@/services/api'

const loading = ref(false)
const rawDataList = ref([])
const pagination = ref(null)
const projects = ref([])
const holes = ref([])
const filters = ref({
  project_id: '',
  hole_id: '',
  upper_imei: '',
  start_time: '',
  end_time: ''
})
const showPointsDialog = ref(false)
const pointsDialogTitle = ref('')
const pointRows = ref([])

function buildQueryParams(page = 1) {
  const params = {
    page,
    limit: 10
  }

  if (filters.value.project_id) {
    params.project_id = filters.value.project_id
  }
  if (filters.value.hole_id) {
    params.hole_id = filters.value.hole_id
  }
  if (filters.value.upper_imei.trim()) {
    params.upper_imei = filters.value.upper_imei.trim()
  }
  if (filters.value.start_time) {
    params.start_time = filters.value.start_time
  }
  if (filters.value.end_time) {
    params.end_time = filters.value.end_time
  }

  return params
}

async function loadProjects() {
  const response = await projectApi.getProjects({ page: 1, limit: 200 })
  if (response.data.success) {
    projects.value = response.data.data.list || []
  }
}

async function loadHolesByProject(projectId) {
  if (!projectId) {
    holes.value = []
    return
  }

  // 修复说明：客户端原始数据页只需要按工程筛选测孔，这里直接调用后端真实存在的 monitoring-holes 路由，避免继续走旧的 /holes 别名导致下拉数据为空。
  const response = await api.get('/monitoring-holes', { params: { page: 1, limit: 200, project_id: projectId } })
  if (response.data.success) {
    holes.value = response.data.data.list || []
  }
}

async function loadRawData(page = 1) {
  loading.value = true
  try {
    // 修复说明：客户端原始数据页已经切到“任务结果视图”，这里统一查询任务维度的数据结构，而不是旧的逐点原始表结构。
    const response = await api.get('/raw-data', { params: buildQueryParams(page) })
    if (response.data.success) {
      rawDataList.value = response.data.data.list || []
      pagination.value = response.data.data.pagination || null
    }
  } catch (error) {
    console.error('Failed to load raw data:', error)
    rawDataList.value = []
    pagination.value = null
  } finally {
    loading.value = false
  }
}

function searchData() {
  loadRawData(1)
}

function changePage(page) {
  loadRawData(page)
}

function resetFilters() {
  filters.value = {
    project_id: '',
    hole_id: '',
    upper_imei: '',
    start_time: '',
    end_time: ''
  }
  holes.value = []
  loadRawData(1)
}

function formatDateTime(timestamp) {
  if (!timestamp) return '-'

  if (typeof timestamp === 'string') {
    const normalized = timestamp.trim()
    const directMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/)
    if (directMatch) {
      // 修复说明：客户端原始数据监测时间若已带业务侧北京时间文本，不应再按浏览器时区二次转换，否则会额外相差 8 小时。
      return `${directMatch[1]} ${directMatch[2]}`
    }
  }

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  const parts = formatter.formatToParts(date)
  const partMap = Object.fromEntries(parts.map(item => [item.type, item.value]))
  return `${partMap.year}-${partMap.month}-${partMap.day} ${partMap.hour}:${partMap.minute}:${partMap.second}`
}

function formatComputedValue(value, digits = 6) {
  if (value === undefined || value === null || value === '') {
    return '--'
  }

  const parsed = Number(value)
  if (Number.isNaN(parsed)) {
    return '--'
  }

  return parsed.toFixed(digits)
}

function openPointsDialog(title, points = []) {
  // 修复说明：用户确认客户端原始数据列表只保留一个“查看明细”入口，这里统一按深度展示正测值、反测值和4个新增计算字段。
  pointsDialogTitle.value = title
  pointRows.value = Array.isArray(points) ? points : []
  showPointsDialog.value = true
}

function closePointsDialog() {
  showPointsDialog.value = false
  pointsDialogTitle.value = ''
  pointRows.value = []
}

function formatPointActionText(points = []) {
  return Array.isArray(points) && points.length ? `${points.length} 条数据` : '--'
}

async function setInitialPipeValue(row) {
  const measurementUuids = Array.isArray(row?.detailRows)
    ? row.detailRows.map(item => item.measurementUuid).filter(Boolean)
    : []

  if (!measurementUuids.length) {
    window.alert('当前任务缺少原始数据明细，无法设置初始管形值')
    return
  }

  const confirmed = window.confirm(`确认将任务 ${row.taskId} 设置为该测孔的初始管形值吗？`)
  if (!confirmed) {
    return
  }

  try {
    await rawDataApi.setInitialPipe({ measurementUuids })
    window.alert('初始管形值设置成功，成果数据已同步重算')
    await loadRawData(pagination.value?.page || 1)
  } catch (error) {
    console.error('Failed to set initial pipe value:', error)
    window.alert(error.response?.data?.message || '设置初始管形值失败')
  }
}

watch(() => filters.value.project_id, async (projectId) => {
  filters.value.hole_id = ''
  await loadHolesByProject(projectId)
})

onMounted(async () => {
  await loadProjects()
  await loadRawData()
})
</script>

<template>
  <div class="raw-data-page">
    <div class="page-header">
      <h1>原始数据列表</h1>
    </div>
    
    <div class="search-filter-bar">
      <div class="filter-bar">
        <select v-model="filters.project_id" class="filter-input">
          <option value="">全部工程</option>
          <option v-for="project in projects" :key="project.id" :value="project.id">
            {{ project.project_name }}
          </option>
        </select>
        <select v-model="filters.hole_id" class="filter-input" :disabled="!filters.project_id">
          <option value="">全部测孔</option>
          <option v-for="hole in holes" :key="hole.id" :value="hole.id">
            {{ hole.hole_name || hole.hole_number }}
          </option>
        </select>
        <input
          type="text"
          v-model="filters.upper_imei"
          @keyup.enter="searchData"
          placeholder="上位机 IMEI"
          class="filter-input"
        >
      </div>
      
      <div class="filter-bar">
        <label class="date-label">监测开始时间：</label>
        <input 
          type="datetime-local" 
          v-model="filters.start_time"
          class="date-input"
        >
        <label class="date-label">监测结束时间：</label>
        <input 
          type="datetime-local" 
          v-model="filters.end_time"
          class="date-input"
        >
        <button class="btn-search" @click="searchData">筛查</button>
        <button class="btn-secondary" @click="resetFilters">重置筛选</button>
      </div>
    </div>
    
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>关联测孔</th>
            <th>监测时间</th>
            <th>上位机 IMEI</th>
            <th>下位机编号</th>
            <th>节点数</th>
            <th>初始管形值</th>
            <th>查看明细</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="data in rawDataList" :key="data.id">
            <td>{{ data.relatedHole || '-' }}</td>
            <td>{{ formatDateTime(data.measurementTime) }}</td>
            <td>{{ data.upperImei || '-' }}</td>
            <td>{{ data.lowerDeviceCode || '-' }}</td>
            <td>{{ data.nodeNum || 0 }}</td>
            <td>
              <button
                class="btn-inline"
                :class="{ 'is-active': data.hasInitialPipeValue && data.initialPipeBatchNumber === data.detailRows?.[0]?.batchNumber }"
                :disabled="!data.detailRows?.length"
                @click="setInitialPipeValue(data)">
                {{ data.hasInitialPipeValue && data.initialPipeBatchNumber === data.detailRows?.[0]?.batchNumber ? '已设为初始' : '设为初始' }}
              </button>
            </td>
            <td>
              <button
                class="link-button"
                :disabled="!data.detailRows?.length"
                @click="openPointsDialog(data)">
                {{ formatPointActionText(data.detailRows) }}
              </button>
            </td>
          </tr>
          <tr v-if="rawDataList.length === 0 && !loading">
            <td colspan="7" class="no-data">暂无数据</td>
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
    
    <div class="dialog-overlay" v-if="showPointsDialog">
      <div class="dialog">
        <div class="dialog-header">
          <div>
            <h3>{{ pointsDialogTitle }}</h3>
            <p class="dialog-subtitle">按深度展示正测值、反测值及 4 个新增计算字段</p>
          </div>
          <button class="dialog-close" @click="closePointsDialog">&times;</button>
        </div>
        <div class="dialog-body">
          <table class="data-table">
            <thead>
              <tr>
                <th>节点号</th>
                <th>深度(m)</th>
                <th>正测值</th>
                <th>反测值</th>
                <th>Y平均</th>
                <th>倾角α(°)</th>
                <th>深度偏移值Δ(mm)</th>
                <th>深度管形值(mm)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="point in pointRows" :key="point.measurementUuid || point.depth">
                <td>{{ point.node ?? '--' }}</td>
                <td>{{ formatComputedValue(point.depth, 2) }}</td>
                <td>{{ formatComputedValue(point.positiveValue, 0) }}</td>
                <td>{{ formatComputedValue(point.negativeValue, 0) }}</td>
                <td>{{ formatComputedValue(point.yAverage, 1) }}</td>
                <td>{{ formatComputedValue(point.inclinationAngle, 8) }}</td>
                <td>{{ formatComputedValue(point.depthOffset, 2) }}</td>
                <td>{{ formatComputedValue(point.pipeShapeValue, 2) }}</td>
              </tr>
              <tr v-if="!pointRows.length">
                <td colspan="8" class="no-data">暂无点位数据</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="closePointsDialog">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.raw-data-page {
  width: 100%;
  max-width: none;
  min-width: 0;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h1 {
  font-size: 24px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
}

.btn-secondary {
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.btn-secondary:hover {
  background: #e5e7eb;
}

.btn-inline {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #1e293b;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.btn-inline.is-active {
  color: #166534;
  border-color: #86efac;
  background: #dcfce7;
}

.btn-inline:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.search-filter-bar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
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
  align-items: center;
  flex-wrap: wrap;
}

.filter-input {
  padding: 10px 12px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  min-width: 120px;
}

.filter-input:focus {
  border-color: #667eea;
}

.filter-bar select {
  padding: 10px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: white;
  min-width: 130px;
}

.filter-bar select:focus {
  border-color: #667eea;
}

.date-label {
  font-size: 14px;
  color: #374151;
  white-space: nowrap;
}

.date-input {
  padding: 10px 12px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
}

.date-input:focus {
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

.link-button {
  border: none;
  background: none;
  padding: 0;
  color: #2563eb;
  cursor: pointer;
}

.link-button:disabled {
  color: #94a3b8;
  cursor: not-allowed;
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
  width: min(96vw, 1280px);
  max-width: 1280px;
  max-height: 90vh;
  overflow: hidden;
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

.dialog-subtitle {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 13px;
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
  overflow-x: auto;
}

.dialog-body .data-table {
  min-width: 980px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
}

</style>
