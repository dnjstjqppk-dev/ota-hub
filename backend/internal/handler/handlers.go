package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
	"tripclone/backend/internal/domain"
	"tripclone/backend/internal/engine"
	"tripclone/backend/internal/repository"
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

	var results []domain.Flight
	for _, f := range h.store.Flights {
		if origin != "" && !strings.EqualFold(f.DepartureAirport, origin) && !strings.Contains(f.DepartureCity, origin) {
			continue
		}
		if dest != "" && !strings.EqualFold(f.ArrivalAirport, dest) && !strings.Contains(f.ArrivalCity, dest) {
			continue
		}
		results = append(results, f)
	}
	writeJSON(w, http.StatusOK, results)
}

func (h *APIHandler) GetTrains(w http.ResponseWriter, r *http.Request) {
	var results []domain.Train
	for _, tr := range h.store.Trains {
		results = append(results, tr)
	}
	writeJSON(w, http.StatusOK, results)
}

func (h *APIHandler) GetCars(w http.ResponseWriter, r *http.Request) {
	var results []domain.CarRental
	for _, c := range h.store.Cars {
		results = append(results, c)
	}
	writeJSON(w, http.StatusOK, results)
}

func (h *APIHandler) GetTransfers(w http.ResponseWriter, r *http.Request) {
	var results []domain.AirportTransfer
	for _, t := range h.store.Transfers {
		results = append(results, t)
	}
	writeJSON(w, http.StatusOK, results)
}

func (h *APIHandler) GetActivities(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	city := q.Get("city")
	category := q.Get("category")

	var results []domain.Activity
	for _, a := range h.store.Activities {
		if city != "" && !strings.Contains(a.City, city) {
			continue
		}
		if category != "" && !strings.EqualFold(a.Category, category) {
			continue
		}
		results = append(results, a)
	}
	writeJSON(w, http.StatusOK, results)
}

func (h *APIHandler) GetPackages(w http.ResponseWriter, r *http.Request) {
	var results []domain.DynamicPackage
	for _, p := range h.store.Packages {
		results = append(results, p)
	}
	writeJSON(w, http.StatusOK, results)
}

func (h *APIHandler) GetPromotions(w http.ResponseWriter, r *http.Request) {
	var results []domain.Promotion
	for _, p := range h.store.Promotions {
		if p.IsActive {
			results = append(results, p)
		}
	}
	writeJSON(w, http.StatusOK, results)
}

func (h *APIHandler) GetFXRates(w http.ResponseWriter, r *http.Request) {
	var results []domain.ExchangeRate
	for _, fx := range h.store.ExchangeRate {
		results = append(results, fx)
	}
	writeJSON(w, http.StatusOK, results)
}

func (h *APIHandler) GetMoments(w http.ResponseWriter, r *http.Request) {
	var results []domain.TripMoment
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

	// Default user if empty
	if b.UserID == "" {
		b.UserID = "a0000000-0000-0000-0000-000000000001"
	}

	created, err := h.store.CreateDraftBooking(b)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h *APIHandler) PayBooking(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	// Transition: DRAFT -> PENDING_PAYMENT -> PAID -> ISSUING -> CONFIRMED
	_, err := h.store.TransitionBookingStatus(id, domain.StatusPendingPayment, "Payment initiated", "SYSTEM")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	_, _ = h.store.TransitionBookingStatus(id, domain.StatusPaid, "Payment verified via PG gateway", "SYSTEM")
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
	var userBookings []domain.Booking
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

func (h *APIHandler) GetAdminDashboard(w http.ResponseWriter, r *http.Request) {
	stats := h.store.GetDashboardStats()
	writeJSON(w, http.StatusOK, stats)
}

func (h *APIHandler) GetAdminBookings(w http.ResponseWriter, r *http.Request) {
	var list []domain.Booking
	for _, b := range h.store.Bookings {
		list = append(list, b)
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *APIHandler) AdminTransitionBooking(w http.ResponseWriter, r *http.Request) {
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

