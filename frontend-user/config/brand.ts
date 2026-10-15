/**
 * getfortrip - Master Brand Configuration & Constants
 * Source of Truth for Platform Identity
 */

export const BRAND = {
  name: 'getfortrip',
  displayName: 'getfortrip',
  officialName: 'getfortrip Global Travel Platform',
  
  // Domain configurations (prepared for getfortrip.com transition)
  plannedDomain: 'getfortrip.com',
  currentDeployUrl: 'https://ota-hub.dnjstjqppk.workers.dev',
  productionDomain: 'https://getfortrip.com',
  
  // Marketing & SEO Copy
  tagline: '전 세계 항공권, 호텔, 기차표, 렌터카 최저가 예약',
  shortTagline: '스마트한 전 세계 여행의 시작',
  metaDescription: 'getfortrip에서 전 세계 호텔, 항공권, 기차표, 렌터카, 투어 티켓 및 eSIM을 실시간 최저가로 비교하고 간편하게 예약하세요.',
  ogTitle: 'getfortrip - 전 세계 스마트 여행 예약 플랫폼',
  
  // Legal & Corporate Info
  companyName: 'getfortrip Inc.',
  copyright: 'Copyright © 2026 getfortrip Inc. All rights reserved.',
  supportEmail: 'support@getfortrip.com',
  businessLicense: '제 2026-서울강남-0941호',
  iataCertified: true,
  pciDssLevel: 'PCI-DSS 레벨 1 최고 등급 보안 인증',

  // Loyalty & Rewards
  coinName: 'getfortrip Coins',
  coinNameKo: 'getfortrip 코인',
  coinSymbol: 'G',
  coinUnit: 'G-Coins',
  coinExchangeRateKRW: 10, // 1 G-Coin = 10 KRW

  // Visual Assets
  logoUrl: '/logo.svg',
  logoWhiteUrl: '/logo-white.svg',
  symbolUrl: '/symbol.svg',
  faviconUrl: '/favicon.svg',
  appleTouchIconUrl: '/symbol.svg'
} as const

export type BrandConfig = typeof BRAND
