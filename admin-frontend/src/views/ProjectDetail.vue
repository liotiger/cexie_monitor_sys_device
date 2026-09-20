<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/services/api'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const detail = ref({
  basicInfo: null,
  holeList: [],
  upperDeviceList: [],
  lowerDeviceList: []
})
const activeTab = ref('basic')

function createEmptyDetail() {
  return {
    basicInfo: null,
    holeList: [],
    upperDeviceList: [],
    lowerDeviceList: []
  }
}

const tabs = [
  { key: 'basic', label: '工程基本信息' },
  { key: 'holes', label: '测孔列表' },
  { key: 'uppers', label: '上位机列表' },
  { key: 'lowers', label: '下位机列表' }
]

// 修复说明：项目状态、上位机在线状态、下位机状态原先直接输出英文枚举，这里参照客户端文案统一映射为中文。
const projectStatusTextMap = {
  planning: '规划中',
  ongoing: '进行中',
  completed: '已完成',
  paused: '已暂停'
}

const networkStatusTextMap = {
  online: '在线',
  offline: '离线'
}

const lowerDeviceStatusTextMap = {
  idle: '空闲',
  measuring: '测量中',
  maintenance: '维护中',
  fault: '故障',
  calibrating: '标定中',
  charging: '充电中',
  calibration_expired: '校准过期'
}

function getProjectStatusText(status) {
  return projectStatusTextMap[status] || (status ? String(status) : '--')
}

function getNetworkStatusText(status) {
  return networkStatusTextMap[String(status || '').toLowerCase()] || '--'
}

function getLowerDeviceStatusText(status) {
  return lowerDeviceStatusTextMap[status] || (status ? String(status) : '--')
}

const currentRows = computed(() => {
  if (activeTab.value === 'holes') {
    return detail.value.holeList || []
  }
  if (activeTab.value === 'uppers') {
    return detail.value.upperDeviceList || []
  }
  if (activeTab.value === 'lowers') {
    return detail.value.lowerDeviceList || []
  }
  return []
})

function formatDateTime(value) {
  if (!value) {
    return '--'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN')
}

function formatDate(value) {
  if (!value) {
    return '--'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString('zh-CN')
}

async function loadDetail() {
  loading.value = true
  try {
    // 修复说明：工程详情页需要一次性拿到四个导航区域的数据，这里直接调用后端聚合详情接口，避免前端分多次请求后再自行拼接。
    const response = await api.get(`/projects/${route.params.id}`)
    detail.value = response.data.data || createEmptyDetail()
  } finally {
    loading.value = false
  }
}

function backToList() {
  router.push('/projects')
}

watch(
  () => route.params.id,
  () => {
    // 修复说明：Vue Router 在同一路由组件内切换不同工程详情时会复用组件实例，这里主动监听工程 id，
    // 避免从一个工程切到另一个工程时仍然残留上一条工程详情和已选中的页签状态。
    activeTab.value = 'basic'
    detail.value = createEmptyDetail()
    loadDetail()
  },
  { immediate: true }
)
</script>

<template>
  <div class="page-stack">
    <div class="panel">
      <div class="panel-header">
        <div>
          <button class="back-button" @click="backToList">返回工程列表</button>
          <h3>{{ detail.basicInfo?.project_name || '工程详情' }}</h3>
          <p class="panel-subtitle">顶部导航可切换工程基本信息、测孔列表、上位机列表、下位机列表。</p>
        </div>
      </div>

      <div class="tab-nav">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab-button"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key">
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div class="panel" v-if="activeTab === 'basic'">
      <h4>工程基本信息</h4>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">客户名称</span>
          <strong>{{ detail.basicInfo?.customer_name || '--' }}</strong>
        </div>
        <div class="info-item">
          <span class="info-label">工程名称</span>
          <strong>{{ detail.basicInfo?.project_name || '--' }}</strong>
        </div>
        <div class="info-item">
          <span class="info-label">工程编码</span>
          <strong>{{ detail.basicInfo?.project_code || '--' }}</strong>
        </div>
        <div class="info-item">
          <span class="info-label">测孔数</span>
          <strong>{{ detail.basicInfo?.hole_count || 0 }}</strong>
        </div>
        <div class="info-item">
          <span class="info-label">项目位置</span>
          <strong>{{ detail.basicInfo?.location || '--' }}</strong>
        </div>
        <div class="info-item">
          <span class="info-label">项目状态</span>
          <strong>{{ getProjectStatusText(detail.basicInfo?.status) }}</strong>
        </div>
        <div class="info-item">
          <span class="info-label">开始日期</span>
          <strong>{{ formatDate(detail.basicInfo?.start_date) }}</strong>
        </div>
        <div class="info-item">
          <span class="info-label">结束日期</span>
          <strong>{{ formatDate(detail.basicInfo?.end_date) }}</strong>
        </div>
        <div class="info-item">
          <span class="info-label">施工单位</span>
          <strong>{{ detail.basicInfo?.contractor || '--' }}</strong>
        </div>
        <div class="info-item">
          <span class="info-label">监理单位</span>
          <strong>{{ detail.basicInfo?.supervisor || '--' }}</strong>
        </div>
      </div>
    </div>

    <div class="panel" v-else>
      <h4>{{ tabs.find(item => item.key === activeTab)?.label }}</h4>

      <table v-if="activeTab === 'holes'" class="table">
        <thead>
          <tr>
            <th>测孔编号</th>
            <th>测孔名称</th>
            <th>孔深(m)</th>
            <th>测量间隔(m)</th>
            <th>初始测量距离(m)</th>
            <th>关联上位机</th>
            <th>关联下位机</th>
            <th>最后监测时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in currentRows" :key="item.id">
            <td>{{ item.hole_number || '--' }}</td>
            <td>{{ item.hole_name || '--' }}</td>
            <td>{{ item.depth ?? '--' }}</td>
            <td>{{ item.measurement_interval ?? '--' }}</td>
            <td>{{ item.initial_measurement_distance ?? '--' }}</td>
            <td>{{ item.upper_device_imei || item.upper_device_name || '--' }}</td>
            <td>{{ item.lower_device_code || item.lower_device_name || '--' }}</td>
            <td>{{ formatDateTime(item.last_measurement_time) }}</td>
          </tr>
          <tr v-if="!currentRows.length && !loading">
            <td colspan="8" class="empty-cell">暂无测孔数据</td>
          </tr>
        </tbody>
      </table>

      <table v-else-if="activeTab === 'uppers'" class="table">
        <thead>
          <tr>
            <th>IMEI</th>
            <th>名称</th>
            <th>在线状态</th>
            <th>关联测孔</th>
            <th>连接时间</th>
            <th>最后在线时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in currentRows" :key="item.id">
            <td>{{ item.imei || '--' }}</td>
            <td>{{ item.device_name || '--' }}</td>
            <td>{{ item.network_status || '--' }}</td>
            <td>{{ item.related_hole_names || '--' }}</td>
            <td>{{ formatDateTime(item.connected_at) }}</td>
            <td>{{ formatDateTime(item.last_online_time) }}</td>
          </tr>
          <tr v-if="!currentRows.length && !loading">
            <td colspan="6" class="empty-cell">暂无上位机数据</td>
          </tr>
        </tbody>
      </table>

      <table v-else class="table">
        <thead>
          <tr>
            <th>下位机编号</th>
            <th>名称</th>
            <th>状态</th>
            <th>关联测孔</th>
            <th>关联上位机</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in currentRows" :key="item.id">
            <td>{{ item.device_code || '--' }}</td>
            <td>{{ item.device_name || '--' }}</td>
            <td>{{ getLowerDeviceStatusText(item.status) }}</td>
            <td>{{ item.related_hole_names || '--' }}</td>
            <td>{{ item.related_upper_imeis || '--' }}</td>
          </tr>
          <tr v-if="!currentRows.length && !loading">
            <td colspan="5" class="empty-cell">暂无下位机数据</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.page-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel {
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.panel-header h3,
.panel h4 {
  margin: 0;
  color: #0f172a;
}

.panel-subtitle {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
}

.back-button {
  border: none;
  background: #f1f5f9;
  color: #334155;
  border-radius: 10px;
  padding: 8px 14px;
  cursor: pointer;
  margin-bottom: 12px;
}

.tab-nav {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 18px;
}

.tab-button {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 10px;
  padding: 10px 16px;
  cursor: pointer;
}

.tab-button.active {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  margin-top: 16px;
}

.info-item {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-label {
  font-size: 13px;
  color: #64748b;
}

.table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 16px;
}

.table th,
.table td {
  padding: 12px 10px;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
}

.table th {
  background: #f8fafc;
  color: #64748b;
}

.empty-cell {
  text-align: center;
  color: #64748b;
  padding: 24px !important;
}
</style>
