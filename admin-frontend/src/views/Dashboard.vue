<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '@/services/api'

const stats = ref({ customers: 0, adminUsers: 0, upperDevices: 0, lowerDevices: 0, rawData: 0, tasks: 0, soldDevices: 0, inStockDevices: 0, warehouses: 0, soldDevicesByCustomer: [] })
const loading = ref(false)
// 修复说明：总览页原先直接展示接口字段名，导致 customers/adminUsers 等英文出现在页面上，这里统一映射为中文标签再渲染。
const statLabelMap = {
  customers: '客户数量',
  adminUsers: '管理员数量',
  upperDevices: '上位机数量',
  lowerDevices: '下位机数量',
  rawData: '原始数据量',
  tasks: '监测任务数',
  soldDevices: '总售出设备',
  inStockDevices: '仓库在库设备',
  warehouses: '启用仓库数'
}

// 修复说明：将统计对象转换为带中文标签的展示数组，保持接口字段不变，只调整界面显示文案。
const statItems = computed(() => Object.entries(stats.value).filter(([, value]) => value !== null && typeof value !== 'object' && Number.isFinite(Number(value))).map(([key, value]) => ({
  key,
  value,
  label: statLabelMap[key] || key
})))

async function loadStats() {
  loading.value = true
  try {
    const response = await api.get('/dashboard/stats')
    stats.value = response.data.data
  } finally {
    loading.value = false
  }
}

onMounted(loadStats)
</script>

<template>
  <div>
    <div class="card-grid">
      <div class="stat-card" v-for="item in statItems" :key="item.key">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </div>
    </div>
    <div class="panel">
      <div class="panel-heading">
        <div>
          <h3>客户售出设备汇总</h3>
          <p>查看每个客户当前持有的上位机和下位机数量。</p>
        </div>
        <router-link to="/device-management" class="panel-link">进入仓库管理</router-link>
      </div>
      <table class="summary-table" v-if="stats.soldDevicesByCustomer?.length">
        <thead><tr><th>客户</th><th>客户编码</th><th>售出总数</th><th>上位机</th><th>下位机</th></tr></thead>
        <tbody><tr v-for="item in stats.soldDevicesByCustomer" :key="item.id"><td>{{ item.customer_name }}</td><td>{{ item.customer_code }}</td><td>{{ item.sold_device_count }}</td><td>{{ item.sold_upper_count || 0 }}</td><td>{{ item.sold_lower_count || 0 }}</td></tr></tbody>
      </table>
      <p v-else>暂无已售出设备。</p>
      <p v-if="loading">正在刷新统计数据...</p>
    </div>
  </div>
</template>

<style scoped>
.card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 20px; }
.stat-card, .panel { background: #fff; border-radius: 14px; padding: 18px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }
.stat-label { display: block; color: #6b7280; margin-bottom: 8px; }
.stat-value { font-size: 30px; }
.panel h3 { margin-bottom: 10px; }
.panel p { color: #4b5563; margin-top: 8px; }
.panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.panel-link { color: #2563eb; font-size: 14px; }
.summary-table { width: 100%; margin-top: 16px; border-collapse: collapse; }
.summary-table th, .summary-table td { padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 14px; }
</style>
