<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import * as echarts from 'echarts'
import api, { resultsApi } from '@/services/api'

const holeOptions = ref([])
const trendSeries = ref([])
const loading = ref(false)
const showHoleDropdown = ref(false)
const hasQueried = ref(false)
const chartRef = ref(null)
const selectedResultId = ref('')
const filters = ref({
  project_id: '',
  hole_ids: [],
  start_time: '',
  end_time: ''
})

const colorPalette = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#059669', '#0891b2', '#4f46e5', '#dc2626']
const chartConfig = Object.freeze({
  // 修复说明：趋势图改用 ECharts 后，仍保留较高的图表高度，保证深度轴和多条曲线有足够展示空间。
  height: 720
})
let trendChartInstance = null

async function loadHoleOptions() {
  try {
    // 修复说明：趋势图筛选直接读取后端真实存在的 /monitoring-holes 接口，避免继续走项目内历史遗留的 /holes 别名导致选项为空。
    const response = await api.get('/monitoring-holes', { params: { page: 1, limit: 200 } })
    if (response.data.success) {
      const rows = Array.isArray(response.data.data?.list) ? response.data.data.list : []
      holeOptions.value = rows.map(item => ({
        id: item.id,
        project_id: item.project_id ? String(item.project_id) : '',
        project_name: item.project?.project_name || '-',
        hole_number: item.hole_number || '-',
        label: `${item.project?.project_name || '-'} / ${item.hole_number || '-'}`
      }))
    }
  } catch (error) {
    console.error('Failed to load hole options:', error)
    holeOptions.value = []
  }
}

async function loadTrendData() {
  loading.value = true
  try {
    const params = {}
    const linkedHoleIds = filters.value.hole_ids.length > 0
      ? filters.value.hole_ids
      : filteredHoleOptions.value.map(item => item.id)
    // 修复说明：查询参数与底部数据列表必须完全联动；当项目已选但测孔未勾选时，这里退化为查询当前项目下全部测孔，避免出现项目筛选与结果数据不一致。
    if (linkedHoleIds.length > 0) {
      params.hole_ids = linkedHoleIds.join(',')
    }
    if (filters.value.start_time) {
      params.start_time = filters.value.start_time
    }
    if (filters.value.end_time) {
      params.end_time = filters.value.end_time
    }

    const response = await resultsApi.getTrendData(params)
    if (response.data.success) {
      // 修复说明：只有真正执行过查询后才展示下方结果区域，便于“重置筛选”时彻底清空趋势图和列表。
      hasQueried.value = true
      const nextTrendSeries = Array.isArray(response.data.data?.list) ? response.data.data.list : []
      trendSeries.value = nextTrendSeries
      // 修复说明：右侧成果列表默认显示最新一条监测成果数据，这里复用后端已按监测时间倒序返回的第一条曲线作为默认选中项。
      selectedResultId.value = nextTrendSeries[0] ? String(nextTrendSeries[0].result_id) : ''
    }
  } catch (error) {
    console.error('Failed to load result trends:', error)
    hasQueried.value = true
    trendSeries.value = []
    // 修复说明：查询失败后同步清空当前曲线联动状态，避免用户继续看到上一批查询残留的成果明细。
    selectedResultId.value = ''
    window.alert(error.response?.data?.message || '加载成果趋势图失败')
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  // 修复说明：按最新交互要求，点击“重置筛选”后必须真正清空项目、测孔和时间条件，而不是恢复默认值。
  filters.value = {
    project_id: '',
    hole_ids: [],
    start_time: '',
    end_time: ''
  }
  showHoleDropdown.value = false
  hasQueried.value = false
  trendSeries.value = []
  // 修复说明：重置筛选时同步清空曲线与列表联动选中态，避免列表误显示上一次查询结果。
  selectedResultId.value = ''
}

function formatDateTime(timestamp) {
  if (!timestamp) return '-'
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

function normalizeResultId(value) {
  return value === undefined || value === null ? '' : String(value)
}

function getSeriesColor(index) {
  return colorPalette[index % colorPalette.length]
}

const selectedHoleLabels = computed(() => {
  const selectedIdSet = new Set(filters.value.hole_ids)
  return filteredHoleOptions.value
    .filter(item => selectedIdSet.has(item.id))
    .map(item => item.label)
})

const projectOptions = computed(() => {
  const projectMap = new Map()
  holeOptions.value.forEach((item) => {
    if (!item.project_id || projectMap.has(item.project_id)) {
      return
    }
    projectMap.set(item.project_id, {
      id: item.project_id,
      name: item.project_name
    })
  })
  return Array.from(projectMap.values())
})

const filteredHoleOptions = computed(() => {
  if (!filters.value.project_id) {
    return holeOptions.value
  }
  return holeOptions.value.filter(item => item.project_id === filters.value.project_id)
})

const holeDropdownText = computed(() => {
  if (selectedHoleLabels.value.length === 0) {
    return '请选择测孔'
  }
  if (selectedHoleLabels.value.length === 1) {
    return selectedHoleLabels.value[0]
  }
  return `已选择 ${selectedHoleLabels.value.length} 个测孔`
})

function toggleHoleDropdown() {
  showHoleDropdown.value = !showHoleDropdown.value
}

function toggleHoleSelection(holeId) {
  // 修复说明：改为下拉多选框后，测孔选择通过显式增删 ID 数组维护，避免浏览器原生 multiple 交互在不同系统下操作体验不一致。
  const currentIds = new Set(filters.value.hole_ids)
  if (currentIds.has(holeId)) {
    currentIds.delete(holeId)
  } else {
    currentIds.add(holeId)
  }
  filters.value.hole_ids = Array.from(currentIds)
}

function clearHoleSelection() {
  filters.value.hole_ids = []
}

function formatDateTimeLocal(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hour}:${minute}`
}

function applyProjectSelection(projectId, options = {}) {
  const targetProjectId = String(projectId || '')
  const nextHoleOptions = holeOptions.value.filter(item => item.project_id === targetProjectId)
  const validHoleIdSet = new Set(nextHoleOptions.map(item => item.id))
  const preservedHoleIds = filters.value.hole_ids.filter(item => validHoleIdSet.has(item))
  filters.value.project_id = targetProjectId
  // 修复说明：项目切换后，测孔多选框只保留该项目下的有效测孔；如果没有有效选择，则默认补上该项目第一个测孔，保证查询条件与下方数据严格联动。
  filters.value.hole_ids = preservedHoleIds.length > 0
    ? preservedHoleIds
    : (options.keepEmpty ? [] : (nextHoleOptions[0] ? [nextHoleOptions[0].id] : []))
}

function handleProjectChange() {
  applyProjectSelection(filters.value.project_id)
  showHoleDropdown.value = false
}

function applyDefaultFilters() {
  const firstProject = projectOptions.value[0] || null
  const endDate = new Date()
  const startDate = new Date(endDate.getTime() - (7 * 24 * 60 * 60 * 1000))
  filters.value.start_time = formatDateTimeLocal(startDate)
  filters.value.end_time = formatDateTimeLocal(endDate)
  applyProjectSelection(firstProject?.id || '', { keepEmpty: false })
}

function handleDocumentClick(event) {
  if (!event.target.closest('.multi-select-dropdown')) {
    showHoleDropdown.value = false
  }
}

const normalizedSeries = computed(() => trendSeries.value.map((series, index) => ({
  ...series,
  color: getSeriesColor(index),
  detail_rows: Array.isArray(series.detail_rows)
    ? series.detail_rows.map(item => ({
      ...item,
      depth: Number(item.depth || 0),
      current_pipe_value: Number(item.current_pipe_value || 0),
      cumulative_displacement: Number(item.cumulative_displacement || 0),
      previous_pipe_value: Number(item.previous_pipe_value || 0),
      current_displacement: Number(item.current_displacement || 0),
      deformation_rate: Number(item.deformation_rate || 0)
    }))
    : [],
  points: Array.isArray(series.points)
    ? series.points
      .map(point => ({
        ...point,
        depth: Number(point.depth || 0),
        cumulative_displacement: Number(point.cumulative_displacement || 0),
        current_displacement: Number(point.current_displacement || 0)
      }))
      .filter(point => Number.isFinite(point.depth) && Number.isFinite(point.cumulative_displacement))
      .sort((left, right) => left.depth - right.depth)
    : []
})).filter(series => series.points.length > 0))

const hasTrendData = computed(() => normalizedSeries.value.length > 0)
const shouldShowResultSection = computed(() => hasQueried.value)
const allPoints = computed(() => normalizedSeries.value.flatMap(series => series.points))
const selectedSeries = computed(() => {
  const matchedSeries = normalizedSeries.value.find(series => normalizeResultId(series.result_id) === selectedResultId.value)
  return matchedSeries || normalizedSeries.value[0] || null
})
const selectedDetailRows = computed(() => selectedSeries.value?.detail_rows || [])
const selectedSeriesTitle = computed(() => {
  if (!selectedSeries.value) {
    return '暂无联动成果数据'
  }
  return `${selectedSeries.value.project_name || '-'} / ${selectedSeries.value.hole_code || '-'}`
})
const xAxisRange = computed(() => {
  if (allPoints.value.length === 0) {
    return { min: -1, max: 1 }
  }
  const xValues = allPoints.value
    .map(point => Number(point.cumulative_displacement))
    .filter(value => Number.isFinite(value))
  if (xValues.length === 0) {
    return { min: -1, max: 1 }
  }
  const minValue = Math.min(...xValues)
  const maxValue = Math.max(...xValues)
  if (minValue === maxValue) {
    const fallbackPadding = Math.abs(minValue) > 0 ? Math.abs(minValue) * 0.1 : 1
    // 修复说明：累计变形量全部相等时主动补齐左右留白，避免 ECharts 因横轴范围塌缩导致曲线无法辨识。
    return {
      min: minValue - fallbackPadding,
      max: maxValue + fallbackPadding
    }
  }
  const padding = (maxValue - minValue) * 0.1
  // 修复说明：累计变形量不再强制按 0 对称，而是按真实最小/最大值加留白生成横轴范围，确保曲线位置与数据真实一致。
  return {
    min: minValue - padding,
    max: maxValue + padding
  }
})

function buildChartSeriesData(series) {
  return series.points.map(point => ({
    value: [Number(point.cumulative_displacement || 0), Number(point.depth || 0)],
    node: point.node,
    depth: point.depth,
    cumulative_displacement: point.cumulative_displacement,
    current_displacement: point.current_displacement,
    result_id: series.result_id,
    measurement_time: series.measurement_time
  }))
}

function buildTrendChartOption() {
  return {
    color: normalizedSeries.value.map(series => series.color),
    animation: false,
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      // 修复说明：提示框直接展示接口返回的点位明细，确保 ECharts 图形与右侧列表使用完全相同的数据口径。
      formatter: (params) => {
        const data = params.data || {}
        return [
          `${params.seriesName}`,
          `成果ID：${data.result_id ?? '-'}`,
          `监测时间：${formatDateTime(data.measurement_time)}`,
          `节点号：${data.node ?? '-'}`,
          `深度：${formatNumber(data.depth, 2)} m`,
          `累计变形量：${formatNumber(data.cumulative_displacement, 6)} mm`
        ].join('<br/>')
      }
    },
    legend: {
      type: 'scroll',
      top: 12,
      left: 12,
      right: 12,
      itemWidth: 18,
      itemHeight: 10,
      textStyle: {
        fontSize: 15,
        color: '#374151'
      }
    },
    grid: {
      left: 88,
      right: 36,
      top: 80,
      bottom: 72
    },
    xAxis: {
      type: 'value',
      min: xAxisRange.value.min,
      max: xAxisRange.value.max,
      name: '累计变形量 (mm)',
      nameLocation: 'middle',
      nameGap: 40,
      nameTextStyle: {
        fontSize: 17,
        fontWeight: 600,
        color: '#1f2937'
      },
      axisLabel: {
        fontSize: 15,
        color: '#6b7280'
      },
      splitLine: {
        lineStyle: {
          color: '#e5e7eb'
        }
      },
      axisLine: {
        lineStyle: {
          color: '#94a3b8'
        }
      }
    },
    yAxis: {
      type: 'value',
      inverse: true,
      name: '深度 (m)',
      nameLocation: 'middle',
      nameGap: 56,
      nameTextStyle: {
        fontSize: 17,
        fontWeight: 600,
        color: '#1f2937'
      },
      axisLabel: {
        fontSize: 15,
        color: '#6b7280'
      },
      splitLine: {
        lineStyle: {
          color: '#e5e7eb'
        }
      },
      axisLine: {
        lineStyle: {
          color: '#94a3b8'
        }
      }
    },
    series: normalizedSeries.value.map(series => ({
      name: series.curve_name,
      type: 'line',
      triggerLineEvent: true,
      showSymbol: true,
      symbol: 'circle',
      symbolSize: normalizeResultId(series.result_id) === selectedResultId.value ? 9 : 7,
      lineStyle: {
        width: normalizeResultId(series.result_id) === selectedResultId.value ? 4 : 2.5,
        opacity: selectedSeries.value ? (normalizeResultId(series.result_id) === selectedResultId.value ? 1 : 0.35) : 1
      },
      itemStyle: {
        opacity: selectedSeries.value ? (normalizeResultId(series.result_id) === selectedResultId.value ? 1 : 0.5) : 1
      },
      emphasis: {
        focus: 'series'
      },
      data: buildChartSeriesData(series)
    }))
  }
}

function handleTrendChartClick(params) {
  const clickedSeriesId = normalizedSeries.value[params?.seriesIndex]?.result_id
  if (clickedSeriesId === undefined || clickedSeriesId === null) {
    return
  }
  // 修复说明：点击任意一根趋势曲线或其点位时，右侧成果列表立即切换到该曲线对应的成果明细，满足图表与列表联动要求。
  selectedResultId.value = normalizeResultId(clickedSeriesId)
}

async function renderTrendChart() {
  if (!shouldShowResultSection.value || !hasTrendData.value) {
    return
  }
  await nextTick()
  if (!chartRef.value) {
    return
  }
  if (!trendChartInstance) {
    // 修复说明：趋势图改用 Apache ECharts 实例化渲染，替换原先手写 SVG 逻辑，提升交互和展示稳定性。
    trendChartInstance = echarts.init(chartRef.value)
    // 修复说明：绑定曲线点击事件，把图表交互直接映射到右侧成果数据列表，避免图表和列表各自独立。
    trendChartInstance.on('click', handleTrendChartClick)
  }
  trendChartInstance.setOption(buildTrendChartOption(), true)
  trendChartInstance.resize()
}

function disposeTrendChart() {
  if (trendChartInstance) {
    trendChartInstance.dispose()
    trendChartInstance = null
  }
}

function handleChartResize() {
  if (trendChartInstance) {
    trendChartInstance.resize()
  }
}

watch([normalizedSeries, shouldShowResultSection, selectedResultId], async () => {
  if (!shouldShowResultSection.value || !hasTrendData.value) {
    disposeTrendChart()
    return
  }
  await renderTrendChart()
}, { deep: true })

watch(normalizedSeries, (seriesList) => {
  const hasMatchedSelectedSeries = seriesList.some(series => normalizeResultId(series.result_id) === selectedResultId.value)
  if (!hasMatchedSelectedSeries) {
    // 修复说明：查询结果变化后如果原选中曲线已不存在，则自动回退到最新一条曲线，保证右侧列表始终有明确的联动对象。
    selectedResultId.value = seriesList[0] ? normalizeResultId(seriesList[0].result_id) : ''
  }
}, { deep: true })

onMounted(async () => {
  document.addEventListener('click', handleDocumentClick)
  window.addEventListener('resize', handleChartResize)
  await loadHoleOptions()
  // 修复说明：页面首次进入默认选中一个项目的一个测孔，并自动查询最近1周数据，满足成果趋势图默认展示要求。
  applyDefaultFilters()
  await loadTrendData()
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
  window.removeEventListener('resize', handleChartResize)
  disposeTrendChart()
})
</script>

<template>
  <div class="results-trend-page">
    <div class="page-header">
      <h1>数据趋势图</h1>
      <p>横坐标为累计变形量，纵坐标为深度；点击曲线可联动切换左侧列表。</p>
    </div>

    <div class="content-layout">
      <!-- 左侧：筛查条件 + 统计摘要 + 成果列表 -->
      <div class="left-panel">
        <div class="filter-card">
          <div class="filter-grid">
            <label class="field-group">
              <span>项目</span>
              <select v-model="filters.project_id" @change="handleProjectChange">
                <option v-for="project in projectOptions" :key="project.id" :value="project.id">
                  {{ project.name }}
                </option>
              </select>
            </label>
            <label class="field-group field-group-wide">
              <span>测孔</span>
              <div class="multi-select-dropdown" @click.stop>
                <button type="button" class="dropdown-trigger" @click="toggleHoleDropdown">
                  <span class="dropdown-text">{{ holeDropdownText }}</span>
                  <span class="dropdown-arrow" :class="{ expanded: showHoleDropdown }">⌄</span>
                </button>
                <div v-if="showHoleDropdown" class="dropdown-panel">
                  <div class="dropdown-actions">
                    <button type="button" class="dropdown-action-btn" @click="clearHoleSelection">清空</button>
                    <span>共 {{ filteredHoleOptions.length }} 个测孔</span>
                  </div>
                  <label v-for="hole in filteredHoleOptions" :key="hole.id" class="dropdown-option">
                    <input
                      type="checkbox"
                      :checked="filters.hole_ids.includes(hole.id)"
                      @change="toggleHoleSelection(hole.id)"
                    >
                    <span>{{ hole.label }}</span>
                  </label>
                  <div v-if="filteredHoleOptions.length === 0" class="dropdown-empty">当前项目暂无可选测孔</div>
                </div>
              </div>
              <small>测孔选项会随项目联动，默认选中当前项目的第一个测孔。</small>
            </label>
            <label class="field-group">
              <span>开始时间</span>
              <input v-model="filters.start_time" type="datetime-local">
            </label>
            <label class="field-group">
              <span>结束时间</span>
              <input v-model="filters.end_time" type="datetime-local">
            </label>
          </div>
          <div class="filter-actions">
            <button class="btn-primary" :disabled="loading" @click="loadTrendData">
              {{ loading ? '查询中...' : '查询趋势图' }}
            </button>
            <button class="btn-secondary" :disabled="loading" @click="resetFilters">重置筛选</button>
          </div>
        </div>

        <div v-if="shouldShowResultSection" class="summary-card">
          <span>匹配曲线：{{ normalizedSeries.length }} 条</span>
          <span>匹配点位：{{ allPoints.length }} 个</span>
          <span>当前联动成果：{{ selectedSeries?.result_id ?? '-' }}</span>
        </div>

        <div v-if="shouldShowResultSection" class="table-card">
          <div class="linked-result-summary">
            <!-- 修复说明：左侧列表展示当前选中曲线的成果明细，并明确提示用户可通过点击右侧曲线切换联动对象。 -->
            <strong>{{ selectedSeriesTitle }}</strong>
            <span>成果ID：{{ selectedSeries?.result_id ?? '-' }}</span>
            <span>监测时间：{{ formatDateTime(selectedSeries?.measurement_time) }}</span>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th>节点号</th>
                <th>深度(m)</th>
                <th>本次管形值</th>
                <th>累计变形量(mm)</th>
                <th>上次管形值</th>
                <th>本次变形量(mm)</th>
                <th>变形速率</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in selectedDetailRows" :key="`row-${selectedSeries?.result_id ?? 'empty'}-${row.id}`">
                <!-- 修复说明：列表直接复用当前曲线返回的成果明细，避免前端重新聚合全部曲线数据导致默认展示口径错误。 -->
                <td>{{ row.node ?? '-' }}</td>
                <td>{{ formatNumber(row.depth, 2) }}</td>
                <td>{{ formatNumber(row.current_pipe_value, 6) }}</td>
                <td>{{ formatNumber(row.cumulative_displacement, 6) }}</td>
                <td>{{ formatNumber(row.previous_pipe_value, 6) }}</td>
                <td>{{ formatNumber(row.current_displacement, 6) }}</td>
                <td>{{ formatNumber(row.deformation_rate, 8) }}</td>
              </tr>
              <tr v-if="selectedDetailRows.length === 0">
                <td colspan="7" class="no-data">{{ hasTrendData ? '暂无关联成果明细' : '暂无符合条件的成果曲线数据' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 右侧：曲线图 -->
      <div v-if="shouldShowResultSection" class="chart-card">
        <div v-if="hasTrendData" class="chart-wrapper">
          <div
            ref="chartRef"
            class="chart-echarts"
          ></div>
        </div>
        <div v-else class="empty-state">暂无符合条件的成果曲线数据</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.results-trend-page {
  width: 100%;
  max-width: none;
  min-width: 0;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 600;
  color: #1a1a2e;
}

.page-header p {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
}

.filter-card,
.summary-card,
.chart-card,
.table-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.filter-card {
  padding: 20px;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-group-wide {
  grid-column: span 1;
}

.field-group span {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.field-group input {
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  outline: none;
  background: white;
}

.field-group select {
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  outline: none;
  background: white;
}

.field-group input:focus {
  border-color: #667eea;
}

.field-group select:focus {
  border-color: #667eea;
}

.multi-select-dropdown {
  position: relative;
}

.dropdown-trigger {
  width: 100%;
  min-height: 44px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  color: #111827;
}

.dropdown-trigger:focus {
  border-color: #667eea;
}

.dropdown-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-arrow {
  color: #6b7280;
  font-size: 12px;
  transition: transform 0.2s ease;
}

.dropdown-arrow.expanded {
  transform: rotate(180deg);
}

.dropdown-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 20;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  max-height: 280px;
  overflow-y: auto;
}

.dropdown-actions {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  color: #6b7280;
  font-size: 12px;
}

.dropdown-action-btn {
  border: none;
  background: none;
  color: #2563eb;
  cursor: pointer;
  padding: 0;
  font-size: 12px;
}

.dropdown-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  color: #374151;
  font-size: 14px;
}

.dropdown-option:hover {
  background: #f9fafb;
}

.dropdown-option input {
  margin: 0;
}

.dropdown-empty {
  padding: 16px 12px;
  color: #6b7280;
  font-size: 13px;
}

.content-layout {
  /* 修复说明：左右布局，左侧筛查条件+列表占 7，右侧曲线图占 3。 */
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 3fr);
  gap: 20px;
  align-items: stretch;
}

.left-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

.field-group small {
  color: #6b7280;
  font-size: 12px;
}

.filter-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.btn-primary,
.btn-secondary {
  border-radius: 8px;
  padding: 10px 18px;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid transparent;
}

.btn-primary {
  background: #2563eb;
  color: white;
}

.btn-primary:disabled,
.btn-secondary:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
  border-color: #e5e7eb;
}

.summary-card {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  padding: 14px 20px;
  color: #374151;
  font-size: 14px;
}

.chart-card {
  /* 修复说明：曲线图卡片占满右侧列，并维持固定视口高度便于深度轴展开。 */
  height: calc(100vh - 240px);
  min-height: 720px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chart-wrapper {
  /* 修复说明：图表容器占满卡片剩余空间，让 ECharts 在统一高度下完整铺满显示区域。 */
  width: 100%;
  flex: 1;
  min-height: 0;
}

.chart-echarts {
  /* 修复说明：ECharts 容器占满卡片宽度并由组件脚本统一控制高度，避免旧 SVG 自适应逻辑残留。 */
  width: 100%;
  height: 100%;
  min-width: 0;
  display: block;
}

.empty-state {
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  font-size: 14px;
}

.table-card {
  /* 修复说明：左侧成果列表固定高度，表格数据行在卡片内部滚动，与右侧曲线图整体观感对齐。 */
  height: 560px;
  min-height: 400px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.linked-result-summary {
  /* 修复说明：在列表顶部补充当前联动成果摘要，帮助用户确认“默认最新一条”与“点击曲线切换”后的目标批次。 */
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  align-items: center;
  padding: 16px 16px 0;
  color: #374151;
  font-size: 14px;
}

.table-card .data-table {
  /* 修复说明：表格最小宽度同步下调，避免在常见窗口宽度下把整体布局再次撑出横向滚动。 */
  min-width: 640px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.table-card table {
  /* 修复说明：表格改为在卡片内部独立滚动，和左侧图表共享同一高度时不会把卡片继续撑高。 */
  display: block;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.data-table thead,
.data-table tbody,
.data-table tr {
  display: table;
  width: 100%;
  table-layout: fixed;
}

.data-table tbody {
  /* 修复说明：表头固定在顶部，数据行区域单独滚动，提升长列表浏览体验。 */
  display: block;
  height: calc(100% - 48px);
  overflow: auto;
}

.data-table th,
.data-table td {
  padding: 14px 16px;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
}

.data-table th {
  background: #f9fafb;
  color: #6b7280;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.data-table td {
  color: #374151;
  font-size: 14px;
}

.no-data {
  text-align: center;
  color: #6b7280;
  padding: 32px !important;
}

@media (max-width: 1200px) {
  .filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 992px) {
  .content-layout {
    grid-template-columns: 1fr;
  }

  .chart-card,
  .table-card {
    height: auto;
    min-height: 0;
  }

  .chart-echarts {
    /* 修复说明：小屏改回固定图表高度，避免单列布局下图表被压缩得过高或过低。 */
    min-height: 560px;
  }

  .table-card table,
  .data-table tbody {
    height: auto;
    overflow: visible;
  }
}

@media (max-width: 560px) {
  .filter-grid {
    grid-template-columns: 1fr;
  }
}
</style>
