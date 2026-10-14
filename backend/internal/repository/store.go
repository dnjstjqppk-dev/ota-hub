package repository

import (
	"fmt"
	"strings"
	"sync"
	"time"
	"tripclone/backend/internal/domain"
	"tripclone/backend/internal/engine"
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
		Email:             "vip@tripclone.com",
		FullName:          "김트립 (VIP 다이아몬드)",
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
		{ID: "t1", UserID: u1.ID, LastNameEN: "KIM", FirstNameEN: "TRIP", BirthDate: "1990-05-15", Gender: "M", PassportNumber: "M12345678", Nationality: "KOR"},
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
		Tags:         []string{"Trip.Best 2026", "초고층 시티뷰", "럭셔리 호캉스"},
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
		BookingCode:         "TRIP-20261101-7781",
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
		PrimaryContactName:  "김트립",
		PrimaryContactEmail: "vip@tripclone.com",
		PrimaryContactPhone: "+82-10-1234-5678",
		ConfirmationNumber:  "VOUCH-SG-88219",
		VoucherURL:          "https://voucher.tripclone.com/v/TRIP-20261101-7781",
		CreatedAt:           time.Now().Add(-48 * time.Hour),
		UpdatedAt:           time.Now().Add(-48 * time.Hour),
	}
	b2 := domain.Booking{
		ID:                  "30000000-0000-0000-0000-000000000002",
		BookingCode:         "TRIP-20261102-1209",
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
		PrimaryContactName:  "김트립",
		PrimaryContactEmail: "vip@tripclone.com",
		PrimaryContactPhone: "+82-10-1234-5678",
		ConfirmationNumber:  "PNR-KE-79482X",
		CreatedAt:           time.Now().Add(-24 * time.Hour),
		UpdatedAt:           time.Now().Add(-24 * time.Hour),
	}
	b3 := domain.Booking{
		ID:                  "30000000-0000-0000-0000-000000000003",
		BookingCode:         "TRIP-20261103-9941",
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
		PrimaryContactName:  "김트립",
		PrimaryContactEmail: "vip@tripclone.com",
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
		Content:    "기념일을 맞아 다녀온 시그니엘 서울! 살롱 드 시그니엘 라운지에서 즐기는 샴페인과 초고층 야경은 잊을 수 없네요. 트립닷컴 특가 쿠폰으로 조식까지 알차게 다녀왔어요.",
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
	b.BookingCode = fmt.Sprintf("TRIP-%s-%04d", time.Now().Format("20060102"), time.Now().Unix()%10000)
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
		b.VoucherURL = fmt.Sprintf("https://voucher.tripclone.com/v/%s", b.BookingCode)
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

