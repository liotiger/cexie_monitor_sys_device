<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// 菜单结构：设备管理 / 数据管理为一级分组菜单，子项为二级菜单；分组默认展开，可点击折叠。
const menus = [
  { path: '/dashboard', label: '总览' },
  // 修复说明：管理端新增工程管理入口，统一从侧边菜单进入工程列表页。
  { path: '/projects', label: '工程管理' },
  {
    path: 'group-devices',
    label: '设备管理',
    children: [
      { path: '/upper-devices', label: '上位机列表' },
      { path: '/lower-devices', label: '下位机列表' }
    ]
  },
  { path: '/device-management', label: '仓库管理' },
  {
    path: 'group-data',
    label: '数据管理',
    children: [
      { path: '/raw-data', label: '原始数据' }
    ]
  },
  { path: '/customers', label: '客户管理' },
  { path: '/admin-users', label: '系统用户管理' }
]

// 折叠状态：仅记录被手动折叠的分组，未记录的分组默认展开。
const collapsedGroups = ref([])

function isGroupExpanded(item) {
  return !collapsedGroups.value.includes(item.path)
}

function toggleGroup(item) {
  collapsedGroups.value = isGroupExpanded(item)
    ? [...collapsedGroups.value, item.path]
    : collapsedGroups.value.filter(path => path !== item.path)
}

const flatMenus = computed(() => menus.flatMap(item => item.children || [item]))
const currentTitle = computed(() => route.meta?.title || flatMenus.value.find(item => route.path === item.path || route.path.startsWith(`${item.path}/`))?.label || '管理端')
// 页面说明：路由 meta.description 提供时在顶栏标题下方展示，替代原先固定的用户名副标题。
const currentDescription = computed(() => route.meta?.description || '')
// 修复说明：管理端界面需要统一显示中文，这里为品牌副标题和默认账号名提供中文兜底，避免页面出现英文占位文案。
const brandSubtitle = '管理控制台'
const displayUsername = computed(() => authStore.user?.username || '管理员')

function isMenuActive(path) {
  return path === '/projects' ? route.path.startsWith('/projects') : route.path === path
}

function isGroupActive(item) {
  return item.children?.some(child => route.path === child.path || route.path.startsWith(`${child.path}/`))
}

function logout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark"></div>
        <div class="brand-text">
          <h1>管理端</h1>
          <p>{{ brandSubtitle }}</p>
        </div>
      </div>
      <nav class="menu">
        <template v-for="item in menus" :key="item.path">
          <div v-if="item.children" class="menu-group" :class="{ active: isGroupActive(item) }">
            <button type="button" class="menu-group-title" :class="{ collapsed: !isGroupExpanded(item) }" @click="toggleGroup(item)">
              <span class="group-label">{{ item.label }}</span>
              <span class="chevron">▾</span>
            </button>
            <router-link v-show="isGroupExpanded(item)" v-for="child in item.children" :key="child.path" :to="child.path"
              class="menu-item menu-child" :class="{ active: isMenuActive(child.path) }">
              <span class="child-dot"></span>
              <span>{{ child.label }}</span>
            </router-link>
          </div>
          <router-link v-else :to="item.path" class="menu-item" :class="{ active: isMenuActive(item.path) }">
            {{ item.label }}
          </router-link>
        </template>
      </nav>
      <div class="sidebar-footer">测斜监测系统</div>
    </aside>
    <div class="main">
      <header class="header">
        <div class="header-info">
          <h2>{{ currentTitle }}</h2>
          <p v-if="currentDescription">{{ currentDescription }}</p>
        </div>
        <div class="header-side">
          <span class="user-chip">{{ displayUsername }}</span>
          <button class="logout-btn" @click="logout">退出登录</button>
        </div>
      </header>
      <main class="content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.layout { width: 100%; min-height: 100vh; display: grid; grid-template-columns: 248px minmax(0, 1fr); }

/* 侧边栏：深色渐变底、固定吸顶，分组标题 + 二级菜单形成清晰层次 */
.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #0f172a 0%, #0b1220 100%);
  color: #fff;
  padding: 20px 14px 14px;
}
.sidebar::-webkit-scrollbar { width: 6px; }
.sidebar::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.25); border-radius: 3px; }

.brand { display: flex; align-items: center; gap: 12px; padding: 4px 10px 16px; margin-bottom: 10px; border-bottom: 1px solid rgba(148, 163, 184, 0.15); }
.brand-mark { flex-shrink: 0; width: 38px; height: 38px; border-radius: 11px; background: linear-gradient(135deg, #3b82f6, #06b6d4); display: flex; align-items: center; justify-content: center; }
.brand-mark::after { content: ''; width: 11px; height: 11px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.25); }
.brand-text h1 { font-size: 17px; line-height: 1.2; letter-spacing: 0.02em; }
.brand-text p { color: #94a3b8; font-size: 12px; margin-top: 2px; }

.menu { display: flex; flex-direction: column; gap: 4px; flex: 1; }

/* 一级分组菜单：标题可点击展开/折叠，默认展开 */
.menu-group { display: grid; gap: 2px; padding-top: 6px; }
.menu-group-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #8ea0bd;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  cursor: pointer;
  user-select: none;
  transition: color 0.15s, background 0.15s;
}
.menu-group-title:hover { color: #e2e8f0; background: rgba(148, 163, 184, 0.08); }
.menu-group.active .menu-group-title { color: #93c5fd; }
.menu-group-title .chevron { font-size: 11px; color: #64748b; transition: transform 0.2s ease; }
.menu-group-title.collapsed .chevron { transform: rotate(-90deg); }

/* 菜单项：悬浮渐显，激活时左侧蓝色指示条 + 高亮底色 */
.menu-item {
  position: relative;
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 9px;
  color: #a9b7cc;
  font-size: 14px;
  transition: background 0.15s, color 0.15s;
}
.menu-item:hover { background: rgba(148, 163, 184, 0.12); color: #fff; }
.menu-item.active {
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.24), rgba(59, 130, 246, 0.07));
  color: #fff;
  font-weight: 600;
}
.menu-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  border-radius: 2px;
  background: #3b82f6;
}

/* 二级菜单：缩进 + 圆点标记，与一级菜单拉开层级 */
.menu-child { padding-left: 30px; font-size: 13.5px; color: #94a3b8; }
.menu-child .child-dot { width: 5px; height: 5px; border-radius: 50%; background: #475569; margin-right: 9px; transition: background 0.15s, box-shadow 0.15s; }
.menu-child:hover .child-dot, .menu-child.active .child-dot { background: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2); }

.sidebar-footer { padding: 14px 12px 4px; border-top: 1px solid rgba(148, 163, 184, 0.12); color: #475569; font-size: 11px; letter-spacing: 0.06em; }

.main { min-width: 0; display: flex; flex-direction: column; }

/* 顶栏：吸顶毛玻璃，标题 + 用户信息层次清晰 */
.header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 28px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #e5e7eb;
}
.header h2 { font-size: 19px; letter-spacing: 0.01em; }
.header-info p { color: #6b7280; font-size: 13px; margin-top: 3px; }
.header-side { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.user-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
}
.user-chip::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }
.logout-btn {
  border: 1px solid #fecaca;
  background: #fff;
  color: #ef4444;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.logout-btn:hover { background: #ef4444; border-color: #ef4444; color: #fff; }

.content { width: 100%; min-width: 0; padding: 24px 28px 40px; }
.content > :deep(*) { width: 100%; min-width: 0; max-width: none; }

@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .sidebar { position: static; height: auto; padding-bottom: 12px; }
  .sidebar-footer { display: none; }
  .menu { flex-direction: row; flex-wrap: wrap; }
  .menu-group { padding-top: 0; }
  .menu-group-title { width: auto; }
}
</style>
