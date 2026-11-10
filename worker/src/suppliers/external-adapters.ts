/**
 * External supplier capability specifications.
 * ============================================
 * Admin-only reference: which fulfilment capabilities the platform has
 * actually contracted (none, today) and which data contracts a future
 * integration must implement. No vendor names appear here — naming a vendor
 * would imply a partnership that does not exist (#41).
 *
 * Every spec reports BLOCKED_PENDING_CONTRACT. In particular nothing here
 * may fabricate fulfilment artifacts (the old eSIM mock minted fake ICCIDs
 * and QR codes; that is gone).
 */

export type ContractStatus = 'ACTIVE' | 'PENDING_CONTRACT';

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

function blocked(code: string, message: string) {
  return { status: 'BLOCKED_PENDING_CONTRACT', code, message };
}

// 1. GDS / NDC flight fulfilment (no contract: no ticketing exists)
export const gdsFlightAdapter: ExternalAdapterSpec = {
  supplierCode: 'GDS_FLIGHT_01',
  supplierName: 'GDS 항공 공급사 (미계약)',
  category: 'FLIGHT',
  contractStatus: 'PENDING_CONTRACT',
  apiDocsUrl: 'https://developers.amadeus.com/self-service/category/air',
  supportedMethods: ['v2/shopping/flight-offers', 'v1/booking/flight-orders', 'v1/booking/flight-orders/cancellation'],
  async search(params: any) {
    return { ...blocked('GDS_CONTRACT_REQUIRED', 'GDS/NDC 항공 공급 계약이 없어 실시간 요금 조회·발권을 할 수 없습니다.'), query: params };
  },
  async createOrder(payload: any) {
    return { ...blocked('GDS_CONTRACT_REQUIRED', 'GDS/NDC 항공 공급 계약이 없어 PNR 생성·발권을 할 수 없습니다.'), payload };
  },
  async cancelOrder(orderId: string, reason: string) {
    return { ...blocked('GDS_CONTRACT_REQUIRED', 'GDS/NDC 항공 공급 계약이 없어 취소 연동을 할 수 없습니다.'), orderId, reason };
  }
};

// 2. Bed-bank hotel fulfilment (no contract)
export const bedbankHotelAdapter: ExternalAdapterSpec = {
  supplierCode: 'BEDBANK_HOTEL_01',
  supplierName: '베드뱅크 호텔 공급사 (미계약)',
  category: 'HOTEL',
  contractStatus: 'PENDING_CONTRACT',
  apiDocsUrl: 'https://partners.agoda.com/api',
  supportedMethods: ['hotels/availability', 'bookings/create', 'bookings/cancel'],
  async search(params: any) {
    return { ...blocked('BEDBANK_CONTRACT_REQUIRED', '베드뱅크 공급 계약이 없어 실시간 객실 재고 조회를 할 수 없습니다.'), params };
  },
  async createOrder(payload: any) {
    return { ...blocked('BEDBANK_CONTRACT_REQUIRED', '베드뱅크 공급 계약이 없어 실시간 객실 확정을 할 수 없습니다.'), payload };
  },
  async cancelOrder(orderId: string) {
    return { ...blocked('BEDBANK_CONTRACT_REQUIRED', '베드뱅크 공급 계약이 없어 취소 연동을 할 수 없습니다.'), orderId };
  }
};

// 3. Global activity fulfilment (no contract)
export const globalActivityAdapter: ExternalAdapterSpec = {
  supplierCode: 'OTA_ACTIVITY_01',
  supplierName: '글로벌 액티비티 공급사 (미계약)',
  category: 'ACTIVITY',
  contractStatus: 'PENDING_CONTRACT',
  apiDocsUrl: 'https://docs.viator.com/partner-api',
  supportedMethods: ['products/search', 'availability/check', 'bookings/book', 'bookings/cancel'],
  async search(params: any) {
    return { ...blocked('ACTIVITY_CONTRACT_REQUIRED', '액티비티 공급 계약이 없어 실시간 상품 조회를 할 수 없습니다.'), params };
  },
  async createOrder(payload: any) {
    return { ...blocked('ACTIVITY_CONTRACT_REQUIRED', '액티비티 공급 계약이 없어 실시간 바우처 발권을 할 수 없습니다.'), payload };
  },
  async cancelOrder(orderId: string) {
    return { ...blocked('ACTIVITY_CONTRACT_REQUIRED', '액티비티 공급 계약이 없어 취소 연동을 할 수 없습니다.'), orderId };
  }
};

// 4. Global car-rental fulfilment (no contract)
export const globalCarAdapter: ExternalAdapterSpec = {
  supplierCode: 'CAR_GLOBAL_01',
  supplierName: '글로벌 렌터카 공급사 (미계약)',
  category: 'CAR',
  contractStatus: 'PENDING_CONTRACT',
  apiDocsUrl: 'https://www.rentalcars.com/affiliates',
  supportedMethods: ['search/vehicles', 'bookings/quote', 'bookings/confirm'],
  async search(params: any) {
    return { ...blocked('CAR_CONTRACT_REQUIRED', '렌터카 공급 계약이 없어 실시간 차량 조회를 할 수 없습니다.'), params };
  },
  async createOrder(payload: any) {
    return { ...blocked('CAR_CONTRACT_REQUIRED', '렌터카 공급 계약이 없어 실시간 예약을 할 수 없습니다.'), payload };
  },
  async cancelOrder(orderId: string) {
    return { ...blocked('CAR_CONTRACT_REQUIRED', '렌터카 공급 계약이 없어 취소 연동을 할 수 없습니다.'), orderId };
  }
};

// 5. eSIM fulfilment (no contract — listings only, never issuance)
export const globalEsimAdapter: ExternalAdapterSpec = {
  supplierCode: 'ESIM_GLOBAL_01',
  supplierName: '글로벌 eSIM 공급사 (미계약)',
  category: 'ESIM',
  contractStatus: 'PENDING_CONTRACT',
  apiDocsUrl: 'https://partners.airalo.com/api',
  supportedMethods: ['packages/list', 'orders/create', 'esim/status'],
  async search(params: any) {
    return { ...blocked('ESIM_CONTRACT_REQUIRED', 'eSIM 공급 계약이 없어 개통 연동을 할 수 없습니다. 요금제 조회만 제공합니다.'), params };
  },
  async createOrder(payload: any) {
    return { ...blocked('ESIM_CONTRACT_REQUIRED', 'eSIM 공급 계약이 없어 개통·QR 발급을 할 수 없습니다.'), payload };
  },
  async cancelOrder(orderId: string) {
    return { ...blocked('ESIM_CONTRACT_REQUIRED', 'eSIM 공급 계약이 없어 취소 연동을 할 수 없습니다.'), orderId };
  }
};

// 6. Travel-insurance fulfilment (no contract — listings only, never issuance)
export const travelInsuranceAdapter: ExternalAdapterSpec = {
  supplierCode: 'INSURANCE_01',
  supplierName: '여행자보험 공급사 (미계약)',
  category: 'INSURANCE',
  contractStatus: 'PENDING_CONTRACT',
  apiDocsUrl: 'https://www.chubb.com/kr-kr/corporate-partners.html',
  supportedMethods: ['policy/quote', 'policy/issue', 'policy/endorsement', 'policy/cancel'],
  async search(params: any) {
    return { ...blocked('INSURANCE_CONTRACT_REQUIRED', '여행자보험 제휴가 없어 실시간 견적을 할 수 없습니다. 플랜 조회만 제공합니다.'), params };
  },
  async createOrder(payload: any) {
    return { ...blocked('INSURANCE_CONTRACT_REQUIRED', '여행자보험 제휴가 없어 실증권 발행을 할 수 없습니다.'), payload };
  },
  async cancelOrder(orderId: string) {
    return { ...blocked('INSURANCE_CONTRACT_REQUIRED', '여행자보험 제휴가 없어 취소 연동을 할 수 없습니다.'), orderId };
  }
};

export const externalSupplierRegistry: Record<string, ExternalAdapterSpec> = {
  GDS_FLIGHT_01: gdsFlightAdapter,
  BEDBANK_HOTEL_01: bedbankHotelAdapter,
  OTA_ACTIVITY_01: globalActivityAdapter,
  CAR_GLOBAL_01: globalCarAdapter,
  ESIM_GLOBAL_01: globalEsimAdapter,
  INSURANCE_01: travelInsuranceAdapter
};
