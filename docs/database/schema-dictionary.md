# getforTrip OTA — Database Schema Dictionary

## 1. 회원 및 인증 도메인 (Auth & User Domain)

### 1.1 `users` (회원 마스터)
고객 및 관리자/내부 사용자의 기본 계정 정보를 관리합니다.

| 컬럼명 | 데이터 타입 | Null | Default | PK/FK | 설명 |
|---|---|---|---|---|---|
| `id` | UUID | NO | gen_random_uuid() | PK | 사용자 고유 식별자 |
| `email` | VARCHAR(255) | NO | - | UK | 로그인 이메일 주소 (유니크) |
| `password_hash` | VARCHAR(255) | NO | - | - | Argon2id / bcrypt 해시된 비밀번호 |
| `full_name` | VARCHAR(100) | NO | - | - | 고객 실명 |
| `phone` | VARCHAR(50) | YES | NULL | - | 국제 표준 E.164 형식 연락처 |
| `membership_tier` | VARCHAR(20) | NO | 'SILVER' | - | 회원 등급 (`SILVER`, `GOLD`, `PLATINUM`, `DIAMOND`) |
| `trip_coins_balance` | INT | NO | 0 | - | 현재 가용 getforTrip 코인 잔액 |
| `status` | VARCHAR(20) | NO | 'ACTIVE' | - | 계정 상태 (`ACTIVE`, `SUSPENDED`, `WITHDRAWN`) |
| `created_at` | TIMESTAMPTZ | NO | NOW() | - | 계정 생성 일시 |
| `updated_at` | TIMESTAMPTZ | NO | NOW() | - | 최종 수정 일시 |

### 1.2 `user_coin_ledger` (코인 적립/차감 원장)
트립 코인의 모든 적립, 사용, 취소 환급 내역을 기록하는 불변(Append-Only) 원장 테이블입니다.

| 컬럼명 | 데이터 타입 | Null | Default | PK/FK | 설명 |
|---|---|---|---|---|---|
| `id` | UUID | NO | gen_random_uuid() | PK | 원장 레코드 식별자 |
| `user_id` | UUID | NO | - | FK (`users.id`) | 대상 사용자 ID |
| `booking_id` | UUID | YES | NULL | FK (`bookings.id`)| 연관 예약 ID |
| `transaction_type` | VARCHAR(20) | NO | - | - | `EARN`, `REDEEM`, `REFUND`, `EXPIRE`, `ADMIN_ADJUST` |
| `amount` | INT | NO | - | - | 변동 수량 (차감은 음수) |
| `balance_after` | INT | NO | - | - | 변동 후 잔액 |
| `description` | VARCHAR(255) | NO | - | - | 변동 사유 및 내역 설명 |
| `created_at` | TIMESTAMPTZ | NO | NOW() | - | 발생 일시 |

---

## 2. 파트너 및 공급사 도메인 (B2B Partner Domain)

### 2.1 `partners` (파트너사 마스터)
호텔 운영사, 차량 렌터사, 투어 기획사 등 B2B 공급사 정보.

| 컬럼명 | 데이터 타입 | Null | Default | PK/FK | 설명 |
|---|---|---|---|---|---|
| `id` | UUID | NO | gen_random_uuid() | PK | 파트너 식별자 |
| `company_name` | VARCHAR(150) | NO | - | - | 파트너 법인/상호명 |
| `business_reg_number` | VARCHAR(50) | NO | - | UK | 사업자 등록번호 |
| `contact_name` | VARCHAR(100) | NO | - | - | 정산/운영 담당자 성명 |
| `contact_email` | VARCHAR(255) | NO | - | - | 담당자 이메일 |
| `contact_phone` | VARCHAR(50) | NO | - | - | 담당자 연락처 |
| `commission_rate` | DECIMAL(5,2)| NO | 12.00 | - | 플랫폼 수수료율 (%) |
| `settlement_bank_code`| VARCHAR(20) | NO | - | - | 정산 은행 코드 |
| `settlement_account_num`| VARCHAR(100) | NO | - | - | 암호화된 정산 계좌번호 |
| `status` | VARCHAR(20) | NO | 'ACTIVE' | - | 계약 상태 (`ACTIVE`, `PENDING_REVIEW`, `TERMINATED`) |
| `created_at` | TIMESTAMPTZ | NO | NOW() | - | 등록 일시 |

### 2.2 `partner_api_keys` (B2B OpenAPI 연동 키)
PMS/GDS/Channel Manager 직접 연동을 위한 API 인증 자격증명.

| 컬럼명 | 데이터 타입 | Null | Default | PK/FK | 설명 |
|---|---|---|---|---|---|
| `id` | UUID | NO | gen_random_uuid() | PK | 키 ID |
| `partner_id` | UUID | NO | - | FK (`partners.id`)| 소속 파트너사 |
| `key_prefix` | VARCHAR(16) | NO | - | - | 마스킹 표기용 접두어 (`gft_live_...`) |
| `secret_hash` | VARCHAR(255) | NO | - | - | SHA-256 해시된 API Secret |
| `allowed_ips` | INET[] | YES | NULL | - | IP 허용 목록 (CIDR 배열) |
| `rate_limit_per_min`| INT | NO | 600 | - | 분당 최대 호출 한도 |
| `expires_at` | TIMESTAMPTZ | YES | NULL | - | 유효 만료 일시 |
| `created_at` | TIMESTAMPTZ | NO | NOW() | - | 발급 일시 |

---

## 3. 숙박 도메인 (Hotel & Inventory Domain)

### 3.1 `hotels` (호텔 속성 마스터)
| 컬럼명 | 데이터 타입 | Null | Default | PK/FK | 설명 |
|---|---|---|---|---|---|
| `id` | UUID | NO | gen_random_uuid() | PK | 호텔 ID |
| `partner_id` | UUID | NO | - | FK (`partners.id`)| 공급 파트너 ID |
| `name_ko` | VARCHAR(200) | NO | - | - | 호텔 한글 표기명 |
| `name_en` | VARCHAR(200) | NO | - | - | 호텔 영문 표기명 |
| `country_code` | VARCHAR(2) | NO | - | - | ISO-3166-1 alpha-2 (`KR`, `JP`, `TH`, `FR`) |
| `city_code` | VARCHAR(50) | NO | - | - | 도시 식별 코드 (`SEOUL`, `TOKYO`, `OSAKA`, etc.) |
| `address` | TEXT | NO | - | - | 호텔 도로명/상세 주소 |
| `latitude` | DECIMAL(10,7)| NO | - | - | WGS84 위도 |
| `longitude` | DECIMAL(10,7)| NO | - | - | WGS84 경도 |
| `star_rating` | INT | NO | 5 | - | 성급 (1~5) |
| `review_score` | DECIMAL(3,1)| NO | 0.0 | - | 평균 평점 (0.0 ~ 5.0) |
| `checkin_time` | VARCHAR(10) | NO | '15:00' | - | 체크인 기준 시각 |
| `checkout_time`| VARCHAR(10) | NO | '11:00' | - | 체크아웃 기준 시각 |
| `amenities` | JSONB | NO | '[]' | - | 부대시설 태그 리스트 (수영장, 와이파이, 조식 등) |
| `images` | JSONB | NO | '[]' | - | CDN 이미지 URL 목록 |
| `status` | VARCHAR(20) | NO | 'ONLINE' | - | 노출 상태 (`ONLINE`, `OFFLINE`, `SOLD_OUT`) |

### 3.2 `hotel_rooms` (객실 타입 마스터)
| 컬럼명 | 데이터 타입 | Null | Default | PK/FK | 설명 |
|---|---|---|---|---|---|
| `id` | UUID | NO | gen_random_uuid() | PK | 객실 타입 ID |
| `hotel_id` | UUID | NO | - | FK (`hotels.id`)| 소속 호텔 ID |
| `name_ko` | VARCHAR(150) | NO | - | - | 객실 한글명 (예: 디럭스 킹 룸) |
| `room_type` | VARCHAR(50) | NO | 'DELUXE' | - | 객실 규격 (`STANDARD`, `DELUXE`, `SUITE`, `VILLA`) |
| `standard_occupancy` | INT | NO | 2 | - | 기준 투숙 인원 |
| `max_occupancy` | INT | NO | 3 | - | 최대 투숙 허용 인원 |
| `room_size_sqm` | DECIMAL(6,2)| NO | 32.0 | - | 객실 면적 (㎡) |
| `bed_type` | VARCHAR(100) | NO | '1 King Bed'| - | 침대 구성 |
| `has_breakfast` | BOOLEAN | NO | FALSE | - | 조식 포함 여부 |
| `is_refundable` | BOOLEAN | NO | TRUE | - | 무료 취소 가능 여부 |

### 3.3 `room_inventories` (일자별 객실 재고 원장)
| 컬럼명 | 데이터 타입 | Null | Default | PK/FK | 설명 |
|---|---|---|---|---|---|
| `id` | UUID | NO | gen_random_uuid() | PK | 원장 식별자 |
| `room_id` | UUID | NO | - | FK (`hotel_rooms.id`)| 대상 객실 타입 |
| `stay_date` | DATE | NO | - | - | 투숙 대상 일자 |
| `total_allotted` | INT | NO | 0 | - | 파트너 할당 총 객실 수 |
| `locked_inventory` | INT | NO | 0 | - | 15분 결제 대기 중 잠긴 객실 수 |
| `sold_inventory` | INT | NO | 0 | - | 결제 완료 확정 판매 객실 수 |
| `available_inventory`| INT | NO | 0 | - | 실시간 판매 가능 잔여 객실 수 |

---

## 4. 예약 및 결제 도메인 (Booking & Payment Domain)

### 4.1 `bookings` (통합 예약 마스터)
| 컬럼명 | 데이터 타입 | Null | Default | PK/FK | 설명 |
|---|---|---|---|---|---|
| `id` | UUID | NO | gen_random_uuid() | PK | 내부 예약 식별자 |
| `booking_code` | VARCHAR(32) | NO | - | UK | 사용자 노출용 영숫자 예약번호 (`GF-HT-202611-89312`) |
| `user_id` | UUID | YES | NULL | FK (`users.id`)| 예약 고객 ID (비회원 가능) |
| `domain_type` | VARCHAR(20) | NO | - | - | `HOTEL`, `FLIGHT`, `PACKAGE`, `TRAIN`, `CAR`, `ACTIVITY`, `TRANSFER` |
| `status` | VARCHAR(20) | NO | 'DRAFT' | - | `DRAFT`, `PAYMENT_PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED` |
| `base_amount_krw` | DECIMAL(12,2)| NO | 0.00 | - | 정가 기준 합계 |
| `tax_amount_krw` | DECIMAL(12,2)| NO | 0.00 | - | 제세공과금 및 유류세 |
| `service_fee_krw` | DECIMAL(12,2)| NO | 0.00 | - | 플랫폼 취급 수수료 |
| `discount_amount_krw`| DECIMAL(12,2)| NO | 0.00 | - | 쿠폰 및 프로모션 할인 총액 |
| `trip_coins_used` | INT | NO | 0 | - | 결제에 사용된 코인 수량 |
| `final_amount_krw` | DECIMAL(12,2)| NO | 0.00 | - | KRW 기준 최종 결제 실 청구액 |
| `paid_currency` | VARCHAR(3) | NO | 'KRW' | - | 실제 승인된 화폐 코드 (`KRW`, `USD`, `JPY`, `EUR`) |
| `paid_currency_amount`| DECIMAL(12,2)| NO | 0.00 | - | 실제 승인된 외화 금액 |
| `primary_contact_name`| VARCHAR(100) | NO | - | - | 대표 예약자 성명 |
| `primary_contact_email`| VARCHAR(255)| NO | - | - | 바우처 수신 이메일 |
| `primary_contact_phone`| VARCHAR(50) | NO | - | - | SMS 수신 휴대전화번호 |
| `inventory_lock_expires_at`| TIMESTAMPTZ| YES | NULL | - | 15분 소프트 락 만료 시각 |
| `created_at` | TIMESTAMPTZ | NO | NOW() | - | 예약 생성 일시 |
| `confirmed_at` | TIMESTAMPTZ | YES | NULL | - | 발권/예약 확정 일시 |
| `cancelled_at` | TIMESTAMPTZ | YES | NULL | - | 취소 일시 |

### 4.2 `booking_items` (세부 예약 품목)
복합 결제 및 패키지 번들을 구성하는 개별 공급 품목 내역.

| 컬럼명 | 데이터 타입 | Null | Default | PK/FK | 설명 |
|---|---|---|---|---|---|
| `id` | UUID | NO | gen_random_uuid() | PK | 품목 ID |
| `booking_id` | UUID | NO | - | FK (`bookings.id`)| 루트 예약 ID |
| `item_type` | VARCHAR(30) | NO | - | - | `HOTEL_ROOM`, `FLIGHT_OUTBOUND`, `FLIGHT_INBOUND`, `CAR_RENTAL`, etc. |
| `target_resource_id`| UUID | NO | - | - | 대상 리소스 식별자 |
| `confirmation_pin` | VARCHAR(50) | YES | NULL | - | 공급사 PNR / 호텔 PMS 컨펌번호 |
| `snapshot_data` | JSONB | NO | '{}' | - | 예약 당시 상품 명세 (이름, 일정, 사진, 정책) 스냅샷 |
| `item_price_krw` | DECIMAL(12,2)| NO | 0.00 | - | 품목별 배분 가격 |
| `supplier_status` | VARCHAR(30) | NO | 'PENDING' | - | 공급사 발권 상태 (`PENDING`, `CONFIRMED`, `FAILED`, `CANCELLED`) |

### 4.3 `payments` (전자결제 승인 원장)
| 컬럼명 | 데이터 타입 | Null | Default | PK/FK | 설명 |
|---|---|---|---|---|---|
| `id` | UUID | NO | gen_random_uuid() | PK | 결제 레코드 ID |
| `booking_id` | UUID | NO | - | FK (`bookings.id`)| 연관 예약 ID |
| `transaction_code` | VARCHAR(64) | NO | - | UK | PG사 거래 고유번호 (TID) |
| `pg_provider` | VARCHAR(30) | NO | 'TOSS_PAYMENTS'| - | PG사 구분 (`TOSS_PAYMENTS`, `STRIPE`, `KAKAO_PAY`) |
| `payment_method` | VARCHAR(30) | NO | 'CARD' | - | 결제 수단 (`CARD`, `EASY_PAY`, `VIRTUAL_ACCOUNT`) |
| `amount` | DECIMAL(12,2)| NO | - | - | 승인 금액 |
| `currency` | VARCHAR(3) | NO | 'KRW' | - | 승인 통화 |
| `status` | VARCHAR(20) | NO | 'AUTHORIZED' | - | `AUTHORIZED`, `SETTLED`, `CANCELLED`, `FAILED` |
| `pg_raw_response` | JSONB | NO | '{}' | - | PG사 웹훅/응답 전문 원본 (감사용) |
| `paid_at` | TIMESTAMPTZ | YES | NULL | - | 승인 완료 시각 |
