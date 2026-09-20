<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '@/services/api'

const loading = ref(false)
const inventoryLoading = ref(false)
const errorMessage = ref('')
const overview = ref({ customers: 0, soldDevices: 0, inStockDevices: 0, warehouses: 0, soldDevicesByCustomer: [] })
const inventory = ref([])
const warehouses = ref([])
const customers = ref([])
const availableDevices = ref([])
const filters = ref({ search: '', status: '', deviceType: '' })

const stockDialogVisible = ref(false)
const stockSubmitting = ref(false)
const stockError = ref('')
const stockForm = ref({ device_type: 'upper', device_id: '', warehouse_id: '', notes: '' })

const saleDialogVisible = ref(false)
const saleSubmitting = ref(false)
const saleError = ref('')
const saleTarget = ref(null)
const saleForm = ref({ customer_id: '', notes: '' })

const warehouseDialogVisible = ref(false)
const warehouseEditId = ref(null)
const warehouseSubmitting = ref(false)
const warehouseError = ref('')
const warehouseForm = ref({ warehouse_code: '', warehouse_name: '', address: '' })

const statItems = computed(() => [
  { label: '客户数量', value: overview.value.customers },
  { label: '总售出设备', value: overview.value.soldDevices },
  { label: '仓库在库设备', value: overview.value.inStockDevices },
  { label: '启用仓库数', value: overview.value.warehouses }
])

const availableForStock = computed(() => availableDevices.value.filter(item => item.device_type === stockForm.value.device_type))

const statusText = {
  in_stock: '在库',
  sold: '已售出',
  returned: '已退回',
  scrapped: '已报废'
}

function deviceTypeText(type) {
  return type === 'upper' ? '上位机' : '下位机'
}

function formatDate(value) {
  if (!value) return '--'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false })
}

async function loadOverview() {
  const response = await api.get('/device-management/overview')
  overview.value = response.data.data || overview.value
}

async function loadInventory() {
  inventoryLoading.value = true
  try {
    const response = await api.get('/device-management/inventory', {
      params: { ...filters.value, page: 1, limit: 100 }
    })
    inventory.value = response.data.data?.list || []
  } finally {
    inventoryLoading.value = false
  }
}

async function loadSupportingData() {
  const [warehouseResponse, customerResponse, availableResponse] = await Promise.all([
    api.get('/warehouses'),
    api.get('/customers'),
    api.get('/device-management/available-devices')
  ])
  warehouses.value = warehouseResponse.data.data || []
  customers.value = customerResponse.data.data || []
  availableDevices.value = availableResponse.data.data || []
  if (!stockForm.value.warehouse_id && warehouses.value.length) {
    stockForm.value.warehouse_id = warehouses.value[0].id
  }
}

async function loadAll() {
  loading.value = true
  errorMessage.value = ''
  try {
    await Promise.all([loadOverview(), loadInventory(), loadSupportingData()])
  } catch (error) {
    errorMessage.value = error.response?.data?.details || error.response?.data?.error || '设备管理数据加载失败'
  } finally {
    loading.value = false
  }
}

function openStockDialog() {
  stockError.value = ''
  stockForm.value = {
    device_type: 'upper',
    device_id: '',
    warehouse_id: warehouses.value[0]?.id || '',
    notes: ''
  }
  stockDialogVisible.value = true
}

function closeStockDialog() {
  if (stockSubmitting.value) return
  stockDialogVisible.value = false
}

async function stockDevice() {
  stockSubmitting.value = true
  stockError.value = ''
  try {
    await api.post('/device-management/inventory', stockForm.value)
    closeStockDialog()
    await loadAll()
  } catch (error) {
    stockError.value = error.response?.data?.details || error.response?.data?.error || '设备入库失败'
  } finally {
    stockSubmitting.value = false
  }
}

function openSaleDialog(item) {
  saleTarget.value = item
  saleForm.value = { customer_id: '', notes: '' }
  saleError.value = ''
  saleDialogVisible.value = true
}

function closeSaleDialog() {
  if (saleSubmitting.value) return
  saleDialogVisible.value = false
  saleTarget.value = null
}

async function sellDevice() {
  saleSubmitting.value = true
  saleError.value = ''
  try {
    await api.post('/device-management/sales', {
      inventory_id: saleTarget.value.id,
      ...saleForm.value
    })
    closeSaleDialog()
    await loadAll()
  } catch (error) {
    saleError.value = error.response?.data?.details || error.response?.data?.error || '设备销售失败'
  } finally {
    saleSubmitting.value = false
  }
}

async function returnDevice(item) {
  if (!window.confirm(`确定将设备 ${item.identifier} 从客户 ${item.customer_name || '--'} 退回仓库吗？`)) return
  try {
    await api.post(`/device-management/inventory/${item.id}/return`)
    await loadAll()
  } catch (error) {
    errorMessage.value = error.response?.data?.details || error.response?.data?.error || '设备退回失败'
  }
}

async function restockDevice(item) {
  try {
    await api.post('/device-management/inventory', {
      device_type: item.device_type,
      device_id: item.device_type === 'upper' ? item.upper_device_id : item.lower_device_id,
      warehouse_id: item.warehouse_id,
      notes: item.notes
    })
    await loadAll()
  } catch (error) {
    errorMessage.value = error.response?.data?.details || error.response?.data?.error || '设备重新入库失败'
  }
}

function openWarehouseDialog() {
  warehouseForm.value = { warehouse_code: '', warehouse_name: '', address: '' }
  warehouseError.value = ''
  warehouseEditId.value = null
  warehouseDialogVisible.value = true
}

function openEditWarehouse(warehouse) {
  warehouseEditId.value = warehouse.id
  warehouseForm.value = {
    warehouse_code: warehouse.warehouse_code,
    warehouse_name: warehouse.warehouse_name,
    address: warehouse.address || '',
    status: warehouse.status
  }
  warehouseError.value = ''
  warehouseDialogVisible.value = true
}

function closeWarehouseDialog() {
  if (!warehouseSubmitting.value) warehouseDialogVisible.value = false
}

async function createWarehouse() {
  warehouseSubmitting.value = true
  warehouseError.value = ''
  try {
    if (warehouseEditId.value) {
      await api.put(`/warehouses/${warehouseEditId.value}`, warehouseForm.value)
    } else {
      await api.post('/warehouses', warehouseForm.value)
    }
    closeWarehouseDialog()
    await loadAll()
  } catch (error) {
    warehouseError.value = error.response?.data?.details || error.response?.data?.error || '仓库创建失败'
  } finally {
    warehouseSubmitting.value = false
  }
}

function refreshInventory() {
  loadInventory().catch(error => {
    errorMessage.value = error.response?.data?.details || error.response?.data?.error || '库存刷新失败'
  })
}

onMounted(loadAll)
</script>

<template>
  <div class="page-stack">
    <div v-if="errorMessage" class="feedback error">{{ errorMessage }}</div>

    <!-- 顶部：统计概览 -->
    <div class="stat-grid">
      <div v-for="item in statItems" :key="item.label" class="stat-card">
        <span>{{ item.label }}</span><strong>{{ loading ? '...' : item.value }}</strong>
      </div>
    </div>

    <!-- 中部：设备库存与销售 -->
    <div class="panel">
      <div class="panel-heading">
        <div><h3>设备库存与销售</h3><p>设备出厂后先入库，售出后进入客户设备管理。</p></div>
        <button class="text-button" @click="loadAll">刷新</button>
      </div>
      <div class="filters">
        <input v-model="filters.search" placeholder="搜索设备编号、IMEI、客户或仓库" @keyup.enter="refreshInventory" />
        <select v-model="filters.deviceType" @change="refreshInventory"><option value="">全部设备</option><option value="upper">上位机</option><option value="lower">下位机</option></select>
        <select v-model="filters.status" @change="refreshInventory"><option value="">全部状态</option><option value="in_stock">在库</option><option value="sold">已售出</option><option value="returned">已退回</option><option value="scrapped">已报废</option></select>
        <button class="primary" @click="refreshInventory">搜索</button>
      </div>
      <div class="table-wrap">
        <table class="table wide">
          <thead><tr><th>设备类型</th><th>设备编号</th><th>设备名称</th><th>状态</th><th>仓库</th><th>客户</th><th>入库时间</th><th>售出时间</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="item in inventory" :key="item.id">
              <td>{{ deviceTypeText(item.device_type) }}</td>
              <td>{{ item.identifier || '--' }}</td>
              <td>{{ item.device_name || '--' }}</td>
              <td><span class="status" :class="item.inventory_status">{{ statusText[item.inventory_status] || item.inventory_status }}</span></td>
              <td>{{ item.warehouse_name || '--' }}</td>
              <td>{{ item.customer_name ? `${item.customer_name} (${item.customer_code})` : '--' }}</td>
              <td>{{ formatDate(item.stocked_at) }}</td>
              <td>{{ formatDate(item.sold_at) }}</td>
              <td class="action-cell">
                <button v-if="item.inventory_status === 'in_stock'" class="primary small" @click="openSaleDialog(item)">销售</button>
                <button v-if="item.inventory_status === 'sold'" class="warning small" @click="returnDevice(item)">退回仓库</button>
                <button v-if="item.inventory_status === 'sold' && item.device_type === 'upper'" class="secondary small" @click="$router.push({ path: '/upper-devices', query: { search: item.identifier } })">处理设备</button>
                <button v-if="item.inventory_status === 'sold' && item.device_type === 'lower'" class="secondary small" @click="$router.push({ path: '/lower-devices', query: { search: item.identifier } })">处理设备</button>
                <button v-if="item.inventory_status === 'returned' || item.inventory_status === 'scrapped'" class="secondary small" @click="restockDevice(item)">重新入库</button>
              </td>
            </tr>
            <tr v-if="!inventory.length && !inventoryLoading"><td colspan="9" class="empty-cell">暂无库存记录</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 底部：客户售出设备 与 仓库 并排展示 -->
    <div class="bottom-grid">
      <div class="panel customer-panel">
        <div class="panel-heading"><div><h3>客户售出设备</h3><p>按当前已售出设备统计客户归属。</p></div></div>
        <div class="table-wrap" v-if="overview.soldDevicesByCustomer?.length">
          <table class="table">
            <thead><tr><th>客户</th><th>客户编码</th><th>总数</th><th>上位机</th><th>下位机</th></tr></thead>
            <tbody><tr v-for="item in overview.soldDevicesByCustomer" :key="item.id"><td>{{ item.customer_name }}</td><td>{{ item.customer_code }}</td><td>{{ item.sold_device_count }}</td><td>{{ item.sold_upper_count || 0 }}</td><td>{{ item.sold_lower_count || 0 }}</td></tr></tbody>
          </table>
        </div>
        <p v-else class="empty-text">暂无已售出设备。</p>
      </div>

      <div class="panel warehouse-panel">
        <div class="panel-heading">
          <div><h3>仓库</h3><p>当前启用仓库及设备数量。</p></div>
          <div class="heading-actions">
            <button class="secondary small" @click="openWarehouseDialog">新增仓库</button>
            <button class="primary small" @click="openStockDialog">设备入库</button>
          </div>
        </div>
        <div class="warehouse-grid"><div v-for="warehouse in warehouses" :key="warehouse.id" class="warehouse-card"><strong>{{ warehouse.warehouse_name }}</strong><span>{{ warehouse.warehouse_code }} · {{ warehouse.status === 'active' ? '启用' : '停用' }}</span><small>{{ warehouse.address || '未填写地址' }}</small><button class="text-button" @click="openEditWarehouse(warehouse)">编辑仓库</button></div></div>
        <p v-if="!warehouses.length" class="empty-text">暂无仓库，点击右上角“新增仓库”创建。</p>
      </div>
    </div>

    <div v-if="stockDialogVisible" class="dialog-overlay">
      <div class="dialog">
        <div class="dialog-header"><h3>设备入库</h3><button class="icon-button" @click="closeStockDialog">&times;</button></div>
        <div class="dialog-body form-grid">
          <label>设备类型<select v-model="stockForm.device_type" @change="stockForm.device_id = ''"><option value="upper">上位机</option><option value="lower">下位机</option></select></label>
          <label>设备<select v-model="stockForm.device_id"><option value="">请选择设备</option><option v-for="item in availableForStock" :key="`${item.device_type}-${item.device_id}`" :value="item.device_id">{{ item.identifier }} / {{ item.device_name || '未命名设备' }}</option></select></label>
          <label>仓库<select v-model="stockForm.warehouse_id"><option v-for="item in warehouses" :key="item.id" :value="item.id">{{ item.warehouse_name }}</option></select></label>
          <label class="full">备注<textarea v-model="stockForm.notes" rows="3"></textarea></label>
          <p v-if="stockError" class="feedback error full">{{ stockError }}</p>
        </div>
        <div class="dialog-footer"><button class="muted" @click="closeStockDialog">取消</button><button class="primary" :disabled="stockSubmitting" @click="stockDevice">{{ stockSubmitting ? '入库中...' : '确认入库' }}</button></div>
      </div>
    </div>

    <div v-if="saleDialogVisible" class="dialog-overlay">
      <div class="dialog">
        <div class="dialog-header"><div><h3>销售设备</h3><p>{{ saleTarget?.identifier }} / {{ deviceTypeText(saleTarget?.device_type) }}</p></div><button class="icon-button" @click="closeSaleDialog">&times;</button></div>
        <div class="dialog-body form-grid">
          <label class="full">销售客户<select v-model="saleForm.customer_id"><option value="">请选择客户</option><option v-for="customer in customers" :key="customer.id" :value="customer.id">{{ customer.customer_name }}（{{ customer.customer_code }}）</option></select></label>
          <label class="full">备注<textarea v-model="saleForm.notes" rows="3"></textarea></label>
          <p class="hint full">确认销售后，设备将进入客户设备管理；上位机会同步客户绑定关系。</p>
          <p v-if="saleError" class="feedback error full">{{ saleError }}</p>
        </div>
        <div class="dialog-footer"><button class="muted" @click="closeSaleDialog">取消</button><button class="primary" :disabled="saleSubmitting" @click="sellDevice">{{ saleSubmitting ? '提交中...' : '确认销售' }}</button></div>
      </div>
    </div>

    <div v-if="warehouseDialogVisible" class="dialog-overlay">
      <div class="dialog small-dialog">
        <div class="dialog-header"><h3>{{ warehouseEditId ? '编辑仓库' : '新增仓库' }}</h3><button class="icon-button" @click="closeWarehouseDialog">&times;</button></div>
        <div class="dialog-body form-grid"><label>仓库编码<input v-model="warehouseForm.warehouse_code" :disabled="!!warehouseEditId" placeholder="例如 MAIN-2" /></label><label>仓库名称<input v-model="warehouseForm.warehouse_name" placeholder="请输入仓库名称" /></label><label class="full">地址<input v-model="warehouseForm.address" /></label><label v-if="warehouseEditId" class="full">状态<select v-model="warehouseForm.status"><option value="active">启用</option><option value="inactive">停用</option></select></label><p v-if="warehouseError" class="feedback error full">{{ warehouseError }}</p></div>
        <div class="dialog-footer"><button class="muted" @click="closeWarehouseDialog">取消</button><button class="primary" :disabled="warehouseSubmitting" @click="createWarehouse">{{ warehouseSubmitting ? '保存中...' : (warehouseEditId ? '保存仓库' : '创建仓库') }}</button></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-stack { display: grid; gap: 18px; align-content: start; }

/* 面板标题：标题说明在左，操作按钮在右 */
.panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; }
.panel-heading h3 { color: #1f2937; font-size: 16px; }
.panel-heading p { margin-top: 5px; color: #64748b; font-size: 13px; }
.heading-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* 统计卡片 */
.stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.stat-card, .panel { background: #fff; border-radius: 12px; padding: 18px; box-shadow: 0 8px 24px rgba(15, 23, 42, .06); }
.stat-card span { display: block; color: #64748b; font-size: 13px; }
.stat-card strong { display: block; margin-top: 8px; color: #0f172a; font-size: 30px; font-variant-numeric: tabular-nums; }

/* 筛选栏：输入框 + 两个下拉 + 按钮并列一排，仅窄屏换行 */
.filters { display: grid; grid-template-columns: minmax(240px, 1.6fr) minmax(0, 1fr) minmax(0, 1fr) auto; gap: 10px; align-items: center; margin: 14px 0 4px; }

/* 表格操作列按钮 */
.action-cell { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
input, select, textarea { box-sizing: border-box; width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 9px 10px; background: #fff; }
button { border: 0; border-radius: 8px; padding: 9px 13px; cursor: pointer; }
button:disabled { opacity: .55; cursor: not-allowed; }
.primary { background: #2563eb; color: #fff; }
.secondary { background: #0f766e; color: #fff; }
.warning { background: #d97706; color: #fff; }
.muted { background: #64748b; color: #fff; }
.small { padding: 6px 9px; font-size: 12px; }
.text-button { background: transparent; color: #2563eb; padding: 4px 6px; }
.table-wrap { overflow-x: auto; margin-top: 6px; }
.table { width: 100%; border-collapse: collapse; }
.table.wide { min-width: 980px; }
.customer-panel .table { min-width: 420px; }
.table th, .table td { padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 13px; vertical-align: middle; white-space: nowrap; }
.table th { color: #475569; font-weight: 600; background: #f8fafc; }
.table th:first-child { border-radius: 6px 0 0 6px; }
.table th:last-child { border-radius: 0 6px 6px 0; }
.status { display: inline-flex; padding: 4px 8px; border-radius: 999px; font-size: 12px; }
.status.in_stock { color: #166534; background: #dcfce7; }
.status.sold { color: #1d4ed8; background: #dbeafe; }
.status.returned { color: #92400e; background: #fef3c7; }
.status.scrapped { color: #991b1b; background: #fee2e2; }
.empty-cell, .empty-text { padding: 22px; color: #64748b; text-align: center; font-size: 13px; }

/* 底部：客户售出设备 与 仓库 并排展示 */
.bottom-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 18px; align-items: start; }

/* 仓库卡片：网格自适应，卡片带悬浮效果 */
.warehouse-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; margin-top: 14px; }
.warehouse-card { display: grid; gap: 5px; padding: 14px; border: 1px solid #e5e7eb; border-radius: 10px; transition: border-color .15s, box-shadow .15s; }
.warehouse-card:hover { border-color: #93c5fd; box-shadow: 0 6px 16px rgba(37, 99, 235, .08); }
.warehouse-card strong { color: #1f2937; }
.warehouse-card span, .warehouse-card small { color: #64748b; font-size: 12px; }
.warehouse-card .text-button { justify-self: start; }

.feedback { padding: 10px 12px; border-radius: 8px; }
.feedback.error { color: #991b1b; background: #fee2e2; }
.hint { color: #64748b; font-size: 13px; line-height: 1.5; }
.dialog-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(15, 23, 42, .45); }
.dialog { width: min(620px, 100%); max-height: 90vh; overflow: auto; background: #fff; border-radius: 12px; box-shadow: 0 24px 64px rgba(15, 23, 42, .2); }
.small-dialog { width: min(500px, 100%); }
.dialog-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 20px; border-bottom: 1px solid #e5e7eb; }
.dialog-header h3 { color: #1f2937; }
.dialog-header p { margin-top: 5px; color: #64748b; font-size: 13px; }
.icon-button { padding: 0 5px; background: transparent; color: #475569; font-size: 24px; }
.dialog-body { display: grid; gap: 14px; padding: 20px; }
.form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.form-grid label { display: grid; gap: 6px; color: #334155; font-size: 13px; }
.full { grid-column: 1 / -1; }
.dialog-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 0 20px 20px; }
@media (max-width: 1100px) { .bottom-grid { grid-template-columns: 1fr; } }
@media (max-width: 800px) { .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .filters { grid-template-columns: 1fr 1fr; } }
@media (max-width: 520px) { .stat-grid, .form-grid, .filters { grid-template-columns: 1fr; } .full { grid-column: auto; } }
</style>
