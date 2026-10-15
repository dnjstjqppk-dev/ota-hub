-- =========================================================================
-- Migration 000008: 글로벌 OTA 마스터 주문(Orders), 결제 트랜잭션(Payments),
--                    여정 품목(Itinerary Items) 및 전자 바우처(Vouchers) 통합 스키마
-- =========================================================================

-- 1. 통합 예약 주문 테이블 (booking_orders)
CREATE TABLE IF NOT EXISTS booking_orders (
    id VARCHAR(64) PRIMARY KEY, -- e.g., 'GF-20261015-9821'
    user_id VARCHAR(64) NOT NULL,
    domain_type VARCHAR(32) NOT NULL, -- 'HOTEL', 'FLIGHT', 'TRAIN', 'CAR', 'TRANSFER', 'ACTIVITY', 'PACKAGE'
    order_status VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED', -- 'DRAFT', 'PENDING_PAYMENT', 'CONFIRMED', 'ISSUE_FAILED', 'CANCEL_REQUESTED', 'CANCELLED', 'REFUNDED'
    
    -- 금액 및 통화 규격
    base_amount_krw NUMERIC(12,2) NOT NULL,
    tax_amount_krw NUMERIC(12,2) NOT NULL DEFAULT 0,
    service_fee_krw NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount_krw NUMERIC(12,2) NOT NULL DEFAULT 0,
    trip_coins_used INT NOT NULL DEFAULT 0,
    final_amount_krw NUMERIC(12,2) NOT NULL,
    paid_currency VARCHAR(10) NOT NULL DEFAULT 'KRW', -- KRW, USD, JPY, EUR, CNY, HKD, TWD, SGD, THB, GBP
    paid_currency_amount NUMERIC(12,2) NOT NULL,
    exchange_rate NUMERIC(10,4) NOT NULL DEFAULT 1.0000,
    
    -- 예약자 및 비상 연락처
    primary_contact_name VARCHAR(100) NOT NULL,
    primary_contact_email VARCHAR(150) NOT NULL,
    primary_contact_phone VARCHAR(50) NOT NULL,
    special_requests TEXT,
    
    -- 확정 식별자 및 공급처 수배 PNR
    confirmation_number VARCHAR(64), -- 'PNR-XXXXXX'
    supplier_reference_id VARCHAR(64),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_booking_orders_user_status ON booking_orders (user_id, order_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_orders_domain_status ON booking_orders (domain_type, order_status);

-- 2. 여정 상세 품목 테이블 (booking_itinerary_items)
CREATE TABLE IF NOT EXISTS booking_itinerary_items (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL REFERENCES booking_orders(id) ON DELETE CASCADE,
    item_type VARCHAR(32) NOT NULL, -- 'HOTEL_ROOM', 'FLIGHT_SEGMENT', 'TRAIN_SEAT', 'CAR_VEHICLE', 'TRANSFER_RIDE', 'TOUR_TICKET', 'PACKAGE_BUNDLE'
    product_id VARCHAR(64) NOT NULL,
    product_title VARCHAR(255) NOT NULL,
    
    -- 일정
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    departure_location VARCHAR(150),
    arrival_location VARCHAR(150),
    
    -- 수량 및 탑승/투숙객
    quantity INT NOT NULL DEFAULT 1,
    passenger_name VARCHAR(100),
    seat_number VARCHAR(30),
    cabin_or_room_class VARCHAR(50),
    
    unit_price_krw NUMERIC(12,2) NOT NULL,
    subtotal_krw NUMERIC(12,2) NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_itinerary_items_order ON booking_itinerary_items (order_id);

-- 3. 결제 트랜잭션 및 정산 원장 (payment_transactions)
CREATE TABLE IF NOT EXISTS payment_transactions (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL REFERENCES booking_orders(id) ON DELETE CASCADE,
    pg_provider VARCHAR(50) NOT NULL DEFAULT 'STRIPE', -- 'STRIPE', 'PORTONE', 'TOSS', 'ALIPAY', 'WECHATPAY', 'PAYPAL'
    pg_transaction_id VARCHAR(150) NOT NULL,
    idempotency_key VARCHAR(150) UNIQUE,
    
    payment_method VARCHAR(50) NOT NULL DEFAULT 'CREDIT_CARD', -- 'CREDIT_CARD', 'VIRTUAL_ACCOUNT', 'EASY_PAY', 'TRIP_COINS'
    payment_status VARCHAR(32) NOT NULL DEFAULT 'SUCCESS', -- 'SUCCESS', 'FAILED', 'CANCELLED', 'PARTIAL_REFUNDED'
    
    amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'KRW',
    card_company VARCHAR(50),
    installment_months INT DEFAULT 0,
    
    receipt_url TEXT,
    refund_amount NUMERIC(12,2) DEFAULT 0,
    refunded_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order ON payment_transactions (order_id, payment_status);

-- 4. 전자 바우처 및 QR 체크인 테이블 (customer_vouchers)
CREATE TABLE IF NOT EXISTS customer_vouchers (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL REFERENCES booking_orders(id) ON DELETE CASCADE,
    itinerary_item_id VARCHAR(64) REFERENCES booking_itinerary_items(id) ON DELETE SET NULL,
    voucher_code VARCHAR(100) UNIQUE NOT NULL,
    qr_payload TEXT NOT NULL,
    barcode_value VARCHAR(100),
    valid_until TIMESTAMP WITH TIME ZONE,
    is_redeemed BOOLEAN DEFAULT FALSE,
    redeemed_at TIMESTAMP WITH TIME ZONE,
    checkin_station_or_gate VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_vouchers_order ON customer_vouchers (order_id, voucher_code);

