package repository

import "getfortrip/backend/internal/domain"

// Store is the persistence interface for the getfortrip platform.
// Implementations: InMemoryStore (existing map-backed Store) and PostgresStore.
type Store interface {
	// --- Catalog ---
	SearchHotels(city string, star int, minPrice, maxPrice float64, freeCancel, breakfast bool) []domain.Hotel
	GetHotelDetail(id string) (*domain.Hotel, error)
	GetFlightDetail(id string) (*domain.Flight, error)
	GetTrainDetail(id string) (*domain.Train, error)
	GetCarDetail(id string) (*domain.CarRental, error)
	GetTransferDetail(id string) (*domain.AirportTransfer, error)
	GetActivityDetail(id string) (*domain.Activity, error)
	GetPackageDetail(id string) (*domain.DynamicPackage, error)

	// --- Listings (replaces direct map iteration) ---
	GetHotels() []domain.Hotel
	GetFlights() []domain.Flight
	GetTrains() []domain.Train
	GetCars() []domain.CarRental
	GetTransfers() []domain.AirportTransfer
	GetActivities() []domain.Activity
	GetPackages() []domain.DynamicPackage
	GetPromotions() []domain.Promotion
	GetTripMoments() []domain.TripMoment
	SaveTripMoment(m domain.TripMoment) error

	// --- Bookings ---
	GetBooking(id string) (*domain.Booking, bool)
	SaveBooking(booking domain.Booking) error
	GetBookings() []domain.Booking
	GetBookingsByUser(userId string) []domain.Booking
	TransitionBookingStatus(id string, status domain.BookingStatus, reason, actor string) (*domain.Booking, error)
	CreateDraftBooking(b domain.Booking) (*domain.Booking, error)

	// --- Users & Travelers ---
	GetUser(id string) (*domain.User, bool)
	CreateUser(u domain.User) error
	GetUserByEmail(email string) (*domain.User, bool)
	GetSavedTravelers(userId string) ([]domain.SavedTraveler, error)
	SaveSavedTraveler(t domain.SavedTraveler) error

	// --- FX ---
	GetFXRates() []domain.ExchangeRate
	GetFXRate(currency domain.Currency) (domain.ExchangeRate, bool)
	SaveFXRate(r domain.ExchangeRate) error

	// --- Admin & CS ---
	GetDashboardStats() map[string]any
	GetAuditLogs() []domain.AdminAuditLog
	CreateAuditLog(log domain.AdminAuditLog) error
	GetNotices() []domain.Notice
	CreateNotice(n domain.Notice) error
	GetCSTickets() []domain.CSTicket
	CreateCSTicket(t domain.CSTicket) error

	// --- Search & Suggest ---
	SearchSuggest(q, domain string) []domain.SuggestItem
	GetDomainFilters(domainType string) []domain.DomainFilterDefinition
	GetAllFilters() map[string][]domain.DomainFilterDefinition

	// --- Curation & Referral ---
	GetCuratedProducts(platform domain.OTAPlatform, limit int) []*domain.UniversalProduct
	GetUniversalProduct(id string) *domain.UniversalProduct

	// --- Curation persistence (ingest pipeline) ---
	SaveRawScrape(req domain.IngestRawRequest) string
	UpsertUniversalProduct(p *domain.UniversalProduct)
	SaveCuratedContent(c *domain.CuratedContent)
	SaveAffiliateReferral(a *domain.AffiliateReferral)
	LogWebhookDispatch(logEntry *domain.TravelCheckinWebhookLog)

	// --- Lifecycle ---
	Close() error
}
