import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import CatalogView from '../views/CatalogView.vue'
import PricingView from '../views/PricingView.vue'
import BookingOmsView from '../views/BookingOmsView.vue'
import PromotionsView from '../views/PromotionsView.vue'
import CommunityView from '../views/CommunityView.vue'
import SupportView from '../views/SupportView.vue'
import SettlementsView from '../views/SettlementsView.vue'
import PartnersView from '../views/PartnersView.vue'
import UsersView from '../views/UsersView.vue'
import LoginView from '../views/LoginView.vue'
import FeatureFlagsView from '../views/FeatureFlagsView.vue'
import UrlIngestionView from '../views/UrlIngestionView.vue'
import SuppliersView from '../views/SuppliersView.vue'
import TicketsView from '../views/TicketsView.vue'
import AffiliateView from '../views/AffiliateView.vue'
import LegalView from '../views/LegalView.vue'
import EntitiesView from '../views/EntitiesView.vue'
import { restoreSession, session } from '../composables/session'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
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
    path: '/bookings',
    name: 'Bookings',
    component: BookingOmsView,
    meta: { requiresAuth: true }
  },
  {
    path: '/catalog',
    name: 'Catalog',
    component: CatalogView,
    meta: { requiresAuth: true }
  },
  {
    path: '/suppliers',
    name: 'Suppliers',
    component: SuppliersView,
    meta: { requiresAuth: true }
  },
  {
    path: '/url-ingest',
    name: 'UrlIngest',
    component: UrlIngestionView,
    meta: { requiresAuth: true }
  },
  {
    path: '/feature-flags',
    name: 'FeatureFlags',
    component: FeatureFlagsView,
    meta: { requiresAuth: true }
  },
  {
    path: '/partners',
    name: 'Partners',
    component: PartnersView,
    meta: { requiresAuth: true }
  },
  {
    path: '/users',
    name: 'Users',
    component: UsersView,
    meta: { requiresAuth: true }
  },
  {
    path: '/pricing',
    name: 'Pricing',
    component: PricingView,
    meta: { requiresAuth: true }
  },
  {
    path: '/promotions',
    name: 'Promotions',
    component: PromotionsView,
    meta: { requiresAuth: true }
  },
  {
    path: '/community',
    name: 'Community',
    component: CommunityView,
    meta: { requiresAuth: true }
  },
  {
    path: '/support',
    name: 'Support',
    component: SupportView,
    meta: { requiresAuth: true }
  },
  {
    path: '/tickets',
    name: 'Tickets',
    component: TicketsView,
    meta: { requiresAuth: true }
  },
  {
    path: '/settlements',
    name: 'Settlements',
    component: SettlementsView,
    meta: { requiresAuth: true }
  },
  {
    path: '/affiliate',
    name: 'Affiliate',
    component: AffiliateView,
    meta: { requiresAuth: true }
  },
  {
    path: '/legal',
    name: 'Legal',
    component: LegalView,
    meta: { requiresAuth: true }
  },
  {
    path: '/entities',
    name: 'Entities',
    component: EntitiesView,
    meta: { requiresAuth: true }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard'
  }
]

// Support both standalone host (e.g. ota-admin.workers.dev -> '/') and path mount (e.g. ota-hub/admin/)
const basePath = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin') ? '/admin/' : '/'

const router = createRouter({
  history: createWebHistory(basePath),
  routes
})

// Authentication Route Guard (#35: verified against the cookie jar, not a stored token).
router.beforeEach(async (to, _from, next) => {
  const isPublic = to.meta.public === true
  if (!isPublic || to.path === '/login') await restoreSession()
  const logged = !!session.user

  if (!isPublic && !logged) {
    next({ path: '/login', query: { redirect: to.fullPath } })
  } else if (to.path === '/login' && logged) {
    next({ path: '/dashboard' })
  } else {
    next()
  }
})

export default router
