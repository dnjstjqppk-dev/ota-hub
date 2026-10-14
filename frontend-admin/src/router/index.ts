import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '../views/DashboardView.vue'
import CatalogView from '../views/CatalogView.vue'
import PricingView from '../views/PricingView.vue'
import BookingOmsView from '../views/BookingOmsView.vue'
import PromotionsView from '../views/PromotionsView.vue'
import CommunityView from '../views/CommunityView.vue'
import SupportView from '../views/SupportView.vue'
import SettlementsView from '../views/SettlementsView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', component: DashboardView },
    { path: '/catalog', component: CatalogView },
    { path: '/pricing', component: PricingView },
    { path: '/bookings', component: BookingOmsView },
    { path: '/promotions', component: PromotionsView },
    { path: '/community', component: CommunityView },
    { path: '/support', component: SupportView },
    { path: '/settlements', component: SettlementsView }
  ]
})

export default router

