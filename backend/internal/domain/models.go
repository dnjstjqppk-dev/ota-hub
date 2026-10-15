package domain

import (
	"time"
)

// Currency types
type Currency string

const (
	CurrencyKRW Currency = "KRW"
	CurrencyUSD Currency = "USD"
	CurrencyJPY Currency = "JPY"
	CurrencyEUR Currency = "EUR"
	CurrencyCNY Currency = "CNY"
	CurrencyGBP Currency = "GBP"
)

// User tiers
type UserTier string

const (
	TierSilver      UserTier = "SILVER"
	TierGold        UserTier = "GOLD"
	TierPlatinum    UserTier = "PLATINUM"
	TierDiamond     UserTier = "DIAMOND"
	TierDiamondPlus UserTier = "DIAMOND_PLUS"
)

// Domain types
type DomainType string

const (
	DomainHotel    DomainType = "HOTEL"
	DomainFlight   DomainType = "FLIGHT"
	DomainTrain    DomainType = "TRAIN"
	DomainCar      DomainType = "CAR"
	DomainTransfer DomainType = "TRANSFER"
	DomainActivity DomainType = "ACTIVITY"
	DomainPackage  DomainType = "PACKAGE"
)

// Booking statuses
type BookingStatus string

const (
	StatusDraft          BookingStatus = "DRAFT"
	StatusPendingPayment BookingStatus = "PENDING_PAYMENT"
	StatusPaid           BookingStatus = "PAID"
	StatusIssuing        BookingStatus = "ISSUING"
	StatusConfirmed      BookingStatus = "CONFIRMED"
	StatusCompleted      BookingStatus = "COMPLETED"
	StatusCancelReq      BookingStatus = "CANCEL_REQUESTED"
	StatusCancelled      BookingStatus = "CANCELLED"
	StatusRefunded       BookingStatus = "REFUNDED"
	StatusIssueFailed    BookingStatus = "ISSUE_FAILED"
)

// ExchangeRate represents FX rates against KRW
type ExchangeRate struct {
	Currency  Currency  `json:"currency"`
	RateToKRW float64   `json:"rate_to_krw"`
	Symbol    string    `json:"symbol"`
	UpdatedAt time.Time `json:"updated_at"`
}

// User model
type User struct {
	ID                string    `json:"id"`
	Email             string    `json:"email"`
	FullName          string    `json:"full_name"`
	PhoneNumber       string    `json:"phone_number"`
	PreferredCurrency Currency  `json:"preferred_currency"`
	PreferredLanguage string    `json:"preferred_language"`
	Tier              UserTier  `json:"tier"`
	TripCoins         int       `json:"trip_coins"`
	AvatarURL         string    `json:"avatar_url"`
	CreatedAt         time.Time `json:"created_at"`
}

// SavedTraveler
type SavedTraveler struct {
	ID             string    `json:"id"`
	UserID         string    `json:"user_id"`
	LastNameEN     string    `json:"last_name_en"`
	FirstNameEN    string    `json:"first_name_en"`
	BirthDate      string    `json:"birth_date"`
	Gender         string    `json:"gender"`
	PassportNumber string    `json:"passport_number"`
	PassportExpiry string    `json:"passport_expiry"`
	Nationality    string    `json:"nationality"`
	CreatedAt      time.Time `json:"created_at"`
}

// Hotel & Room
type Hotel struct {
	ID                 string            `json:"id"`
	NameKO             string            `json:"name_ko"`
	NameEN             string            `json:"name_en"`
	City               string            `json:"city"`
	Country            string            `json:"country"`
	Address            string            `json:"address"`
	Latitude           float64           `json:"latitude"`
	Longitude          float64           `json:"longitude"`
	StarRating         int               `json:"star_rating"`
	PropertyType       string            `json:"property_type"` // HOTEL, RESORT, APARTMENT, VILLA, HOSTEL
	ReviewScore        float64           `json:"review_score"`
	ReviewCount        int               `json:"review_count"`
	CleanlinessScore   float64           `json:"cleanliness_score"`
	LocationScore      float64           `json:"location_score"`
	ServiceScore       float64           `json:"service_score"`
	FacilitiesScore    float64           `json:"facilities_score"`
	Neighborhood       string            `json:"neighborhood"`
	SubwayNearby       string            `json:"subway_nearby"`
	DistanceToCenterKM float64           `json:"distance_to_center_km"`
	CheckInTime        string            `json:"check_in_time"`
	CheckOutTime       string            `json:"check_out_time"`
	Policies           map[string]string `json:"policies"`
	ThumbnailURL       string            `json:"thumbnail_url"`
	Images             []string          `json:"images"`
	Amenities          []string          `json:"amenities"`
	Description        string            `json:"description"`
	Tags               []string          `json:"tags"`
	Rooms              []HotelRoom       `json:"rooms,omitempty"`
}

type HotelRatePlan struct {
	ID                   string  `json:"id"`
	RoomID               string  `json:"room_id"`
	Name                 string  `json:"name"`
	MealPlan             string  `json:"meal_plan"`             // ROOM_ONLY, BREAKFAST_FOR_1, BREAKFAST_FOR_2
	CancellationType     string  `json:"cancellation_type"`     // FREE, CONDITIONAL, NON_REFUNDABLE
	CancellationDeadline string  `json:"cancellation_deadline"` // e.g. "2026-10-28 18:00"
	PaymentType          string  `json:"payment_type"`          // PAY_NOW, PAY_AT_HOTEL
	BasePriceKRW         float64 `json:"base_price_krw"`
	TaxAndFeesKRW        float64 `json:"tax_and_fees_krw"`
	OriginalPriceKRW     float64 `json:"original_price_krw"`
}

type HotelRoom struct {
	ID                 string          `json:"id"`
	HotelID            string          `json:"hotel_id"`
	Name               string          `json:"name"`
	BedType            string          `json:"bed_type"`
	MaxGuests          int             `json:"max_guests"`
	RoomSizeSqm        float64         `json:"room_size_sqm"`
	ViewType           string          `json:"view_type"`
	HasBathtub         bool            `json:"has_bathtub"`
	HasWindow          bool            `json:"has_window"`
	IsSmoking          bool            `json:"is_smoking"`
	BasePriceKRW       float64         `json:"base_price_krw"`
	IsFreeCancellation bool            `json:"is_free_cancellation"`
	IncludesBreakfast  bool            `json:"includes_breakfast"`
	AvailableStock     int             `json:"available_stock"`
	Images             []string        `json:"images"`
	RatePlans          []HotelRatePlan `json:"rate_plans,omitempty"`
}

// Flight
type Flight struct {
	ID                string    `json:"id"`
	FlightNumber      string    `json:"flight_number"`
	AirlineName       string    `json:"airline_name"`
	AirlineCode       string    `json:"airline_code"`
	AirlineLogo       string    `json:"airline_logo"`
	DepartureAirport  string    `json:"departure_airport"`
	ArrivalAirport    string    `json:"arrival_airport"`
	DepartureCity     string    `json:"departure_city"`
	ArrivalCity       string    `json:"arrival_city"`
	DepartureTime     time.Time `json:"departure_time"`
	ArrivalTime       time.Time `json:"arrival_time"`
	DurationMinutes   int       `json:"duration_minutes"`
	CabinClass        string    `json:"cabin_class"`
	Stops             int       `json:"stops"`               // 0: 직항, 1: 1회 경유, 2: 2회 경유
	DepartureTimeSlot string    `json:"departure_time_slot"` // EARLY_MORNING, MORNING, AFTERNOON, EVENING
	BasePriceKRW      float64   `json:"base_price_krw"`
	FreeBaggageKG     int       `json:"free_baggage_kg"`
	AvailableSeats    int       `json:"available_seats"`
	IsRefundable      bool      `json:"is_refundable"`
	IsChangeable      bool      `json:"is_changeable"`
	RefundFeeKRW      float64   `json:"refund_fee_krw"`
}

// Train
type Train struct {
	ID               string    `json:"id"`
	TrainNumber      string    `json:"train_number"`
	TrainType        string    `json:"train_type"`
	DepartureStation string    `json:"departure_station"`
	ArrivalStation   string    `json:"arrival_station"`
	DepartureTime    time.Time `json:"departure_time"`
	ArrivalTime      time.Time `json:"arrival_time"`
	DurationMinutes  int       `json:"duration_minutes"`
	SeatClass        string    `json:"seat_class"`
	PriceKRW         float64   `json:"price_krw"`
	AvailableSeats   int       `json:"available_seats"`
}

// CarRental
type CarRental struct {
	ID                string  `json:"id"`
	CompanyName       string  `json:"company_name"`
	VehicleModel      string  `json:"vehicle_model"`
	VehicleType       string  `json:"vehicle_type"`
	Seats             int     `json:"seats"`
	Transmission      string  `json:"transmission"`
	DailyPriceKRW     float64 `json:"daily_price_krw"`
	PickupLocation    string  `json:"pickup_location"`
	InsuranceIncluded bool    `json:"insurance_included"`
	ImageURL          string  `json:"image_url"`
	AvailableStock    int     `json:"available_stock"`
}

// AirportTransfer
type AirportTransfer struct {
	ID              string  `json:"id"`
	ServiceTitle    string  `json:"service_title"`
	AirportCode     string  `json:"airport_code"`
	DestinationArea string  `json:"destination_area"`
	VehicleClass    string  `json:"vehicle_class"`
	MaxPassengers   int     `json:"max_passengers"`
	MaxLuggage      int     `json:"max_luggage"`
	PriceKRW        float64 `json:"price_krw"`
	FlightTracking  bool    `json:"flight_tracking"`
	ImageURL        string  `json:"image_url"`
}

// Activity & eSIM
type Activity struct {
	ID                  string                   `json:"id"`
	Title               string                   `json:"title"`
	Category            string                   `json:"category"`
	City                string                   `json:"city"`
	Country             string                   `json:"country"`
	PriceKRW            float64                  `json:"price_krw"`
	ReviewScore         float64                  `json:"review_score"`
	ReviewCount         int                      `json:"review_count"`
	InstantConfirmation bool                     `json:"instant_confirmation"`
	FreeCancellation    bool                     `json:"free_cancellation"`
	DurationType        string                   `json:"duration_type"` // UNDER_2H, HALF_DAY, FULL_DAY, MULTI_DAY
	GuideLanguage       string                   `json:"guide_language"` // KO, EN, JA, ZH
	VoucherType         string                   `json:"voucher_type"`   // QR_CODE, BARCODE, PHYSICAL_EXCHANGE
	ThumbnailURL        string                   `json:"thumbnail_url"`
	Description         string                   `json:"description"`
	Highlights          []string                 `json:"highlights"`
	Itinerary           []map[string]interface{} `json:"itinerary"`
	Inclusions          []string                 `json:"inclusions"`
	Exclusions          []string                 `json:"exclusions"`
	HowToUse            string                   `json:"how_to_use"`
	Packages            []map[string]interface{} `json:"packages"`
	Details             any                      `json:"details"`
}

// Package
type DynamicPackage struct {
	ID                  string  `json:"id"`
	Title               string  `json:"title"`
	DestinationCity     string  `json:"destination_city"`
	HotelID             string  `json:"hotel_id"`
	FlightID            string  `json:"flight_id"`
	PackageDiscountRate float64 `json:"package_discount_rate"`
	TotalOriginalKRW    float64 `json:"total_original_krw"`
	TotalPackageKRW     float64 `json:"total_package_krw"`
	ThumbnailURL        string  `json:"thumbnail_url"`
	Hotel               *Hotel  `json:"hotel,omitempty"`
	Flight              *Flight `json:"flight,omitempty"`
}

// Promotion / Coupon
type Promotion struct {
	ID                string      `json:"id"`
	Code              string      `json:"code"`
	Title             string      `json:"title"`
	DiscountType      string      `json:"discount_type"` // PERCENTAGE, FIXED_AMOUNT
	DiscountValue     float64     `json:"discount_value"`
	MinOrderAmountKRW float64     `json:"min_order_amount_krw"`
	MaxDiscountKRW    float64     `json:"max_discount_krw"`
	ApplicableDomain  *DomainType `json:"applicable_domain"`
	ValidFrom         time.Time   `json:"valid_from"`
	ValidUntil        time.Time   `json:"valid_until"`
	IsActive          bool        `json:"is_active"`
}

// Booking & Items
type Booking struct {
	ID                    string        `json:"id"`
	BookingCode           string        `json:"booking_code"`
	UserID                string        `json:"user_id"`
	DomainType            DomainType    `json:"domain_type"`
	Status                BookingStatus `json:"status"`
	BaseAmountKRW         float64       `json:"base_amount_krw"`
	TaxAmountKRW          float64       `json:"tax_amount_krw"`
	ServiceFeeKRW         float64       `json:"service_fee_krw"`
	DiscountAmountKRW     float64       `json:"discount_amount_krw"`
	TripCoinsUsed         int           `json:"trip_coins_used"`
	FinalAmountKRW        float64       `json:"final_amount_krw"`
	PaidCurrency          Currency      `json:"paid_currency"`
	PaidCurrencyAmount    float64       `json:"paid_currency_amount"`
	PrimaryContactName    string        `json:"primary_contact_name"`
	PrimaryContactEmail   string        `json:"primary_contact_email"`
	PrimaryContactPhone   string        `json:"primary_contact_phone"`
	TravelerDetails       []any         `json:"traveler_details"`
	SpecialRequests       string        `json:"special_requests"`
	ConfirmationNumber    string        `json:"confirmation_number"`
	VoucherURL            string        `json:"voucher_url"`
	InventoryLockExpireAt time.Time     `json:"inventory_lock_expires_at"`
	CreatedAt             time.Time     `json:"created_at"`
	UpdatedAt             time.Time     `json:"updated_at"`
	Items                 []BookingItem `json:"items,omitempty"`
}

type BookingItem struct {
	ID              string    `json:"id"`
	BookingID       string    `json:"booking_id"`
	ItemReferenceID string    `json:"item_reference_id"`
	ItemName        string    `json:"item_name"`
	Quantity        int       `json:"quantity"`
	StartDate       time.Time `json:"start_date"`
	EndDate         time.Time `json:"end_date"`
}

// Community: Trip Moment & Review
type TripMoment struct {
	ID                string      `json:"id"`
	UserID            string      `json:"user_id"`
	UserName          string      `json:"user_name"`
	UserAvatar        string      `json:"user_avatar"`
	City              string      `json:"city"`
	Title             string      `json:"title"`
	Content           string      `json:"content"`
	Photos            []string    `json:"photos"`
	LinkedProductType *DomainType `json:"linked_product_type"`
	LinkedProductID   *string     `json:"linked_product_id"`
	LikesCount        int         `json:"likes_count"`
	IsFeatured        bool        `json:"is_featured"`
	CreatedAt         time.Time   `json:"created_at"`
}

type Review struct {
	ID         string     `json:"id"`
	UserID     string     `json:"user_id"`
	UserName   string     `json:"user_name"`
	DomainType DomainType `json:"domain_type"`
	TargetID   string     `json:"target_id"`
	Rating     float64    `json:"rating"`
	Content    string     `json:"content"`
	Photos     []string   `json:"photos"`
	CreatedAt  time.Time  `json:"created_at"`
}

// Admin Audit Log
type AdminAuditLog struct {
	ID             string    `json:"id"`
	AdminUsername  string    `json:"admin_username"`
	Action         string    `json:"action"`
	TargetResource string    `json:"target_resource"`
	TargetID       string    `json:"target_id"`
	BeforeState    any       `json:"before_state"`
	AfterState     any       `json:"after_state"`
	CreatedAt      time.Time `json:"created_at"`
}

// Notice & CS Ticket
type Notice struct {
	ID           string    `json:"id"`
	Title        string    `json:"title"`
	Content      string    `json:"content"`
	IsEmergency  bool      `json:"is_emergency"`
	BannerActive bool      `json:"banner_active"`
	CreatedAt    time.Time `json:"created_at"`
}

type CSTicket struct {
	ID         string    `json:"id"`
	UserID     string    `json:"user_id"`
	BookingID  string    `json:"booking_id"`
	Subject    string    `json:"subject"`
	Category   string    `json:"category"`
	Status     string    `json:"status"` // OPEN, IN_PROGRESS, RESOLVED
	Messages   []any     `json:"messages"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// Autocomplete & Suggest Model (getfortrip specification)
type SuggestItem struct {
	ID        string `json:"id"`
	Domain    string `json:"domain"`     // hotels, flights, trains, cars, attractions, packages
	Type      string `json:"type"`       // city, airport, hotel, station, landmark, activity, package
	Title     string `json:"title"`      // e.g. "도쿄 (Tokyo)"
	Subtitle  string `json:"subtitle"`   // e.g. "일본 간토 지방, 도쿄도"
	Code      string `json:"code"`       // e.g. "TYO", "HND", "ICN"
	Badge     string `json:"badge"`      // e.g. "도시", "공항", "5성급 호텔", "KTX 역"
	Icon      string `json:"icon"`       // e.g. "city", "plane", "hotel", "train", "car", "ticket", "landmark"
	TargetURL string `json:"target_url"` // e.g. "/hotels/list?city=도쿄"
	CountInfo string `json:"count_info"` // e.g. "숙소 2,450개"
}

// Faceted Filter Models (getfortrip specification)
type DomainFilterOption struct {
	ID        string  `json:"id"`
	LabelKO   string  `json:"label_ko"`
	LabelEN   string  `json:"label_en"`
	Value     any     `json:"value,omitempty"`
	Min       float64 `json:"min,omitempty"`
	Max       float64 `json:"max,omitempty"`
	CountHint int     `json:"count_hint,omitempty"`
	Icon      string  `json:"icon,omitempty"`
	Alliance  string  `json:"alliance,omitempty"`
}

type DomainFilterDefinition struct {
	ID                    string               `json:"id"`
	DomainType            DomainType           `json:"domain_type"` // HOTEL, FLIGHT, TRAIN, CAR, TRANSFER, ACTIVITY, PACKAGE
	FilterGroup           string               `json:"filter_group"`
	FilterKey             string               `json:"filter_key"`
	DisplayNameKO         string               `json:"display_name_ko"`
	DisplayNameEN         string               `json:"display_name_en"`
	UIControlType         string               `json:"ui_control_type"` // CHECKBOX_LIST, RADIO_GROUP, RANGE_SLIDER, BOOLEAN_SWITCH
	Icon                  string               `json:"icon"`
	SortOrder             int                  `json:"sort_order"`
	IsCollapsedByDefault  bool                 `json:"is_collapsed_by_default"`
	IsSearchable          bool                 `json:"is_searchable"`
	Options               []DomainFilterOption `json:"options"`
	IsActive              bool                 `json:"is_active"`
}


