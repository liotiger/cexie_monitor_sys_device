<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'

const reportsList = ref([])
const pagination = ref(null)
const filters = ref({
  report_type: '',
  status: ''
})

const showCreateDialog = ref(false)
const showDetailDialog = ref(false)
const showReviewDialog = ref(false)
const currentReport = ref(null)
const reviewFormData = ref({
  status: '',
  review_comment: ''
})

const reportTypeOptions = [
  { value: '', label: '全部类型' },
  { value: 'daily', label: '日报' },
  { value: 'weekly', label: '周报' },
  { value: 'monthly', label: '月报' },
  { value: 'custom', label: '自定义报表' }
]

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'pending_review', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' }
]

const reportTypeTextMap = {
  daily: '日报',
  weekly: '周报',
  monthly: '月报',
  custom: '自定义报表'
}

const statusTextMap = {
  draft: '草稿',
  pending_review: '待审核',
  approved: '已通过',
  rejected: '已驳回'
}

const statusClassMap = {
  draft: 'status-draft',
  pending_review: 'status-pending',
  approved: 'status-approved',
  rejected: 'status-rejected'
}

const createFormData = ref({
  report_name: '',
  report_type: 'daily',
  hole_ids: '',
  start_time: '',
  end_time: '',
  description: ''
})

async function loadReports(page = 1) {
  try {
    let url = `/reports?page=${page}&limit=10`
    
    if (filters.value.report_type) {
      url += `&report_type=${filters.value.report_type}`
    }
    if (filters.value.status) {
      url += `&status=${filters.value.status}`
    }
    
    const response = await api.get(url)
    if (response.data.success) {
      reportsList.value = response.data.data.list
      pagination.value = response.data.data.pagination
    }
  } catch (error) {
    console.error('Failed to load reports:', error)
  }
}

function filterReports() {
  loadReports(1)
}

function changePage(page) {
  loadReports(page)
}

function resetFilters() {
  filters.value = {
    report_type: '',
    status: ''
  }
  loadReports(1)
}

function openCreateDialog() {
  createFormData.value = {
    report_name: '',
    report_type: 'daily',
    hole_ids: '',
    start_time: '',
    end_time: '',
    description: ''
  }
  showCreateDialog.value = true
}

async function createReport() {
  try {
    const data = {
      ...createFormData.value,
      hole_ids: createFormData.value.hole_ids.split(',').map(id => id.trim()).filter(id => id)
    }
    const response = await api.post('/reports', data)
    if (response.data.success) {
      showCreateDialog.value = false
      loadReports()
    }
  } catch (error) {
    console.error('Failed to create report:', error)
    alert(error.response?.data?.message || '创建报表失败')
  }
}

async function viewDetail(report) {
  try {
    const response = await api.get(`/reports/${report.id}`)
    if (response.data.success) {
      currentReport.value = response.data.data
      showDetailDialog.value = true
    }
  } catch (error) {
    console.error('Failed to load detail:', error)
  }
}

async function generateReport(report) {
  try {
    const response = await api.post(`/reports/${report.id}/generate`)
    if (response.data.success) {
      loadReports(pagination.value?.page || 1)
      alert('报表生成成功')
    }
  } catch (error) {
    console.error('Failed to generate report:', error)
    alert('生成报表失败')
  }
}

function openReviewDialog(report) {
  currentReport.value = report
  reviewFormData.value = {
    status: 'approved',
    review_comment: ''
  }
  showReviewDialog.value = true
}

async function reviewReport() {
  try {
    const response = await api.put(`/reports/${currentReport.value.id}/review`, reviewFormData.value)
    if (response.data.success) {
      showReviewDialog.value = false
      loadReports(pagination.value?.page || 1)
    }
  } catch (error) {
    console.error('Failed to review report:', error)
    alert('审核失败')
  }
}

async function downloadReport(report) {
  try {
    const response = await api.get(`/reports/${report.id}/download`, { responseType: 'blob' })
    const blob = new Blob([response.data], { type: 'application/pdf' })
    const link = document.createElement('a')
    link.href = window.URL.createObjectURL(blob)
    link.download = `${report.report_name}.pdf`
    link.click()
    window.URL.revokeObjectURL(link.href)
  } catch (error) {
    console.error('Failed to download report:', error)
    alert('下载失败')
  }
}

async function deleteReport(report) {
  if (!confirm(`确定要删除报表"${report.report_name}"吗？`)) return
  
  try {
    const response = await api.delete(`/reports/${report.id}`)
    if (response.data.success) {
      loadReports(pagination.value?.page || 1)
    }
  } catch (error) {
    console.error('Failed to delete report:', error)
    alert('删除失败')
  }
}

function formatDateTime(timestamp) {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN')
}

onMounted(() => {
  loadReports()
})
</script>

<template>
  <div class="reports-page">
    <div class="page-header">
      <h1>报表管理</h1>
      <button class="btn-primary" @click="openCreateDialog">+ 创建报表</button>
    </div>
    
    <div class="filter-bar-container">
      <div class="filter-bar">
        <select v-model="filters.report_type" @change="filterReports">
          <option v-for="opt in reportTypeOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <select v-model="filters.status" @change="filterReports">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <button class="btn-secondary" @click="resetFilters">重置筛选</button>
      </div>
    </div>
    
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>报表名称</th>
            <th>报表类型</th>
            <th>创建时间</th>
            <th>创建人</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="report in reportsList" :key="report.id">
            <td>{{ report.report_name }}</td>
            <td>
              <span class="type-badge" :class="`type-${report.report_type}`">
                {{ reportTypeTextMap[report.report_type] }}
              </span>
            </td>
            <td>{{ formatDateTime(report.created_at) }}</td>
            <td>{{ report.creator_name || '-' }}</td>
            <td>
              <span class="status-badge" :class="statusClassMap[report.status]">
                {{ statusTextMap[report.status] }}
              </span>
            </td>
            <td>
              <div class="actions">
                <button class="btn-icon" title="查看详情" @click="viewDetail(report)">📋</button>
                <button 
                  v-if="report.status === 'draft'" 
                  class="btn-icon" 
                  title="生成报表" 
                  @click="generateReport(report)"
                >⚙️</button>
                <button 
                  v-if="report.status === 'pending_review'" 
                  class="btn-icon" 
                  title="审核报表" 
                  @click="openReviewDialog(report)"
                >✅</button>
                <button 
                  v-if="report.status === 'approved'" 
                  class="btn-icon" 
                  title="下载报表" 
                  @click="downloadReport(report)"
                >📥</button>
                <button 
                  v-if="report.status === 'draft' || report.status === 'rejected'" 
                  class="btn-icon btn-danger" 
                  title="删除" 
                  @click="deleteReport(report)"
                >🗑️</button>
              </div>
            </td>
          </tr>
          <tr v-if="reportsList.length === 0">
            <td colspan="6" class="no-data">暂无数据</td>
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
    
    <div class="dialog-overlay" v-if="showCreateDialog">
      <div class="dialog">
        <div class="dialog-header">
          <h3>创建报表</h3>
          <button class="dialog-close" @click="showCreateDialog = false">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>报表名称 <span class="required">*</span></label>
            <input type="text" v-model="createFormData.report_name" placeholder="请输入报表名称">
          </div>
          <div class="form-group">
            <label>报表类型 <span class="required">*</span></label>
            <select v-model="createFormData.report_type">
              <option value="daily">日报</option>
              <option value="weekly">周报</option>
              <option value="monthly">月报</option>
              <option value="custom">自定义报表</option>
            </select>
          </div>
          <div class="form-group">
            <label>测孔编号 <span class="required">*</span></label>
            <input type="text" v-model="createFormData.hole_ids" placeholder="多个测孔用逗号分隔">
            <span class="form-hint">多个测孔编号用英文逗号分隔，如：CX01,CX02,CX03</span>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>开始时间 <span class="required">*</span></label>
              <input type="datetime-local" v-model="createFormData.start_time">
            </div>
            <div class="form-group">
              <label>结束时间 <span class="required">*</span></label>
              <input type="datetime-local" v-model="createFormData.end_time">
            </div>
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea v-model="createFormData.description" placeholder="请输入报表描述" rows="3"></textarea>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="showCreateDialog = false">取消</button>
          <button class="btn-primary" @click="createReport">创建</button>
        </div>
      </div>
    </div>
    
    <div class="dialog-overlay" v-if="showDetailDialog">
      <div class="dialog">
        <div class="dialog-header">
          <h3>报表详情</h3>
          <button class="dialog-close" @click="showDetailDialog = false">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="detail-section">
            <h4>基本信息</h4>
            <div class="detail-grid">
              <div class="detail-item">
                <label>报表名称：</label>
                <span>{{ currentReport?.report_name }}</span>
              </div>
              <div class="detail-item">
                <label>报表类型：</label>
                <span class="type-badge" :class="`type-${currentReport?.report_type}`">
                  {{ reportTypeTextMap[currentReport?.report_type] }}
                </span>
              </div>
              <div class="detail-item">
                <label>创建时间：</label>
                <span>{{ formatDateTime(currentReport?.created_at) }}</span>
              </div>
              <div class="detail-item">
                <label>创建人：</label>
                <span>{{ currentReport?.creator_name || '-' }}</span>
              </div>
              <div class="detail-item">
                <label>状态：</label>
                <span class="status-badge" :class="statusClassMap[currentReport?.status]">
                  {{ statusTextMap[currentReport?.status] }}
                </span>
              </div>
              <div class="detail-item">
                <label>时间范围：</label>
                <span>{{ formatDateTime(currentReport?.start_time) }} ~ {{ formatDateTime(currentReport?.end_time) }}</span>
              </div>
            </div>
          </div>
          
          <div class="detail-section" v-if="currentReport?.description">
            <h4>描述</h4>
            <p class="description-text">{{ currentReport?.description }}</p>
          </div>
          
          <div class="detail-section" v-if="currentReport?.hole_codes?.length">
            <h4>包含测孔</h4>
            <div class="hole-tags">
              <span v-for="code in currentReport.hole_codes" :key="code" class="hole-tag">
                {{ code }}
              </span>
            </div>
          </div>
          
          <div class="detail-section" v-if="currentReport?.summary">
            <h4>数据摘要</h4>
            <div class="summary-grid">
              <div class="summary-item">
                <label>测孔数量：</label>
                <span>{{ currentReport?.summary?.hole_count || 0 }}</span>
              </div>
              <div class="summary-item">
                <label>数据点数：</label>
                <span>{{ currentReport?.summary?.data_count || 0 }}</span>
              </div>
              <div class="summary-item">
                <label>最大位移：</label>
                <span>{{ currentReport?.summary?.max_displacement?.toFixed(4) || '-' }} mm</span>
              </div>
              <div class="summary-item">
                <label>预警数量：</label>
                <span>{{ currentReport?.summary?.warning_count || 0 }}</span>
              </div>
              <div class="summary-item">
                <label>报警数量：</label>
                <span>{{ currentReport?.summary?.alert_count || 0 }}</span>
              </div>
            </div>
          </div>
          
          <div class="detail-section" v-if="currentReport?.review_info">
            <h4>审核信息</h4>
            <div class="detail-grid">
              <div class="detail-item">
                <label>审核人：</label>
                <span>{{ currentReport?.review_info?.reviewer_name || '-' }}</span>
              </div>
              <div class="detail-item">
                <label>审核时间：</label>
                <span>{{ formatDateTime(currentReport?.review_info?.reviewed_at) }}</span>
              </div>
            </div>
            <div class="review-comment" v-if="currentReport?.review_info?.comment">
              <label>审核意见：</label>
              <p>{{ currentReport?.review_info?.comment }}</p>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="showDetailDialog = false">关闭</button>
          <button 
            v-if="currentReport?.status === 'approved'" 
            class="btn-primary" 
            @click="downloadReport(currentReport)"
          >📥 下载报表</button>
        </div>
      </div>
    </div>
    
    <div class="dialog-overlay" v-if="showReviewDialog">
      <div class="dialog dialog-small">
        <div class="dialog-header">
          <h3>审核报表</h3>
          <button class="dialog-close" @click="showReviewDialog = false">&times;</button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>审核结果 <span class="required">*</span></label>
            <select v-model="reviewFormData.status">
              <option value="approved">通过</option>
              <option value="rejected">驳回</option>
            </select>
          </div>
          <div class="form-group">
            <label>审核意见</label>
            <textarea v-model="reviewFormData.review_comment" placeholder="请输入审核意见" rows="4"></textarea>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-secondary" @click="showReviewDialog = false">取消</button>
          <button class="btn-primary" @click="reviewReport">提交审核</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reports-page {
  width: 100%;
  max-width: none;
  min-width: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-header h1 {
  font-size: 24px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
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

.filter-bar select:focus {
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

.type-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.type-daily {
  background: #dbeafe;
  color: #1e40af;
}

.type-weekly {
  background: #d1fae5;
  color: #065f46;
}

.type-monthly {
  background: #e0e7ff;
  color: #3730a3;
}

.type-custom {
  background: #fef3c7;
  color: #92400e;
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.status-draft {
  background: #e5e7eb;
  color: #374151;
}

.status-pending {
  background: #fef3c7;
  color: #92400e;
}

.status-approved {
  background: #d1fae5;
  color: #065f46;
}

.status-rejected {
  background: #fee2e2;
  color: #991b1b;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
  border-radius: 4px;
}

.btn-icon:hover {
  background: #f3f4f6;
}

.btn-icon.btn-danger:hover {
  background: #fee2e2;
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
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
}

.dialog-small {
  max-width: 450px;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
}

.dialog-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #6b7280;
  padding: 0;
  line-height: 1;
}

.dialog-body {
  padding: 24px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.form-group .required {
  color: #ef4444;
}

.form-group input,
.form-group select,
.form-group textarea {
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  border-color: #667eea;
}

.form-group textarea {
  resize: vertical;
}

.form-hint {
  font-size: 12px;
  color: #6b7280;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.detail-section {
  margin-bottom: 24px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-section h4 {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid #667eea;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.detail-item {
  display: flex;
  gap: 8px;
}

.detail-item label {
  font-size: 14px;
  color: #6b7280;
  min-width: 80px;
}

.detail-item span {
  font-size: 14px;
  color: #374151;
}

.description-text {
  font-size: 14px;
  color: #374151;
  line-height: 1.6;
  margin: 0;
}

.hole-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hole-tag {
  display: inline-block;
  padding: 4px 12px;
  background: #e0e7ff;
  color: #3730a3;
  border-radius: 20px;
  font-size: 13px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-item label {
  font-size: 13px;
  color: #6b7280;
}

.summary-item span {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
}

.review-comment {
  margin-top: 12px;
}

.review-comment label {
  font-size: 14px;
  color: #6b7280;
  display: block;
  margin-bottom: 8px;
}

.review-comment p {
  font-size: 14px;
  color: #374151;
  background: #f9fafb;
  padding: 12px;
  border-radius: 6px;
  margin: 0;
}
</style>
