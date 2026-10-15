-- =========================================================================
-- getforTrip Global OTA: Comprehensive Mock Seed Data across 7 Domains
-- Migration 000007: Realistic Seed Data for Hotels, Flights, Trains, Cars, Transfers, Activities, Packages
-- =========================================================================

-- 1. Hotels Seed
INSERT INTO hotel_properties (
  id, name_ko, name_en, property_type, star_rating, city, country,
  address_ko, address_en, latitude, longitude, neighborhood, subway_station,
  subway_distance_mins, review_score, review_count, badge, thumbnail_url,
  gallery_images, amenities, free_cancellation, free_breakfast, instant_confirmation,
  base_price_krw, discount_rate
) VALUES 
(
  'htl_tokyo_01', '그랜드 하얏트 도쿄 롯폰기 힐스', 'Grand Hyatt Tokyo Roppongi Hills',
  'HOTEL', 5, '도쿄', '일본',
  '도쿄도 미나토구 롯폰기 6-10-3', '6-10-3 Roppongi, Minato-ku, Tokyo',
  35.6599, 139.7292, '롯폰기 힐스 쇼핑가', '롯폰기역 (히비야선/오에도선)',
  3, 4.9, 2180, '럭셔리 랜드마크',
  'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800',
  '["https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800", "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800", "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800"]'::jsonb,
  '["실내 수영장", "무료 고속 Wi-Fi", "피트니스 센터", "스파 & 사우나", "프리미엄 조식 뷔페", "24시간 룸서비스", "발레파킹"]'::jsonb,
  TRUE, TRUE, TRUE, 385000, 15
),
(
  'htl_seoul_01', '시그니엘 서울 롯데월드타워', 'Signiel Seoul Lotte World Tower',
  'HOTEL', 5, '서울', '대한민국',
  '서울특별시 송파구 올림픽로 300 롯데월드타워 76-101층', '300 Olympic-ro, Songpa-gu, Seoul',
  37.5126, 127.1025, '잠실 롯데월드몰', '잠실역 (2호선/8호선)',
  1, 4.9, 3450, '최고 평점 5성급',
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
  '["https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800", "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800"]'::jsonb,
  '["초고층 전망", "인피니티 풀", "에비앙 스파", "미쉐린 스타 다이닝", "무료 발레파킹"]'::jsonb,
  TRUE, TRUE, TRUE, 550000, 10
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO hotel_room_options (
  id, hotel_id, room_name_ko, room_name_en, bed_type, max_occupancy, room_size_sqm,
  window_view, price_per_night_krw, breakfast_included, free_cancellation, available_inventory, room_photos
) VALUES
(
  'rm_tokyo_dlx', 'htl_tokyo_01', '디럭스 킹 룸 (시티뷰)', 'Deluxe King Room (City View)',
  '킹베드 1개 (King Bed)', 2, 42, 'CITY_VIEW', 385000, TRUE, TRUE, 4,
  '["https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800"]'::jsonb
),
(
  'rm_tokyo_ste', 'htl_tokyo_01', '그랜드 클럽 이그제큐티브 스위트', 'Grand Club Executive Suite',
  '슈퍼킹베드 1개', 3, 75, 'CITY_VIEW', 680000, TRUE, TRUE, 2,
  '["https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- 2. Flights Seed
INSERT INTO flight_schedules (
  id, airline_code, airline_name_ko, airline_name_en, flight_number, aircraft_type,
  departure_airport, arrival_airport, departure_terminal, arrival_terminal,
  departure_time, arrival_time, duration_minutes, stops, layover_airport, layover_duration_mins,
  departure_time_slot, cabin_class, free_checked_baggage_kg, free_cabin_baggage_kg,
  seat_pitch_inch, base_fare_krw, tax_fuel_krw, available_seats, refund_penalty_krw, mileage_accrual_pct
) VALUES
(
  'flt_ke703', 'KE', '대한항공', 'Korean Air', 'KE703', 'Airbus A330-300',
  'ICN', 'NRT', 'T2', 'T1',
  '2026-11-01 10:10:00+09', '2026-11-01 12:35:00+09', 145, 0, NULL, 0,
  'MORNING', 'ECONOMY', 23, 10, 32, 245000, 48000, 7, 30000, 100
),
(
  'flt_oz102', 'OZ', '아시아나항공', 'Asiana Airlines', 'OZ102', 'Airbus A350-900',
  'ICN', 'NRT', 'T1', 'T1',
  '2026-11-01 09:00:00+09', '2026-11-01 11:20:00+09', 140, 0, NULL, 0,
  'MORNING', 'ECONOMY', 23, 10, 33, 238000, 48000, 5, 30000, 100
)
ON CONFLICT (id) DO NOTHING;

-- 3. Trains Seed
INSERT INTO train_journeys (
  id, rail_network, train_type, train_number, departure_station, arrival_station,
  departure_time, arrival_time, duration_minutes, seat_class, base_price_krw, first_class_price_krw,
  power_outlet, free_wifi, luggage_policy, available_seats, stops_schedule
) VALUES
(
  'trn_ktx_01', 'KTX_SRT', 'KTX-산천', 'KTX 021', '서울역 (Seoul)', '부산역 (Busan)',
  '2026-11-01 08:30:00+09', '2026-11-01 11:05:00+09', 155, 'STANDARD', 59800, 83700,
  TRUE, TRUE, '28인치 수하물 2개 무료 적재', 42,
  '[{"station": "서울역", "time": "08:30"}, {"station": "대전역", "time": "09:25"}, {"station": "동대구역", "time": "10:10"}, {"station": "부산역", "time": "11:05"}]'::jsonb
),
(
  'trn_shinkansen_01', 'SHINKANSEN', '신칸센 노조미 N700S', 'NOZOMI 23', '도쿄역 (Tokyo)', '신오사카역 (Shin-Osaka)',
  '2026-11-01 09:00:00+09', '2026-11-01 11:30:00+09', 150, 'STANDARD', 145000, 210000,
  TRUE, TRUE, '대형 수하물 사전 예약 석 제공', 18,
  '[{"station": "도쿄역", "time": "09:00"}, {"station": "나고야역", "time": "10:35"}, {"station": "교토역", "time": "11:15"}, {"station": "신오사카역", "time": "11:30"}]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- 4. Cars Seed
INSERT INTO car_rental_catalog (
  id, company_name, vehicle_model, vehicle_category, seats, luggage_large, luggage_small,
  transmission, fuel_type, pickup_city, pickup_location_name, pickup_type,
  daily_price_krw, insurance_super_cdw, unlimited_mileage, free_cancellation_hours, min_driver_age, image_url
) VALUES
(
  'car_avante_01', '롯데렌터카 (Lotte Rent-a-Car)', '현대 더 뉴 아반떼 (2025/2026)', 'SEDAN', 5, 2, 2,
  'AUTO', 'GASOLINE', '제주', '제주국제공항 렌터카하우스 셔틀 탑승장 1구역', 'AIRPORT_SHUTTLE',
  48000, TRUE, TRUE, 48, 21,
  'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800'
),
(
  'car_yaris_01', 'Times Car Rental Japan', 'Toyota Yaris Hybrid', 'COMPACT', 5, 2, 1,
  'AUTO', 'HYBRID', '도쿄', '도쿄 나리타 국제공항 제1터미널 카운터', 'IN_TERMINAL',
  62000, TRUE, TRUE, 48, 21,
  'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800'
)
ON CONFLICT (id) DO NOTHING;

-- 5. Transfers Seed
INSERT INTO airport_transfer_catalog (
  id, airport_code, airport_name, destination_zone, service_type, vehicle_tier,
  vehicle_model_example, max_passengers, max_luggage, price_krw, free_waiting_mins,
  flight_tracking, meet_and_greet, free_cancellation_hours, image_url
) VALUES
(
  'tf_icn_van_01', 'ICN', '인천국제공항 T1/T2', '서울 도심 (중구/명동/강남) 전역', 'PRIVATE_TRANSFER', 'BUSINESS_VAN',
  '현대 스타리아 라운지 리무진 / 카니발 하이리무진', 6, 6, 120000, 60,
  TRUE, TRUE, 24,
  'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800'
),
(
  'tf_nrt_sedan_01', 'NRT', '도쿄 나리타공항 T1/T2/T3', '도쿄 23구 (신주쿠/시부야/긴자) 전역', 'PRIVATE_TRANSFER', 'COMFORT_SEDAN',
  '도요타 크라운 / 프리우스 알파 프리미엄 세단', 4, 3, 185000, 60,
  TRUE, TRUE, 24,
  'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800'
)
ON CONFLICT (id) DO NOTHING;

-- 6. Activities Seed
INSERT INTO activity_catalog (
  id, title_ko, title_en, city, country, main_category, duration_text,
  guide_language, instant_confirmation, free_cancellation, voucher_type,
  rating, review_count, hero_image_url, highlights, inclusions, exclusions,
  meeting_point, price_krw, package_options
) VALUES
(
  'act_disney_tokyo', '도쿄 디즈니랜드 1일 e-티켓 (즉시 확정 / 모바일 QR 바로 입장)', 'Tokyo Disneyland 1-Day Passport e-Ticket',
  '도쿄', '일본', 'THEME_PARK', '자유 이용',
  'KOREAN', TRUE, TRUE, 'MOBILE_QR',
  4.9, 8740,
  'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800',
  '["현장 티켓부스 대기 없는 모바일 QR 즉시 입장", "어트랙션 및 퍼레이드 자유 이용", "디즈니 프리미어 액세스(DPA) 연동 가능"]'::jsonb,
  '["도쿄 디즈니랜드 1일 자유 이용권", "어트랙션 및 정기 공연 관람"]'::jsonb,
  '["식음료 및 개인 소비", "도쿄 디즈니씨 입장(별도 티켓)"]'::jsonb,
  'JR 마이하마역 직결 디즈니랜드 정문 메인 게이트',
  89000,
  '[{"id": "pkg_adult", "name": "성인 (만 18세 이상)", "price_krw": 89000}, {"id": "pkg_teen", "name": "청소년 (만 12~17세)", "price_krw": 74000}, {"id": "pkg_child", "name": "아동 (만 4~11세)", "price_krw": 53000}]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- 7. Dynamic Packages Seed
INSERT INTO dynamic_package_bundles (
  id, title_ko, city, country, duration_nights, duration_days,
  flight_id, hotel_id, original_combined_price_krw, bundle_price_krw,
  savings_percentage, badge, hero_image_url, package_features
) VALUES
(
  'pkg_tokyo_4d3n', '[항공+호텔 결합] 도쿄 롯폰기 하얏트 럭셔리 에어텔 4일 (대한항공 직항 왕복 + 5성급 3박)',
  '도쿄', '일본', 3, 4,
  'flt_ke703', 'htl_tokyo_01',
  1400000, 1150000, 18, '베스트셀러 에어텔',
  'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800',
  '["대한항공 직항 왕복 (위탁수하물 23kg 무료)", "그랜드 하얏트 도쿄 롯폰기 3박 (조식 포함)", "공항 왕복 리무진 버스 할인 쿠폰 제공", "24시간 안심 케어 서비스"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

