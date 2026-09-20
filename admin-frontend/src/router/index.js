import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/dashboard' },
      // 修复说明：为管理端顶部标题提供稳定中文来源，这里统一给各页面补 meta.title，避免动态路由进入详情页时标题丢失。
      { path: 'dashboard', name: 'Dashboard', component: () => import('@/views/Dashboard.vue'), meta: { title: '总览' } },
      // 修复说明：新增工程管理列表页，供菜单“工程管理”直接进入工程列表。
      { path: 'projects', name: 'Projects', component: () => import('@/views/Projects.vue'), meta: { title: '工程管理' } },
      // 修复说明：新增工程详情页，用于承载工程基本信息、测孔列表、上位机列表和下位机列表四个导航区域。
      { path: 'projects/:id', name: 'ProjectDetail', component: () => import('@/views/ProjectDetail.vue'), meta: { title: '工程详情' } },
      { path: 'devices', redirect: '/upper-devices' },
      { path: 'device-management', name: 'DeviceManagement', component: () => import('@/views/DeviceManagement.vue'), meta: { title: '仓库管理', description: '管理设备入库、销售归属和客户售后处理入口。' } },
      { path: 'upper-devices', name: 'UpperDevices', component: () => import('@/views/UpperDevices.vue'), meta: { title: '上位机列表' } },
      { path: 'lower-devices', name: 'LowerDevices', component: () => import('@/views/LowerDevices.vue'), meta: { title: '下位机列表' } },
      { path: 'raw-data', name: 'RawData', component: () => import('@/views/RawData.vue'), meta: { title: '原始数据' } },
      { path: 'customers', name: 'Customers', component: () => import('@/views/Customers.vue'), meta: { title: '客户管理' } },
      { path: 'admin-users', name: 'AdminUsers', component: () => import('@/views/AdminUsers.vue'), meta: { title: '系统用户管理' } }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/login' }
]

const router = createRouter({
  // 修复说明：使用 Vite 注入的 BASE_URL 与 vite.config.js 的 base 保持一致。
  //   - 默认 base='/'：localhost:4201/、子域名部署都使用 '/' 路由
  //   - 同域名部署 base='/admin/'：路由自动基于 /admin/ 前缀，避免页面 404
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
    return
  }

  if (to.name === 'Login' && authStore.isAuthenticated) {
    next('/dashboard')
    return
  }

  next()
})

export default router
