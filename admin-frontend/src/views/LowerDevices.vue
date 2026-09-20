<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'

const route = useRoute()
const loading = ref(false)
const search = ref('')
const lowerDevices = ref([])
const lastUpdatedAt = ref('')
const calibrationDialogVisible = ref(false)
const calibrationSubmitting = ref(false)
const calibrationDevice = ref(null)
const calibrationError = ref('')
const calibrationForm = ref({
  k_value: null,
  beta_value: null,
  calibration_date: '',
  calibration_org: '',
  valid_until: '',
  calibration_status: 'valid'
})

const calibrationStatusTextMap = {
  valid: '有效',
  expired: '已过期',
  pending: '待校准'
}

function formatDate(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10)
  }
  return date.toLocaleDateString()
}

function formatRelatedUpperDevice(item) {
  return item?.related_upper_device || '--'
}

async function loadLowerDevices() {
  loading.value = true
  try {
    const response = await api.get('/lower-devices', {
      params: { search: search.value, limit: 50 }
    })
    lowerDevices.value = response.data.data.list || []
    lastUpdatedAt.value = new Date().toLocaleString()
  } finally {
    loading.value = false
  }
}

function openCalibrationDialog(device) {
  calibrationDevice.value = device
  calibrationError.value = ''
  calibrationForm.value = {
    k_value: device.k_value ?? null,
    beta_value: device.beta_value ?? null,
    calibration_date: device.calibration_date ? String(device.calibration_date).slice(0, 10) : '',
    calibration_org: device.calibration_org || '',
    valid_until: device.valid_until ? String(device.valid_until).slice(0, 10) : '',
    calibration_status: device.calibration_status || 'valid'
  }
  calibrationDialogVisible.value = true
}

function closeCalibrationDialog() {
  calibrationDialogVisible.value = false
  calibrationSubmitting.value = false
  calibrationDevice.value = null
  calibrationError.value = ''
}

async function saveCalibration() {
  if (!calibrationDevice.value?.id) return

  calibrationSubmitting.value = true
  calibrationError.value = ''
  try {
    await api.put(`/lower-devices/${calibrationDevice.value.id}/calibration`, {
      ...calibrationForm.value,
      calibration_date: calibrationForm.value.calibration_date || null,
      valid_until: calibrationForm.value.valid_until || null
    })
    closeCalibrationDialog()
    await loadLowerDevices()
  } catch (error) {
    calibrationError.value = error.response?.data?.details || error.response?.data?.error || '保存下位机校准信息失败'
  } finally {
    calibrationSubmitting.value = false
  }
}

onMounted(() => {
  search.value = String(route.query.search || '')
  loadLowerDevices()
})
</script>

<template>
  <div class="page-stack">
    <div class="toolbar">
      <input v-model="search" placeholder="搜索设备编号、名称或关联上位机" @keyup.enter="loadLowerDevices" />
      <button @click="loadLowerDevices">搜索</button>
      <button class="muted-button" @click="search = ''; loadLowerDevices()">重置</button>
      <span class="toolbar-tip">{{ lastUpdatedAt ? `最近刷新：${lastUpdatedAt}` : '' }}</span>
    </div>

    <div class="panel">
      <h3>下位机列表</h3>
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>编号</th>
            <th>名称</th>
            <th>K值</th>
            <th>β值</th>
            <th>校准日期</th>
            <th>校准机构</th>
            <th>有效期至</th>
            <th>校准状态</th>
            <th>关联上位机</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in lowerDevices" :key="item.id">
            <td>{{ item.id }}</td>
            <td>{{ item.device_code }}</td>
            <td>{{ item.device_name || '--' }}</td>
            <td>{{ item.k_value ?? '--' }}</td>
            <td>{{ item.beta_value ?? '--' }}</td>
            <td>{{ formatDate(item.calibration_date) }}</td>
            <td>{{ item.calibration_org || '--' }}</td>
            <td>{{ formatDate(item.valid_until) }}</td>
            <td>{{ calibrationStatusTextMap[item.calibration_status] || '--' }}</td>
            <td>{{ formatRelatedUpperDevice(item) }}</td>
            <td class="action-cell">
              <button class="secondary" @click="openCalibrationDialog(item)">编辑校准</button>
            </td>
          </tr>
          <tr v-if="!lowerDevices.length && !loading"><td colspan="11">暂无下位机数据</td></tr>
        </tbody>
      </table>
    </div>

    <div v-if="calibrationDialogVisible" class="dialog-overlay">
      <div class="dialog calibration-dialog">
        <div class="dialog-header">
          <div>
            <h3>编辑下位机校准信息</h3>
            <p class="dialog-subtitle">{{ calibrationDevice?.device_code || '--' }}</p>
          </div>
          <button class="icon-btn" @click="closeCalibrationDialog">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="calibration-form">
            <label>
              <span>K值</span>
              <input type="number" step="0.000001" v-model="calibrationForm.k_value" />
            </label>
            <label>
              <span>β值</span>
              <input type="number" step="0.000001" v-model="calibrationForm.beta_value" />
            </label>
            <label>
              <span>校准日期</span>
              <input type="date" v-model="calibrationForm.calibration_date" />
            </label>
            <label>
              <span>校准机构</span>
              <input type="text" v-model="calibrationForm.calibration_org" />
            </label>
            <label>
              <span>校准有效期</span>
              <input type="date" v-model="calibrationForm.valid_until" />
            </label>
            <label>
              <span>校准状态</span>
              <select v-model="calibrationForm.calibration_status">
                <option value="valid">有效</option>
                <option value="expired">已过期</option>
                <option value="pending">待校准</option>
              </select>
            </label>
          </div>
          <p v-if="calibrationError" class="error-text">{{ calibrationError }}</p>
        </div>
        <div class="dialog-footer">
          <button class="secondary muted" @click="closeCalibrationDialog">取消</button>
          <button class="secondary" :disabled="calibrationSubmitting" @click="saveCalibration">
            {{ calibrationSubmitting ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-stack { display: grid; gap: 18px; }
.toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.toolbar input { flex: 1; min-width: 260px; border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; }
.toolbar button { border: none; border-radius: 10px; background: #2563eb; color: #fff; padding: 10px 16px; }
.muted-button { background: #64748b !important; }
.toolbar-tip { color: #64748b; font-size: 13px; }
.panel { background: #fff; border-radius: 14px; padding: 18px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }
.panel h3 { margin-bottom: 14px; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 14px; }
.action-cell { display: flex; gap: 8px; }
.secondary { border: none; border-radius: 10px; color: #fff; padding: 8px 12px; background: #2563eb; }
.dialog-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.dialog { width: min(680px, 92vw); max-height: 85vh; overflow: auto; background: #fff; border-radius: 16px; box-shadow: 0 24px 64px rgba(15, 23, 42, 0.18); }
.dialog-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid #e5e7eb; }
.dialog-subtitle { margin-top: 4px; color: #64748b; font-size: 13px; }
.icon-btn { border: none; background: transparent; font-size: 24px; cursor: pointer; color: #475569; }
.dialog-body { padding: 18px 20px; }
.error-text { color: #dc2626; }
.calibration-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.calibration-form label { display: grid; gap: 6px; color: #334155; font-size: 13px; }
.calibration-form input, .calibration-form select { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; }
.dialog-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 0 20px 18px; }
.secondary.muted { background: #64748b; }
</style>
