<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const sidebarCollapsed = ref(false)
const showUserMenu = ref(false)
const isMobile = ref(false)
const expandedMenuKeys = ref(['/results'])

const currentUser = computed(() => authStore.user)
const currentServiceLabel = computed(() => '客户端')

const currentUserRoleLabel = computed(() => {
  const roles = Array.isArray(currentUser.value?.roles) ? currentUser.value.roles : []
  const role = currentUser.value?.role

  if (roles.includes('system_admin') || role === 'system_admin') {
    return '系统管理员'
  }
  if (roles.includes('admin') || role === 'admin') {
    return '管理员'
  }

  return '用户'
})

const userInitial = computed(() => {
  const username = currentUser.value?.username
  return username ? username.charAt(0).toUpperCase() : 'U'
})

const menuItems = [
  { path: '/dashboard', icon: '📊', text: '仪表盘', group: 'overview' },
  { path: '/users', icon: '👥', text: '用户管理', group: 'system' },
  { path: '/roles', icon: '🎭', text: '角色管理', group: 'system' },
  { path: '/permissions', icon: '🔐', text: '权限管理', group: 'system' },
  { path: '/upper-devices', icon: '📡', text: '上位机管理', group: 'device' },
  { path: '/lower-devices', icon: '📱', text: '下位机管理', group: 'device' },
  { path: '/device-bindings', icon: '🔗', text: '设备绑定', group: 'device' },
  { path: '/projects', icon: '📁', text: '工程管理', group: 'business' },
  { path: '/raw-data', icon: '📋', text: '原始数据', group: 'data' },
  // 修复说明：成果数据菜单改为二级目录，保留统一入口语义，并拆分为“成果数据列表”和“成果数据趋势图”两个子页面。
  {
    path: '/results',
    icon: '📈',
    text: '成果数据',
    group: 'data',
    children: [
      { path: '/results/list', text: '数据列表' },
      { path: '/results/trend', text: '数据趋势图' }
    ]
  },
  { path: '/reports', icon: '📄', text: '报表管理', group: 'data' }
]

const menuGroups = {
  overview: '概览',
  business: '业务管理',
  device: '设备管理',
  data: '数据管理',
  system: '系统管理'
}

const groupedMenuItems = computed(() => {
  const groups = {}
  // 修复说明：按最新菜单规划调整客户端一级菜单顺序为“概览 -> 业务管理 -> 设备管理 -> 数据管理 -> 系统管理”。
  const groupOrder = ['overview', 'business', 'device', 'data', 'system']
  groupOrder.forEach(key => {
    const items = menuItems.filter(item => item.group === key)

    if (items.length > 0) {
      groups[key] = items
    }
  })
  return groups
})

const currentPageTitle = computed(() => {
  const matchTitle = findCurrentMenuTitle(menuItems)
  return matchTitle || '测斜监测系统'
})

function getMenuKey(item) {
  return item.path || item.text
}

function isRouteMatch(targetPath) {
  return route.path === targetPath || route.path.startsWith(`${targetPath}/`)
}

function isMenuItemActive(item) {
  if (Array.isArray(item.children) && item.children.length > 0) {
    return item.children.some(child => isRouteMatch(child.path))
  }
  return Boolean(item.path) && isRouteMatch(item.path)
}

function isMenuExpanded(item) {
  return expandedMenuKeys.value.includes(getMenuKey(item)) || isMenuItemActive(item)
}

function findCurrentMenuTitle(items) {
  for (const item of items) {
    if (Array.isArray(item.children) && item.children.length > 0) {
      const child = item.children.find(candidate => isRouteMatch(candidate.path))
      if (child) {
        return child.text
      }
    }
    if (item.path && isRouteMatch(item.path)) {
      return item.text
    }
  }
  return ''
}

function toggleMenuItem(item) {
  if (Array.isArray(item.children) && item.children.length > 0) {
    const menuKey = getMenuKey(item)
    if (sidebarCollapsed.value) {
      // 修复说明：侧边栏收起时无法直接展开二级菜单，这里默认跳转到第一个子页面，避免用户点击父级后无响应。
      router.push(item.children[0].path)
      closeSidebar()
      return
    }
    expandedMenuKeys.value = expandedMenuKeys.value.includes(menuKey)
      ? expandedMenuKeys.value.filter(key => key !== menuKey)
      : [...expandedMenuKeys.value, menuKey]
    return
  }

  if (item.path) {
    router.push(item.path)
    closeSidebar()
  }
}

function checkMobile() {
  isMobile.value = window.innerWidth < 768
  if (isMobile.value) {
    sidebarCollapsed.value = true
  }
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

function closeSidebar() {
  if (isMobile.value) {
    sidebarCollapsed.value = true
  }
}

function logout() {
  authStore.logout()
  router.push('/login')
}

function handleClickOutside(event) {
  if (showUserMenu.value && !event.target.closest('.user-menu')) {
    showUserMenu.value = false
  }
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="layout-container">
    <div v-if="isMobile && !sidebarCollapsed" class="sidebar-overlay" @click="toggleSidebar"></div>
    
    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed, mobile: isMobile }">
      <div class="sidebar-header">
        <div class="logo-container">
          <div class="logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <transition name="fade">
            <div v-if="!sidebarCollapsed" class="logo-text">
              <h1>测斜监测系统</h1>
              <span class="version">v1.0.0</span>
            </div>
          </transition>
        </div>
      </div>
      
      <nav class="sidebar-nav">
        <template v-for="(groupItems, groupKey) in groupedMenuItems" :key="groupKey">
          <div v-if="!sidebarCollapsed && groupItems.length" class="nav-group-title">
            {{ menuGroups[groupKey] }}
          </div>
          <div
            v-for="item in groupItems"
            :key="item.path || item.text"
            class="nav-entry"
          >
            <button
              type="button"
              class="nav-item nav-button"
              :class="{ active: isMenuItemActive(item), 'has-children': item.children?.length }"
              @click="toggleMenuItem(item)"
            >
              <span class="nav-icon">{{ item.icon }}</span>
              <transition name="fade">
                <span v-if="!sidebarCollapsed" class="nav-text">{{ item.text }}</span>
              </transition>
              <transition name="fade">
                <span
                  v-if="!sidebarCollapsed && item.children?.length"
                  class="submenu-arrow"
                  :class="{ expanded: isMenuExpanded(item) }"
                >⌄</span>
              </transition>
            </button>
            <div
              v-if="!sidebarCollapsed && item.children?.length && isMenuExpanded(item)"
              class="submenu"
            >
              <router-link
                v-for="child in item.children"
                :key="child.path"
                :to="child.path"
                class="submenu-item"
                :class="{ active: isRouteMatch(child.path) }"
                @click="closeSidebar"
              >
                {{ child.text }}
              </router-link>
            </div>
          </div>
        </template>
      </nav>
    </aside>
    
    <div class="main-content">
      <header class="header">
        <div class="header-left">
          <button class="toggle-btn" @click="toggleSidebar">
            <svg v-if="sidebarCollapsed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12h18M3 6h18M3 18h18"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
            </svg>
          </button>
          <div class="breadcrumb">
            <span class="breadcrumb-item">{{ currentPageTitle }}</span>
          </div>
        </div>
        
        <div class="header-right">
          <div class="header-actions">
            <button class="action-btn" title="通知">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <span class="badge-dot"></span>
            </button>
          </div>
          
          <div class="user-menu" @click.stop="showUserMenu = !showUserMenu">
            <div class="user-avatar">
              {{ userInitial }}
            </div>
            <transition name="fade">
              <div v-if="!sidebarCollapsed || !isMobile" class="user-info">
                <span class="user-name">{{ currentUser?.username || '用户' }}</span>
                <span class="user-role">{{ currentServiceLabel }} / {{ currentUserRoleLabel }}</span>
              </div>
            </transition>
            
            <transition name="dropdown">
              <div class="dropdown-menu" v-if="showUserMenu">
                <div class="dropdown-header">
                  <div class="dropdown-avatar">{{ userInitial }}</div>
                  <div class="dropdown-user-info">
                    <span class="dropdown-username">{{ currentUser?.username }}</span>
                    <span class="dropdown-email">{{ currentUser?.email || 'user@example.com' }}</span>
                  </div>
                </div>
                <div class="dropdown-divider"></div>
                <a class="dropdown-item" @click="showUserMenu = false">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  个人中心
                </a>
                <a class="dropdown-item" @click="showUserMenu = false">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                  系统设置
                </a>
                <div class="dropdown-divider"></div>
                <a @click="logout" class="dropdown-item logout">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  退出登录
                </a>
              </div>
            </transition>
          </div>
        </div>
      </header>
      
      <main class="content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.layout-container {
  display: flex;
  min-height: 100vh;
  background: #f3f4f6;
}

.sidebar-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 99;
}

.sidebar {
  width: 260px;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  color: white;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 100;
}

.sidebar.collapsed {
  width: 70px;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.logo-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo {
  width: 40px;
  height: 40px;
  min-width: 40px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo svg {
  width: 24px;
  height: 24px;
  color: white;
}

.logo-text h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
}

.logo-text .version {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.sidebar-nav {
  flex: 1;
  padding: 12px 0;
  overflow-y: auto;
}

.nav-group-title {
  padding: 12px 20px 8px;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.nav-item {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  transition: all 0.2s;
  gap: 12px;
  margin: 2px 8px;
  border-radius: 8px;
}

.nav-entry {
  margin-bottom: 2px;
}

.nav-button {
  width: calc(100% - 16px);
  border: none;
  background: none;
  font: inherit;
  text-align: left;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.nav-item.router-link-active,
.nav-item.active {
  background: rgba(102, 126, 234, 0.3);
  color: white;
}

.nav-icon {
  font-size: 18px;
  min-width: 24px;
  text-align: center;
}

.nav-text {
  font-size: 14px;
  white-space: nowrap;
}

.submenu-arrow {
  margin-left: auto;
  font-size: 12px;
  transition: transform 0.2s ease;
}

.submenu-arrow.expanded {
  transform: rotate(180deg);
}

.submenu {
  margin: 4px 8px 6px 44px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.submenu-item {
  color: rgba(255, 255, 255, 0.75);
  text-decoration: none;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 8px;
  transition: all 0.2s;
}

.submenu-item:hover,
.submenu-item.active {
  background: rgba(102, 126, 234, 0.25);
  color: white;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.header {
  background: white;
  padding: 12px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  position: sticky;
  top: 0;
  z-index: 50;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.toggle-btn {
  background: none;
  border: none;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.toggle-btn:hover {
  background: #f3f4f6;
  color: #374151;
}

.toggle-btn svg {
  width: 20px;
  height: 20px;
}

.breadcrumb {
  display: flex;
  align-items: center;
}

.breadcrumb-item {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  background: none;
  border: none;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #f3f4f6;
  color: #374151;
}

.action-btn svg {
  width: 20px;
  height: 20px;
}

.badge-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  background: #ef4444;
  border-radius: 50%;
  border: 2px solid white;
}

.user-menu {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  position: relative;
  padding: 6px 12px;
  border-radius: 8px;
  transition: all 0.2s;
}

.user-menu:hover {
  background: #f3f4f6;
}

.user-avatar {
  width: 36px;
  height: 36px;
  min-width: 36px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 14px;
}

.user-info {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.user-role {
  font-size: 12px;
  color: #6b7280;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  min-width: 220px;
  overflow: hidden;
  z-index: 100;
}

.dropdown-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #f9fafb;
}

.dropdown-avatar {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 16px;
}

.dropdown-user-info {
  display: flex;
  flex-direction: column;
}

.dropdown-username {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
}

.dropdown-email {
  font-size: 12px;
  color: #6b7280;
}

.dropdown-divider {
  height: 1px;
  background: #e5e7eb;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  color: #374151;
  text-decoration: none;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.dropdown-item:hover {
  background: #f3f4f6;
}

.dropdown-item svg {
  width: 18px;
  height: 18px;
  color: #6b7280;
}

.dropdown-item.logout {
  color: #ef4444;
}

.dropdown-item.logout svg {
  color: #ef4444;
}

.content {
  flex: 1;
  width: 100%;
  min-width: 0;
  padding: 24px;
  overflow-y: auto;
}

.content > :deep(*) {
  width: 100%;
  min-width: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@media (max-width: 768px) {
  .sidebar-overlay {
    display: block;
  }

  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 100;
  }

  .sidebar.collapsed {
    transform: translateX(-100%);
    width: 260px;
  }

  .user-info {
    display: none;
  }

  .header {
    padding: 12px 16px;
  }

  .content {
    padding: 16px;
  }
}
</style>
