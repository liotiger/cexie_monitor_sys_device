<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { dashboardApi } from '@/services/api'

const router = useRouter()

const loading = ref(true)
const stats = ref({
  deviceTotal: 0,
  deviceOnline: 0,
  projectTotal: 0,
  projectActive: 0,
  holeTotal: 0,
  holeActive: 0,
  todayMeasurements: 0,
  todayAlerts: 0
})
const recentDevices = ref([])
const recentMeasurements = ref([])
const alerts = ref([])

const deviceOnlineRate = computed(() => {
  if (stats.value.deviceTotal === 0) return 0
  return Math.round((stats.value.deviceOnline / stats.value.deviceTotal) * 100)
})

const quickActions = [
  { icon: '📡', text: '上位机管理', path: '/upper-devices', color: '#667eea' },
  { icon: '📁', text: '新建工程', path: '/projects', color: '#10b981' },
  { icon: '🕳️', text: '工程测孔', path: '/projects', color: '#f59e0b' },
  { icon: '📄', text: '生成报表', path: '/reports', color: '#ef4444' }
]

async function loadDashboardData() {
  loading.value = true
  try {
    const [statsRes, devicesRes, measurementsRes, alertsRes] = await Promise.all([
      dashboardApi.getStats(),
      dashboardApi.getRecentDevices(),
      dashboardApi.getRecentMeasurements(),
      dashboardApi.getAlerts()
    ])
    
    if (statsRes.data.success) {
      stats.value = statsRes.data.data
    }
    if (devicesRes.data.success) {
      recentDevices.value = devicesRes.data.data
    }
    if (measurementsRes.data.success) {
      recentMeasurements.value = measurementsRes.data.data
    }
    if (alertsRes.data.success) {
      alerts.value = alertsRes.data.data
    }
  } catch (error) {
    console.error('Failed to load dashboard data:', error)
  } finally {
    loading.value = false
  }
}

function navigateTo(path) {
  router.push(path)
}

function formatTime(dateStr) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getAlertLevelClass(level) {
  switch (level) {
    case 'critical': return 'critical'
    case 'warning': return 'warning'
    default: return 'info'
  }
}

function getAlertLevelText(level) {
  switch (level) {
    case 'critical': return '严重'
    case 'warning': return '警告'
    default: return '提示'
  }
}

onMounted(() => {
  loadDashboardData()
})
</script>

<template>
  <div class="dashboard">
    <div class="page-header">
      <h1 class="page-title">仪表盘</h1>
      <p class="page-subtitle">系统运行状态概览</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card devices">
        <div class="stat-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
            <line x1="12" y1="18" x2="12.01" y2="18"/>
          </svg>
        </div>
        <div class="stat-content">
          <div class="stat-main">
            <span class="stat-value">{{ stats.deviceOnline }}</span>
            <span class="stat-unit">/ {{ stats.deviceTotal }}</span>
          </div>
          <div class="stat-label">在线设备</div>
          <div class="stat-progress">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: deviceOnlineRate + '%' }"></div>
            </div>
            <span class="progress-text">{{ deviceOnlineRate }}%</span>
          </div>
        </div>
      </div>

      <div class="stat-card projects">
        <div class="stat-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div class="stat-content">
          <div class="stat-main">
            <span class="stat-value">{{ stats.projectActive }}</span>
            <span class="stat-unit">/ {{ stats.projectTotal }}</span>
          </div>
          <div class="stat-label">进行中项目</div>
          <div class="stat-trend up">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
              <polyline points="17 6 23 6 23 12"/>
            </svg>
            <span>活跃项目</span>
          </div>
        </div>
      </div>

      <div class="stat-card holes">
        <div class="stat-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="4"/>
          </svg>
        </div>
        <div class="stat-content">
          <div class="stat-main">
            <span class="stat-value">{{ stats.holeActive }}</span>
            <span class="stat-unit">/ {{ stats.holeTotal }}</span>
          </div>
          <div class="stat-label">监测中测孔</div>
          <div class="stat-trend">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
            <span>监测点位</span>
          </div>
        </div>
      </div>

      <div class="stat-card measurements">
        <div class="stat-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        </div>
        <div class="stat-content">
          <div class="stat-main">
            <span class="stat-value">{{ stats.todayMeasurements }}</span>
            <span class="stat-unit">次</span>
          </div>
          <div class="stat-label">今日测量</div>
          <div class="stat-trend up">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <span>实时监测</span>
          </div>
        </div>
      </div>

      <div class="stat-card alerts">
        <div class="stat-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div class="stat-content">
          <div class="stat-main">
            <span class="stat-value">{{ stats.todayAlerts }}</span>
            <span class="stat-unit">条</span>
          </div>
          <div class="stat-label">今日预警</div>
          <div class="stat-trend" :class="{ warning: stats.todayAlerts > 0 }">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{{ stats.todayAlerts > 0 ? '需要关注' : '运行正常' }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="quick-actions-section">
      <h2 class="section-title">快捷操作</h2>
      <div class="quick-actions">
        <div 
          v-for="action in quickActions" 
          :key="action.text"
          class="quick-action-card"
          @click="navigateTo(action.path)"
        >
          <div class="action-icon" :style="{ background: action.color }">
            {{ action.icon }}
          </div>
          <span class="action-text">{{ action.text }}</span>
        </div>
      </div>
    </div>

    <div class="content-grid">
      <div class="content-card devices-card">
        <div class="card-header">
          <h3>设备状态</h3>
          <a class="view-all" @click="navigateTo('/upper-devices')">查看全部</a>
        </div>
        <div class="card-content">
          <div v-if="loading" class="loading-state">
            <div class="spinner"></div>
            <span>加载中...</span>
          </div>
          <div v-else-if="!recentDevices.length" class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
              <line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
            <span>暂无设备数据</span>
          </div>
          <div v-else class="device-list">
            <div v-for="device in recentDevices" :key="device.id" class="device-item">
              <div class="device-info">
                <div class="device-name">{{ device.name }}</div>
                <div class="device-meta">
                  <span class="device-sn">{{ device.serialNumber }}</span>
                  <span class="device-project">{{ device.projectName || '未绑定' }}</span>
                </div>
              </div>
              <div class="device-status" :class="{ online: device.isOnline }">
                <span class="status-dot"></span>
                {{ device.isOnline ? '在线' : '离线' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="content-card measurements-card">
        <div class="card-header">
          <h3>最近测量</h3>
          <a class="view-all" @click="navigateTo('/raw-data')">查看全部</a>
        </div>
        <div class="card-content">
          <div v-if="loading" class="loading-state">
            <div class="spinner"></div>
            <span>加载中...</span>
          </div>
          <div v-else-if="!recentMeasurements.length" class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>暂无测量数据</span>
          </div>
          <div v-else class="measurement-list">
            <div v-for="item in recentMeasurements" :key="item.id" class="measurement-item">
              <div class="measurement-info">
                <div class="measurement-hole">{{ item.holeName }}</div>
                <div class="measurement-meta">
                  <span>{{ item.projectName }}</span>
                  <span>{{ formatTime(item.measuredAt) }}</span>
                </div>
              </div>
              <div class="measurement-value">
                <span class="value">{{ item.depth }}</span>
                <span class="unit">m</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="content-card alerts-card">
        <div class="card-header">
          <h3>预警信息</h3>
          <a class="view-all" @click="navigateTo('/results')">查看全部</a>
        </div>
        <div class="card-content">
          <div v-if="loading" class="loading-state">
            <div class="spinner"></div>
            <span>加载中...</span>
          </div>
          <div v-else-if="!alerts.length" class="empty-state success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span>暂无预警信息</span>
          </div>
          <div v-else class="alert-list">
            <div v-for="alert in alerts" :key="alert.id" class="alert-item" :class="getAlertLevelClass(alert.level)">
              <div class="alert-level">
                <span class="level-badge">{{ getAlertLevelText(alert.level) }}</span>
              </div>
              <div class="alert-content">
                <div class="alert-message">{{ alert.message }}</div>
                <div class="alert-meta">
                  <span>{{ alert.holeName }}</span>
                  <span>{{ formatTime(alert.createdAt) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  width: 100%;
  max-width: none;
  min-width: 0;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0 0 4px 0;
}

.page-subtitle {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.2s;
}

.stat-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon svg {
  width: 24px;
  height: 24px;
}

.stat-card.devices .stat-icon {
  background: #e0e7ff;
  color: #667eea;
}

.stat-card.projects .stat-icon {
  background: #d1fae5;
  color: #10b981;
}

.stat-card.holes .stat-icon {
  background: #fef3c7;
  color: #f59e0b;
}

.stat-card.measurements .stat-icon {
  background: #dbeafe;
  color: #3b82f6;
}

.stat-card.alerts .stat-icon {
  background: #fee2e2;
  color: #ef4444;
}

.stat-content {
  flex: 1;
  min-width: 0;
}

.stat-main {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a2e;
  line-height: 1;
}

.stat-unit {
  font-size: 14px;
  color: #6b7280;
}

.stat-label {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 8px;
}

.stat-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  border-radius: 3px;
  transition: width 0.3s;
}

.progress-text {
  font-size: 12px;
  font-weight: 600;
  color: #667eea;
}

.stat-trend {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
}

.stat-trend svg {
  width: 14px;
  height: 14px;
}

.stat-trend.up {
  color: #10b981;
}

.stat-trend.warning {
  color: #f59e0b;
}

.quick-actions-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0 0 16px 0;
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.quick-action-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.2s;
}

.quick-action-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.action-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.action-text {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 20px;
}

.content-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.card-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
}

.view-all {
  font-size: 13px;
  color: #667eea;
  cursor: pointer;
  transition: color 0.2s;
}

.view-all:hover {
  color: #764ba2;
}

.card-content {
  padding: 16px 20px;
  min-height: 200px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #6b7280;
}

.loading-state .spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e5e7eb;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state svg {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-state.success svg {
  color: #10b981;
}

.device-list,
.measurement-list,
.alert-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.device-item,
.measurement-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  transition: background 0.2s;
}

.device-item:hover,
.measurement-item:hover {
  background: #f3f4f6;
}

.device-info,
.measurement-info {
  flex: 1;
  min-width: 0;
}

.device-name,
.measurement-hole {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a2e;
  margin-bottom: 4px;
}

.device-meta,
.measurement-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #6b7280;
}

.device-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  padding: 4px 10px;
  background: #f3f4f6;
  border-radius: 12px;
}

.device-status.online {
  color: #10b981;
  background: #d1fae5;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.measurement-value {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.measurement-value .value {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
}

.measurement-value .unit {
  font-size: 12px;
  color: #6b7280;
}

.alert-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  border-left: 3px solid;
}

.alert-item.critical {
  background: #fef2f2;
  border-color: #ef4444;
}

.alert-item.warning {
  background: #fffbeb;
  border-color: #f59e0b;
}

.alert-item.info {
  background: #eff6ff;
  border-color: #3b82f6;
}

.level-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.alert-item.critical .level-badge {
  background: #fee2e2;
  color: #ef4444;
}

.alert-item.warning .level-badge {
  background: #fef3c7;
  color: #d97706;
}

.alert-item.info .level-badge {
  background: #dbeafe;
  color: #3b82f6;
}

.alert-content {
  flex: 1;
  min-width: 0;
}

.alert-message {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a2e;
  margin-bottom: 4px;
}

.alert-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #6b7280;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .quick-actions {
    grid-template-columns: repeat(2, 1fr);
  }

  .content-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .quick-actions {
    grid-template-columns: 1fr;
  }
}
</style>
