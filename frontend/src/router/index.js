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
      { path: 'dashboard', name: 'Dashboard', component: () => import('@/views/Dashboard.vue') },
      { path: 'users', name: 'Users', component: () => import('@/views/Users.vue') },
      { path: 'devices', redirect: '/upper-devices' },
      { path: 'devices/:id', redirect: '/upper-devices' },
      { path: 'upper-devices', name: 'UpperDevices', component: () => import('@/views/UpperDevices.vue') },
      { path: 'lower-devices', name: 'LowerDevices', component: () => import('@/views/LowerDevices.vue') },
      { path: 'device-bindings', name: 'DeviceBindings', component: () => import('@/views/DeviceBindings.vue') },
      { path: 'projects', name: 'Projects', component: () => import('@/views/Projects.vue') },
      { path: 'projects/:id', name: 'ProjectDetail', component: () => import('@/views/ProjectDetail.vue') },
      { path: 'roles', name: 'Roles', component: () => import('@/views/Roles.vue') },
      { path: 'permissions', name: 'Permissions', component: () => import('@/views/Permissions.vue') },
      { path: 'raw-data', name: 'RawData', component: () => import('@/views/RawData.vue') },
      // 修复说明：将成果数据入口调整为二级路由结构，/results 只负责跳转，避免影响现有菜单高亮与旧地址兼容。
      { path: 'results', redirect: '/results/list' },
      { path: 'results/list', name: 'ResultsList', component: () => import('@/views/Results.vue') },
      { path: 'results/trend', name: 'ResultsTrend', component: () => import('@/views/ResultsTrend.vue') },
      { path: 'reports', name: 'Reports', component: () => import('@/views/Reports.vue') },
      // 兼容旧书签：测孔功能已统一收口到工程详情，不再保留独立页面。
      { path: 'holes', redirect: '/projects' }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/login' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }

  if (to.name === 'Login' && authStore.isAuthenticated) {
    next('/dashboard')
    return
  }

  next()
})

export default router
