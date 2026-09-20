<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'

const router = useRouter()
const loading = ref(false)
const projects = ref([])

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

async function loadProjects() {
  loading.value = true
  try {
    // 修复说明：工程管理列表直接从管理端统一工程接口读取，避免再从客户、设备或原始数据页面间接拼装工程维度数据。
    const response = await api.get('/projects')
    projects.value = response.data.data || []
  } finally {
    loading.value = false
  }
}

function openDetail(project) {
  if (!project?.id) {
    return
  }

  router.push(`/projects/${project.id}`)
}

onMounted(loadProjects)
</script>

<template>
  <div class="page-stack">
    <div class="panel">
      <div class="panel-header">
        <div>
          <h3>工程列表</h3>
          <p class="panel-subtitle">展示客户名称、工程名称、测孔数，并支持进入工程详情。</p>
        </div>
        <button class="refresh-button" @click="loadProjects">刷新</button>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>客户名称</th>
            <th>工程名称</th>
            <th>测孔数</th>
            <th>查看详情</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in projects" :key="item.id">
            <td>{{ item.customer_name || '--' }}</td>
            <td>
              <div class="primary-text">{{ item.project_name || '--' }}</div>
              <div class="secondary-text">编码：{{ item.project_code || '--' }}</div>
              <div class="secondary-text">起止：{{ formatDate(item.start_date) }} ~ {{ formatDate(item.end_date) }}</div>
            </td>
            <td>{{ item.hole_count || 0 }}</td>
            <td>
              <button class="link-button" @click="openDetail(item)">查看详情</button>
            </td>
          </tr>
          <tr v-if="!projects.length && !loading">
            <td colspan="4" class="empty-cell">暂无工程数据</td>
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

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.panel-header h3 {
  margin: 0;
  color: #0f172a;
}

.panel-subtitle {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
}

.refresh-button {
  border: none;
  background: #2563eb;
  color: #fff;
  border-radius: 10px;
  padding: 10px 16px;
  cursor: pointer;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  padding: 12px 10px;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
  vertical-align: top;
}

.table th {
  background: #f8fafc;
  color: #64748b;
}

.primary-text {
  color: #0f172a;
  font-weight: 600;
}

.secondary-text {
  margin-top: 4px;
  color: #64748b;
  font-size: 13px;
}

.link-button {
  border: none;
  background: none;
  color: #2563eb;
  cursor: pointer;
  padding: 0;
}

.empty-cell {
  text-align: center;
  color: #64748b;
  padding: 24px !important;
}
</style>
