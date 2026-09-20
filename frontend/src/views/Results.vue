<script setup>
import { ref, onMounted, watch } from 'vue'
import api, { projectApi } from '@/services/api'

const resultsList = ref([])
const pagination = ref(null)
const showAllDetailsDialog = ref(false)
const currentDetailResult = ref(null)
const detailRows = ref([])
const projects = ref([])
const filters = ref({
  project_id: '',
  hole_id: '',
  alert_level: '',
  start_time: '',
  end_time: ''
})

const alertLevelOptions = [
  { value: '', label: '全部预警级别' },
  { value: 'normal', label: '正常' },
  { value: 'warning', label: '黄色预警' },
  { value: 'alarm', label: '红色预警' }
]

const alertLevelTextMap = {
  normal: '正常',
  warning: '黄色预警',
  alarm: '红色预警'
}

const alertLevelClassMap = {
  normal: 'alert-normal',
  warning: 'alert-warning',
  alarm: 'alert-danger'
}

async function loadResults(page = 1) {
  try {
    let url = `/results?page=${page}&limit=10`

    if (filters.value.project_id) {
      url += `&project_id=${filters.value.project_id}`
    }
    if (filters.value.hole_id) {
      url += `&hole_id=${filters.value.hole_id}`
    }
    if (filters.value.alert_level) {
      url += `&warning_level=${filters.value.alert_level}`
    }
    if (filters.value.start_time) {
      url += `&start_time=${filters.value.start_time}`
    }
    if (filters.value.end_time) {
      url += `&end_time=${filters.value.end_time}`
    }

    const response = await api.get(url)
    if (response.data.success) {
      // 修复说明：后端聚合结果里的 DECIMAL 字段在运行时可能以字符串返回，列表渲染时若直接调用 toFixed 会抛错；这里先按原语义透传并显式兜底为空数组，避免页面因单个字段类型不符而整表白屏。
      resultsList.value = Array.isArray(response.data.data?.list) ? response.data.data.list : []
      pagination.value = response.data.data.pagination
    }
  } catch (error) {
    console.error('Failed to load results:', error)
  }
}

async function loadProjects() {
  try {
    const response = await projectApi.getProjects({ page: 1, limit: 200 })
    if (response.data.success) {
      projects.value = response.data.data.list || []
    }
  } catch (error) {
    console.error('Failed to load projects:', error)
  }
}

function filterResults() {
  loadResults(1)
}

function changePage(page) {
  loadResults(page)
}

function resetFilters() {
  filters.value = {
    project_id: '',
    hole_id: '',
    alert_level: '',
    start_time: '',
    end_time: ''
  }
  loadResults(1)
}

function formatDateTime(timestamp) {
  if (!timestamp) return '-'
  // 修复说明：后端已统一返回北京时间字符串，这里优先直显，避免前端重复解析再次引入时区偏差。
  if (typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)) {
    return timestamp
  }
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date).replace(/\//g, '-')
}

function formatNumber(value, digits = 4) {
  if (value === undefined || value === null || value === '') return '-'
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : '-'
}

async function viewAllDetails(result) {
  try {
    const response = await api.get(`/results/${result.id}/all-details`)
    if (response.data.success) {
      currentDetailResult.value = response.data.data
      detailRows.value = Array.isArray(response.data.data?.detailRows) ? response.data.data.detailRows : []
      showAllDetailsDialog.value = true
    }
  } catch (error) {
    console.error('Failed to load all result details:', error)
    window.alert(error.response?.data?.message || '加载全部成果数据失败')
  }
}

onMounted(() => {
  loadProjects()
  loadResults()
})
</script>

<template>
  <div class="results-page">
    <div class="page-header">
      <!-- 修复说明：成果数据已拆分为二级目录，这里明确显示当前子页面是“成果数据列表”，避免与趋势图页标题混淆。 -->
      <h1>成果数据列表</h1>
    </div>
    
    <div class="filter-bar-container">
      <div class="filter-bar">
        <select v-model="filters.project_id" @change="filterResults" class="filter-select">
          <option value="">全部工程</option>
          <option v-for="project in projects" :key="project.id" :value="project.id">
            {{ project.project_name }}
          </option>
        </select>
        <input
          type="text"
          v-model="filters.hole_id"
          @change="filterResults"
          placeholder="测孔编号"
          class="filter-input"
        >
        <select v-model="filters.alert_level" @change="filterResults">
          <option v-for="opt in alertLevelOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <label class="date-label">开始时间：</label>
        <input 
          type="datetime-local" 
          v-model="filters.start_time"
          @change="filterResults"
          class="date-input"
        >
        <label class="date-label">结束时间：</label>
        <input 
          type="datetime-local" 
          v-model="filters.end_time"
          @change="filterResults"
          class="date-input"
        >
        <button class="btn-secondary" @click="resetFilters">重置筛选</button>
      </div>
    </div>
    
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>工程名称</th>
            <th>测孔编号</th>
            <th>监测时间</th>
            <th>最大变形值(mm)</th>
            <th>最大深度(m)</th>
            <th>预警级别</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="result in resultsList" :key="result.id">
            <td>{{ result.id }}</td>
            <td>{{ result.project_name || '-' }}</td>
            <td>{{ result.hole_code || '-' }}</td>
            <td>{{ formatDateTime(result.measurement_time) }}</td>
            <!-- 修复说明：最大变形值和最大深度统一走安全数字格式化，兼容后端把 DECIMAL 作为字符串返回的真实情况，避免 toFixed 运行时报错导致列表不显示。 -->
            <td>{{ formatNumber(result.max_displacement, 4) }}</td>
            <td>{{ formatNumber(result.max_depth, 2) }}</td>
            <td>
              <span class="alert-badge" :class="alertLevelClassMap[result.alert_level]">
                {{ alertLevelTextMap[result.alert_level] }}
              </span>
            </td>
            <td>
              <button class="btn-link" @click="viewAllDetails(result)">查看数据</button>
            </td>
          </tr>
          <tr v-if="resultsList.length === 0">
            <td colspan="8" class="no-data">暂无数据</td>
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

    <div v-if="showAllDetailsDialog" class="dialog-overlay">
      <div class="dialog dialog-large">
        <div class="dialog-header">
          <h3>全部成果数据</h3>
          <button class="dialog-close" @click="showAllDetailsDialog = false">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="detail-summary">
            <span>工程：{{ currentDetailResult?.project_name || '-' }}</span>
            <span>测孔：{{ currentDetailResult?.hole_code || '-' }}</span>
            <span>监测时间：{{ formatDateTime(currentDetailResult?.measurement_time) }}</span>
          </div>
          <div class="detail-table-wrap">
            <table class="data-table detail-table">
              <thead>
                <tr>
                  <th>节点号</th>
                  <th>深度</th>
                  <th>本次管形值</th>
                  <th>累计变形值</th>
                  <th>上次管型值</th>
                  <th>本次变形值</th>
                  <th>变形速率</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in detailRows" :key="item.id">
                  <td>{{ item.node ?? '--' }}</td>
                  <td>{{ formatNumber(item.depth, 2) }}</td>
                  <td>{{ formatNumber(item.current_pipe_value, 6) }}</td>
                  <td>{{ formatNumber(item.cumulative_displacement, 6) }}</td>
                  <td>{{ formatNumber(item.previous_pipe_value, 6) }}</td>
                  <td>{{ formatNumber(item.current_displacement, 6) }}</td>
                  <td>{{ formatNumber(item.deformation_rate, 8) }}</td>
                </tr>
                <tr v-if="detailRows.length === 0">
                  <td colspan="7" class="no-data">暂无成果明细</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.results-page {
  width: 100%;
  max-width: none;
  min-width: 0;
}

.page-header {
  display: flex;
  align-items: center;
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

.filter-bar-container {
  margin-bottom: 24px;
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

.alert-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.alert-normal {
  background: #d1fae5;
  color: #065f46;
}

.alert-warning {
  background: #fef3c7;
  color: #92400e;
}

.alert-danger {
  background: #fee2e2;
  color: #991b1b;
}

.btn-link {
  border: none;
  background: none;
  color: #2563eb;
  cursor: pointer;
  padding: 0;
  font-size: 14px;
}

.btn-link:hover {
  color: #1d4ed8;
  text-decoration: underline;
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
  inset: 0;
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
  max-height: 90vh;
  overflow: hidden;
}

.dialog-large {
  max-width: 1280px;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-close {
  border: none;
  background: none;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  color: #6b7280;
}

.dialog-body {
  padding: 24px;
  overflow: auto;
}

.detail-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  margin-bottom: 16px;
  color: #374151;
  font-size: 14px;
}

.detail-table-wrap {
  overflow-x: auto;
}

.detail-table {
  min-width: 980px;
}

</style>
