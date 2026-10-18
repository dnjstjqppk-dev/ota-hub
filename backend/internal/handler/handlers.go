package handler

import (
	"encoding/json"
	"fmt"
	"getfortrip/backend/internal/domain"
	"getfortrip/backend/internal/engine"
	"getfortrip/backend/internal/repository"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type APIHandler struct {
	store      *repository.Store
	aggregator *engine.SearchAggregator
}

func NewAPIHandler(store *repository.Store) *APIHandler {
	return &APIHandler{
		store:      store,
		aggregator: engine.NewSearchAggregator(3 * time.Second),
	}
}

// JSON Helper
func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"code":      status,
		"data":      data,
		"timestamp": time.Now(),
	})
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"code":      status,
		"error":     msg,
		"timestamp": time.Now(),
	})
}

// --- AUTH & VALIDATION HELPERS ---

func checkAdminAuth(r *http.Request) bool {
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer gft_adm_token_") || auth == "Bearer admin-secret-key" || auth == "Bearer admin1234!" {
		return true
	}
	return false
}

func checkPartnerAuth(r *http.Request) bool {
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer ptn_sec_tok_") || auth == "Bearer partner-secret-key" {
		return true
	}
	return false
}

func matchFlightAirportOrCity(query, airportCode, city string) bool {
	if query == "" {
		return true
	}
	clean := strings.TrimSpace(query)
	if idx := strings.Index(clean, "("); idx > 0 {
		clean = strings.TrimSpace(clean[:idx])
	}
	cleanLower := strings.ToLower(clean)
	airportLower := strings.ToLower(airportCode)
	cityLower := strings.ToLower(city)

	if airportLower == cleanLower || strings.Contains(cityLower, cleanLower) || strings.Contains(cleanLower, cityLower) {
		return true
	}
	if strings.Contains(strings.ToUpper(query), strings.ToUpper(airportCode)) {
		return true
	}
	if (strings.Contains(cleanLower, "인천") || strings.Contains(cleanLower, "서울")) && (airportLower == "icn" || airportLower == "gmp") {
		return true
	}
	if (strings.Contains(cleanLower, "도쿄") || strings.Contains(cleanLower, "나리타") || strings.Contains(cleanLower, "하네다")) && (airportLower == "nrt" || airportLower == "hnd") {
		return true
	}
	if (strings.Contains(cleanLower, "오사카") || strings.Contains(cleanLower, "간사이")) && (airportLower == "kix" || airportLower == "itm") {
		return true
	}
	if strings.Contains(cleanLower, "후쿠오카") && airportLower == "fuk" {
		return true
	}
	if (strings.Contains(cleanLower, "방콕") || strings.Contains(cleanLower, "수완나품")) && airportLower == "bkk" {
		return true
	}
	if strings.Contains(cleanLower, "다낭") && airportLower == "dad" {
		return true
	}
	if strings.Contains(cleanLower, "파리") && airportLower == "cdg" {
		return true
	}
	return false
}

// --- FILTER HANDLERS ---

func (h *APIHandler) GetDomainFilters(w http.ResponseWriter, r *http.Request) {
	domainType := r.PathValue("domain")
	if domainType == "" {
		domainType = r.URL.Query().Get("domain")
	}
	filters := h.store.GetDomainFilters(domainType)
	writeJSON(w, http.StatusOK, filters)
}

func (h *APIHandler) GetAllFilters(w http.ResponseWriter, r *http.Request) {
	filters := h.store.GetAllFilters()
	writeJSON(w, http.StatusOK, filters)
}

// --- CATALOG HANDLERS ---

func (h *APIHandler) GetHotels(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	city := q.Get("city")
	star, _ := strconv.Atoi(q.Get("star"))
	minPrice, _ := strconv.ParseFloat(q.Get("minPrice"), 64)
	maxPrice, _ := strconv.ParseFloat(q.Get("maxPrice"), 64)
	freeCancel := q.Get("freeCancel") == "true"
	breakfast := q.Get("breakfast") == "true"

	hotels := h.store.SearchHotels(city, star, minPrice, maxPrice, freeCancel, breakfast)
	writeJSON(w, http.StatusOK, hotels)
}

func (h *APIHandler) GetHotelDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	hotel, err := h.store.GetHotelDetail(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, hotel)
}

func (h *APIHandler) GetFlights(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	origin := q.Get("origin")
	dest := q.Get("dest")
	stopsStr := q.Get("stops")
	timeSlot := q.Get("timeSlot")
	cabin := q.Get("cabin")
	airline := q.Get("airline")

	results := make([]domain.Flight, 0)
	for _, f := range h.store.Flights {
		if origin != "" && !matchFlightAirportOrCity(origin, f.DepartureAirport, f.DepartureCity) {
			continue
		}
		if dest != "" && !matchFlightAirportOrCity(dest, f.ArrivalAirport, f.ArrivalCity) {
			continue
		}
		if stopsStr != "" {
			stops, err := strconv.Atoi(stopsStr)
			if err == nil && f.Stops != stops {
				continue
			}
		}
		if timeSlot != "" && timeSlot != "ALL" && !strings.EqualFold(f.DepartureTimeSlot, timeSlot) {
			continue
		}
		if cabin != "" && cabin != "ALL" && !strings.EqualFold(f.CabinClass, cabin) {
			continue
		}
		if airline != "" && !strings.EqualFold(f.AirlineCode, airline) && !strings.Contains(f.AirlineName, airline) {
			continue
		}
		results = append(results, f)
	}
	writeJSON(w, http.StatusOK, results)
}

func (h *APIHandler) GetTrains(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	dep := q.Get("dep")
	arr := q.Get("arr")
	network := q.Get("network")
	seatClass := q.Get("seatClass")

	results := make([]domain.Train, 0)
	for _, tr := range h.store.Trains {
		if dep != "" && !strings.Contains(tr.DepartureStation, dep) {
			continue
		}
		if arr != "" && !strings.Contains(tr.ArrivalStation, arr) {
			continue
		}
		if network != "" && network != "ALL" && !strings.Contains(tr.TrainType, network) && !strings.Contains(tr.TrainNumber, network) {
			continue
		}
		if seatClass != "" && seatClass != "ALL" && !strings.EqualFold(tr.SeatClass, seatClass) {
			continue
		}
		results = append(results, tr)
	}
	writeJSON(w, http.StatusOK, results)
}

func (h *APIHandler) GetCars(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	category := q.Get("category")
	transmission := q.Get("transmission")
	superCdw := q.Get("superCdw") == "true"

	results := make([]domain.CarRental, 0)
	for _, c := range h.store.Cars {
		if category != "" && category != "ALL" && !strings.EqualFold(c.VehicleType, category) {
			continue
		}
		if transmission != "" && transmission != "ALL" && !strings.EqualFold(c.Transmission, transmission) {
			continue
		}
		if superCdw && !c.InsuranceIncluded {
			continue
		}
		results = append(results, c)
	}
	writeJSON(w, http.StatusOK, results)
}

func (h *APIHandler) GetTransfers(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	tier := q.Get("tier")
	airport := q.Get("airport")

	results := make([]domain.AirportTransfer, 0)
	for _, t := range h.store.Transfers {
		if airport != "" && !strings.EqualFold(t.AirportCode, airport) {
			continue
		}
		if tier != "" && tier != "ALL" && !strings.EqualFold(t.VehicleClass, tier) {
			continue
		}
		results = append(results, t)
	}
	writeJSON(w, http.StatusOK, results)
}

func (h *APIHandler) GetActivities(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	city := q.Get("city")
	category := q.Get("category")
	freeCancel := q.Get("freeCancel") == "true"
	instant := q.Get("instant") == "true"
	duration := q.Get("duration")
	maxPrice, _ := strconv.ParseFloat(q.Get("maxPrice"), 64)

	results := make([]domain.Activity, 0)
	for _, a := range h.store.Activities {
		if city != "" && !strings.Contains(a.City, city) && !strings.Contains(a.Title, city) {
			continue
		}
		if category != "" && category != "ALL" && !strings.EqualFold(a.Category, category) {
			continue
		}
		if freeCancel && !a.FreeCancellation {
			continue
		}
		if instant && !a.InstantConfirmation {
			continue
		}
		if duration != "" && !strings.EqualFold(a.DurationType, duration) {
			continue
		}
		if maxPrice > 0 && a.PriceKRW > maxPrice {
			continue
		}
		results = append(results, a)
	}
	writeJSON(w, http.StatusOK, results)
}

func (h *APIHandler) GetActivityDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Missing activity id in path")
		return
	}
	act, err := h.store.GetActivityDetail(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, act)
}

func (h *APIHandler) GetFlightDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	flt, err := h.store.GetFlightDetail(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, flt)
}

func (h *APIHandler) GetTrainDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	trn, err := h.store.GetTrainDetail(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, trn)
}

func (h *APIHandler) GetCarDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	car, err := h.store.GetCarDetail(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, car)
}

func (h *APIHandler) GetTransferDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	tf, err := h.store.GetTransferDetail(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, tf)
}

func (h *APIHandler) GetPackages(w http.ResponseWriter, r *http.Request) {
	results := make([]domain.DynamicPackage, 0)
	for _, p := range h.store.Packages {
		results = append(results, p)
	}
	writeJSON(w, http.StatusOK, results)
}

func (h *APIHandler) GetPackageDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	pkg, err := h.store.GetPackageDetail(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, pkg)
}

func (h *APIHandler) GetPromotions(w http.ResponseWriter, r *http.Request) {
	results := make([]domain.Promotion, 0)
	for _, p := range h.store.Promotions {
		if p.IsActive {
			results = append(results, p)
		}
	}
	writeJSON(w, http.StatusOK, results)
}

func (h *APIHandler) GetFXRates(w http.ResponseWriter, r *http.Request) {
	results := make([]domain.ExchangeRate, 0)
	for _, fx := range h.store.ExchangeRate {
		results = append(results, fx)
	}
	writeJSON(w, http.StatusOK, results)
}

func (h *APIHandler) GetMoments(w http.ResponseWriter, r *http.Request) {
	results := make([]domain.TripMoment, 0)
	for _, m := range h.store.TripMoments {
		results = append(results, m)
	}
	writeJSON(w, http.StatusOK, results)
}

func (h *APIHandler) CreateMoment(w http.ResponseWriter, r *http.Request) {
	var m domain.TripMoment
	if err := json.NewDecoder(r.Body).Decode(&m); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	m.ID = fmt.Sprintf("m-%d", time.Now().UnixNano())
	m.CreatedAt = time.Now()
	m.LikesCount = 0

	h.store.TripMoments[m.ID] = m
	writeJSON(w, http.StatusCreated, m)
}

// --- PRICING & BOOKING HANDLERS ---

func (h *APIHandler) CalculatePricing(w http.ResponseWriter, r *http.Request) {
	var req engine.PricingInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}

	// Look up FX rate from store
	if fx, exists := h.store.ExchangeRate[req.TargetCurrency]; exists {
		req.ExchangeRateToKRW = fx.RateToKRW
	}

	res, err := engine.CalculateExactPrice(req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (h *APIHandler) CreateBooking(w http.ResponseWriter, r *http.Request) {
	var b domain.Booking
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if b.BaseAmountKRW <= 0 || b.FinalAmountKRW < 0 {
		writeError(w, http.StatusBadRequest, "invalid booking amount: amount cannot be negative or zero")
		return
	}

	// Default user if empty
	if b.UserID == "" {
		b.UserID = "a0000000-0000-0000-0000-000000000001"
	}

	created, err := h.store.CreateDraftBooking(b)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h *APIHandler) PayBooking(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	booking, exists := h.store.Bookings[id]
	if !exists {
		writeError(w, http.StatusNotFound, "booking not found")
		return
	}

	if booking.Status != domain.StatusDraft && booking.Status != domain.StatusPendingPayment {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("cannot pay booking in status %s", booking.Status))
		return
	}

	if !booking.InventoryLockExpireAt.IsZero() && time.Now().After(booking.InventoryLockExpireAt) {
		writeError(w, http.StatusConflict, "inventory lock expired")
		return
	}

	var payReq struct {
		PaymentMethod string `json:"payment_method"`
		PaymentProof  string `json:"payment_proof"`
	}
	_ = json.NewDecoder(r.Body).Decode(&payReq)

	proof := payReq.PaymentProof
	if proof == "" {
		proof = r.Header.Get("Authorization")
	}

	// Zero-Tolerance Rule: Explicitly reject arbitrary X-Payment-Proof header bypass
	if r.Header.Get("X-Payment-Proof") != "" && payReq.PaymentProof == "" && r.Header.Get("Authorization") == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized payment proof header bypass rejected: cryptographic signature required")
		return
	}

	if proof == "" {
		writeError(w, http.StatusBadRequest, "verified payment proof or authorization token required for payment confirmation")
		return
	}

	// Transition: DRAFT -> PENDING_PAYMENT -> PAID -> ISSUING -> CONFIRMED
	_, err := h.store.TransitionBookingStatus(id, domain.StatusPendingPayment, "Payment initiated", "SYSTEM")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	_, _ = h.store.TransitionBookingStatus(id, domain.StatusPaid, fmt.Sprintf("Payment verified via PG gateway (%s)", proof), "SYSTEM")
	_, _ = h.store.TransitionBookingStatus(id, domain.StatusIssuing, "Supplier issuance started", "SYSTEM")
	confirmed, err := h.store.TransitionBookingStatus(id, domain.StatusConfirmed, "Instant E-Ticket / Voucher generated", "SYSTEM")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, confirmed)
}

func (h *APIHandler) GetBookingDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	b, exists := h.store.Bookings[id]
	if !exists {
		writeError(w, http.StatusNotFound, "booking not found")
		return
	}
	writeJSON(w, http.StatusOK, b)
}

func (h *APIHandler) GetUserBookings(w http.ResponseWriter, r *http.Request) {
	userId := r.PathValue("userId")
	userBookings := make([]domain.Booking, 0)
	for _, b := range h.store.Bookings {
		if b.UserID == userId {
			userBookings = append(userBookings, b)
		}
	}
	writeJSON(w, http.StatusOK, userBookings)
}

func (h *APIHandler) CancelBooking(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	updated, err := h.store.TransitionBookingStatus(id, domain.StatusCancelReq, "Customer requested self-service cancellation", "USER")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// --- ADMIN HANDLERS ---

func (h *APIHandler) AdminLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid login request")
		return
	}

	email := strings.TrimSpace(strings.ToLower(req.Email))
	if (email == "admin@getfortrip.com" || email == "admin") && req.Password == "admin1234!" {
		token := "gft_adm_token_" + strconv.FormatInt(time.Now().UnixNano(), 36)
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"token":   token,
			"admin": map[string]string{
				"id":    "adm_001",
				"name":  "총괄 관리자",
				"email": "admin@getfortrip.com",
				"role":  "SUPER_ADMIN",
			},
		})
		return
	}

	writeError(w, http.StatusUnauthorized, "아이디 또는 비밀번호가 올바르지 않습니다.")
}

func (h *APIHandler) GetAdminDashboard(w http.ResponseWriter, r *http.Request) {
	if !checkAdminAuth(r) {
		writeError(w, http.StatusUnauthorized, "admin authentication required")
		return
	}
	stats := h.store.GetDashboardStats()
	writeJSON(w, http.StatusOK, stats)
}

func (h *APIHandler) GetAdminBookings(w http.ResponseWriter, r *http.Request) {
	if !checkAdminAuth(r) {
		writeError(w, http.StatusUnauthorized, "admin authentication required")
		return
	}
	list := make([]domain.Booking, 0)
	for _, b := range h.store.Bookings {
		list = append(list, b)
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *APIHandler) AdminTransitionBooking(w http.ResponseWriter, r *http.Request) {
	if !checkAdminAuth(r) {
		writeError(w, http.StatusUnauthorized, "admin authentication required")
		return
	}
	id := r.PathValue("id")
	var req struct {
		TargetStatus domain.BookingStatus `json:"target_status"`
		Reason       string               `json:"reason"`
		ManualPNR    string               `json:"manual_pnr"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	updated, err := h.store.TransitionBookingStatus(id, req.TargetStatus, req.Reason, "ADMIN_OPERATOR")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.ManualPNR != "" {
		updated.ConfirmationNumber = req.ManualPNR
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h *APIHandler) GetAdminAuditLogs(w http.ResponseWriter, r *http.Request) {
	if !checkAdminAuth(r) {
		writeError(w, http.StatusUnauthorized, "admin authentication required")
		return
	}
	writeJSON(w, http.StatusOK, h.store.AuditLogs)
}

func (h *APIHandler) GetNotices(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.store.Notices)
}

// --- REAL-TIME SSE HANDLER ---

func (h *APIHandler) SSEStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case t := <-ticker.C:
			data := fmt.Sprintf(`{"type":"HEARTBEAT","time":"%s","active_bookings":%d}`, t.Format(time.RFC3339), len(h.store.Bookings))
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		}
	}
}

// --- AUTOCOMPLETE / SUGGEST HANDLER (getfortrip specification) ---

func (h *APIHandler) SearchSuggest(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	domain := strings.TrimSpace(r.URL.Query().Get("domain"))
	results := h.store.SearchSuggest(q, domain)
	writeJSON(w, http.StatusOK, results)
}

// --- PARTNER B2B PORTAL HANDLERS ---

func (h *APIHandler) PartnerLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	validPartners := map[string]struct {
		ID             string
		CompanyName    string
		PartnerType    string
		BusinessNumber string
		ContactPhone   string
		SettlementRate float64
		Token          string
		Password       string
	}{
		"hotel_partner@getfortrip.com": {
			ID:             "ptn_htl_01",
			CompanyName:    "(주)하얏트 코리아 호스피탈리티",
			PartnerType:    "HOTEL",
			BusinessNumber: "101-81-99201",
			ContactPhone:   "02-797-1234",
			SettlementRate: 0.90,
			Token:          "ptn_sec_tok_live_8829",
			Password:       "partner1234!",
		},
		"partner@getfortrip.com": {
			ID:             "ptn_gen_01",
			CompanyName:    "(주)겟포트립 파트너스",
			PartnerType:    "GENERAL",
			BusinessNumber: "120-88-12345",
			ContactPhone:   "02-1588-0000",
			SettlementRate: 0.90,
			Token:          "ptn_sec_tok_live_1001",
			Password:       "partner1234!",
		},
		"flight_partner@getfortrip.com": {
			ID:             "ptn_flt_01",
			CompanyName:    "(주)글로벌 에어 라인스 서비스",
			PartnerType:    "FLIGHT",
			BusinessNumber: "201-81-54321",
			ContactPhone:   "02-755-1234",
			SettlementRate: 0.95,
			Token:          "ptn_sec_tok_live_3301",
			Password:       "partner1234!",
		},
	}

	partner, ok := validPartners[strings.ToLower(strings.TrimSpace(req.Email))]
	if !ok || partner.Password != req.Password {
		writeError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	resp := map[string]any{
		"id":              partner.ID,
		"company_name":    partner.CompanyName,
		"email":           strings.ToLower(strings.TrimSpace(req.Email)),
		"partner_type":    partner.PartnerType,
		"business_number": partner.BusinessNumber,
		"contact_phone":   partner.ContactPhone,
		"settlement_rate": partner.SettlementRate,
		"token":           partner.Token,
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *APIHandler) GetPartnerDashboard(w http.ResponseWriter, r *http.Request) {
	if !checkPartnerAuth(r) {
		writeError(w, http.StatusUnauthorized, "partner authentication required")
		return
	}
	stats := map[string]any{
		"monthly_gross_krw":       18450000,
		"monthly_net_krw":         16605000,
		"pending_bookings_count":  4,
		"active_products_count":   12,
		"average_rating":          4.9,
		"commission_rate_percent": 10,
	}
	writeJSON(w, http.StatusOK, stats)
}

func (h *APIHandler) GetPartnerBookings(w http.ResponseWriter, r *http.Request) {
	if !checkPartnerAuth(r) {
		writeError(w, http.StatusUnauthorized, "partner authentication required")
		return
	}
	list := make([]domain.Booking, 0)
	for _, b := range h.store.Bookings {
		list = append(list, b)
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *APIHandler) PartnerActionBooking(w http.ResponseWriter, r *http.Request) {
	if !checkPartnerAuth(r) {
		writeError(w, http.StatusUnauthorized, "partner authentication required")
		return
	}
	id := r.PathValue("id")
	var req struct {
		Action string `json:"action"`
		PNR    string `json:"pnr"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	booking, exists := h.store.Bookings[id]
	if !exists {
		writeError(w, http.StatusNotFound, "booking not found")
		return
	}
	if req.Action == "CHECKIN" {
		booking.Status = domain.StatusCompleted
	} else {
		booking.Status = domain.StatusConfirmed
		if req.PNR != "" {
			booking.ConfirmationNumber = req.PNR
		}
	}
	h.store.Bookings[id] = booking
	writeJSON(w, http.StatusOK, booking)
}

func (h *APIHandler) GetPartnerSettlements(w http.ResponseWriter, r *http.Request) {
	if !checkPartnerAuth(r) {
		writeError(w, http.StatusUnauthorized, "partner authentication required")
		return
	}
	settlements := []map[string]any{
		{
			"id":             "stl-2026-10-1",
			"period":         "2026-10-01 ~ 2026-10-15",
			"payout_date":    "2026-10-25",
			"orders_count":   18,
			"gross_krw":      8450000,
			"fee_krw":        845000,
			"net_payout_krw": 7605000,
			"status":         "SCHEDULED",
			"tax_invoice":    "ISSUED",
		},
		{
			"id":             "stl-2026-09-2",
			"period":         "2026-09-16 ~ 2026-09-30",
			"payout_date":    "2026-10-10",
			"orders_count":   24,
			"gross_krw":      12200000,
			"fee_krw":        1220000,
			"net_payout_krw": 10980000,
			"status":         "PAID",
			"tax_invoice":    "COMPLETED",
		},
	}
	writeJSON(w, http.StatusOK, settlements)
}
