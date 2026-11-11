import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { partnerInfo, partnerOnboardingPending, restorePartnerSession } from '../config/api'
import DashboardView from '../views/DashboardView.vue'
import ProductsView from '../views/ProductsView.vue'
import InventoryCalendarView from '../views/InventoryCalendarView.vue'
import OrdersView from '../views/OrdersView.vue'
import OrderDetailView from '../views/OrderDetailView.vue'
import SettlementsView from '../views/SettlementsView.vue'
import ProfileView from '../views/ProfileView.vue'
import StaffView from '../views/StaffView.vue'
import ApiKeysView from '../views/ApiKeysView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import PartnerTermsView from '../views/PartnerTermsView.vue'
import ForgotPasswordView from '../views/ForgotPasswordView.vue'
import ResetPasswordView from '../views/ResetPasswordView.vue'

const routes: RouteRecordRaw[] = [
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
    path: '/terms',
    name: 'PartnerTerms',
    component: PartnerTermsView,
    meta: { public: true }
  },
  {
    path: '/forgot-password',
    name: 'ForgotPassword',
    component: ForgotPasswordView,
    meta: { public: true }
  },
  {
    path: '/reset-password',
    name: 'ResetPassword',
    component: ResetPasswordView,
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
    path: '/orders/:id',
    name: 'OrderDetail',
    component: OrderDetailView,
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

// Authentication Route Guard (#35: verified against the cookie jar, not a stored token).
router.beforeEach(async (to, _from, next) => {
  const isPublic = to.meta.public === true
  // restorePartnerSession verifies the jar once per page load (memory Bearer
  // covers cross-site staging); later navigations answer from the info cache.
  const authed = (!isPublic || to.path === '/login' || to.path === '/register')
    ? await restorePartnerSession()
    : !!partnerInfo()

  if (!isPublic && !authed) {
    next({ path: '/login', query: { redirect: to.fullPath } })
  } else if ((to.path === '/login' || to.path === '/register') && authed) {
    next({ path: partnerOnboardingPending() ? '/profile' : '/dashboard' })
  } else if (!isPublic && authed && partnerOnboardingPending() && to.path !== '/profile') {
    // C1: onboarding accounts can only complete their profile + docs.
    next({ path: '/profile', query: { onboarding: '1' } })
  } else {
    next()
  }
})

export default router
