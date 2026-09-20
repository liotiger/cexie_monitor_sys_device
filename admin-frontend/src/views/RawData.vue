<script setup>
import { onMounted, ref, watch } from 'vue'
import api from '@/services/api'

const loading = ref(false)
const rows = ref([])
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
  const response = await api.get('/projects')
  projects.value = response.data.data || []
}

async function loadHolesByProject(projectId) {
  if (!projectId) {
    holes.value = []
    return
  }

  // 修复说明：管理端原始数据页筛查口径对齐客户端，这里改为通过工程加载测孔下拉，避免继续靠一个搜索框做模糊匹配。
  const response = await api.get('/monitoring-holes', { params: { project_id: projectId } })
  holes.value = response.data.data || []
}

async function loadRows(page = 1) {
  loading.value = true
  try {
    const response = await api.get('/raw-data', { params: buildQueryParams(page) })
    rows.value = response.data.data.list || []
    pagination.value = response.data.data.pagination || null
  } finally {
    loading.value = false
  }
}

function searchData() {
  loadRows(1)
}

function changePage(page) {
  loadRows(page)
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
  loadRows(1)
}

function openPointsDialog(title, points = []) {
  // 修复说明：管理端原始数据列表现改为单个“查看明细”入口，这里直接展示已合并好的正测值/反测值明细，减少用户来回点两个按钮核对。
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

function formatBeijingDateTime(value) {
  if (!value) {
    return '--'
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    const directMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/)
    if (directMatch) {
      // 修复说明：后端已优先输出北京时间字符串，这里直接复用原值，避免前端二次时区换算导致显示偏差。
      return `${directMatch[1]} ${directMatch[2]}`
    }
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '--'
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

function formatDetailValue(value) {
  if (value === undefined || value === null || value === '') {
    return '--'
  }
  return value
}

watch(() => filters.value.project_id, async (projectId) => {
  filters.value.hole_id = ''
  await loadHolesByProject(projectId)
})

onMounted(async () => {
  await loadProjects()
  await loadRows()
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
          v-model="filters.upper_imei"
          class="filter-input"
          placeholder="上位机 IMEI"
          @keyup.enter="searchData"
        />
      </div>

      <div class="filter-bar">
        <label class="date-label">监测开始时间：</label>
        <input v-model="filters.start_time" type="datetime-local" class="date-input" />
        <label class="date-label">监测结束时间：</label>
        <input v-model="filters.end_time" type="datetime-local" class="date-input" />
        <button class="btn-search" @click="searchData">筛查</button>
        <button class="btn-secondary" @click="resetFilters">重置筛选</button>
      </div>
    </div>

    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>任务ID</th>
            <th>监测时间</th>
            <th>关联测孔</th>
            <th>上位机IMEI</th>
            <th>下位机编号</th>
            <th>节点数</th>
            <th>查看明细</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in rows" :key="item.id">
            <td>{{ item.taskId || '--' }}</td>
            <td>{{ formatBeijingDateTime(item.measurementTime) }}</td>
            <td>{{ item.relatedHole || '--' }}</td>
            <td>{{ item.upperImei || '--' }}</td>
            <td>{{ item.lowerDeviceCode || '--' }}</td>
            <td>{{ item.nodeNum || 0 }}</td>
            <td>
              <button
                class="link-button"
                :disabled="!item.detailRows?.length"
                @click="openPointsDialog(`原始数据明细 - ${item.taskId}`, item.detailRows)">
                {{ formatPointActionText(item.detailRows) }}
              </button>
            </td>
          </tr>
          <tr v-if="rows.length === 0 && !loading">
            <td colspan="7" class="no-data">暂无原始数据</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="pagination" v-if="pagination">
      <span>共 {{ pagination.total }} 条记录</span>
      <div class="page-buttons">
        <button :disabled="pagination.page === 1" @click="changePage(pagination.page - 1)">上一页</button>
        <span>第 {{ pagination.page }} 页</span>
        <button :disabled="pagination.page * pagination.limit >= pagination.total" @click="changePage(pagination.page + 1)">下一页</button>
      </div>
    </div>

    <div v-if="showPointsDialog" class="dialog-overlay">
      <div class="dialog">
        <div class="dialog-header">
          <div>
            <h3>{{ pointsDialogTitle }}</h3>
            <p class="dialog-subtitle">按点位统一展示正测值、反测值明细</p>
          </div>
          <button class="icon-btn" @click="closePointsDialog">&times;</button>
        </div>
        <div class="dialog-body">
          <table class="data-table detail-table">
            <thead>
              <tr>
                <th>数据列表序号</th>
                <th>节点号</th>
                <th>深度(m)</th>
                <th>正测值</th>
                <th>反测值</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="point in pointRows" :key="`${point.idx}-${point.node}-${point.depth}`">
                <td>{{ formatDetailValue(point.idx) }}</td>
                <td>{{ formatDetailValue(point.node) }}</td>
                <td>{{ formatDetailValue(point.depth) }}</td>
                <td>{{ formatDetailValue(point.positiveValue) }}</td>
                <td>{{ formatDetailValue(point.negativeValue) }}</td>
              </tr>
              <tr v-if="!pointRows.length">
                <td colspan="5" class="no-data">暂无点位数据</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.raw-data-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header h1 {
  margin: 0;
  font-size: 24px;
  color: #0f172a;
}

.search-filter-bar,
.table-container,
.pagination {
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.search-filter-bar {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.filter-input,
.date-input,
.filter-bar select {
  min-width: 160px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  outline: none;
  background: #fff;
}

.filter-input:focus,
.date-input:focus,
.filter-bar select:focus {
  border-color: #2563eb;
}

.date-label {
  color: #475569;
  font-size: 14px;
  white-space: nowrap;
}

.btn-search,
.btn-secondary {
  border: none;
  border-radius: 10px;
  padding: 10px 16px;
  font-size: 14px;
  cursor: pointer;
}

.btn-search {
  background: #2563eb;
  color: #fff;
}

.btn-secondary {
  background: #f1f5f9;
  color: #334155;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 12px 10px;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
  font-size: 14px;
  color: #334155;
}

.data-table th {
  background: #f8fafc;
  color: #64748b;
  font-weight: 600;
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
  padding: 24px !important;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-buttons button {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
}

.page-buttons button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  width: min(96vw, 1180px);
  max-height: 88vh;
  overflow: auto;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.18);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-header h3 {
  margin: 0;
  color: #0f172a;
}

.dialog-subtitle {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 13px;
}

.icon-btn {
  border: none;
  background: transparent;
  font-size: 24px;
  cursor: pointer;
  color: #475569;
}

.dialog-body {
  padding: 18px 20px;
  overflow-x: auto;
}

.detail-table {
  min-width: 720px;
}
</style>
