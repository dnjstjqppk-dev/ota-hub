import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import ProductsView from '../views/ProductsView.vue'
import InventoryCalendarView from '../views/InventoryCalendarView.vue'
import OrdersView from '../views/OrdersView.vue'
import SettlementsView from '../views/SettlementsView.vue'
import ProfileView from '../views/ProfileView.vue'
import StaffView from '../views/StaffView.vue'
import ApiKeysView from '../views/ApiKeysView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { public: true }
  },
  {
    path: '/register',
    name: 'Register',
    component: RegisterView,
    meta: { public: true }
  },
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: DashboardView,
    meta: { requiresAuth: true }
  },
  {
    path: '/products',
    name: 'Products',
    component: ProductsView,
    meta: { requiresAuth: true }
  },
  {
    path: '/inventory',
    name: 'Inventory',
    component: InventoryCalendarView,
    meta: { requiresAuth: true }
  },
  {
    path: '/orders',
    name: 'Orders',
    component: OrdersView,
    meta: { requiresAuth: true }
  },
  {
    path: '/settlements',
    name: 'Settlements',
    component: SettlementsView,
    meta: { requiresAuth: true }
  },
  {
    path: '/profile',
    name: 'Profile',
    component: ProfileView,
    meta: { requiresAuth: true }
  },
  {
    path: '/staff',
    name: 'Staff',
    component: StaffView,
    meta: { requiresAuth: true }
  },
  {
    path: '/api-keys',
    name: 'ApiKeys',
    component: ApiKeysView,
    meta: { requiresAuth: true }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard'
  }
]

// Support both standalone host (ota-partner.workers.dev -> '/') and path mount (ota-hub/partner/)
const basePath = typeof window !== 'undefined' && window.location.pathname.startsWith('/partner') ? '/partner/' : '/'

const router = createRouter({
  history: createWebHistory(basePath),
  routes
})

// Authentication Route Guard
router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('getfortrip_partner_token')
  const isPublic = to.meta.public === true

  if (!isPublic && !token) {
    next({ path: '/login', query: { redirect: to.fullPath } })
  } else if ((to.path === '/login' || to.path === '/register') && token) {
    next({ path: '/dashboard' })
  } else {
    next()
  }
})

export default router

