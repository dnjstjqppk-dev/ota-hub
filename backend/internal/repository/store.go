package repository

import (
	"fmt"
	"getfortrip/backend/internal/domain"
	"getfortrip/backend/internal/engine"
	"strings"
	"sync"
	"time"
)

type Store struct {
	mu                sync.RWMutex
	Users             map[string]domain.User
	Travelers         map[string][]domain.SavedTraveler
	ExchangeRate      map[domain.Currency]domain.ExchangeRate
	Hotels            map[string]domain.Hotel
	HotelRooms        map[string]domain.HotelRoom
	Flights           map[string]domain.Flight
	Trains            map[string]domain.Train
	Cars              map[string]domain.CarRental
	Transfers         map[string]domain.AirportTransfer
	Activities        map[string]domain.Activity
	Packages          map[string]domain.DynamicPackage
	Promotions        map[string]domain.Promotion
	Bookings          map[string]domain.Booking
	TripMoments       map[string]domain.TripMoment
	Reviews           map[string][]domain.Review
	AuditLogs         []domain.AdminAuditLog
	Notices           []domain.Notice
	CSTickets         map[string]domain.CSTicket
	FilterDefinitions map[string][]domain.DomainFilterDefinition

	// Curation & Multi-Platform Webhook Ingestion Store
	UniversalProducts  map[string]*domain.UniversalProduct
	CuratedContents    map[string]*domain.CuratedContent
	AffiliateReferrals map[string]*domain.AffiliateReferral
	RawScrapes         map[string]domain.IngestRawRequest
	WebhookLogs        []domain.TravelCheckinWebhookLog
}

func NewStore() *Store {
	s := &Store{
		Users:              make(map[string]domain.User),
		Travelers:          make(map[string][]domain.SavedTraveler),
		ExchangeRate:       make(map[domain.Currency]domain.ExchangeRate),
		Hotels:             make(map[string]domain.Hotel),
		HotelRooms:         make(map[string]domain.HotelRoom),
		Flights:            make(map[string]domain.Flight),
		Trains:             make(map[string]domain.Train),
		Cars:               make(map[string]domain.CarRental),
		Transfers:          make(map[string]domain.AirportTransfer),
		Activities:         make(map[string]domain.Activity),
		Packages:           make(map[string]domain.DynamicPackage),
		Promotions:         make(map[string]domain.Promotion),
		Bookings:           make(map[string]domain.Booking),
		TripMoments:        make(map[string]domain.TripMoment),
		Reviews:            make(map[string][]domain.Review),
		AuditLogs:          make([]domain.AdminAuditLog, 0),
		Notices:            make([]domain.Notice, 0),
		CSTickets:          make(map[string]domain.CSTicket),
		FilterDefinitions:  make(map[string][]domain.DomainFilterDefinition),
		UniversalProducts:  make(map[string]*domain.UniversalProduct),
		CuratedContents:    make(map[string]*domain.CuratedContent),
		AffiliateReferrals: make(map[string]*domain.AffiliateReferral),
		RawScrapes:         make(map[string]domain.IngestRawRequest),
		WebhookLogs:        make([]domain.TravelCheckinWebhookLog, 0),
	}
	s.seedDefaultData()
	s.seedFilterDefinitions()
	return s
}

func (s *Store) seedDefaultData() {
	// FX Rates
	s.ExchangeRate[domain.CurrencyKRW] = domain.ExchangeRate{Currency: domain.CurrencyKRW, RateToKRW: 1.0, Symbol: "₩", UpdatedAt: time.Now()}
	s.ExchangeRate[domain.CurrencyUSD] = domain.ExchangeRate{Currency: domain.CurrencyUSD, RateToKRW: 1350.0, Symbol: "$", UpdatedAt: time.Now()}
	s.ExchangeRate[domain.CurrencyJPY] = domain.ExchangeRate{Currency: domain.CurrencyJPY, RateToKRW: 9.10, Symbol: "¥", UpdatedAt: time.Now()}
	s.ExchangeRate[domain.CurrencyEUR] = domain.ExchangeRate{Currency: domain.CurrencyEUR, RateToKRW: 1470.0, Symbol: "€", UpdatedAt: time.Now()}
	s.ExchangeRate[domain.CurrencyCNY] = domain.ExchangeRate{Currency: domain.CurrencyCNY, RateToKRW: 188.0, Symbol: "¥", UpdatedAt: time.Now()}
	s.ExchangeRate[domain.CurrencyGBP] = domain.ExchangeRate{Currency: domain.CurrencyGBP, RateToKRW: 1720.0, Symbol: "£", UpdatedAt: time.Now()}

	// Users
	u1 := domain.User{
		ID:                "a0000000-0000-0000-0000-000000000001",
		Email:             "vip@getfortrip.com",
		FullName:          "김여행 (VIP 다이아몬드)",
		PhoneNumber:       "+82-10-1234-5678",
		PreferredCurrency: domain.CurrencyKRW,
		PreferredLanguage: "ko",
		Tier:              domain.TierDiamond,
		TripCoins:         28500,
		AvatarURL:         "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
		CreatedAt:         time.Now(),
	}
	s.Users[u1.ID] = u1
	s.Travelers[u1.ID] = []domain.SavedTraveler{
		{ID: "t1", UserID: u1.ID, LastNameEN: "KIM", FirstNameEN: "TRAVEL", BirthDate: "1990-05-15", Gender: "M", PassportNumber: "M12345678", Nationality: "KOR"},
		{ID: "t2", UserID: u1.ID, LastNameEN: "LEE", FirstNameEN: "MINA", BirthDate: "1993-08-20", Gender: "F", PassportNumber: "M87654321", Nationality: "KOR"},
	}

	// Hotels & Rooms
	h1 := domain.Hotel{
		ID:           "c0000000-0000-0000-0000-000000000001",
		NameKO:       "시그니엘 서울",
		NameEN:       "SIGNIEL SEOUL",
		City:         "서울",
		Country:      "대한민국",
		Address:      "서울특별시 송파구 올림픽로 300 롯데월드타워 76-101층",
		Latitude:     37.5125,
		Longitude:    127.1025,
		StarRating:   5,
		ReviewScore:  4.9,
		ReviewCount:  1540,
		ThumbnailURL: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800",
		Images:       []string{"https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800", "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800"},
		Amenities:    []string{"WIFI", "POOL", "GYM", "BREAKFAST", "SPA", "VALET"},
		Description:  "초고층 롯데월드타워에서 서울의 파노라믹 한강 뷰를 감상할 수 있는 럭셔리 랜드마크 호텔.",
		Tags:         []string{"getfortrip Best 2026", "초고층 시티뷰", "럭셔리 호캉스"},
	}
	s.Hotels[h1.ID] = h1
	r1 := domain.HotelRoom{
		ID:                 "d0000000-0000-0000-0000-000000000001",
		HotelID:            h1.ID,
		Name:               "프리미어 더블룸 (파노라믹 리버뷰)",
		BedType:            "킹 베드 1개",
		MaxGuests:          2,
		RoomSizeSqm:        53.0,
		BasePriceKRW:       580000,
		IsFreeCancellation: true,
		IncludesBreakfast:  false,
		AvailableStock:     8,
		Images:             []string{"https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800"},
	}
	r2 := domain.HotelRoom{
		ID:                 "d0000000-0000-0000-0000-000000000002",
		HotelID:            h1.ID,
		Name:               "디럭스 스위트 (살롱 드 시그니엘 라운지 & 조식 2인)",
		BedType:            "슈퍼 킹 베드 1개",
		MaxGuests:          3,
		RoomSizeSqm:        88.0,
		BasePriceKRW:       950000,
		IsFreeCancellation: true,
		IncludesBreakfast:  true,
		AvailableStock:     3,
		Images:             []string{"https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800"},
	}
	s.HotelRooms[r1.ID] = r1
	s.HotelRooms[r2.ID] = r2

	h2 := domain.Hotel{
		ID:           "c0000000-0000-0000-0000-000000000002",
		NameKO:       "도쿄 그랜드 하얏트",
		NameEN:       "Grand Hyatt Tokyo",
		City:         "도쿄",
		Country:      "일본",
		Address:      "6-10-3 Roppongi, Minato-ku, Tokyo",
		Latitude:     35.6596,
		Longitude:    139.7289,
		StarRating:   5,
		ReviewScore:  4.8,
		ReviewCount:  1120,
		ThumbnailURL: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800",
		Images:       []string{"https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800"},
		Amenities:    []string{"WIFI", "POOL", "BREAKFAST", "METRO_ACCESS"},
		Description:  "롯폰기 힐즈 복합 문화단지와 바로 연결되어 쇼핑과 다이닝에 최적화된 도쿄 최고급 호텔.",
		Tags:         []string{"롯폰기 힐즈 직결", "미슐랭 다이닝"},
	}
	s.Hotels[h2.ID] = h2
	r3 := domain.HotelRoom{
		ID:                 "d0000000-0000-0000-0000-000000000003",
		HotelID:            h2.ID,
		Name:               "그랜드 킹 룸 (도쿄 타워 뷰)",
		BedType:            "킹 베드 1개",
		MaxGuests:          2,
		RoomSizeSqm:        42.0,
		BasePriceKRW:       490000,
		IsFreeCancellation: true,
		IncludesBreakfast:  false,
		AvailableStock:     10,
		Images:             []string{"https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800"},
	}
	s.HotelRooms[r3.ID] = r3

	h3 := domain.Hotel{
		ID:           "c0000000-0000-0000-0000-000000000003",
		NameKO:       "스위소텔 난카이 오사카",
		NameEN:       "Swissotel Nankai Osaka",
		City:         "오사카",
		Country:      "일본",
		Address:      "5-1-60 Namba, Chuo-ku, Osaka",
		Latitude:     34.6644,
		Longitude:    135.5015,
		StarRating:   5,
		ReviewScore:  4.7,
		ReviewCount:  2400,
		ThumbnailURL: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800",
		Amenities:    []string{"WIFI", "METRO_DIRECT", "BREAKFAST", "SPA"},
		Tags:         []string{"난바역 바로 위", "도톤보리 도보 5분"},
	}
	s.Hotels[h3.ID] = h3
	r4 := domain.HotelRoom{
		ID:                 "d0000000-0000-0000-0000-000000000005",
		HotelID:            h3.ID,
		Name:               "어드밴티지 퀸 룸 (고층 시티뷰)",
		BedType:            "퀸 베드 1개",
		MaxGuests:          2,
		RoomSizeSqm:        32.0,
		BasePriceKRW:       260000,
		IsFreeCancellation: true,
		IncludesBreakfast:  true,
		AvailableStock:     12,
	}
	s.HotelRooms[r4.ID] = r4

	h4 := domain.Hotel{
		ID:           "c0000000-0000-0000-0000-000000000004",
		NameKO:       "방콕 샹그릴라 호텔",
		NameEN:       "Shangri-La Bangkok",
		City:         "방콕",
		Country:      "태국",
		Address:      "89 Soi Wat Suan Phlu, Bang Rak, Bangkok",
		Latitude:     13.7212,
		Longitude:    100.5143,
		StarRating:   5,
		ReviewScore:  4.7,
		ReviewCount:  2800,
		ThumbnailURL: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800",
		Amenities:    []string{"WIFI", "RIVER_VIEW", "POOL", "BREAKFAST"},
		Tags:         []string{"차오프라야 리버뷰", "BTS 사판탁신역"},
	}
	s.Hotels[h4.ID] = h4
	r5 := domain.HotelRoom{
		ID:                 "d0000000-0000-0000-0000-000000000006",
		HotelID:            h4.ID,
		Name:               "디럭스 발코니 리버뷰 룸",
		BedType:            "킹 베드 1개",
		MaxGuests:          2,
		RoomSizeSqm:        48.0,
		BasePriceKRW:       290000,
		IsFreeCancellation: true,
		IncludesBreakfast:  true,
		AvailableStock:     15,
	}
	s.HotelRooms[r5.ID] = r5

	// Flights
	f1 := domain.Flight{
		ID:               "e0000000-0000-0000-0000-000000000001",
		FlightNumber:     "KE703",
		AirlineName:      "대한항공",
		AirlineCode:      "KE",
		DepartureAirport: "ICN",
		ArrivalAirport:   "NRT",
		DepartureCity:    "서울/인천",
		ArrivalCity:      "도쿄/나리타",
		DepartureTime:    time.Date(2026, 11, 1, 10, 10, 0, 0, time.Local),
		ArrivalTime:      time.Date(2026, 11, 1, 12, 35, 0, 0, time.Local),
		DurationMinutes:  145,
		CabinClass:       "ECONOMY",
		BasePriceKRW:     345000,
		FreeBaggageKG:    23,
		AvailableSeats:   45,
	}
	f2 := domain.Flight{
		ID:               "e0000000-0000-0000-0000-000000000002",
		FlightNumber:     "OZ102",
		AirlineName:      "아시아나항공",
		AirlineCode:      "OZ",
		DepartureAirport: "ICN",
		ArrivalAirport:   "NRT",
		DepartureCity:    "서울/인천",
		ArrivalCity:      "도쿄/나리타",
		DepartureTime:    time.Date(2026, 11, 1, 9, 0, 0, 0, time.Local),
		ArrivalTime:      time.Date(2026, 11, 1, 11, 20, 0, 0, time.Local),
		DurationMinutes:  140,
		CabinClass:       "ECONOMY",
		BasePriceKRW:     330000,
		FreeBaggageKG:    23,
		AvailableSeats:   28,
	}
	f3 := domain.Flight{
		ID:               "e0000000-0000-0000-0000-000000000004",
		FlightNumber:     "TG659",
		AirlineName:      "타이항공",
		AirlineCode:      "TG",
		DepartureAirport: "ICN",
		ArrivalAirport:   "BKK",
		DepartureCity:    "서울/인천",
		ArrivalCity:      "방콕/수완나품",
		DepartureTime:    time.Date(2026, 11, 5, 9, 35, 0, 0, time.Local),
		ArrivalTime:      time.Date(2026, 11, 5, 13, 30, 0, 0, time.Local),
		DurationMinutes:  355,
		CabinClass:       "ECONOMY",
		BasePriceKRW:     489000,
		FreeBaggageKG:    20,
		AvailableSeats:   52,
	}
	s.Flights[f1.ID] = f1
	s.Flights[f2.ID] = f2
	s.Flights[f3.ID] = f3

	// Trains
	tr1 := domain.Train{
		ID:               "f0000000-0000-0000-0000-000000000001",
		TrainNumber:      "KTX 021",
		TrainType:        "KTX",
		DepartureStation: "서울역",
		ArrivalStation:   "부산역",
		DepartureTime:    time.Date(2026, 11, 1, 8, 0, 0, 0, time.Local),
		ArrivalTime:      time.Date(2026, 11, 1, 10, 35, 0, 0, time.Local),
		DurationMinutes:  155,
		SeatClass:        "일반실",
		PriceKRW:         59800,
		AvailableSeats:   110,
	}
	tr2 := domain.Train{
		ID:               "f0000000-0000-0000-0000-000000000003",
		TrainNumber:      "NOZOMI 23",
		TrainType:        "SHINKANSEN",
		DepartureStation: "도쿄역",
		ArrivalStation:   "신오사카역",
		DepartureTime:    time.Date(2026, 11, 2, 9, 0, 0, 0, time.Local),
		ArrivalTime:      time.Date(2026, 11, 2, 11, 30, 0, 0, time.Local),
		DurationMinutes:  150,
		SeatClass:        "지정석",
		PriceKRW:         138000,
		AvailableSeats:   140,
	}
	s.Trains[tr1.ID] = tr1
	s.Trains[tr2.ID] = tr2

	// Cars & Transfers
	car1 := domain.CarRental{
		ID:                "70000000-0000-0000-0000-000000000001",
		CompanyName:       "롯데렌터카 제주",
		VehicleModel:      "현대 디 올 뉴 그랜저 (2025)",
		VehicleType:       "SEDAN",
		Seats:             5,
		Transmission:      "AUTO",
		DailyPriceKRW:     85000,
		PickupLocation:    "제주국제공항 렌터카하우스",
		InsuranceIncluded: true,
		ImageURL:          "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800",
		AvailableStock:    5,
	}
	s.Cars[car1.ID] = car1

	tf1 := domain.AirportTransfer{
		ID:              "71000000-0000-0000-0000-000000000001",
		ServiceTitle:    "인천공항 T1/T2 -> 서울 시내 프라이빗 대형 밴 (카니발 하이리무진)",
		AirportCode:     "ICN",
		DestinationArea: "서울 전 지역",
		VehicleClass:    "LUXURY_VAN_7",
		MaxPassengers:   7,
		MaxLuggage:      6,
		PriceKRW:        120000,
		FlightTracking:  true,
		ImageURL:        "https://images.unsplash.com/photo-1559297434-fae8a1916a79?w=800",
	}
	s.Transfers[tf1.ID] = tf1

	// Activities & eSIM (Trip-style UX/UI Seeds)
	act1 := domain.Activity{
		ID:                  "80000000-0000-0000-0000-000000000001",
		Title:               "도쿄 디즈니랜드 / 디즈니씨 1일 전자 여권 (공식 모바일 QR 직입장)",
		Category:            "THEME_PARK",
		City:                "도쿄",
		Country:             "일본",
		PriceKRW:            89000,
		ReviewScore:         4.9,
		ReviewCount:         8740,
		InstantConfirmation: true,
		FreeCancellation:    false,
		DurationType:        "FULL_DAY",
		GuideLanguage:       "KO",
		VoucherType:         "QR_CODE",
		ThumbnailURL:        "https://images.unsplash.com/photo-1546707012-c46675f12716?w=800",
		Description:         "현장 매표소 대기 없이 스마트폰 공식 QR코드로 게이트에서 바로 스캔하여 입장하는 1일 자유이용권.",
		Highlights: []string{
			"공식 라이선스 QR 코드로 매표소 대기 없이 즉시 게이트 통과",
			"디즈니랜드 또는 디즈니씨 중 원하는 테마파크 1곳 종일 무제한 이용",
			"도쿄 디즈니 리조트 공식 앱 연동으로 대기시간 실시간 확인 및 DPA 구매 가능",
		},
		Itinerary: []map[string]interface{}{
			{"step": 1, "time": "08:30", "title": "도쿄 디즈니 리조트 도착 및 전용 게이트 대기", "desc": "JR 마이하마역에서 도보 5분"},
			{"step": 2, "time": "09:00", "title": "공식 모바일 QR코드 스캔 및 파크 입장", "desc": "스마트폰 화면 바우처를 리더기에 태그"},
			{"step": 3, "time": "14:00", "title": "주간 퍼레이드 및 어트랙션 자유 이용", "desc": "미녀와 야수, 베이맥스 등 인기 어트랙션 탑승"},
			{"step": 4, "time": "20:30", "title": "나이트 일렉트리컬 퍼레이드 & 불꽃놀이", "desc": "신데렐라 성 앞 명당 관람 후 자유 퇴장"},
		},
		Inclusions: []string{"도쿄 디즈니랜드 또는 디즈니씨 1일 자유이용권", "파크 내 모든 무료 어트랙션 탑승", "소비세 및 발권 수수료"},
		Exclusions: []string{"디즈니 프리미어 액세스(DPA) 유료 패스", "식음료 및 기념품", "파크 내 유료 렌탈 서비스"},
		HowToUse:   "예약 즉시 발송되는 바우처 속 QR코드를 캡처하거나 출력하여 입장 게이트 스캐너에 직접 태그하세요. 실물 티켓으로 교환할 필요가 없습니다.",
		Packages: []map[string]interface{}{
			{"id": "pkg-disney-adult", "name": "성인 1일 이용권 (만 18세 이상)", "price_krw": 89000, "market_price_krw": 99000, "desc": "성인 전용 1일 종일 자유이용권"},
			{"id": "pkg-disney-teen", "name": "청소년 1일 이용권 (만 12~17세)", "price_krw": 75000, "market_price_krw": 83000, "desc": "중고등학생 전용 할인권"},
			{"id": "pkg-disney-child", "name": "어린이 1일 이용권 (만 4~11세)", "price_krw": 53000, "market_price_krw": 60000, "desc": "만 4세 이상 유아 및 초등학생"},
		},
	}
	act2 := domain.Activity{
		ID:                  "80000000-0000-0000-0000-000000000002",
		Title:               "유니버설 스튜디오 재팬 (USJ) 1일 스튜디오 패스 + 슈퍼 닌텐도 월드 확약권",
		Category:            "THEME_PARK",
		City:                "오사카",
		Country:             "일본",
		PriceKRW:            86500,
		ReviewScore:         4.9,
		ReviewCount:         12400,
		InstantConfirmation: true,
		FreeCancellation:    false,
		DurationType:        "FULL_DAY",
		GuideLanguage:       "KO",
		VoucherType:         "QR_CODE",
		ThumbnailURL:        "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800",
		Description:         "오사카 여행 필수 코스! 슈퍼 닌텐도 월드와 위저딩 월드 오브 해리포터를 즐기는 공식 USJ 입장권.",
		Highlights: []string{
			"공식 모바일 QR 즉시 발권으로 현장 매표소 대기 생략",
			"마리오 카트, 요시 어드벤처가 있는 슈퍼 닌텐도 월드 입장 확약 옵션",
			"귀멸의 칼날, 주술회전 등 한정 어트랙션 시즌 체험",
		},
		Inclusions: []string{"유니버설 스튜디오 재팬 1일 파크 입장 및 일반 어트랙션 이용권", "소비세"},
		Exclusions: []string{"익스프레스 패스(Express Pass 별도 구매)", "파워업 밴드(현장 구매)", "식음료"},
		HowToUse:   "스마트폰에 바우처 QR코드를 띄워 입장 게이트 리더기에 직접 스캔하세요.",
		Packages: []map[string]interface{}{
			{"id": "pkg-usj-1day", "name": "1일 스튜디오 패스 (성인 만 12세 이상)", "price_krw": 86500, "market_price_krw": 95000, "desc": "종일 자유 이용권"},
			{"id": "pkg-usj-child", "name": "1일 스튜디오 패스 (아동 만 4~11세)", "price_krw": 56000, "market_price_krw": 62000, "desc": "아동 전용 이용권"},
		},
	}
	act3 := domain.Activity{
		ID:                  "80000000-0000-0000-0000-000000000003",
		Title:               "일본 무제한 5G 매일 2GB+속도제어 로밍 eSIM (3일~10일)",
		Category:            "ESIM",
		City:                "도쿄",
		Country:             "일본",
		PriceKRW:            6500,
		ReviewScore:         4.8,
		ReviewCount:         15400,
		InstantConfirmation: true,
		FreeCancellation:    true,
		DurationType:        "MULTI_DAY",
		GuideLanguage:       "KO",
		VoucherType:         "QR_CODE",
		ThumbnailURL:        "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800",
		Description:         "실물 유심 교체 없이 이메일로 받은 QR코드 스캔 즉시 개통되는 고속 Docomo/SoftBank 5G eSIM.",
		Highlights: []string{
			"유심 교체 없이 QR코드 스캔으로 1분 만에 설치 완료",
			"일본 1위 통신사 Docomo/SoftBank 정규 5G망 무제한 데이터",
			"기존 한국 번호(전화/문자) 그대로 유지 수신 가능",
		},
		Inclusions: []string{"지정 기간 고속 데이터", "QR코드 설치 안내서(한국어)", "24시간 실시간 카카오톡 기술지원"},
		Exclusions: []string{"현지 음성통화 및 SMS(데이터 전용)"},
		HowToUse:   "스마트폰 [설정] > [셀룰러] > [eSIM 추가]를 누르고 바우처의 QR코드를 스캔하여 활성화하세요.",
		Packages: []map[string]interface{}{
			{"id": "pkg-esim-3d", "name": "3일권 매일 2GB 이후 무제한", "price_krw": 6500, "market_price_krw": 8900, "desc": "3일 동안 매일 고속 2GB"},
			{"id": "pkg-esim-5d", "name": "5일권 매일 2GB 이후 무제한", "price_krw": 9900, "market_price_krw": 13900, "desc": "가장 인기 있는 5일 플랜"},
			{"id": "pkg-esim-7d", "name": "7일권 완전 무제한 무감속", "price_krw": 18500, "market_price_krw": 23000, "desc": "데이터 속도 저하 없는 프리미엄"},
		},
	}
	act4 := domain.Activity{
		ID:                  "80000000-0000-0000-0000-000000000004",
		Title:               "타이베이 예스진지 1일 버스투어 (한국어 가이드 & 전용 셔틀버스)",
		Category:            "DAY_TOUR",
		City:                "타이베이",
		Country:             "대만",
		PriceKRW:            35000,
		ReviewScore:         4.9,
		ReviewCount:         4320,
		InstantConfirmation: true,
		FreeCancellation:    true,
		DurationType:        "FULL_DAY",
		GuideLanguage:       "KO",
		VoucherType:         "QR_CODE",
		ThumbnailURL:        "https://images.unsplash.com/photo-1508248467877-aec1b08de376?w=800",
		Description:         "타이베이 필수 근교 명소 예류, 스펀 천등, 진과스 황금폭포, 지우펀 홍등 거리를 한국어 가이드와 전용 버스로 안전하고 쾌적하게 여행하는 1일 투어.",
		Highlights: []string{
			"전문 한국어 가이드의 재치 넘치는 역사 해설과 인생샷 스팟 안내",
			"대중교통으로 가기 힘든 예류-스펀-진과스-지우펀을 전용 버스로 한 번에 정복",
			"스펀 천등 날리기 및 지우펀 명물 땅콩아이스크림 할인 혜택",
		},
		Itinerary: []map[string]interface{}{
			{"step": 1, "time": "09:30", "title": "타이베이 메인역 동3문 집결", "desc": "한국어 가이드 미팅 및 출석 체크"},
			{"step": 2, "time": "10:30", "title": "예류 지질공원 탐방 (70분 체류)", "desc": "여왕머리 바위 관람 및 해안 지질 지형 감상"},
			{"step": 3, "time": "12:30", "title": "스펀 옛길 천등 날리기 (60분 체류)", "desc": "기찻길에서 소원 천등 날리기 및 닭날개볶음밥 시식"},
			{"step": 4, "time": "14:30", "title": "진과스 황금박물관 & 광부도시락 (60분 체류)", "desc": "순금 220kg 황금 만지기"},
			{"step": 5, "time": "16:30", "title": "지우펀 홍등거리 감성 투어 (120분 체류)", "desc": "아메이차루 홍등 골목 및 지우펀 야경 감상"},
			{"step": 6, "time": "19:30", "title": "타이베이 시내(시먼딩 또는 라오허제 야시장) 하차", "desc": "원하는 장소에서 자유 해산"},
		},
		Inclusions: []string{"타이베이 시내 왕복 전용 투어 버스", "공인 한국어 가이드 해설비", "차량 승객 보험"},
		Exclusions: []string{"예류 지질공원 입장료(NT$120)", "스펀 천등 날리기 비용(NT$200~250)", "광부도시락 및 개인 식사비"},
		HowToUse:   "지정된 미팅 시간 10분 전까지 타이베이 메인역 동3문 앞으로 오셔서 'getfortrip' 깃발을 든 가이드에게 모바일 바우처를 제시하세요.",
		Packages: []map[string]interface{}{
			{"id": "pkg-ye-standard", "name": "기본 1인 투어 참가권", "price_krw": 35000, "market_price_krw": 45000, "desc": "한국어 가이드 + 전용 버스 포함"},
			{"id": "pkg-ye-combo", "name": "1인 투어 + 스펀 천등(단색) 포함 패키지", "price_krw": 44000, "market_price_krw": 55000, "desc": "천등 날리기 사전 포함 상품"},
		},
	}
	act5 := domain.Activity{
		ID:                  "80000000-0000-0000-0000-000000000005",
		Title:               "파리 루브르 박물관 공인 한국어 도슨트 집중 투어 (최대 10인)",
		Category:            "DOCENT_TOUR",
		City:                "파리",
		Country:             "프랑스",
		PriceKRW:            79000,
		ReviewScore:         5.0,
		ReviewCount:         2850,
		InstantConfirmation: true,
		FreeCancellation:    true,
		DurationType:        "HALF_DAY",
		GuideLanguage:       "KO",
		VoucherType:         "QR_CODE",
		ThumbnailURL:        "https://images.unsplash.com/photo-1543349689-9a4d426bee8e?w=800",
		Description:         "프랑스 국가공인 한국인 가이드와 함께 모나리자, 사모트라케의 니케, 밀로의 비너스 등 루브르의 핵심 걸작을 3시간 동안 생생하고 재미있게 감상하는 소수정예 프리미엄 도슨트 투어.",
		Highlights: []string{
			"프랑스 문화부 공인 한국인 전문 가이드의 심도 있는 예술사 해설",
			"최대 10인 한정 소수정예 진행으로 쾌적한 질의응답 및 감상",
			"최신 무선 수신기 무료 대여로 가이드의 목소리를 또렷하게 청취",
		},
		Itinerary: []map[string]interface{}{
			{"step": 1, "time": "09:30", "title": "루브르 박물관 피라미드 카루젤 아케이드 집결", "desc": "무선 수신기 배부 및 사전 브리핑"},
			{"step": 2, "time": "10:00", "title": "고대 그리스 & 로마 조각관", "desc": "밀로의 비너스, 사모트라케의 니케 입체 감상"},
			{"step": 3, "time": "11:00", "title": "이탈리아 르네상스 회화관", "desc": "레오나르도 다빈치의 모나리자, 라파엘로 명작"},
			{"step": 4, "time": "12:00", "title": "프랑스 대형 낭만주의 회화관", "desc": "민중을 이끄는 자유의 여신, 나폴레옹 1세의 대관식"},
			{"step": 5, "time": "12:30", "title": "투어 종료 및 질의응답", "desc": "투어 종료 후 루브르 박물관 내 자유 관람 지속 가능"},
		},
		Inclusions: []string{"프랑스 국가공인 한국어 가이드 해설비", "개인용 고음질 무선 수신기 대여"},
		Exclusions: []string{"루브르 박물관 공식 입장권(성인 22유로 사전 예약 필수)", "개인 이어폰(3.5mm 유선 권장)"},
		HowToUse:   "루브르 박물관 카루젤 개선문 앞 동상 아래에서 'getfortrip 도슨트' 피켓을 든 가이드와 미팅합니다.",
		Packages: []map[string]interface{}{
			{"id": "pkg-louvre-docent", "name": "오전 09:30 도슨트 집중 투어", "price_krw": 79000, "market_price_krw": 95000, "desc": "가장 관람이 여유로운 오전 타임"},
			{"id": "pkg-louvre-afternoon", "name": "오후 14:00 도슨트 집중 투어", "price_krw": 79000, "market_price_krw": 95000, "desc": "여유로운 오후 일정"},
		},
	}
	s.Activities[act1.ID] = act1
	s.Activities[act2.ID] = act2
	s.Activities[act3.ID] = act3
	s.Activities[act4.ID] = act4
	s.Activities[act5.ID] = act5

	// Packages
	pkg1 := domain.DynamicPackage{
		ID:                  "90000000-0000-0000-0000-000000000001",
		Title:               "도쿄 3박 4일 특가 패키지 (대한항공 왕복 + 그랜드 하얏트 3박)",
		DestinationCity:     "도쿄",
		HotelID:             h2.ID,
		FlightID:            f1.ID,
		PackageDiscountRate: 15.00,
		TotalOriginalKRW:    1815000,
		TotalPackageKRW:     1542750,
		ThumbnailURL:        "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800",
		Hotel:               &h2,
		Flight:              &f1,
	}
	s.Packages[pkg1.ID] = pkg1

	// Promotions & Coupons
	p1 := domain.Promotion{
		ID:                "20000000-0000-0000-0000-000000000001",
		Code:              "WELCOME2026",
		Title:             "신규 회원 첫 예약 10% 웰컴 할인",
		DiscountType:      "PERCENTAGE",
		DiscountValue:     10.00,
		MinOrderAmountKRW: 50000,
		MaxDiscountKRW:    30000,
		ValidFrom:         time.Now().Add(-24 * time.Hour),
		ValidUntil:        time.Now().Add(365 * 24 * time.Hour),
		IsActive:          true,
	}
	p2 := domain.Promotion{
		ID:                "20000000-0000-0000-0000-000000000002",
		Code:              "HOTEL50000",
		Title:             "전 세계 호텔 50,000원 즉시할인 쿠폰",
		DiscountType:      "FIXED_AMOUNT",
		DiscountValue:     50000.00,
		MinOrderAmountKRW: 300000,
		MaxDiscountKRW:    50000,
		ValidFrom:         time.Now().Add(-24 * time.Hour),
		ValidUntil:        time.Now().Add(365 * 24 * time.Hour),
		IsActive:          true,
	}
	s.Promotions[p1.Code] = p1
	s.Promotions[p2.Code] = p2

	// Bookings
	b1 := domain.Booking{
		ID:                  "30000000-0000-0000-0000-000000000001",
		BookingCode:         "GFT-20261101-7781",
		UserID:              u1.ID,
		DomainType:          domain.DomainHotel,
		Status:              domain.StatusConfirmed,
		BaseAmountKRW:       580000,
		TaxAmountKRW:        58000,
		ServiceFeeKRW:       17400,
		DiscountAmountKRW:   50000,
		TripCoinsUsed:       500,
		FinalAmountKRW:      600400,
		PaidCurrency:        domain.CurrencyKRW,
		PaidCurrencyAmount:  600400,
		PrimaryContactName:  "김여행",
		PrimaryContactEmail: "vip@getfortrip.com",
		PrimaryContactPhone: "+82-10-1234-5678",
		ConfirmationNumber:  "VOUCH-SG-88219",
		VoucherURL:          "https://voucher.getfortrip.com/v/GFT-20261101-7781",
		CreatedAt:           time.Now().Add(-48 * time.Hour),
		UpdatedAt:           time.Now().Add(-48 * time.Hour),
	}
	b2 := domain.Booking{
		ID:                  "30000000-0000-0000-0000-000000000002",
		BookingCode:         "GFT-20261102-1209",
		UserID:              u1.ID,
		DomainType:          domain.DomainFlight,
		Status:              domain.StatusConfirmed,
		BaseAmountKRW:       345000,
		TaxAmountKRW:        34500,
		ServiceFeeKRW:       10350,
		DiscountAmountKRW:   24150,
		TripCoinsUsed:       0,
		FinalAmountKRW:      365700,
		PaidCurrency:        domain.CurrencyKRW,
		PaidCurrencyAmount:  365700,
		PrimaryContactName:  "김여행",
		PrimaryContactEmail: "vip@getfortrip.com",
		PrimaryContactPhone: "+82-10-1234-5678",
		ConfirmationNumber:  "PNR-KE-79482X",
		CreatedAt:           time.Now().Add(-24 * time.Hour),
		UpdatedAt:           time.Now().Add(-24 * time.Hour),
	}
	b3 := domain.Booking{
		ID:                  "30000000-0000-0000-0000-000000000003",
		BookingCode:         "GFT-20261103-9941",
		UserID:              u1.ID,
		DomainType:          domain.DomainFlight,
		Status:              domain.StatusIssueFailed,
		BaseAmountKRW:       489000,
		TaxAmountKRW:        48900,
		ServiceFeeKRW:       14670,
		DiscountAmountKRW:   0,
		TripCoinsUsed:       0,
		FinalAmountKRW:      552570,
		PaidCurrency:        domain.CurrencyUSD,
		PaidCurrencyAmount:  409.31,
		PrimaryContactName:  "김여행",
		PrimaryContactEmail: "vip@getfortrip.com",
		PrimaryContactPhone: "+82-10-1234-5678",
		CreatedAt:           time.Now().Add(-2 * time.Hour),
		UpdatedAt:           time.Now().Add(-2 * time.Hour),
	}
	s.Bookings[b1.ID] = b1
	s.Bookings[b2.ID] = b2
	s.Bookings[b3.ID] = b3

	// Trip Moments & Reviews
	m1 := domain.TripMoment{
		ID:         "40000000-0000-0000-0000-000000000001",
		UserID:     u1.ID,
		UserName:   u1.FullName,
		UserAvatar: u1.AvatarURL,
		City:       "서울",
		Title:      "시그니엘 서울 85층 한강 일몰 뷰는 정말 환상적입니다!",
		Content:    "기념일을 맞아 다녀온 시그니엘 서울! 살롱 드 시그니엘 라운지에서 즐기는 샴페인과 초고층 야경은 잊을 수 없네요. getfortrip 특가 쿠폰으로 조식까지 알차게 다녀왔어요.",
		Photos:     []string{"https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800", "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800"},
		LikesCount: 342,
		IsFeatured: true,
		CreatedAt:  time.Now().Add(-5 * 24 * time.Hour),
	}
	s.TripMoments[m1.ID] = m1

	// Notices & CS
	s.Notices = append(s.Notices, domain.Notice{
		ID:           "n1",
		Title:        "[긴급] 동남아 태풍 기상악화에 따른 일부 항공편 결항 수수료 면제 안내",
		Content:      "해당 항공편 탑승 고객님께서는 고객센터 또는 셀프서비스를 통해 위약금 없이 100% 무료 환불 및 일정 변경이 가능합니다.",
		IsEmergency:  true,
		BannerActive: true,
		CreatedAt:    time.Now(),
	})
}

// SearchHotels queries hotels with multi-criteria filters
func (s *Store) SearchHotels(city string, star int, minPrice, maxPrice float64, freeCancel, breakfast bool) []domain.Hotel {
	s.mu.RLock()
	defer s.mu.RUnlock()

	results := make([]domain.Hotel, 0)
	cleanCity := strings.TrimSpace(city)
	if idx := strings.Index(cleanCity, "("); idx > 0 {
		cleanCity = strings.TrimSpace(cleanCity[:idx])
	}
	cleanCityLower := strings.ToLower(cleanCity)

	for _, h := range s.Hotels {
		if cleanCity != "" {
			hCityLower := strings.ToLower(h.City)
			hNameLower := strings.ToLower(h.NameKO)
			matched := strings.Contains(hCityLower, cleanCityLower) ||
				strings.Contains(cleanCityLower, hCityLower) ||
				strings.Contains(hNameLower, cleanCityLower) ||
				strings.Contains(cleanCityLower, hNameLower)
			if !matched {
				if (cleanCityLower == "tokyo" || cleanCityLower == "tyo") && strings.Contains(hCityLower, "도쿄") {
					matched = true
				} else if (cleanCityLower == "osaka" || cleanCityLower == "osa") && strings.Contains(hCityLower, "오사카") {
					matched = true
				} else if (cleanCityLower == "seoul" || cleanCityLower == "sel") && strings.Contains(hCityLower, "서울") {
					matched = true
				} else if (cleanCityLower == "bangkok" || cleanCityLower == "bkk") && strings.Contains(hCityLower, "방콕") {
					matched = true
				} else if (cleanCityLower == "fukuoka" || cleanCityLower == "fuk") && strings.Contains(hCityLower, "후쿠오카") {
					matched = true
				} else if (cleanCityLower == "paris" || cleanCityLower == "par") && strings.Contains(hCityLower, "파리") {
					matched = true
				}
			}
			if !matched {
				continue
			}
		}
		if star > 0 && h.StarRating < star {
			continue
		}

		// Attach matching rooms
		var rooms []domain.HotelRoom
		for _, r := range s.HotelRooms {
			if r.HotelID == h.ID {
				if minPrice > 0 && r.BasePriceKRW < minPrice {
					continue
				}
				if maxPrice > 0 && r.BasePriceKRW > maxPrice {
					continue
				}
				if freeCancel && !r.IsFreeCancellation {
					continue
				}
				if breakfast && !r.IncludesBreakfast {
					continue
				}
				rooms = append(rooms, r)
			}
		}

		hCopy := h
		hCopy.Rooms = rooms
		results = append(results, hCopy)
	}
	return results
}

// GetHotelDetail returns hotel with all rooms and reviews
func (s *Store) GetHotelDetail(id string) (*domain.Hotel, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	h, exists := s.Hotels[id]
	if !exists {
		return nil, fmt.Errorf("hotel with id %s not found", id)
	}

	var rooms []domain.HotelRoom
	for _, r := range s.HotelRooms {
		if r.HotelID == id {
			rooms = append(rooms, r)
		}
	}
	h.Rooms = rooms
	return &h, nil
}

// GetActivityDetail returns activity with its full packages and details
func (s *Store) GetActivityDetail(id string) (*domain.Activity, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	act, exists := s.Activities[id]
	if !exists {
		return nil, fmt.Errorf("activity with id %s not found", id)
	}
	return &act, nil
}

// GetFlightDetail returns flight by ID
func (s *Store) GetFlightDetail(id string) (*domain.Flight, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	flt, exists := s.Flights[id]
	if !exists {
		return nil, fmt.Errorf("flight with id %s not found", id)
	}
	return &flt, nil
}

// GetTrainDetail returns train by ID
func (s *Store) GetTrainDetail(id string) (*domain.Train, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	trn, exists := s.Trains[id]
	if !exists {
		return nil, fmt.Errorf("train with id %s not found", id)
	}
	return &trn, nil
}

// GetCarDetail returns car rental by ID
func (s *Store) GetCarDetail(id string) (*domain.CarRental, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	car, exists := s.Cars[id]
	if !exists {
		return nil, fmt.Errorf("car with id %s not found", id)
	}
	return &car, nil
}

// GetTransferDetail returns airport transfer by ID
func (s *Store) GetTransferDetail(id string) (*domain.AirportTransfer, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	tf, exists := s.Transfers[id]
	if !exists {
		return nil, fmt.Errorf("transfer with id %s not found", id)
	}
	return &tf, nil
}

// GetPackageDetail returns dynamic package by ID
func (s *Store) GetPackageDetail(id string) (*domain.DynamicPackage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	pkg, exists := s.Packages[id]
	if !exists {
		return nil, fmt.Errorf("package with id %s not found", id)
	}
	return &pkg, nil
}

// CreateDraftBooking creates draft booking with 15min inventory lock
func (s *Store) CreateDraftBooking(b domain.Booking) (*domain.Booking, error) {
	if b.BaseAmountKRW <= 0 || b.FinalAmountKRW < 0 {
		return nil, fmt.Errorf("invalid booking amount: amount cannot be negative or zero")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	b.ID = fmt.Sprintf("b-%d", time.Now().UnixNano())
	b.BookingCode = fmt.Sprintf("GFT-%s-%04d", time.Now().Format("20060102"), time.Now().Unix()%10000)
	b.Status = domain.StatusDraft
	b.InventoryLockExpireAt = time.Now().Add(15 * time.Minute)
	b.CreatedAt = time.Now()
	b.UpdatedAt = time.Now()

	s.Bookings[b.ID] = b
	return &b, nil
}

// TransitionBookingStatus updates booking state with validation and audit logging
func (s *Store) TransitionBookingStatus(bookingID string, targetStatus domain.BookingStatus, reason string, operator string) (*domain.Booking, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	b, exists := s.Bookings[bookingID]
	if !exists {
		return nil, fmt.Errorf("booking %s not found", bookingID)
	}

	if err := engine.ValidateTransition(b.Status, targetStatus); err != nil {
		return nil, err
	}

	oldStatus := b.Status
	b.Status = targetStatus
	b.UpdatedAt = time.Now()

	if targetStatus == domain.StatusConfirmed && b.ConfirmationNumber == "" {
		b.ConfirmationNumber = fmt.Sprintf("CONF-%s-%d", b.DomainType, time.Now().Unix()%100000)
		b.VoucherURL = fmt.Sprintf("https://voucher.getfortrip.com/v/%s", b.BookingCode)
	}

	s.Bookings[bookingID] = b

	s.AuditLogs = append(s.AuditLogs, domain.AdminAuditLog{
		ID:             fmt.Sprintf("log-%d", time.Now().UnixNano()),
		AdminUsername:  operator,
		Action:         "STATUS_TRANSITION",
		TargetResource: "BOOKING",
		TargetID:       bookingID,
		BeforeState:    oldStatus,
		AfterState:     fmt.Sprintf("%s (%s)", targetStatus, reason),
		CreatedAt:      time.Now(),
	})

	return &b, nil
}

// GetDashboardStats aggregates live metrics
func (s *Store) GetDashboardStats() map[string]any {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var totalGMV float64
	domainCounts := make(map[string]int)
	statusCounts := make(map[string]int)

	for _, b := range s.Bookings {
		totalGMV += b.FinalAmountKRW
		domainCounts[string(b.DomainType)]++
		statusCounts[string(b.Status)]++
	}

	return map[string]any{
		"total_gmv_krw":    totalGMV,
		"total_bookings":   len(s.Bookings),
		"domain_breakdown": domainCounts,
		"status_breakdown": statusCounts,
		"active_users":     len(s.Users),
		"timestamp":        time.Now(),
	}
}

// SearchSuggest provides getfortrip multi-domain autocomplete suggestions
func (s *Store) SearchSuggest(query string, domainFilter string) []domain.SuggestItem {
	s.mu.RLock()
	defer s.mu.RUnlock()

	q := strings.ToLower(strings.TrimSpace(query))
	df := strings.ToLower(strings.TrimSpace(domainFilter))

	// Base curated catalog
	catalog := []domain.SuggestItem{
		// [Hotels - Cities]
		{ID: "c-tyo", Domain: "hotels", Type: "city", Title: "도쿄 (Tokyo)", Subtitle: "일본 간토 지방, 도쿄도", Code: "TYO", Badge: "인기 도시", Icon: "city", TargetURL: "/hotels/list?city=도쿄", CountInfo: "숙소 2,450개"},
		{ID: "c-osa", Domain: "hotels", Type: "city", Title: "오사카 (Osaka)", Subtitle: "일본 간사이 지방, 오사카부", Code: "OSA", Badge: "인기 도시", Icon: "city", TargetURL: "/hotels/list?city=오사카", CountInfo: "숙소 1,820개"},
		{ID: "c-fuk", Domain: "hotels", Type: "city", Title: "후쿠오카 (Fukuoka)", Subtitle: "일본 규슈 지방", Code: "FUK", Badge: "인기 도시", Icon: "city", TargetURL: "/hotels/list?city=후쿠오카", CountInfo: "숙소 980개"},
		{ID: "c-sel", Domain: "hotels", Type: "city", Title: "서울 (Seoul)", Subtitle: "대한민국 수도권", Code: "SEL", Badge: "인기 도시", Icon: "city", TargetURL: "/hotels/list?city=서울", CountInfo: "숙소 3,120개"},
		{ID: "c-cju", Domain: "hotels", Type: "city", Title: "제주 (Jeju)", Subtitle: "대한민국 제주특별자치도", Code: "CJU", Badge: "휴양지", Icon: "city", TargetURL: "/hotels/list?city=제주", CountInfo: "숙소 1,450개"},
		{ID: "c-pus", Domain: "hotels", Type: "city", Title: "부산 (Busan)", Subtitle: "대한민국 영남권 해양도시", Code: "PUS", Badge: "해변 도시", Icon: "city", TargetURL: "/hotels/list?city=부산", CountInfo: "숙소 1,150개"},
		{ID: "c-bkk", Domain: "hotels", Type: "city", Title: "방콕 (Bangkok)", Subtitle: "태국 수도", Code: "BKK", Badge: "인기 도시", Icon: "city", TargetURL: "/hotels/list?city=방콕", CountInfo: "숙소 3,400개"},
		{ID: "c-dad", Domain: "hotels", Type: "city", Title: "다낭 (Da Nang)", Subtitle: "베트남 중부 해양 휴양지", Code: "DAD", Badge: "리조트 추천", Icon: "city", TargetURL: "/hotels/list?city=다낭", CountInfo: "숙소 1,210개"},
		{ID: "c-sin", Domain: "hotels", Type: "city", Title: "싱가포르 (Singapore)", Subtitle: "싱가포르", Code: "SIN", Badge: "글로벌 허브", Icon: "city", TargetURL: "/hotels/list?city=싱가포르", CountInfo: "숙소 1,600개"},
		{ID: "c-tpe", Domain: "hotels", Type: "city", Title: "타이베이 (Taipei)", Subtitle: "대만", Code: "TPE", Badge: "미식 여행", Icon: "city", TargetURL: "/hotels/list?city=타이베이", CountInfo: "숙소 1,350개"},
		{ID: "c-par", Domain: "hotels", Type: "city", Title: "파리 (Paris)", Subtitle: "프랑스 일드프랑스", Code: "PAR", Badge: "유럽 인기", Icon: "city", TargetURL: "/hotels/list?city=파리", CountInfo: "숙소 2,890개"},
		{ID: "c-lon", Domain: "hotels", Type: "city", Title: "런던 (London)", Subtitle: "영국 그레이터런던", Code: "LON", Badge: "유럽 인기", Icon: "city", TargetURL: "/hotels/list?city=런던", CountInfo: "숙소 2,750개"},
		{ID: "c-nyc", Domain: "hotels", Type: "city", Title: "뉴욕 (New York)", Subtitle: "미국 뉴욕주", Code: "NYC", Badge: "미주 인기", Icon: "city", TargetURL: "/hotels/list?city=뉴욕", CountInfo: "숙소 1,980개"},

		// [Flights - Airports with IATA Codes]
		{ID: "a-icn", Domain: "flights", Type: "airport", Title: "인천국제공항 (Incheon Int'l)", Subtitle: "대한민국 서울/인천 (ICN)", Code: "ICN", Badge: "공항 · IATA", Icon: "plane", TargetURL: "/flights/search?dest=ICN", CountInfo: "일일 320편"},
		{ID: "a-gmp", Domain: "flights", Type: "airport", Title: "김포국제공항 (Gimpo Int'l)", Subtitle: "대한민국 서울 (GMP)", Code: "GMP", Badge: "공항 · IATA", Icon: "plane", TargetURL: "/flights/search?dest=GMP", CountInfo: "일일 140편"},
		{ID: "a-hnd", Domain: "flights", Type: "airport", Title: "도쿄 하네다 국제공항 (Haneda)", Subtitle: "일본 도쿄 (HND)", Code: "HND", Badge: "공항 · IATA", Icon: "plane", TargetURL: "/flights/search?dest=HND", CountInfo: "일일 125편"},
		{ID: "a-nrt", Domain: "flights", Type: "airport", Title: "도쿄 나리타 국제공항 (Narita)", Subtitle: "일본 지바/도쿄 (NRT)", Code: "NRT", Badge: "공항 · IATA", Icon: "plane", TargetURL: "/flights/search?dest=NRT", CountInfo: "일일 98편"},
		{ID: "a-kix", Domain: "flights", Type: "airport", Title: "오사카 간사이 국제공항 (Kansai)", Subtitle: "일본 오사카 (KIX)", Code: "KIX", Badge: "공항 · IATA", Icon: "plane", TargetURL: "/flights/search?dest=KIX", CountInfo: "일일 110편"},
		{ID: "a-fuk", Domain: "flights", Type: "airport", Title: "후쿠오카 국제공항 (Fukuoka)", Subtitle: "일본 후쿠오카 (FUK)", Code: "FUK", Badge: "공항 · IATA", Icon: "plane", TargetURL: "/flights/search?dest=FUK", CountInfo: "일일 75편"},
		{ID: "a-bkk", Domain: "flights", Type: "airport", Title: "방콕 수완나품 국제공항 (Suvarnabhumi)", Subtitle: "태국 방콕 (BKK)", Code: "BKK", Badge: "공항 · IATA", Icon: "plane", TargetURL: "/flights/search?dest=BKK", CountInfo: "일일 160편"},
		{ID: "a-dad", Domain: "flights", Type: "airport", Title: "다낭 국제공항 (Da Nang Int'l)", Subtitle: "베트남 다낭 (DAD)", Code: "DAD", Badge: "공항 · IATA", Icon: "plane", TargetURL: "/flights/search?dest=DAD", CountInfo: "일일 65편"},
		{ID: "a-cdg", Domain: "flights", Type: "airport", Title: "파리 샤를 드골 공항 (Charles de Gaulle)", Subtitle: "프랑스 파리 (CDG)", Code: "CDG", Badge: "공항 · IATA", Icon: "plane", TargetURL: "/flights/search?dest=CDG", CountInfo: "일일 210편"},
		{ID: "a-lhr", Domain: "flights", Type: "airport", Title: "런던 히드로 공항 (Heathrow)", Subtitle: "영국 런던 (LHR)", Code: "LHR", Badge: "공항 · IATA", Icon: "plane", TargetURL: "/flights/search?dest=LHR", CountInfo: "일일 240편"},
		{ID: "a-jfk", Domain: "flights", Type: "airport", Title: "뉴욕 존 F. 케네디 국제공항 (JFK)", Subtitle: "미국 뉴욕 (JFK)", Code: "JFK", Badge: "공항 · IATA", Icon: "plane", TargetURL: "/flights/search?dest=JFK", CountInfo: "일일 230편"},

		// [Trains - High-speed Railway Stations]
		{ID: "t-seoul", Domain: "trains", Type: "station", Title: "서울역 (Seoul Station)", Subtitle: "대한민국 수도권 (KTX/경부선/공항철도)", Code: "KTX", Badge: "KTX 역", Icon: "train", TargetURL: "/trains?dep=서울역", CountInfo: "환승 허브"},
		{ID: "t-busan", Domain: "trains", Type: "station", Title: "부산역 (Busan Station)", Subtitle: "대한민국 부산 (KTX 종착역)", Code: "KTX", Badge: "KTX 역", Icon: "train", TargetURL: "/trains?arr=부산역", CountInfo: "KTX 종착역"},
		{ID: "t-dongdaegu", Domain: "trains", Type: "station", Title: "동대구역 (Dongdaegu Station)", Subtitle: "대한민국 대구 (KTX/SRT)", Code: "KTX", Badge: "고속철도", Icon: "train", TargetURL: "/trains?arr=동대구역", CountInfo: "KTX 환승"},
		{ID: "t-tokyo", Domain: "trains", Type: "station", Title: "도쿄역 (Tokyo Station)", Subtitle: "일본 도쿄 (도카이도 신칸센/JR)", Code: "Shinkansen", Badge: "신칸센 역", Icon: "train", TargetURL: "/trains?dep=도쿄역", CountInfo: "신칸센 출발"},
		{ID: "t-shinosaka", Domain: "trains", Type: "station", Title: "신오사카역 (Shin-Osaka Station)", Subtitle: "일본 오사카 (산요/도카이도 신칸센)", Code: "Shinkansen", Badge: "신칸센 역", Icon: "train", TargetURL: "/trains?arr=신오사카역", CountInfo: "간사이 중심"},
		{ID: "t-kyoto", Domain: "trains", Type: "station", Title: "교토역 (Kyoto Station)", Subtitle: "일본 교토 (신칸센/JR 서일본)", Code: "JR", Badge: "기차역", Icon: "train", TargetURL: "/trains?arr=교토역", CountInfo: "관광 거점"},
		{ID: "t-lyon", Domain: "trains", Type: "station", Title: "파리 리옹역 (Paris Gare de Lyon)", Subtitle: "프랑스 파리 (TGV/남부선)", Code: "TGV", Badge: "초고속열차", Icon: "train", TargetURL: "/trains?dep=ParisLyon", CountInfo: "TGV 출발"},

		// [Cars & Airport Transfers]
		{ID: "car-icn", Domain: "cars", Type: "car", Title: "인천국제공항 T1/T2 렌터카", Subtitle: "대한민국 인천공항 여객터미널 1/2 지점", Code: "ICN", Badge: "공항 지점", Icon: "car", TargetURL: "/cars?loc=인천공항", CountInfo: "차량 120대+"},
		{ID: "car-cju", Domain: "cars", Type: "car", Title: "제주공항 렌터카 셔틀 스테이션", Subtitle: "대한민국 제주도 제주시 공항로", Code: "CJU", Badge: "완전자차 보장", Icon: "car", TargetURL: "/cars?loc=제주공항", CountInfo: "차량 250대+"},
		{ID: "car-nrt", Domain: "cars", Type: "car", Title: "나리타공항 렌터카 카운터", Subtitle: "일본 나리타공항 제1/제2터미널", Code: "NRT", Badge: "공항 지점", Icon: "car", TargetURL: "/cars?loc=나리타공항", CountInfo: "ETC 카드 포함"},
		{ID: "car-fuk", Domain: "cars", Type: "car", Title: "후쿠오카공항 국제선 렌터카", Subtitle: "일본 후쿠오카시 하카타구", Code: "FUK", Badge: "공항 지점", Icon: "car", TargetURL: "/cars?loc=후쿠오카공항", CountInfo: "한국어 네비 지원"},
		{ID: "trans-icn", Domain: "cars", Type: "car", Title: "인천공항 프라이빗 픽업 & 샌딩", Subtitle: "서울 전 지역 호텔 픽업 / 벤츠·카니발 리무진", Code: "ICN", Badge: "공항 픽업", Icon: "car", TargetURL: "/cars?tab=transfers", CountInfo: "항공편 지연 대기"},

		// [Things to do / Activities / eSIM]
		{ID: "act-usj", Domain: "things-to-do", Type: "activity", Title: "유니버설 스튜디오 재팬 (USJ) 입장권", Subtitle: "일본 오사카 코노하나구 · 익스프레스 패스", Code: "USJ", Badge: "인기 테마파크", Icon: "ticket", TargetURL: "/things-to-do?q=유니버설", CountInfo: "즉시 확정 · QR입장"},
		{ID: "act-tdl", Domain: "things-to-do", Type: "activity", Title: "도쿄 디즈니랜드 / 디즈니씨 1일권", Subtitle: "일본 지바현 우라야스시 디즈니 리조트", Code: "Disney", Badge: "인기 테마파크", Icon: "ticket", TargetURL: "/things-to-do?q=디즈니랜드", CountInfo: "날짜 지정 e-티켓"},
		{ID: "act-shibuya", Domain: "things-to-do", Type: "landmark", Title: "시부야 스카이 (SHIBUYA SKY) 전망대", Subtitle: "일본 도쿄 시부야 스크램블 스퀘어 최상층", Code: "Tokyo", Badge: "명소 랜드마크", Icon: "landmark", TargetURL: "/things-to-do?q=시부야스카이", CountInfo: "일몰 시간대 인기"},
		{ID: "act-tower", Domain: "things-to-do", Type: "landmark", Title: "도쿄 타워 메인 데크 입장권", Subtitle: "일본 도쿄 미나토구 시바코엔", Code: "Tokyo", Badge: "랜드마크", Icon: "landmark", TargetURL: "/things-to-do?q=도쿄타워", CountInfo: "즉시 예약"},
		{ID: "act-esim-jp", Domain: "things-to-do", Type: "activity", Title: "일본 무제한 매일 2GB+ LTE eSIM", Subtitle: "로컬 통신사(Softbank/Docomo) 고속 무제한", Code: "eSIM", Badge: "베스트셀러", Icon: "ticket", TargetURL: "/things-to-do?category=esim", CountInfo: "이메일 3분 즉시발송"},
		{ID: "act-esim-sea", Domain: "things-to-do", Type: "activity", Title: "동남아 5개국 통합 데이터 eSIM", Subtitle: "태국, 베트남, 싱가포르, 말레이시아, 인도네시아", Code: "eSIM", Badge: "다국가 지원", Icon: "ticket", TargetURL: "/things-to-do?category=esim", CountInfo: "QR 간편 등록"},
		{ID: "act-danang", Domain: "things-to-do", Type: "activity", Title: "다낭 썬월드 바나힐 케이블카 & 입장권", Subtitle: "베트남 다낭 골든 브릿지 일일 투어", Code: "DaNang", Badge: "투어&입장권", Icon: "ticket", TargetURL: "/things-to-do?q=바나힐", CountInfo: "왕복 픽업 옵션"},

		// [Packages - Flight + Hotel Bundles]
		{ID: "pkg-tyo", Domain: "packages", Type: "package", Title: "[항공+호텔] 도쿄 3박 4일 자유여행 에어텔", Subtitle: "왕복 항공권 + 신주쿠/시부야 인기 호텔 묶음 할인", Code: "TYO", Badge: "다이내믹 패키지", Icon: "hotel", TargetURL: "/packages/builder?dest=도쿄", CountInfo: "최대 25% 추가 할인"},
		{ID: "pkg-osa", Domain: "packages", Type: "package", Title: "[항공+호텔] 오사카 2박 3일 미식&쇼핑 에어텔", Subtitle: "왕복 항공권 + 난바/도톤보리 4성급 호텔 결합", Code: "OSA", Badge: "다이내믹 패키지", Icon: "hotel", TargetURL: "/packages/builder?dest=오사카", CountInfo: "최대 30% 추가 할인"},
		{ID: "pkg-dad", Domain: "packages", Type: "package", Title: "[항공+호텔] 다낭 4박 5일 오션뷰 리조트 패키지", Subtitle: "국적기 직항 + 미케비치 5성급 럭셔리 풀빌라", Code: "DAD", Badge: "휴양 패키지", Icon: "hotel", TargetURL: "/packages/builder?dest=다낭", CountInfo: "최대 35% 특가"},
	}

	// Dynamic store hotels integration
	for _, h := range s.Hotels {
		catalog = append(catalog, domain.SuggestItem{
			ID:        "hotel-" + h.ID,
			Domain:    "hotels",
			Type:      "hotel",
			Title:     h.NameKO,
			Subtitle:  fmt.Sprintf("%s %s · %s", h.Country, h.City, h.Address),
			Code:      "",
			Badge:     fmt.Sprintf("%d성급 호텔", h.StarRating),
			Icon:      "hotel",
			TargetURL: fmt.Sprintf("/hotels/%s", h.ID),
			CountInfo: fmt.Sprintf("평점 %.1f", h.ReviewScore),
		})
	}

	// Filter and match
	matched := make([]domain.SuggestItem, 0)
	for _, item := range catalog {
		// Domain filter check
		if df != "" && df != "all" {
			if !strings.EqualFold(item.Domain, df) {
				continue
			}
		}

		// Empty query -> Popular top picks
		if q == "" {
			matched = append(matched, item)
			if len(matched) >= 10 {
				break
			}
			continue
		}

		// Search match: Title, Subtitle, Code
		titleLower := strings.ToLower(item.Title)
		subtitleLower := strings.ToLower(item.Subtitle)
		codeLower := strings.ToLower(item.Code)

		if strings.Contains(titleLower, q) ||
			strings.Contains(subtitleLower, q) ||
			strings.Contains(codeLower, q) {
			matched = append(matched, item)
			if len(matched) >= 15 {
				break
			}
		}
	}

	return matched
}

// ==============================================================================
// Curation & Multi-Platform Ingestion Storage Methods
// ==============================================================================

func (s *Store) SaveRawScrape(req domain.IngestRawRequest) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := fmt.Sprintf("raw-%s-%s-%d", req.Platform, req.SourceProductID, time.Now().UnixNano())
	s.RawScrapes[id] = req
	return id
}

func (s *Store) UpsertUniversalProduct(p *domain.UniversalProduct) {
	s.mu.Lock()
	defer s.mu.Unlock()

	p.UpdatedAt = time.Now()
	s.UniversalProducts[p.ID] = p
}

func (s *Store) SaveCuratedContent(c *domain.CuratedContent) {
	s.mu.Lock()
	defer s.mu.Unlock()

	c.UpdatedAt = time.Now()
	s.CuratedContents[c.ProductID] = c

	if prod, exists := s.UniversalProducts[c.ProductID]; exists {
		prod.CuratedContent = c
		prod.CurationStatus = domain.CurationStatusAIProcessed
	}
}

func (s *Store) SaveAffiliateReferral(a *domain.AffiliateReferral) {
	s.mu.Lock()
	defer s.mu.Unlock()

	a.UpdatedAt = time.Now()
	s.AffiliateReferrals[a.ProductID] = a

	if prod, exists := s.UniversalProducts[a.ProductID]; exists {
		prod.AffiliateReferral = a
	}
}

func (s *Store) LogWebhookDispatch(logEntry *domain.TravelCheckinWebhookLog) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if logEntry.ID == "" {
		logEntry.ID = fmt.Sprintf("tc-log-%d", time.Now().UnixNano())
	}
	s.WebhookLogs = append(s.WebhookLogs, *logEntry)

	if prod, exists := s.UniversalProducts[logEntry.ProductID]; exists {
		if logEntry.SyncStatus == domain.SyncStatusSuccess {
			prod.CurationStatus = domain.CurationStatusPublished
		}
	}
}

func (s *Store) GetCuratedProducts(platform domain.OTAPlatform, limit int) []*domain.UniversalProduct {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*domain.UniversalProduct
	for _, p := range s.UniversalProducts {
		if platform != "" && p.Platform != platform {
			continue
		}
		// Attach relations
		if cur, ok := s.CuratedContents[p.ID]; ok {
			p.CuratedContent = cur
		}
		if aff, ok := s.AffiliateReferrals[p.ID]; ok {
			p.AffiliateReferral = aff
		}
		result = append(result, p)
		if limit > 0 && len(result) >= limit {
			break
		}
	}
	return result
}

func (s *Store) GetUniversalProduct(id string) *domain.UniversalProduct {
	s.mu.RLock()
	defer s.mu.RUnlock()

	p, exists := s.UniversalProducts[id]
	if !exists {
		return nil
	}

	if cur, ok := s.CuratedContents[p.ID]; ok {
		p.CuratedContent = cur
	}
	if aff, ok := s.AffiliateReferrals[p.ID]; ok {
		p.AffiliateReferral = aff
	}
	return p
}

// GetDomainFilters retrieves filter taxonomy for a specific domain
func (s *Store) GetDomainFilters(domainType string) []domain.DomainFilterDefinition {
	s.mu.RLock()
	defer s.mu.RUnlock()

	key := strings.ToUpper(strings.TrimSpace(domainType))
	if strings.HasSuffix(key, "S") && key != "CARS" && key != "TRANSFERS" && key != "TRAINS" {
		key = strings.TrimSuffix(key, "S")
	}
	if key == "HOTELS" {
		key = "HOTEL"
	} else if key == "FLIGHTS" {
		key = "FLIGHT"
	} else if key == "ACTIVITIES" || key == "THINGS-TO-DO" {
		key = "ACTIVITY"
	} else if key == "PACKAGES" {
		key = "PACKAGE"
	} else if key == "CARS" {
		key = "CAR"
	} else if key == "TRANSFERS" {
		key = "TRANSFER"
	} else if key == "TRAINS" {
		key = "TRAIN"
	}

	filters, exists := s.FilterDefinitions[key]
	if !exists {
		return []domain.DomainFilterDefinition{}
	}
	return filters
}

// GetAllFilters returns all filter taxonomies
func (s *Store) GetAllFilters() map[string][]domain.DomainFilterDefinition {
	s.mu.RLock()
	defer s.mu.RUnlock()

	res := make(map[string][]domain.DomainFilterDefinition)
	for k, v := range s.FilterDefinitions {
		res[k] = v
	}
	return res
}

func (s *Store) seedFilterDefinitions() {
	// 1. HOTEL Filters
	s.FilterDefinitions["HOTEL"] = []domain.DomainFilterDefinition{
		{
			ID: "flt_hotel_star", DomainType: domain.DomainHotel, FilterGroup: "POPULAR", FilterKey: "star_rating",
			DisplayNameKO: "호텔 성급", DisplayNameEN: "Star Rating", UIControlType: "CHECKBOX_LIST", Icon: "⭐", SortOrder: 1,
			Options: []domain.DomainFilterOption{
				{ID: "5", LabelKO: "5성급 럭셔리", LabelEN: "5 Stars Luxury", Value: 5, CountHint: 320},
				{ID: "4", LabelKO: "4성급 고급", LabelEN: "4 Stars High-end", Value: 4, CountHint: 580},
				{ID: "3", LabelKO: "3성급 가성비", LabelEN: "3 Stars Comfort", Value: 3, CountHint: 740},
				{ID: "2", LabelKO: "2성급 이하 실속", LabelEN: "2 Stars or below", Value: 2, CountHint: 190},
			},
			IsActive: true,
		},
		{
			ID: "flt_hotel_guest_score", DomainType: domain.DomainHotel, FilterGroup: "RATING", FilterKey: "review_score",
			DisplayNameKO: "고객 평점", DisplayNameEN: "Guest Rating", UIControlType: "RADIO_GROUP", Icon: "❤️", SortOrder: 2,
			Options: []domain.DomainFilterOption{
				{ID: "score_4_8", LabelKO: "4.8점 이상 (최고예요)", LabelEN: "4.8+ Exceptional", Value: 4.8},
				{ID: "score_4_5", LabelKO: "4.5점 이상 (아주 좋아요)", LabelEN: "4.5+ Wonderful", Value: 4.5},
				{ID: "score_4_0", LabelKO: "4.0점 이상 (좋아요)", LabelEN: "4.0+ Very Good", Value: 4.0},
			},
			IsActive: true,
		},
		{
			ID: "flt_hotel_property_type", DomainType: domain.DomainHotel, FilterGroup: "PROPERTY", FilterKey: "property_type",
			DisplayNameKO: "숙소 유형", DisplayNameEN: "Property Type", UIControlType: "CHECKBOX_LIST", Icon: "🏨", SortOrder: 3,
			Options: []domain.DomainFilterOption{
				{ID: "HOTEL", LabelKO: "호텔", LabelEN: "Hotel", Value: "HOTEL", CountHint: 1420},
				{ID: "RESORT", LabelKO: "리조트", LabelEN: "Resort", Value: "RESORT", CountHint: 310},
				{ID: "APARTMENT", LabelKO: "아파트 / 레지던스", LabelEN: "Apartment / Residence", Value: "APARTMENT", CountHint: 240},
				{ID: "RYOKAN", LabelKO: "전통 료칸", LabelEN: "Ryokan", Value: "RYOKAN", CountHint: 85},
				{ID: "VILLA", LabelKO: "풀빌라", LabelEN: "Pool Villa", Value: "VILLA", CountHint: 65},
			},
			IsActive: true,
		},
		{
			ID: "flt_hotel_policies", DomainType: domain.DomainHotel, FilterGroup: "POLICY", FilterKey: "policies",
			DisplayNameKO: "예약 및 취소 규정", DisplayNameEN: "Reservation Policies", UIControlType: "CHECKBOX_LIST", Icon: "🛡️", SortOrder: 4,
			Options: []domain.DomainFilterOption{
				{ID: "free_cancel", LabelKO: "무료 취소 가능 (위약금 0원)", LabelEN: "Free Cancellation", Value: true},
				{ID: "free_breakfast", LabelKO: "무료 조식 포함 플랜", LabelEN: "Breakfast Included", Value: true},
				{ID: "pay_at_hotel", LabelKO: "현장 결제 가능 (사전결제 불필요)", LabelEN: "Pay at Hotel", Value: true},
			},
			IsActive: true,
		},
		{
			ID: "flt_hotel_amenities", DomainType: domain.DomainHotel, FilterGroup: "FACILITIES", FilterKey: "amenities",
			DisplayNameKO: "호텔 편의시설", DisplayNameEN: "Hotel Facilities", UIControlType: "CHECKBOX_LIST", Icon: "🏊", SortOrder: 5,
			Options: []domain.DomainFilterOption{
				{ID: "swimming_pool", LabelKO: "수영장 / 인피니티풀", LabelEN: "Swimming Pool", Icon: "🏊"},
				{ID: "fitness", LabelKO: "피트니스 센터", LabelEN: "Fitness Gym", Icon: "🏋️"},
				{ID: "spa", LabelKO: "사우나 & 스파", LabelEN: "Spa & Sauna", Icon: "🧖"},
				{ID: "free_parking", LabelKO: "무료 주차장", LabelEN: "Free Parking", Icon: "🅿️"},
				{ID: "ev_charge", LabelKO: "전기차 충전소", LabelEN: "EV Charging Station", Icon: "🔌"},
			},
			IsActive: true,
		},
	}

	// 2. FLIGHT Filters
	s.FilterDefinitions["FLIGHT"] = []domain.DomainFilterDefinition{
		{
			ID: "flt_flight_stops", DomainType: domain.DomainFlight, FilterGroup: "POPULAR", FilterKey: "stops",
			DisplayNameKO: "경유 횟수", DisplayNameEN: "Stops", UIControlType: "CHECKBOX_LIST", Icon: "✈️", SortOrder: 1,
			Options: []domain.DomainFilterOption{
				{ID: "0", LabelKO: "직항만 보기", LabelEN: "Non-stop only", Value: 0, CountHint: 42},
				{ID: "1", LabelKO: "1회 경유", LabelEN: "1 Stop", Value: 1, CountHint: 86},
				{ID: "2", LabelKO: "2회 이상 경유", LabelEN: "2+ Stops", Value: 2, CountHint: 18},
			},
			IsActive: true,
		},
		{
			ID: "flt_flight_time", DomainType: domain.DomainFlight, FilterGroup: "TIME", FilterKey: "departure_time_slot",
			DisplayNameKO: "출발 시간대", DisplayNameEN: "Departure Time", UIControlType: "CHECKBOX_LIST", Icon: "⏰", SortOrder: 2,
			Options: []domain.DomainFilterOption{
				{ID: "EARLY_MORNING", LabelKO: "새벽 (00:00 ~ 06:00)", LabelEN: "Early Morning", Value: "EARLY_MORNING"},
				{ID: "MORNING", LabelKO: "오전 (06:00 ~ 12:00)", LabelEN: "Morning", Value: "MORNING"},
				{ID: "AFTERNOON", LabelKO: "오후 (12:00 ~ 18:00)", LabelEN: "Afternoon", Value: "AFTERNOON"},
				{ID: "EVENING", LabelKO: "저녁/야간 (18:00 ~ 24:00)", LabelEN: "Evening", Value: "EVENING"},
			},
			IsActive: true,
		},
		{
			ID: "flt_flight_airlines", DomainType: domain.DomainFlight, FilterGroup: "AIRLINE", FilterKey: "airline_code",
			DisplayNameKO: "항공사 & 항공동맹체", DisplayNameEN: "Airlines & Alliances", UIControlType: "CHECKBOX_LIST", Icon: "🛫", SortOrder: 3,
			Options: []domain.DomainFilterOption{
				{ID: "KE", LabelKO: "대한항공 (Korean Air)", LabelEN: "Korean Air", Alliance: "SKYTEAM", CountHint: 28},
				{ID: "OZ", LabelKO: "아시아나항공 (Asiana Airlines)", LabelEN: "Asiana Airlines", Alliance: "STAR_ALLIANCE", CountHint: 22},
				{ID: "7C", LabelKO: "제주항공 (Jeju Air)", LabelEN: "Jeju Air", Alliance: "LCC", CountHint: 19},
				{ID: "TW", LabelKO: "티웨이항공 (Tway Air)", LabelEN: "Tway Air", Alliance: "LCC", CountHint: 15},
			},
			IsActive: true,
		},
		{
			ID: "flt_flight_cabin", DomainType: domain.DomainFlight, FilterGroup: "CABIN", FilterKey: "cabin_class",
			DisplayNameKO: "좌석 등급", DisplayNameEN: "Cabin Class", UIControlType: "RADIO_GROUP", Icon: "💺", SortOrder: 4,
			Options: []domain.DomainFilterOption{
				{ID: "ECONOMY", LabelKO: "일반석 (이코노미)", LabelEN: "Economy", Value: "ECONOMY"},
				{ID: "PREMIUM_ECONOMY", LabelKO: "프리미엄 이코노미", LabelEN: "Premium Economy", Value: "PREMIUM_ECONOMY"},
				{ID: "BUSINESS", LabelKO: "비즈니스석 (프레스티지)", LabelEN: "Business Class", Value: "BUSINESS"},
				{ID: "FIRST", LabelKO: "일등석 (퍼스트)", LabelEN: "First Class", Value: "FIRST"},
			},
			IsActive: true,
		},
	}

	// 3. TRAIN Filters
	s.FilterDefinitions["TRAIN"] = []domain.DomainFilterDefinition{
		{
			ID: "flt_train_network", DomainType: domain.DomainTrain, FilterGroup: "POPULAR", FilterKey: "rail_network",
			DisplayNameKO: "고속철도망 / 국가별 노선", DisplayNameEN: "Rail Network", UIControlType: "CHECKBOX_LIST", Icon: "🚅", SortOrder: 1,
			Options: []domain.DomainFilterOption{
				{ID: "KTX_SRT", LabelKO: "한국 코레일 KTX / SRT", LabelEN: "Korea KTX / SRT", Value: "KTX_SRT"},
				{ID: "SHINKANSEN", LabelKO: "일본 JR 신칸센 (노조미/히카리)", LabelEN: "Japan JR Shinkansen", Value: "SHINKANSEN"},
				{ID: "EUROSTAR", LabelKO: "유럽 유로스타 (런던-파리-브뤼셀)", LabelEN: "Eurostar Europe", Value: "EUROSTAR"},
				{ID: "CHINA_HSR", LabelKO: "중국 고속철도 (CRH 푸싱호)", LabelEN: "China High Speed Rail", Value: "CHINA_HSR"},
			},
			IsActive: true,
		},
		{
			ID: "flt_train_seat_class", DomainType: domain.DomainTrain, FilterGroup: "CABIN", FilterKey: "seat_class",
			DisplayNameKO: "좌석 등급", DisplayNameEN: "Seat Class", UIControlType: "RADIO_GROUP", Icon: "💺", SortOrder: 2,
			Options: []domain.DomainFilterOption{
				{ID: "STANDARD", LabelKO: "일반실 (Standard)", LabelEN: "Standard Class", Value: "STANDARD"},
				{ID: "FIRST", LabelKO: "특실 / 그린샤 (First Class)", LabelEN: "First Class", Value: "FIRST"},
			},
			IsActive: true,
		},
	}

	// 4. CAR Filters
	s.FilterDefinitions["CAR"] = []domain.DomainFilterDefinition{
		{
			ID: "flt_car_category", DomainType: domain.DomainCar, FilterGroup: "POPULAR", FilterKey: "vehicle_category",
			DisplayNameKO: "차종 및 크기", DisplayNameEN: "Vehicle Category", UIControlType: "CHECKBOX_LIST", Icon: "🚗", SortOrder: 1,
			Options: []domain.DomainFilterOption{
				{ID: "COMPACT", LabelKO: "경형 / 소형", LabelEN: "Compact", Value: "COMPACT"},
				{ID: "SEDAN", LabelKO: "중형 세단", LabelEN: "Sedan", Value: "SEDAN"},
				{ID: "SUV", LabelKO: "SUV", LabelEN: "SUV", Value: "SUV"},
				{ID: "VAN", LabelKO: "승합 / 패밀리 밴", LabelEN: "Minivan", Value: "VAN"},
				{ID: "LUXURY", LabelKO: "수입 / 럭셔리", LabelEN: "Luxury", Value: "LUXURY"},
			},
			IsActive: true,
		},
		{
			ID: "flt_car_insurance", DomainType: domain.DomainCar, FilterGroup: "INSURANCE", FilterKey: "insurance_super_cdw",
			DisplayNameKO: "보험 플랜", DisplayNameEN: "Insurance Plan", UIControlType: "CHECKBOX_LIST", Icon: "🛡️", SortOrder: 2,
			Options: []domain.DomainFilterOption{
				{ID: "super_cdw", LabelKO: "완전자차 안심 플랜 (고객 면책금 0원)", LabelEN: "Super CDW (Zero Deductible)", Value: true},
			},
			IsActive: true,
		},
		{
			ID: "flt_car_transmission", DomainType: domain.DomainCar, FilterGroup: "SPEC", FilterKey: "transmission",
			DisplayNameKO: "변속기", DisplayNameEN: "Transmission", UIControlType: "RADIO_GROUP", Icon: "⚙️", SortOrder: 3,
			Options: []domain.DomainFilterOption{
				{ID: "AUTO", LabelKO: "자동 (오토)", LabelEN: "Automatic", Value: "AUTO"},
				{ID: "MANUAL", LabelKO: "수동 (스틱)", LabelEN: "Manual", Value: "MANUAL"},
			},
			IsActive: true,
		},
	}

	// 5. TRANSFER Filters
	s.FilterDefinitions["TRANSFER"] = []domain.DomainFilterDefinition{
		{
			ID: "flt_transfer_tier", DomainType: domain.DomainTransfer, FilterGroup: "POPULAR", FilterKey: "vehicle_tier",
			DisplayNameKO: "차량 등급", DisplayNameEN: "Vehicle Tier", UIControlType: "CHECKBOX_LIST", Icon: "🚖", SortOrder: 1,
			Options: []domain.DomainFilterOption{
				{ID: "COMFORT_SEDAN", LabelKO: "컴포트 세단 (최대 3인, 가방 2개)", LabelEN: "Comfort Sedan", Value: "COMFORT_SEDAN"},
				{ID: "BUSINESS_VAN", LabelKO: "비즈니스 밴 (최대 6인, 가방 6개)", LabelEN: "Business Van", Value: "BUSINESS_VAN"},
				{ID: "LUXURY_FIRST", LabelKO: "럭셔리 VIP 리무진", LabelEN: "First-Class Luxury", Value: "LUXURY_FIRST"},
			},
			IsActive: true,
		},
	}

	// 6. ACTIVITY Filters
	s.FilterDefinitions["ACTIVITY"] = []domain.DomainFilterDefinition{
		{
			ID: "flt_activity_category", DomainType: domain.DomainActivity, FilterGroup: "POPULAR", FilterKey: "category",
			DisplayNameKO: "카테고리 분류", DisplayNameEN: "Category", UIControlType: "CHECKBOX_LIST", Icon: "🎟️", SortOrder: 1,
			Options: []domain.DomainFilterOption{
				{ID: "THEME_PARK", LabelKO: "테마파크 / 놀이공원", LabelEN: "Theme Parks", Value: "THEME_PARK"},
				{ID: "TICKET", LabelKO: "전망대 & 랜드마크 입장권", LabelEN: "Attraction Tickets", Value: "TICKET"},
				{ID: "DAY_TOUR", LabelKO: "1일 버스 투어 / 근교 여행", LabelEN: "Day Tours", Value: "DAY_TOUR"},
				{ID: "ESIM", LabelKO: "해외 데이터 eSIM / 유심", LabelEN: "eSIM", Value: "ESIM"},
			},
			IsActive: true,
		},
		{
			ID: "flt_activity_policy", DomainType: domain.DomainActivity, FilterGroup: "POLICY", FilterKey: "booking_policy",
			DisplayNameKO: "예약 및 취소", DisplayNameEN: "Booking Policy", UIControlType: "CHECKBOX_LIST", Icon: "⚡", SortOrder: 2,
			Options: []domain.DomainFilterOption{
				{ID: "instant_confirmation", LabelKO: "예약 즉시 확정 발권", LabelEN: "Instant Confirmation", Value: true},
				{ID: "free_cancellation", LabelKO: "사용 전 100% 무료 취소 가능", LabelEN: "Free Cancellation", Value: true},
			},
			IsActive: true,
		},
	}

	// 7. PACKAGE Filters
	s.FilterDefinitions["PACKAGE"] = []domain.DomainFilterDefinition{
		{
			ID: "flt_package_savings", DomainType: domain.DomainPackage, FilterGroup: "SAVINGS", FilterKey: "savings_rate",
			DisplayNameKO: "결합 특별 할인율", DisplayNameEN: "Bundle Savings", UIControlType: "CHECKBOX_LIST", Icon: "💸", SortOrder: 1,
			Options: []domain.DomainFilterOption{
				{ID: "save_20", LabelKO: "20% 이상 결합 할인", LabelEN: "20%+ Savings", Value: 20},
				{ID: "save_15", LabelKO: "15% 이상 결합 할인", LabelEN: "15%+ Savings", Value: 15},
				{ID: "save_10", LabelKO: "10% 이상 결합 할인", LabelEN: "10%+ Savings", Value: 10},
			},
			IsActive: true,
		},
	}
}
