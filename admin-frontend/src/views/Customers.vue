<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import api from '@/services/api'

const loading = ref(false)
const submitting = ref(false)
const bindingSubmitting = ref(false)
const callbackSubmitting = ref(false)
const customers = ref([])
const createUpperDeviceOptions = ref([])
const bindingUpperDeviceOptions = ref([])
const errorMessage = ref('')
const bindingErrorMessage = ref('')
const callbackErrorMessage = ref('')
const showBindingDialog = ref(false)
const showCallbackDialog = ref(false)
const showCreateDialog = ref(false)
const bindingCustomer = ref(null)
const callbackCustomer = ref(null)
const selectedBindingIds = ref([])
// 客户列表搜索关键字：仅对客户名称、联系人、联系电话做模糊匹配
const searchKeyword = ref('')

// 客户列表可展示列配置：默认不展示回调地址与回调 Key
const columnOptions = [
  { key: 'id', label: 'ID' },
  { key: 'customerCode', label: '客户编码' },
  { key: 'customerName', label: '客户名称' },
  { key: 'contactPerson', label: '联系人' },
  { key: 'contactPhone', label: '联系电话' },
  { key: 'callbackUrl', label: '回调地址' },
  { key: 'callbackKey', label: '回调 Key' },
  { key: 'upperDevices', label: '已绑上位机' },
  { key: 'clientKey', label: '客户 Key' }
]
const defaultHiddenColumnKeys = ['callbackUrl', 'callbackKey']
const visibleColumnKeys = ref(
  columnOptions.filter(col => !defaultHiddenColumnKeys.includes(col.key)).map(col => col.key)
)
const showColumnConfig = ref(false)

const form = reactive({
  customerCode: '',
  customerName: '',
  contactPerson: '',
  contactPhone: '',
  callbackUrl: '',
  callbackKey: '',
  upperDeviceIds: []
})

const callbackForm = reactive({
  customerCode: '',
  customerName: '',
  contactPerson: '',
  contactPhone: '',
  callbackUrl: '',
  callbackKey: ''
})

const createUpperDeviceSummary = computed(() =>
  createUpperDeviceOptions.value.map(item => ({
    id: item.id,
    imei: item.imei,
    label: item.device_name ? `${item.imei} / ${item.device_name}` : item.imei
  }))
)

const bindingUpperDeviceSummary = computed(() =>
  bindingUpperDeviceOptions.value.map(item => ({
    id: item.id,
    imei: item.imei,
    label: item.device_name ? `${item.imei} / ${item.device_name}` : item.imei
  }))
)

// 按关键字过滤客户列表，空关键字返回全量
const filteredCustomers = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return customers.value
  return customers.value.filter(item =>
    [item.customerName, item.contactPerson, item.contactPhone]
      .some(field => String(field || '').toLowerCase().includes(keyword))
  )
})

// 当前实际展示的列，顺序与 columnOptions 一致
const visibleColumns = computed(() =>
  columnOptions.filter(col => visibleColumnKeys.value.includes(col.key))
)

// 单元格取值，空值统一展示为 '--'
function cellText(item, key) {
  const value = item[key]
  return value === null || value === undefined || value === '' ? '--' : value
}

async function loadCustomers() {
  loading.value = true
  try {
    const response = await api.get('/customers')
    customers.value = response.data.data
  } finally {
    loading.value = false
  }
}

async function loadCreateUpperDevices() {
  const response = await api.get('/upper-devices/available')
  createUpperDeviceOptions.value = response.data.data || []
}

async function loadPageData() {
  await Promise.all([loadCustomers(), loadCreateUpperDevices()])
}

function resetForm() {
  form.customerCode = ''
  form.customerName = ''
  form.contactPerson = ''
  form.contactPhone = ''
  form.callbackUrl = ''
  form.callbackKey = ''
  form.upperDeviceIds = []
}

function openCreateDialog() {
  resetForm()
  errorMessage.value = ''
  showCreateDialog.value = true
}

function closeCreateDialog() {
  if (submitting.value) return
  showCreateDialog.value = false
}

async function createCustomer() {
  const payload = {
    customerCode: form.customerCode.trim(),
    customerName: form.customerName.trim(),
    contactPerson: form.contactPerson.trim(),
    contactPhone: form.contactPhone.trim(),
    callbackUrl: form.callbackUrl.trim(),
    callbackKey: form.callbackKey.trim(),
    upperDeviceIds: form.upperDeviceIds
  }

  if (!payload.customerCode || !payload.customerName) {
    errorMessage.value = '客户编码和客户名称不能为空'
    return
  }

  submitting.value = true
  errorMessage.value = ''
  try {
    await api.post('/customers', payload)
    resetForm()
    showCreateDialog.value = false
    await loadPageData()
  } catch (error) {
    errorMessage.value = error.response?.data?.details || error.response?.data?.error || '新增客户失败'
  } finally {
    submitting.value = false
  }
}

async function removeCustomer(id) {
  await api.delete(`/customers/${id}`)
  await loadCustomers()
}

async function openBindingDialog(customer) {
  bindingCustomer.value = customer
  selectedBindingIds.value = [...(customer.upperDeviceIds || [])]
  bindingErrorMessage.value = ''
  showBindingDialog.value = true

  try {
    const [bindingsResponse, availableResponse] = await Promise.all([
      api.get(`/customers/${customer.id}/upper-devices`),
      api.get('/upper-devices/available', { params: { customerId: customer.id } })
    ])
    selectedBindingIds.value = (bindingsResponse.data.data || []).map(item => item.id)
    bindingUpperDeviceOptions.value = availableResponse.data.data || []
  } catch (error) {
    bindingErrorMessage.value = error.response?.data?.details || error.response?.data?.error || '加载客户绑定上位机失败'
  }
}

function closeBindingDialog() {
  showBindingDialog.value = false
  bindingCustomer.value = null
  selectedBindingIds.value = []
  bindingUpperDeviceOptions.value = []
  bindingErrorMessage.value = ''
}

function openCallbackDialog(customer) {
  callbackCustomer.value = customer
  callbackForm.customerCode = customer.customerCode || ''
  callbackForm.customerName = customer.customerName || ''
  callbackForm.contactPerson = customer.contactPerson || ''
  callbackForm.contactPhone = customer.contactPhone || ''
  callbackForm.callbackUrl = customer.callbackUrl || ''
  callbackForm.callbackKey = customer.callbackKey || ''
  callbackErrorMessage.value = ''
  showCallbackDialog.value = true
}

function closeCallbackDialog() {
  showCallbackDialog.value = false
  callbackCustomer.value = null
  callbackForm.customerCode = ''
  callbackForm.customerName = ''
  callbackForm.contactPerson = ''
  callbackForm.contactPhone = ''
  callbackForm.callbackUrl = ''
  callbackForm.callbackKey = ''
  callbackErrorMessage.value = ''
}

async function saveCallbackConfig() {
  if (!callbackCustomer.value) {
    return
  }

  callbackSubmitting.value = true
  callbackErrorMessage.value = ''
  try {
    const payload = {
      customerCode: callbackForm.customerCode.trim(),
      customerName: callbackForm.customerName.trim(),
      contactPerson: callbackForm.contactPerson.trim(),
      contactPhone: callbackForm.contactPhone.trim(),
      callbackUrl: callbackForm.callbackUrl.trim(),
      callbackKey: callbackForm.callbackKey.trim()
    }

    if (!payload.customerCode || !payload.customerName) {
      callbackErrorMessage.value = '客户编码和客户名称不能为空'
      return
    }

    await api.put(`/customers/${callbackCustomer.value.id}`, {
      ...payload
    })
    closeCallbackDialog()
    await loadCustomers()
  } catch (error) {
    callbackErrorMessage.value = error.response?.data?.details || error.response?.data?.error || '保存回调配置失败'
  } finally {
    callbackSubmitting.value = false
  }
}

async function saveBindings() {
  if (!bindingCustomer.value) {
    return
  }

  bindingSubmitting.value = true
  bindingErrorMessage.value = ''
  try {
    await api.put(`/customers/${bindingCustomer.value.id}/upper-devices`, {
      upperDeviceIds: selectedBindingIds.value
    })
    closeBindingDialog()
    await loadPageData()
  } catch (error) {
    bindingErrorMessage.value = error.response?.data?.details || error.response?.data?.error || '保存客户绑定上位机失败'
  } finally {
    bindingSubmitting.value = false
  }
}

onMounted(loadPageData)
</script>

<template>
  <div class="page-stack">
    <div class="panel">
      <div class="panel-heading">
        <div>
          <h3>客户列表</h3>
          <p>共 {{ customers.length }} 个客户{{ searchKeyword.trim() ? `，匹配 ${filteredCustomers.length} 个` : '' }}</p>
        </div>
        <button class="primary" @click="openCreateDialog">新增客户</button>
      </div>
      <div class="toolbar">
        <input v-model="searchKeyword" class="search-input" placeholder="搜索客户名称、联系人或联系电话" />
        <button v-if="searchKeyword" class="secondary" @click="searchKeyword = ''">清空</button>
        <div class="column-config">
          <button class="secondary" @click="showColumnConfig = !showColumnConfig">列设置</button>
          <div v-if="showColumnConfig" class="column-config-backdrop" @click="showColumnConfig = false"></div>
          <div v-if="showColumnConfig" class="column-config-panel">
            <div class="column-config-title">展示列</div>
            <label v-for="col in columnOptions" :key="col.key" class="column-config-item">
              <input v-model="visibleColumnKeys" type="checkbox" :value="col.key">
              <span>{{ col.label }}</span>
            </label>
          </div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table">
        <thead>
          <tr>
            <th v-for="col in visibleColumns" :key="col.key">{{ col.label }}</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filteredCustomers" :key="item.id">
            <td v-for="col in visibleColumns" :key="col.key">
              <div v-if="col.key === 'upperDevices'" class="binding-summary">
                <strong>{{ item.upperDeviceCount || 0 }}</strong>
                <span>{{ (item.upperDeviceImeis || []).join(', ') || '--' }}</span>
              </div>
              <template v-else>{{ cellText(item, col.key) }}</template>
            </td>
            <td class="action-cell">
              <div class="action-group">
                <button class="secondary" @click="openCallbackDialog(item)">编辑客户</button>
                <button class="secondary" @click="openBindingDialog(item)">绑定上位机</button>
                <button class="danger" @click="removeCustomer(item.id)">删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="!filteredCustomers.length && !loading">
            <td :colspan="visibleColumns.length + 1" class="empty-cell">{{ searchKeyword.trim() ? '未找到匹配的客户' : '暂无客户' }}</td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>

    <div v-if="showCreateDialog" class="dialog-overlay">
      <div class="dialog">
        <div class="dialog-header">
          <h3>新增客户</h3>
          <button class="icon-btn" @click="closeCreateDialog">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="create-form">
            <label>客户编码<input v-model="form.customerCode" placeholder="请输入客户编码" /></label>
            <label>客户名称<input v-model="form.customerName" placeholder="请输入客户名称" /></label>
            <label>联系人<input v-model="form.contactPerson" placeholder="请输入联系人" /></label>
            <label>联系电话<input v-model="form.contactPhone" placeholder="请输入联系电话" /></label>
            <label class="full">回调地址<input v-model="form.callbackUrl" placeholder="请输入回调地址" /></label>
            <label class="full">客户端回调 Key<input v-model="form.callbackKey" placeholder="留空则使用管理端全局默认值" /></label>
          </div>
          <div class="binding-panel">
            <div class="binding-panel-header">
              <span>创建时绑定上位机</span>
              <small>{{ form.upperDeviceIds.length }} 台已选择</small>
            </div>
            <div class="binding-list" v-if="createUpperDeviceSummary.length">
              <label v-for="item in createUpperDeviceSummary" :key="item.id" class="binding-item">
                <input v-model="form.upperDeviceIds" type="checkbox" :value="item.id">
                <span>{{ item.label }}</span>
              </label>
            </div>
            <div v-else class="empty-text">暂无可绑定上位机</div>
          </div>
          <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
        </div>
        <div class="dialog-footer">
          <button class="secondary" @click="closeCreateDialog">取消</button>
          <button class="primary" :disabled="submitting" @click="createCustomer">{{ submitting ? '提交中...' : '确认新增' }}</button>
        </div>
      </div>
    </div>

    <div v-if="showBindingDialog" class="dialog-overlay">
      <div class="dialog">
        <div class="dialog-header">
          <h3>绑定上位机</h3>
          <button class="icon-btn" @click="closeBindingDialog">&times;</button>
        </div>
        <div class="dialog-body">
          <p class="dialog-subtitle">
            当前客户：{{ bindingCustomer?.customerName }}（{{ bindingCustomer?.customerCode }}）
          </p>
          <div class="binding-list dialog-binding-list" v-if="bindingUpperDeviceSummary.length">
            <label v-for="item in bindingUpperDeviceSummary" :key="item.id" class="binding-item">
              <input v-model="selectedBindingIds" type="checkbox" :value="item.id">
              <span>{{ item.label }}</span>
            </label>
          </div>
          <div v-else class="empty-text">暂无可绑定上位机</div>
          <p v-if="bindingErrorMessage" class="error-text">{{ bindingErrorMessage }}</p>
        </div>
        <div class="dialog-footer">
          <button class="secondary" @click="closeBindingDialog">取消</button>
          <button class="primary" :disabled="bindingSubmitting" @click="saveBindings">
            {{ bindingSubmitting ? '保存中...' : '保存绑定' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showCallbackDialog" class="dialog-overlay">
      <div class="dialog dialog-compact">
        <div class="dialog-header">
          <h3>编辑客户</h3>
          <button class="icon-btn" @click="closeCallbackDialog">&times;</button>
        </div>
        <div class="dialog-body">
          <p class="dialog-subtitle">
            当前客户：{{ callbackCustomer?.customerName }}（{{ callbackCustomer?.customerCode }}）
          </p>
          <div class="create-form">
            <label><span class="field-label">客户编码<em class="required-mark">*</em></span><input v-model="callbackForm.customerCode" placeholder="请输入客户编码" /></label>
            <label><span class="field-label">客户名称<em class="required-mark">*</em></span><input v-model="callbackForm.customerName" placeholder="请输入客户名称" /></label>
            <label><span class="field-label">联系人</span><input v-model="callbackForm.contactPerson" placeholder="请输入联系人" /></label>
            <label><span class="field-label">联系电话</span><input v-model="callbackForm.contactPhone" placeholder="请输入联系电话" /></label>
            <label class="full"><span class="field-label">回调地址</span><input v-model="callbackForm.callbackUrl" placeholder="请输入客户端回调地址" /></label>
            <label class="full"><span class="field-label">客户端回调 Key</span><input v-model="callbackForm.callbackKey" placeholder="留空则使用管理端全局默认值" /></label>
          </div>
          <p v-if="callbackErrorMessage" class="error-text">{{ callbackErrorMessage }}</p>
        </div>
        <div class="dialog-footer">
          <button class="secondary" @click="closeCallbackDialog">取消</button>
          <button class="primary" :disabled="callbackSubmitting" @click="saveCallbackConfig">
            {{ callbackSubmitting ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-stack { display: grid; gap: 18px; }
.panel { background: #fff; border-radius: 14px; padding: 18px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }
.panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; }
.panel-heading h3 { color: #1f2937; font-size: 16px; }
.panel-heading p { margin-top: 5px; color: #64748b; font-size: 13px; }

/* 搜索工具栏：输入框占满一行，有内容时显示清空按钮 */
.toolbar { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; margin: 14px 0 4px; }
.search-input { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; }

/* 列设置：按钮右侧弹出勾选面板，遮罩层用于点击空白处收起 */
.column-config { position: relative; }
.column-config-backdrop { position: fixed; inset: 0; z-index: 20; }
.column-config-panel { position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; min-width: 160px; padding: 10px; border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14); }
.column-config-title { padding: 2px 6px 8px; color: #64748b; font-size: 12px; border-bottom: 1px solid #f1f5f9; }
.column-config-item { display: flex; align-items: center; gap: 8px; padding: 7px 6px; color: #334155; font-size: 13px; cursor: pointer; }
.column-config-item:hover { background: #f8fafc; border-radius: 8px; }

.primary, .secondary, .danger { border: none; border-radius: 10px; color: #fff; padding: 10px 14px; cursor: pointer; }
.primary { background: #2563eb; }
.secondary { background: #64748b; }
.danger { background: #dc2626; }
.primary:disabled { opacity: 0.7; cursor: not-allowed; }

/* 新增客户弹窗表单：两列栅格，回调相关字段通栏 */
.create-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.create-form label { display: grid; gap: 6px; color: #334155; font-size: 13px; }
.create-form input { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; }
.create-form .full { grid-column: 1 / -1; }
.field-label { display: block; font-weight: 600; }
.required-mark { margin-left: 4px; color: #dc2626; font-style: normal; }

.binding-panel { margin-top: 14px; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; }
.binding-panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; color: #334155; }
.binding-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; max-height: 220px; overflow: auto; }
.binding-item { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 10px; font-size: 14px; }
.binding-summary { display: grid; gap: 4px; }
.binding-summary strong { color: #0f172a; }
.empty-text { color: #64748b; font-size: 14px; }
.error-text { margin-top: 12px; color: #dc2626; font-size: 14px; }
.table-wrap { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; margin-top: 10px; }
.table th, .table td { padding: 10px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 14px; vertical-align: top; white-space: nowrap; }
.table th { color: #475569; font-weight: 600; background: #f8fafc; }
.empty-cell { padding: 22px; color: #64748b; text-align: center; }
/* 修复说明：display:flex 直接加在 td 上会使该单元格不再生成 table-cell 盒子，
   导致内边距与 vertical-align:top 失效、操作列与其他列错位，这里改为在单元格内用容器承载 flex 布局。 */
.action-cell { vertical-align: top; }
.action-group { display: flex; gap: 8px; }
.action-group button { padding: 6px 10px; font-size: 12px; border-radius: 8px; }
.dialog-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.35); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.dialog { width: 760px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px); overflow: auto; background: #fff; border-radius: 16px; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.2); }
.dialog-header, .dialog-footer { display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; }
.dialog-header { border-bottom: 1px solid #e5e7eb; }
.dialog-header h3 { color: #1f2937; }
.dialog-body { padding: 18px; }
.dialog-subtitle { margin-bottom: 14px; color: #475569; }
.dialog-binding-list { max-height: 360px; }
.dialog-compact { width: 560px; }
.icon-btn { border: none; background: transparent; font-size: 24px; cursor: pointer; color: #64748b; }
.dialog-footer { border-top: 1px solid #e5e7eb; justify-content: flex-end; gap: 8px; }
@media (max-width: 640px) { .create-form { grid-template-columns: 1fr; } .create-form .full { grid-column: auto; } .binding-list { grid-template-columns: 1fr; } }
</style>
