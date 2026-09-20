<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/services/api'

const router = useRouter()

const projects = ref([])
const pagination = ref(null)
const searchTerm = ref('')
const statusFilter = ref('')
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const showDeleteConfirm = ref(false)
const editingProject = ref(null)
const deletingProject = ref(null)

const projectForm = ref({
  projectCode: '',
  name: '',
  description: '',
  location: '',
  startDate: '',
  endDate: '',
  status: 'planning'
})

const formErrors = ref({})

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'planning', label: '规划中' },
  { value: 'ongoing', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'paused', label: '已暂停' }
]

const statusMap = {
  planning: { label: '规划中', class: 'planning' },
  ongoing: { label: '进行中', class: 'in-progress' },
  completed: { label: '已完成', class: 'completed' },
  paused: { label: '已暂停', class: 'paused' }
}

const filteredProjects = computed(() => {
  return projects.value
})

async function loadProjects(page = 1) {
  try {
    let url = `/projects?page=${page}&limit=12`
    if (searchTerm.value) {
      url += `&search=${encodeURIComponent(searchTerm.value)}`
    }
    if (statusFilter.value) {
      url += `&status=${statusFilter.value}`
    }
    
    const response = await api.get(url)
    if (response.data.success) {
      projects.value = response.data.data.list
      pagination.value = response.data.data.pagination
    }
  } catch (error) {
    console.error('Failed to load projects:', error)
  }
}

function searchProjects() {
  loadProjects(1)
}

function filterByStatus() {
  loadProjects(1)
}

function changePage(page) {
  loadProjects(page)
}

function openCreateDialog() {
  projectForm.value = {
    projectCode: '',
    name: '',
    description: '',
    location: '',
    startDate: '',
    endDate: '',
    status: 'planning'
  }
  formErrors.value = {}
  showCreateDialog.value = true
}

function openEditDialog(project) {
  editingProject.value = project
  projectForm.value = {
    projectCode: project.project_code || '',
    name: project.project_name || project.name,
    description: project.description || '',
    location: project.location || '',
    startDate: project.start_date ? project.start_date.split('T')[0] : '',
    endDate: project.end_date ? project.end_date.split('T')[0] : '',
    status: project.status
  }
  formErrors.value = {}
  showEditDialog.value = true
}

function validateForm() {
  formErrors.value = {}
  let isValid = true
  
  if (!projectForm.value.projectCode || projectForm.value.projectCode.trim() === '') {
    formErrors.value.projectCode = '项目编号不能为空'
    isValid = false
  } else if (projectForm.value.projectCode.length > 50) {
    formErrors.value.projectCode = '项目编号不能超过50个字符'
    isValid = false
  }
  
  if (!projectForm.value.name || projectForm.value.name.trim() === '') {
    formErrors.value.name = '项目名称不能为空'
    isValid = false
  } else if (projectForm.value.name.length > 200) {
    formErrors.value.name = '项目名称不能超过200个字符'
    isValid = false
  }
  
  if (projectForm.value.startDate && projectForm.value.endDate) {
    if (new Date(projectForm.value.startDate) > new Date(projectForm.value.endDate)) {
      formErrors.value.dateRange = '开始日期不能晚于结束日期'
      isValid = false
    }
  }
  
  return isValid
}

function openDeleteConfirm(project) {
  deletingProject.value = project
  showDeleteConfirm.value = true
}

async function createProject() {
  if (!validateForm()) {
    return
  }
  try {
    // 修复说明：项目开始日期、结束日期、项目位置都不是必填项，这里统一把空输入转成后端可接受的空值，避免更新时把 '' 写入日期字段报错。
    const payload = buildProjectPayload()
    const response = await api.post('/projects', payload)
    if (response.data.success) {
      showCreateDialog.value = false
      loadProjects()
    }
  } catch (error) {
    console.error('Failed to create project:', error)
    alert(error.response?.data?.message || '创建项目失败')
  }
}

async function updateProject() {
  if (!validateForm()) {
    return
  }
  try {
    // 修复说明：编辑项目时与创建项目共用同一份空值归一化逻辑，确保可选日期字段始终以 null 提交。
    const payload = buildProjectPayload()
    const response = await api.put(`/projects/${editingProject.value.id}`, payload)
    if (response.data.success) {
      showEditDialog.value = false
      loadProjects()
    }
  } catch (error) {
    console.error('Failed to update project:', error)
    alert(error.response?.data?.message || '更新项目失败')
  }
}

async function deleteProject() {
  try {
    const response = await api.delete(`/projects/${deletingProject.value.id}`)
    if (response.data.success) {
      showDeleteConfirm.value = false
      loadProjects()
    }
  } catch (error) {
    console.error('Failed to delete project:', error)
  }
}

function buildProjectPayload() {
  return {
    project_code: projectForm.value.projectCode,
    project_name: projectForm.value.name,
    // 修复说明：项目位置不是必填项，前端空输入统一传空字符串，避免出现 undefined。
    location: projectForm.value.location?.trim?.() || '',
    // 修复说明：开始日期和结束日期不是必填项，前端空输入统一传 null，避免后端收到空字符串。
    start_date: projectForm.value.startDate || null,
    end_date: projectForm.value.endDate || null,
    status: projectForm.value.status,
    description: projectForm.value.description
  }
}

function viewProjectDetail(project) {
  router.push(`/projects/${project.id}`)
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN')
}

onMounted(() => {
  loadProjects()
})
</script>

<template>
  <div class="projects-page">
    <div class="page-header">
      <h1>工程管理</h1>
      <button class="btn-primary" @click="openCreateDialog">+ 新建项目</button>
    </div>
    
    <div class="search-bar">
      <input 
        type="text" 
        v-model="searchTerm"
        @keyup.enter="searchProjects"
        placeholder="搜索项目名称或业主..."
      >
      <select v-model="statusFilter" @change="filterByStatus" class="status-select">
        <option v-for="option in statusOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <button class="btn-search" @click="searchProjects">搜索</button>
    </div>
    
    <div class="projects-grid">
      <div class="project-card" v-for="project in filteredProjects" :key="project.id">
        <div class="card-header">
          <div class="project-title">
            <span class="project-code">{{ project.project_code }}</span>
            <h3 class="project-name">{{ project.project_name || project.name }}</h3>
          </div>
          <span class="status-badge" :class="statusMap[project.status]?.class">
            {{ statusMap[project.status]?.label }}
          </span>
        </div>
        
        <div class="card-body">
          <div class="info-item">
            <span class="info-label">📍 位置</span>
            <span class="info-value">{{ project.location || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">📅 开始日期</span>
            <span class="info-value">{{ formatDate(project.start_date || project.startDate) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">📅 结束日期</span>
            <span class="info-value">{{ formatDate(project.end_date || project.endDate) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">🕳️ 测孔数量</span>
            <span class="info-value">{{ project.hole_count || project.holeCount || 0 }}</span>
          </div>
        </div>
        
        <div class="card-description" v-if="project.description">
          {{ project.description }}
        </div>
        
        <div class="card-footer">
          <button class="btn-view" @click="viewProjectDetail(project)">查看详情</button>
          <div class="actions">
            <button class="btn-icon" title="编辑" @click="openEditDialog(project)">✏️</button>
            <button class="btn-icon" title="删除" @click="openDeleteConfirm(project)">🗑️</button>
          </div>
        </div>
      </div>
      
      <div class="no-data-card" v-if="projects.length === 0">
        <div class="no-data-content">
          <span class="no-data-icon">📁</span>
          <p>暂无项目数据</p>
          <button class="btn-primary" @click="openCreateDialog">创建第一个项目</button>
        </div>
      </div>
    </div>
    
    <div class="pagination" v-if="pagination && projects.length > 0">
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
    
    <div class="dialog-overlay" v-if="showCreateDialog || showEditDialog">
      <div class="dialog">
        <div class="dialog-header">
          <h2>{{ showEditDialog ? '编辑项目' : '新建项目' }}</h2>
          <button class="dialog-close" @click="showCreateDialog = false; showEditDialog = false">×</button>
        </div>
        <div class="dialog-body">
          <div class="form-group">
            <label>项目编号 <span class="required">*</span></label>
            <input type="text" v-model="projectForm.projectCode" placeholder="请输入项目编号" :class="{ 'input-error': formErrors.projectCode }">
            <span class="error-text" v-if="formErrors.projectCode">{{ formErrors.projectCode }}</span>
          </div>
          <div class="form-group">
            <label>项目名称 <span class="required">*</span></label>
            <input type="text" v-model="projectForm.name" placeholder="请输入项目名称" :class="{ 'input-error': formErrors.name }">
            <span class="error-text" v-if="formErrors.name">{{ formErrors.name }}</span>
          </div>
          <div class="form-group">
            <label>项目位置</label>
            <input type="text" v-model="projectForm.location" placeholder="请输入项目位置">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>开始日期</label>
              <input type="date" v-model="projectForm.startDate">
            </div>
            <div class="form-group">
              <label>结束日期</label>
              <input type="date" v-model="projectForm.endDate">
            </div>
          </div>
          <div class="form-group">
            <label>项目状态</label>
            <select v-model="projectForm.status">
              <option value="planning">规划中</option>
              <option value="ongoing">进行中</option>
              <option value="completed">已完成</option>
              <option value="paused">已暂停</option>
            </select>
          </div>
          <div class="form-group">
            <label>项目描述</label>
            <textarea v-model="projectForm.description" placeholder="请输入项目描述" rows="3"></textarea>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-cancel" @click="showCreateDialog = false; showEditDialog = false">取消</button>
          <button class="btn-primary" @click="showEditDialog ? updateProject() : createProject()">
            {{ showEditDialog ? '保存' : '创建' }}
          </button>
        </div>
      </div>
    </div>
    
    <div class="dialog-overlay" v-if="showDeleteConfirm">
      <div class="dialog dialog-small">
        <div class="dialog-header">
          <h2>确认删除</h2>
          <button class="dialog-close" @click="showDeleteConfirm = false">×</button>
        </div>
        <div class="dialog-body">
          <p class="confirm-text">确定要删除项目「{{ deletingProject?.project_name || deletingProject?.name }}」吗？此操作不可恢复。</p>
        </div>
        <div class="dialog-footer">
          <button class="btn-cancel" @click="showDeleteConfirm = false">取消</button>
          <button class="btn-danger" @click="deleteProject">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.projects-page {
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

.search-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.search-bar input {
  flex: 1;
  padding: 10px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
}

.search-bar input:focus {
  border-color: #667eea;
}

.status-select {
  padding: 10px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: white;
  min-width: 140px;
}

.btn-search {
  background: #f3f4f6;
  border: 2px solid #e5e7eb;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 24px;
}

.project-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.project-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.card-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.project-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.project-code {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
}

.project-name {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.planning {
  background: #e0e7ff;
  color: #3730a3;
}

.status-badge.in-progress {
  background: #fef3c7;
  color: #92400e;
}

.status-badge.completed {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.paused {
  background: #fee2e2;
  color: #991b1b;
}

.card-body {
  padding: 16px 20px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.info-item:last-child {
  margin-bottom: 0;
}

.info-label {
  font-size: 13px;
  color: #6b7280;
}

.info-value {
  font-size: 13px;
  color: #374151;
  font-weight: 500;
}

.card-description {
  padding: 0 20px 16px;
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer {
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f9fafb;
}

.btn-view {
  background: none;
  border: 1px solid #667eea;
  color: #667eea;
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.btn-view:hover {
  background: #667eea;
  color: white;
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
}

.no-data-card {
  grid-column: 1 / -1;
  background: white;
  border-radius: 12px;
  padding: 60px 20px;
  text-align: center;
}

.no-data-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.no-data-icon {
  font-size: 48px;
}

.no-data-content p {
  color: #6b7280;
  font-size: 16px;
  margin: 0;
}

.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 24px;
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
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.dialog-small {
  max-width: 400px;
}

.dialog-header {
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialog-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0;
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

.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 8px;
}

.required {
  color: #ef4444;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  border-color: #667eea;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-row .form-group {
  margin-bottom: 20px;
}

.dialog-footer {
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel {
  background: #f3f4f6;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.btn-danger {
  background: #ef4444;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.confirm-text {
  font-size: 14px;
  color: #374151;
  margin: 0;
}

.input-error {
  border-color: #ef4444 !important;
}

.error-text {
  color: #ef4444;
  font-size: 12px;
  margin-top: 4px;
  display: block;
}
</style>
