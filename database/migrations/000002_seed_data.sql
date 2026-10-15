-- ==============================================================================
-- ✈️ getfortrip Full-Scale Production Platform - Migration 000002 (SEED DATA)
-- Zero-Mock Realistic Global Travel Catalog & User Data
-- ==============================================================================

-- 1. 환율 마스터 데이터
INSERT INTO exchange_rates (currency, rate_to_krw, symbol) VALUES
('KRW', 1.0000, '₩'),
('USD', 1350.0000, '$'),
('JPY', 9.1000, '¥'),
('EUR', 1470.0000, '€'),
('CNY', 188.0000, '¥'),
('GBP', 1720.0000, '£')
ON CONFLICT (currency) DO UPDATE SET rate_to_krw = EXCLUDED.rate_to_krw;

-- 2. 사용자 & 상용 여행자 & getfortrip 코인
INSERT INTO users (id, email, password_hash, full_name, phone_number, preferred_currency, preferred_language, tier, trip_coins, avatar_url) VALUES
('a0000000-0000-0000-0000-000000000001', 'vip@getfortrip.com', '$2a$10$wN8WJmZt/ZJ8oK5rQ4a0EuK5G2.L0dZzI1M4Nqf7.7n4QxY6uE8y6', '김여행 (VIP 다이아몬드)', '+82-10-1234-5678', 'KRW', 'ko', 'DIAMOND', 28500, 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'),
('a0000000-0000-0000-0000-000000000002', 'traveler@getfortrip.com', '$2a$10$wN8WJmZt/ZJ8oK5rQ4a0EuK5G2.L0dZzI1M4Nqf7.7n4QxY6uE8y6', '박세계', '+82-10-9876-5432', 'KRW', 'ko', 'PLATINUM', 8400, 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200'),
('a0000000-0000-0000-0000-000000000003', 'globetrotter@getfortrip.com', '$2a$10$wN8WJmZt/ZJ8oK5rQ4a0EuK5G2.L0dZzI1M4Nqf7.7n4QxY6uE8y6', '이지구', '+82-10-5555-7777', 'USD', 'en', 'GOLD', 2100, 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200')
ON CONFLICT (id) DO NOTHING;

INSERT INTO saved_travelers (id, user_id, last_name_en, first_name_en, birth_date, gender, passport_number, passport_expiry, nationality) VALUES
('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'KIM', 'TRAVEL', '1990-05-15', 'M', 'M12345678', '2032-12-31', 'KOR'),
('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'LEE', 'MINA', '1993-08-20', 'F', 'M87654321', '2033-06-30', 'KOR')
ON CONFLICT (id) DO NOTHING;

INSERT INTO trip_coin_ledgers (id, user_id, amount, balance_after, reason) VALUES
('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 5000, 28500, '도쿄 그랜드 하얏트 숙박 리뷰 작성 보너스')
ON CONFLICT (id) DO NOTHING;

-- 3. 관리자 계정
INSERT INTO admin_users (id, username, password_hash, full_name, role) VALUES
('b0000000-0000-0000-0000-000000000001', 'admin_super', '$2a$10$wN8WJmZt/ZJ8oK5rQ4a0EuK5G2.L0dZzI1M4Nqf7.7n4QxY6uE8y6', '총괄 운영 관리자', 'SUPER_ADMIN'),
('b0000000-0000-0000-0000-000000000002', 'admin_oms', '$2a$10$wN8WJmZt/ZJ8oK5rQ4a0EuK5G2.L0dZzI1M4Nqf7.7n4QxY6uE8y6', '발권/정산 담당관', 'OMS_OPERATOR')
ON CONFLICT (id) DO NOTHING;

-- 4. 호텔 마스터 및 객실 (서울, 도쿄, 오사카, 방콕, 파리, 다낭)
INSERT INTO hotels (id, name_ko, name_en, city, country, address, latitude, longitude, star_rating, review_score, review_count, thumbnail_url, images, amenities, tags) VALUES
('c0000000-0000-0000-0000-000000000001', '시그니엘 서울', 'SIGNIEL SEOUL', '서울', '대한민국', '서울특별시 송파구 올림픽로 300 롯데월드타워 76-101층', 37.5125, 127.1025, 5, 4.9, 1540, 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800', '["https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800", "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800"]', '["WIFI", "POOL", "GYM", "BREAKFAST", "SPA", "VALET"]', '["getfortrip Best 2026", "초고층 시티뷰", "럭셔리 호캉스"]'),
('c0000000-0000-0000-0000-000000000002', '도쿄 그랜드 하얏트', 'Grand Hyatt Tokyo', '도쿄', '일본', '6-10-3 Roppongi, Minato-ku, Tokyo', 35.6596, 139.7289, 5, 4.8, 1120, 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800', '["https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800"]', '["WIFI", "POOL", "BREAKFAST", "METRO_ACCESS"]', '["롯폰기 힐즈 직결", "미슐랭 다이닝"]'),
('c0000000-0000-0000-0000-000000000003', '스위소텔 난카이 오사카', 'Swissotel Nankai Osaka', '오사카', '일본', '5-1-60 Namba, Chuo-ku, Osaka', 34.6644, 135.5015, 5, 4.7, 2400, 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800', '["https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800"]', '["WIFI", "METRO_DIRECT", "BREAKFAST", "SPA"]', '["난바역 바로 위", "도톤보리 도보 5분"]'),
('c0000000-0000-0000-0000-000000000004', '방콕 샹그릴라 호텔', 'Shangri-La Bangkok', '방콕', '태국', '89 Soi Wat Suan Phlu, Bang Rak, Bangkok', 13.7212, 100.5143, 5, 4.7, 2800, 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800', '["https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800"]', '["WIFI", "RIVER_VIEW", "POOL", "BREAKFAST"]', '["차오프라야 리버뷰", "BTS 사판탁신역"]'),
('c0000000-0000-0000-0000-000000000005', '파리 풀만 에펠탑', 'Pullman Paris Tour Eiffel', '파리', '프랑스', '18 Avenue De Suffren, 75015 Paris', 48.8553, 2.2934, 4, 4.6, 3100, 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800', '["https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800"]', '["WIFI", "EIFFEL_VIEW", "RESTAURANT", "GYM"]', '["에펠탑 발코니 뷰", "파리 랜드마크"]'),
('c0000000-0000-0000-0000-000000000006', '다낭 인터컨티넨탈 선 페닌슐라 리조트', 'InterContinental Danang Sun Peninsula Resort', '다낭', '베트남', 'Bai Bac, Son Tra Peninsula, Danang', 16.1215, 108.3072, 5, 4.9, 1890, 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800', '["https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800"]', '["PRIVATE_BEACH", "INFINITY_POOL", "SPA", "BREAKFAST"]', '["빌 벤슬리 디자인", "전용 프라이빗 비치"]')
ON CONFLICT (id) DO NOTHING;

-- 객실 시드
INSERT INTO hotel_rooms (id, hotel_id, name, bed_type, max_guests, room_size_sqm, base_price_krw, is_free_cancellation, includes_breakfast, available_stock) VALUES
('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '프리미어 더블룸 (파노라믹 리버뷰)', '킹 베드 1개', 2, 53.0, 580000, true, false, 8),
('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', '디럭스 스위트 (살롱 드 시그니엘 라운지 & 조식 2인)', '슈퍼 킹 베드 1개', 3, 88.0, 950000, true, true, 3),
('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', '그랜드 킹 룸 (도쿄 타워 뷰)', '킹 베드 1개', 2, 42.0, 490000, true, false, 10),
('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', '클럽 디럭스 트윈 (조식 & 이브닝 칵테일)', '싱글 베드 2개', 2, 45.0, 680000, false, true, 5),
('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000003', '어드밴티지 퀸 룸 (고층 시티뷰)', '퀸 베드 1개', 2, 32.0, 260000, true, true, 12),
('d0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000004', '디럭스 발코니 리버뷰 룸', '킹 베드 1개', 2, 48.0, 290000, true, true, 15),
('d0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000005', '클래식 에펠탑 뷰 룸 (발코니 포함)', '더블 베드 1개', 2, 26.0, 480000, true, false, 6),
('d0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000006', '클래식 오션뷰 테라스 킹 스위트', '킹 베드 1개', 2, 70.0, 690000, true, true, 4)
ON CONFLICT (id) DO NOTHING;

-- 5. 항공편 마스터
INSERT INTO flights (id, flight_number, airline_name, airline_code, departure_airport, arrival_airport, departure_city, arrival_city, departure_time, arrival_time, duration_minutes, cabin_class, base_price_krw, free_baggage_kg, available_seats) VALUES
('e0000000-0000-0000-0000-000000000001', 'KE703', '대한항공', 'KE', 'ICN', 'NRT', '서울/인천', '도쿄/나리타', '2026-11-01 10:10:00+09', '2026-11-01 12:35:00+09', 145, 'ECONOMY', 345000, 23, 45),
('e0000000-0000-0000-0000-000000000002', 'OZ102', '아시아나항공', 'OZ', 'ICN', 'NRT', '서울/인천', '도쿄/나리타', '2026-11-01 09:00:00+09', '2026-11-01 11:20:00+09', 140, 'ECONOMY', 330000, 23, 28),
('e0000000-0000-0000-0000-000000000003', '7C1304', '제주항공', '7C', 'ICN', 'KIX', '서울/인천', '오사카/간사이', '2026-11-01 07:30:00+09', '2026-11-01 09:15:00+09', 105, 'ECONOMY', 195000, 15, 60),
('e0000000-0000-0000-0000-000000000004', 'TG659', '타이항공', 'TG', 'ICN', 'BKK', '서울/인천', '방콕/수완나품', '2026-11-05 09:35:00+09', '2026-11-05 13:30:00+07', 355, 'ECONOMY', 489000, 20, 52),
('e0000000-0000-0000-0000-000000000005', 'AF267', '에어프랑스', 'AF', 'ICN', 'CDG', '서울/인천', '파리/샤를드골', '2026-11-10 10:30:00+09', '2026-11-10 18:05:00+01', 875, 'ECONOMY', 1180000, 23, 35),
('e0000000-0000-0000-0000-000000000006', 'KE704', '대한항공 (비즈니스)', 'KE', 'NRT', 'ICN', '도쿄/나리타', '서울/인천', '2026-11-04 14:00:00+09', '2026-11-04 16:45:00+09', 165, 'BUSINESS', 890000, 32, 12)
ON CONFLICT (id) DO NOTHING;

-- 6. 기차표 마스터
INSERT INTO trains (id, train_number, train_type, departure_station, arrival_station, departure_time, arrival_time, duration_minutes, seat_class, price_krw, available_seats) VALUES
('f0000000-0000-0000-0000-000000000001', 'KTX 021', 'KTX', '서울역', '부산역', '2026-11-01 08:00:00+09', '2026-11-01 10:35:00+09', 155, '일반실', 59800, 110),
('f0000000-0000-0000-0000-000000000002', 'KTX 021 (특실)', 'KTX', '서울역', '부산역', '2026-11-01 08:00:00+09', '2026-11-01 10:35:00+09', 155, '특실', 83700, 24),
('f0000000-0000-0000-0000-000000000003', 'NOZOMI 23', 'SHINKANSEN', '도쿄역', '신오사카역', '2026-11-02 09:00:00+09', '2026-11-02 11:30:00+09', 150, '지정석', 138000, 140),
('f0000000-0000-0000-0000-000000000004', 'EUROSTAR 9014', 'EUROSTAR', '런던 세인트 판크라스', '파리 북역', '2026-11-08 09:31:00+00', '2026-11-08 12:47:00+01', 136, 'STANDARD', 156000, 68)
ON CONFLICT (id) DO NOTHING;

-- 7. 렌터카 & 공항픽업
INSERT INTO car_rentals (id, company_name, vehicle_model, vehicle_type, seats, transmission, daily_price_krw, pickup_location, insurance_included, image_url) VALUES
('70000000-0000-0000-0000-000000000001', '롯데렌터카 제주', '현대 디 올 뉴 그랜저 (2025)', 'SEDAN', 5, 'AUTO', 85000, '제주국제공항 렌터카하우스 셔틀 승차장', true, 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800'),
('70000000-0000-0000-0000-000000000002', 'Nippon Rent-A-Car Tokyo', '토요타 야리스 크로스 하이브리드', 'SUV', 5, 'AUTO', 98000, '도쿄 나리타 공항 제1터미널 카운터', true, 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800'),
('70000000-0000-0000-0000-000000000003', 'Avis Paris CDG', '푸조 3008 GT Line', 'SUV', 5, 'AUTO', 145000, '파리 샤를 드골 공항 터미널 2E', true, 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800')
ON CONFLICT (id) DO NOTHING;

INSERT INTO airport_transfers (id, service_title, airport_code, destination_area, vehicle_class, max_passengers, max_luggage, price_krw, image_url) VALUES
('71000000-0000-0000-0000-000000000001', '인천공항 T1/T2 -> 서울 시내 프라이빗 대형 밴 (카니발 하이리무진)', 'ICN', '서울 전 지역', 'LUXURY_VAN_7', 7, 6, 120000, 'https://images.unsplash.com/photo-1559297434-fae8a1916a79?w=800'),
('71000000-0000-0000-0000-000000000002', '도쿄 하네다 공항 -> 신주쿠/시부야 호텔 전용 송영 차량', 'HND', '도쿄 23구', 'COMFORT_SEDAN_4', 3, 3, 98000, 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800'),
('71000000-0000-0000-0000-000000000003', '방콕 수완나품 공항 -> 시내 호텔 프라이빗 픽업 서비스 (기사 피켓 미팅)', 'BKK', '방콕 중심가', 'COMFORT_SEDAN_4', 3, 3, 38000, 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800')
ON CONFLICT (id) DO NOTHING;

-- 8. 투어 & 티켓 / 액티비티 / eSIM
INSERT INTO activities (id, title, category, city, country, price_krw, review_score, review_count, thumbnail_url, description) VALUES
('80000000-0000-0000-0000-000000000001', '도쿄 디즈니랜드 / 디즈니씨 1일 전자 여권 (QR코드 직입장)', 'TICKET', '도쿄', '일본', 89000, 4.9, 8740, 'https://images.unsplash.com/photo-1546707012-c46675f12716?w=800', '현장 티켓 교환 없이 스마트폰 QR코드로 직입장 가능한 도쿄 디즈니 공식 1일 여권입니다.'),
('80000000-0000-0000-0000-000000000002', '유니버설 스튜디오 재팬 (USJ) 1일 스튜디오 패스 + 슈퍼 닌텐도 월드 확약권', 'TICKET', '오사카', '일본', 94000, 4.9, 12300, 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=800', '슈퍼 닌텐도 월드 및 위저딩 월드 오브 해리포터를 즐길 수 있는 오사카 필수 방문 패스.'),
('80000000-0000-0000-0000-000000000003', '일본 무제한 5G 매일 2GB+이후 저속무제한 로밍 eSIM (3일~10일)', 'ESIM', '도쿄', '일본', 6500, 4.8, 15400, 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800', '유심 교체 없이 이메일로 받은 QR코드 스캔 즉시 개통되는 고속 Docomo/SoftBank 5G eSIM.'),
('80000000-0000-0000-0000-000000000004', '방콕 차오프라야 프린세스 디너 크루즈 (라이브 공연 & 인터내셔널 뷔페)', 'TOUR', '방콕', '태국', 39000, 4.7, 3420, 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800', '왓 아룬과 왕궁의 야경을 감상하며 낭만적인 뷔페와 색소폰 라이브 공연을 즐기는 크루즈.'),
('80000000-0000-0000-0000-000000000005', '파리 루브르 박물관 우선 입장권 (시간 지정 티켓)', 'TICKET', '파리', '프랑스', 32000, 4.8, 6200, 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800', '모나리자와 밀로의 비너스를 대기 없이 빠르게 만날 수 있는 루브르 공식 우선 입장권.')
ON CONFLICT (id) DO NOTHING;

-- 9. 항공+호텔 다이내믹 패키지
INSERT INTO packages (id, title, destination_city, hotel_id, flight_id, package_discount_rate, total_original_krw, total_package_krw, thumbnail_url) VALUES
('90000000-0000-0000-0000-000000000001', '도쿄 3박 4일 특가 패키지 (대한항공 왕복 + 그랜드 하얏트 3박)', '도쿄', 'c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 15.00, 1815000, 1542750, 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800'),
('90000000-0000-0000-0000-000000000002', '방콕 4박 5일 힐링 패키지 (타이항공 왕복 + 샹그릴라 리버뷰 4박)', '방콕', 'c0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000004', 18.00, 1649000, 1352180, 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800')
ON CONFLICT (id) DO NOTHING;

-- 10. 프로모션 & 쿠폰
INSERT INTO promotions (id, code, title, discount_type, discount_value, min_order_amount_krw, max_discount_krw, valid_from, valid_until) VALUES
('20000000-0000-0000-0000-000000000001', 'WELCOME2026', '신규 회원 첫 예약 10% 웰컴 할인', 'PERCENTAGE', 10.00, 50000, 30000, '2026-01-01 00:00:00+09', '2026-12-31 23:59:59+09'),
('20000000-0000-0000-0000-000000000002', 'HOTEL50000', '전 세계 호텔 50,000원 즉시할인 쿠폰', 'FIXED_AMOUNT', 50000.00, 300000, 50000, '2026-01-01 00:00:00+09', '2026-12-31 23:59:59+09'),
('20000000-0000-0000-0000-000000000003', 'MEGAFLIGHT', '국제선 항공권 7% 메가세일 쿠폰', 'PERCENTAGE', 7.00, 200000, 70000, '2026-01-01 00:00:00+09', '2026-12-31 23:59:59+09')
ON CONFLICT (id) DO NOTHING;

-- 11. 실제 예약 내역 (OMS 테스트용 다양한 상태: CONFIRMED, ISSUE_FAILED, CANCEL_REQUESTED)
INSERT INTO bookings (id, booking_code, user_id, domain_type, status, base_amount_krw, tax_amount_krw, service_fee_krw, discount_amount_krw, trip_coins_used, final_amount_krw, paid_currency, paid_currency_amount, primary_contact_name, primary_contact_email, primary_contact_phone, traveler_details, confirmation_number, voucher_url) VALUES
('30000000-0000-0000-0000-000000000001', 'GFT-20261101-7781', 'a0000000-0000-0000-0000-000000000001', 'HOTEL', 'CONFIRMED', 580000, 58000, 17400, 50000, 500, 600400, 'KRW', 600400, '김여행', 'vip@getfortrip.com', '+82-10-1234-5678', '[{"name": "KIM TRAVEL", "passport": "M12345678"}]', 'VOUCH-SG-88219', 'https://voucher.getfortrip.com/v/GFT-20261101-7781'),
('30000000-0000-0000-0000-000000000002', 'GFT-20261102-1209', 'a0000000-0000-0000-0000-000000000002', 'FLIGHT', 'CONFIRMED', 345000, 34500, 10350, 24150, 0, 365700, 'KRW', 365700, '박세계', 'traveler@getfortrip.com', '+82-10-9876-5432', '[{"name": "PARK SEGYE", "passport": "M9928172"}]', 'PNR-KE-79482X', 'https://voucher.getfortrip.com/v/GFT-20261102-1209'),
('30000000-0000-0000-0000-000000000003', 'GFT-20261103-9941', 'a0000000-0000-0000-0000-000000000003', 'FLIGHT', 'ISSUE_FAILED', 489000, 48900, 14670, 0, 0, 552570, 'USD', 409.31, '이지구', 'globetrotter@getfortrip.com', '+82-10-5555-7777', '[{"name": "LEE EARTH", "passport": "US991823"}]', NULL, NULL),
('30000000-0000-0000-0000-000000000004', 'GFT-20261104-5512', 'a0000000-0000-0000-0000-000000000001', 'ACTIVITY', 'CONFIRMED', 89000, 8900, 2670, 0, 0, 100570, 'KRW', 100570, '김여행', 'vip@getfortrip.com', '+82-10-1234-5678', '[{"name": "KIM TRAVEL"}]', 'QR-TICKET-DISNEY-8891', 'https://voucher.getfortrip.com/v/GFT-20261104-5512')
ON CONFLICT (id) DO NOTHING;

INSERT INTO booking_items (id, booking_id, item_reference_id, item_name, quantity, start_date, end_date) VALUES
('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '시그니엘 서울 - 프리미어 더블룸 (파노라믹 리버뷰)', 1, '2026-11-01 15:00:00+09', '2026-11-03 11:00:00+09'),
('31000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', '대한항공 KE703 (서울/인천 -> 도쿄/나리타)', 1, '2026-11-01 10:10:00+09', '2026-11-01 12:35:00+09')
ON CONFLICT (id) DO NOTHING;

-- 12. getfortrip 모먼트 & 리뷰
INSERT INTO trip_moments (id, user_id, city, title, content, photos, linked_product_type, linked_product_id, likes_count, is_featured) VALUES
('40000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '서울', '시그니엘 서울 85층 한강 일몰 뷰는 정말 환상적입니다!', '기념일을 맞아 다녀온 시그니엘 서울! 살롱 드 시그니엘 라운지에서 즐기는 샴페인과 롯데월드타워 초고층에서 내려다보는 서울의 일몰과 야경은 잊을 수 없네요. getfortrip 특가 쿠폰으로 조식까지 알차게 다녀왔어요.', '["https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800", "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800"]', 'HOTEL', 'c0000000-0000-0000-0000-000000000001', 342, true),
('40000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', '도쿄', '도쿄 디즈니랜드 오픈런 꿀팁 및 미녀와 야수 후기!', 'getfortrip에서 전자 티켓 구매하고 QR코드로 기다림 없이 0초 만에 통과했습니다. DPA 구매 팁과 인기 어트랙션 순서 공유합니다. 5G eSIM도 도쿄 전역에서 끊김 없이 빵빵 터져서 편리했어요!', '["https://images.unsplash.com/photo-1546707012-c46675f12716?w=800"]', 'ACTIVITY', '80000000-0000-0000-0000-000000000001', 520, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO reviews (id, user_id, domain_type, target_id, rating, content) VALUES
('50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'HOTEL', 'c0000000-0000-0000-0000-000000000001', 5.0, '직원분들의 서비스 태도와 룸 컨디션이 최고였습니다. 침구가 너무 편안해서 꿀잠 잤어요.'),
('50000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'FLIGHT', 'e0000000-0000-0000-0000-000000000001', 4.8, '정시 출발, 정시 도착! 기내식도 맛있었고 수하물도 빠르게 나왔습니다.')
ON CONFLICT (id) DO NOTHING;

-- 13. 공지사항 및 CS 티켓
INSERT INTO notices (id, title, content, is_emergency, banner_active) VALUES
('60000000-0000-0000-0000-000000000001', '[안내] 2026 getfortrip 글로벌 메가세일 시즌 오픈', '전 세계 호텔 최대 50% 할인 및 항공권 즉시할인 쿠폰이 지급됩니다.', false, true),
('60000000-0000-0000-0000-000000000002', '[긴급] 동남아 태풍 기상악화에 따른 일부 항공편 결항 수수료 면제 안내', '해당 항공편 탑승 고객님께서는 고객센터 또는 셀프서비스를 통해 위약금 없이 100% 무료 환불 및 일정 변경이 가능합니다.', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO cs_tickets (id, user_id, booking_id, subject, category, status, messages) VALUES
('61000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '항공권 발권 지연에 따른 처리 문의', 'BOOKING_ISSUE', 'OPEN', '[{"sender": "USER", "message": "결제는 완료되었는데 아직 E-Ticket이 안 나왔습니다. 확인 부탁드립니다.", "time": "2026-10-14 18:00:00"}]')
ON CONFLICT (id) DO NOTHING;

