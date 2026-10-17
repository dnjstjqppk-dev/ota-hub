# getforTrip OTA — Index and Query Optimization Plan

## 1. 개요
OTA 서비스의 데이터베이스 워크로드는 다음과 같은 명확한 특성을 지닙니다.
- **초고빈도 읽기 (Read-Heavy)**: 호텔/항공/열차 검색, 일자별 가격/잔여석 조회 (전체 트래픽의 95% 이상)
- **엄격한 원자적 쓰기 (Write-Heavy Burst)**: 성수기 프로모션 기간 객실 15분 선점 락, 실시간 예약 확정 및 PG 결제 승인

이러한 특성을 감안하여 밀리초 단위 검색 응답속도와 동시성 경합 제로를 달성하기 위한 인덱스 및 쿼리 최적화 플랜을 정의합니다.

---

## 2. 필수 복합 인덱스 (Composite Indexes) 설계

### 2.1 호텔 검색 최적화 인덱스
호텔 검색 쿼리는 `city_code`, `status`, `star_rating`, `review_score`를 복합 필터링합니다.

```sql
-- 1. 도시별 활성 호텔 필터링 커버링 인덱스
CREATE INDEX CONCURRENTLY idx_hotels_city_status_rating 
ON hotels (city_code, status, star_rating DESC, review_score DESC);

-- 2. 일자별 잔여 객실 조회 인덱스
CREATE INDEX CONCURRENTLY idx_room_inventories_lookup 
ON room_inventories (room_id, stay_date) 
INCLUDE (available_inventory, locked_inventory);
```

### 2.2 항공편 노선 및 일자 검색 인덱스
출발지, 도착지, 출발일자 범위로 정렬하는 인덱스입니다.

```sql
CREATE INDEX CONCURRENTLY idx_flights_route_departure 
ON flight_schedules (origin_airport_code, destination_airport_code, departure_time)
WHERE status = 'SCHEDULED';
```

### 2.3 예약 마이페이지 및 관리자 조회 인덱스
고객 마이페이지는 사용자 ID별 최신 예약순 정렬이 핵심입니다.

```sql
CREATE INDEX CONCURRENTLY idx_bookings_user_created 
ON bookings (user_id, created_at DESC)
WHERE status != 'DRAFT';

-- 결제 승인 후 공급사 확정 대기 조회
CREATE INDEX CONCURRENTLY idx_bookings_pending_confirm
ON bookings (status, inventory_lock_expires_at)
WHERE status = 'PAYMENT_PENDING';
```

---

## 3. 대용량 파티셔닝 전략 (Table Partitioning)

### 3.1 `bookings` 및 `payments` 월별 범위 파티셔닝 (Range Partitioning)
연간 수천만 건 이상 누적되는 거래 내역의 빠른 범위 조회와 보관 주기(TTL) 관리를 위해 `created_at` 기준 월별 범위 파티셔닝을 적용합니다.

```sql
CREATE TABLE bookings (
    id UUID NOT NULL,
    booking_code VARCHAR(32) NOT NULL,
    user_id UUID,
    created_at TIMESTAMPTZ NOT NULL,
    ...
) PARTITION BY RANGE (created_at);

-- 2026년 파티션 테이블 예시
CREATE TABLE bookings_2026_11 PARTITION OF bookings
    FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');
```

---

## 4. 고성능 쿼리 실행 계획 (EXPLAIN ANALYZE) 튜닝 가이드

### 4.1 호텔 목록 검색 쿼리 튜닝
- **문제점**: 수만 개 호텔 테이블과 수십만 개 일자별 객실 가격 테이블을 단순 `LEFT JOIN`할 경우 N+1 또는 해시 조인 메모리 초과 발생.
- **해결책**: 서브쿼리 CTE(Common Table Expression)를 통해 목적 도시의 호텔 ID 상위 50개를 먼저 페이징 인덱스로 추출한 후, 해당 50개 호텔에 대해서만 일자별 최저가를 조인.

```sql
EXPLAIN ANALYZE
WITH target_hotels AS (
    SELECT id, name_ko, star_rating, review_score
    FROM hotels
    WHERE city_code = 'TOKYO' AND status = 'ONLINE'
    ORDER BY review_score DESC
    LIMIT 20 OFFSET 0
)
SELECT h.*, MIN(r.base_price_krw) AS min_price
FROM target_hotels h
JOIN hotel_rooms hr ON hr.hotel_id = h.id
JOIN room_rates r ON r.room_id = hr.id AND r.stay_date = '2026-11-01'
JOIN room_inventories inv ON inv.room_id = hr.id AND inv.stay_date = '2026-11-01'
WHERE inv.available_inventory > 0
GROUP BY h.id, h.name_ko, h.star_rating, h.review_score;
```

---

## 5. 읽기 전용 복제본(Read Replicas) 분기 및 캐싱 레이어

1. **CQRS 분리**:
   - 상품 탐색, 검색, 필터링, 정적 데이터 조회: Cloud SQL 읽기 전용 복제본(Read Replica) 및 Cloudflare KV / Redis 캐시 레이어에서 처리.
   - 예약 생성, 결제 승인, 재고 차감: 오직 프라이머리(Primary) 인스턴스에서 엄격한 트랜잭션 격리수준(`READ COMMITTED` / `REPEATABLE READ`)으로 처리.
2. **복제 지연(Replication Lag) 방지책**:
   - 예약 완료 직후 "마이페이지 즉시 이동" 시점에는 세션에 `just_booked=true` 플래그를 설정하여 3초간 Primary DB를 직접 조회하도록 라우팅.
