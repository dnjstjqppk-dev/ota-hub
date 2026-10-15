package repository

import (
	"fmt"
	"strings"
	"sync"
	"time"
	"getfortrip/backend/internal/domain"
	"getfortrip/backend/internal/engine"
)

type Store struct {
	mu           sync.RWMutex
	Users        map[string]domain.User
	Travelers    map[string][]domain.SavedTraveler
	ExchangeRate map[domain.Currency]domain.ExchangeRate
	Hotels       map[string]domain.Hotel
	HotelRooms   map[string]domain.HotelRoom
	Flights      map[string]domain.Flight
	Trains       map[string]domain.Train
	Cars         map[string]domain.CarRental
	Transfers    map[string]domain.AirportTransfer
	Activities   map[string]domain.Activity
	Packages     map[string]domain.DynamicPackage
	Promotions   map[string]domain.Promotion
	Bookings     map[string]domain.Booking
	TripMoments  map[string]domain.TripMoment
	Reviews      map[string][]domain.Review
	AuditLogs    []domain.AdminAuditLog
	Notices      []domain.Notice
	CSTickets    map[string]domain.CSTicket
}

func NewStore() *Store {
	s := &Store{
		Users:        make(map[string]domain.User),
		Travelers:    make(map[string][]domain.SavedTraveler),
		ExchangeRate: make(map[domain.Currency]domain.ExchangeRate),
		Hotels:       make(map[string]domain.Hotel),
		HotelRooms:   make(map[string]domain.HotelRoom),
		Flights:      make(map[string]domain.Flight),
		Trains:       make(map[string]domain.Train),
		Cars:         make(map[string]domain.CarRental),
		Transfers:    make(map[string]domain.AirportTransfer),
		Activities:   make(map[string]domain.Activity),
		Packages:     make(map[string]domain.DynamicPackage),
		Promotions:   make(map[string]domain.Promotion),
		Bookings:     make(map[string]domain.Booking),
		TripMoments:  make(map[string]domain.TripMoment),
		Reviews:      make(map[string][]domain.Review),
		AuditLogs:    make([]domain.AdminAuditLog, 0),
		Notices:      make([]domain.Notice, 0),
		CSTickets:    make(map[string]domain.CSTicket),
	}
	s.seedDefaultData()
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

	// Activities & eSIM
	act1 := domain.Activity{
		ID:                  "80000000-0000-0000-0000-000000000001",
		Title:               "도쿄 디즈니랜드 / 디즈니씨 1일 전자 여권 (QR코드 직입장)",
		Category:            "TICKET",
		City:                "도쿄",
		Country:             "일본",
		PriceKRW:            89000,
		ReviewScore:         4.9,
		ReviewCount:         8740,
		InstantConfirmation: true,
		ThumbnailURL:        "https://images.unsplash.com/photo-1546707012-c46675f12716?w=800",
		Description:         "현장 티켓 교환 없이 스마트폰 QR코드로 직입장 가능한 공식 1일 여권.",
	}
	act2 := domain.Activity{
		ID:                  "80000000-0000-0000-0000-000000000003",
		Title:               "일본 무제한 5G 매일 2GB+속도제어 로밍 eSIM (3일~10일)",
		Category:            "ESIM",
		City:                "도쿄",
		Country:             "일본",
		PriceKRW:            6500,
		ReviewScore:         4.8,
		ReviewCount:         15400,
		InstantConfirmation: true,
		ThumbnailURL:        "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800",
		Description:         "이메일로 받은 QR코드 스캔 즉시 개통되는 고속 Docomo 5G eSIM.",
	}
	s.Activities[act1.ID] = act1
	s.Activities[act2.ID] = act2

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

	var results []domain.Hotel
	for _, h := range s.Hotels {
		if city != "" && !strings.Contains(h.City, city) && !strings.Contains(h.NameKO, city) {
			continue
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

// CreateDraftBooking creates draft booking with 15min inventory lock
func (s *Store) CreateDraftBooking(b domain.Booking) (*domain.Booking, error) {
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
		"total_gmv_krw":   totalGMV,
		"total_bookings":  len(s.Bookings),
		"domain_breakdown": domainCounts,
		"status_breakdown": statusCounts,
		"active_users":    len(s.Users),
		"timestamp":       time.Now(),
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
	var matched []domain.SuggestItem
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

