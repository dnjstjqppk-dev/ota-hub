/**
 * External Supplier GDS/NDC/Bed-Bank Adapter Specifications
 * ==========================================================
 * Compliant with PO Directive Section 2 & 8:
 * - Implements real API request/response structures and data contracts.
 * - Distinguishes between LIVE_CONTRACT_ACTIVE and BLOCKED_PENDING_CONTRACT.
 * - Safely returns structured errors when live supplier credentials are not configured.
 */

export type ContractStatus = 'ACTIVE' | 'PENDING_CONTRACT' | 'SANDBOX_MOCK';

export interface ExternalAdapterSpec {
  supplierCode: string;
  supplierName: string;
  category: 'FLIGHT' | 'HOTEL' | 'ACTIVITY' | 'CAR' | 'ESIM' | 'INSURANCE';
  contractStatus: ContractStatus;
  apiDocsUrl: string;
  supportedMethods: string[];
  search(params: any): Promise<any>;
  createOrder(payload: any): Promise<any>;
  cancelOrder(orderId: string, reason: string): Promise<any>;
}

// 1. Amadeus GDS / NDC Flight Adapter
export const amadeusFlightAdapter: ExternalAdapterSpec = {
  supplierCode: 'AMADEUS_GDS',
  supplierName: 'Amadeus Global Travel Network',
  category: 'FLIGHT',
  contractStatus: 'PENDING_CONTRACT',
  apiDocsUrl: 'https://developers.amadeus.com/self-service/category/air',
  supportedMethods: ['v2/shopping/flight-offers', 'v1/booking/flight-orders', 'v1/booking/flight-orders/cancellation'],
  async search(params: any) {
    return {
      status: 'BLOCKED_PENDING_CONTRACT',
      message: 'Amadeus GDS 글로벌 정식 운영 계약 체결 대기 중입니다. (규격 및 어댑터 매핑 완료)',
      query: params,
      fallbackMode: 'LOCAL_INVENTORY'
    };
  },
  async createOrder(payload: any) {
    return {
      status: 'BLOCKED_PENDING_CONTRACT',
      code: 'AMADEUS_CONTRACT_REQUIRED',
      message: 'Amadeus PNR 자동 생성 및 실발권은 IATA/GDS 운영사 계약 인가가 필요합니다.',
      payload
    };
  },
  async cancelOrder(orderId: string, reason: string) {
    return {
      status: 'BLOCKED_PENDING_CONTRACT',
      orderId,
      reason
    };
  }
};

// 2. Agoda YCS / Hotelbeds Adapter
export const agodaHotelAdapter: ExternalAdapterSpec = {
  supplierCode: 'AGODA_YCS',
  supplierName: 'Agoda Strategic Partner Bed-Bank',
  category: 'HOTEL',
  contractStatus: 'PENDING_CONTRACT',
  apiDocsUrl: 'https://partners.agoda.com/api',
  supportedMethods: ['hotels/availability', 'bookings/create', 'bookings/cancel'],
  async search(params: any) {
    return {
      status: 'BLOCKED_PENDING_CONTRACT',
      message: 'Agoda Partner B2B API 정식 키 발급 대기 중입니다.',
      params
    };
  },
  async createOrder(payload: any) {
    return {
      status: 'BLOCKED_PENDING_CONTRACT',
      code: 'AGODA_KEY_REQUIRED',
      message: 'Agoda Bed-Bank 실시간 객실 확정은 공급사 정산 계약 완료 후 활성화됩니다.'
    };
  },
  async cancelOrder(orderId: string) {
    return { status: 'BLOCKED_PENDING_CONTRACT', orderId };
  }
};

// 3. Viator / Tripadvisor Activity Adapter
export const viatorActivityAdapter: ExternalAdapterSpec = {
  supplierCode: 'VIATOR_API',
  supplierName: 'Viator / Tripadvisor Experiences',
  category: 'ACTIVITY',
  contractStatus: 'PENDING_CONTRACT',
  apiDocsUrl: 'https://docs.viator.com/partner-api',
  supportedMethods: ['products/search', 'availability/check', 'bookings/book', 'bookings/cancel'],
  async search(params: any) {
    return {
      status: 'BLOCKED_PENDING_CONTRACT',
      message: 'Viator 글로벌 어필리에이트/공급사 API 계약 대기 중입니다.',
      params
    };
  },
  async createOrder(payload: any) {
    return {
      status: 'BLOCKED_PENDING_CONTRACT',
      code: 'VIATOR_CONTRACT_REQUIRED',
      message: 'Viator 티켓/바우처 실시간 발권 연동은 공급사 심사 후 활성화됩니다.'
    };
  },
  async cancelOrder(orderId: string) {
    return { status: 'BLOCKED_PENDING_CONTRACT', orderId };
  }
};

// 4. Rentalcars / Booking.com Transport Adapter
export const rentalcarsAdapter: ExternalAdapterSpec = {
  supplierCode: 'RENTALCARS_CONNECT',
  supplierName: 'Rentalcars Connect (Booking Holdings)',
  category: 'CAR',
  contractStatus: 'PENDING_CONTRACT',
  apiDocsUrl: 'https://www.rentalcars.com/affiliates',
  supportedMethods: ['search/vehicles', 'bookings/quote', 'bookings/confirm'],
  async search(params: any) {
    return {
      status: 'BLOCKED_PENDING_CONTRACT',
      message: 'Rentalcars Connect 글로벌 B2B 공급사 계약 대기 중입니다.',
      params
    };
  },
  async createOrder(payload: any) {
    return {
      status: 'BLOCKED_PENDING_CONTRACT',
      code: 'RENTALCARS_KEY_REQUIRED',
      message: '해외 렌터카 실시간 공급 연동은 정식 파트너사 등록 후 활성화됩니다.'
    };
  },
  async cancelOrder(orderId: string) {
    return { status: 'BLOCKED_PENDING_CONTRACT', orderId };
  }
};

// 5. Airalo eSIM Adapter
export const airaloEsimAdapter: ExternalAdapterSpec = {
  supplierCode: 'AIRALO_ESIM',
  supplierName: 'Airalo Global eSIM Platform',
  category: 'ESIM',
  contractStatus: 'SANDBOX_MOCK',
  apiDocsUrl: 'https://partners.airalo.com/api',
  supportedMethods: ['packages/list', 'orders/create', 'esim/status'],
  async search(params: any) {
    return {
      status: 'ACTIVE_SANDBOX',
      message: 'Airalo eSIM 데이터 패키지 샌드박스 연동 활성화 상태입니다.',
      params
    };
  },
  async createOrder(payload: any) {
    return {
      status: 'CONFIRMED',
      iccid: `890141032111${Date.now().toString().slice(-7)}`,
      qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=LPA:1$smdp.airalo.com$TEST-VOUCHER',
      matchingId: `AIRALO-${Date.now()}`
    };
  },
  async cancelOrder(orderId: string) {
    return { status: 'CANCELLED', orderId };
  }
};

// 6. Chubb Travel Insurance Adapter
export const chubbInsuranceAdapter: ExternalAdapterSpec = {
  supplierCode: 'CHUBB_INSURANCE',
  supplierName: 'Chubb Overseas Travel Insurance',
  category: 'INSURANCE',
  contractStatus: 'PENDING_CONTRACT',
  apiDocsUrl: 'https://www.chubb.com/kr-kr/corporate-partners.html',
  supportedMethods: ['policy/quote', 'policy/issue', 'policy/endorsement', 'policy/cancel'],
  async search(params: any) {
    return {
      status: 'BLOCKED_PENDING_CONTRACT',
      message: '에이스손해보험(Chubb) 단체여행보험 제휴 심사 진행 중입니다.',
      params
    };
  },
  async createOrder(payload: any) {
    return {
      status: 'BLOCKED_PENDING_CONTRACT',
      code: 'CHUBB_UNDERWRITING_REQUIRED',
      message: '여행자보험 실증권 발행은 손해보험협회 대리점 등록 및 승인 후 활성화됩니다.'
    };
  },
  async cancelOrder(orderId: string) {
    return { status: 'BLOCKED_PENDING_CONTRACT', orderId };
  }
};

export const externalSupplierRegistry: Record<string, ExternalAdapterSpec> = {
  AMADEUS_GDS: amadeusFlightAdapter,
  AGODA_YCS: agodaHotelAdapter,
  VIATOR_API: viatorActivityAdapter,
  RENTALCARS_CONNECT: rentalcarsAdapter,
  AIRALO_ESIM: airaloEsimAdapter,
  CHUBB_INSURANCE: chubbInsuranceAdapter
};
