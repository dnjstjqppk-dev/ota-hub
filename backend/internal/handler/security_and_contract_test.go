package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"getfortrip/backend/internal/domain"
	"getfortrip/backend/internal/repository"
)

func TestSecurityAndContract(t *testing.T) {
	store := repository.NewStore()
	h := NewAPIHandler(store)

	t.Run("anonymous_admin_read_rejected", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/admin/bookings", nil)
		w := httptest.NewRecorder()
		h.GetAdminBookings(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("Expected 401 Unauthorized for anonymous admin request, got %d", w.Code)
		}

		// With valid admin token
		admToken, err := GenerateJWT(JWTClaims{ID: "adm_001", Role: "ADMIN"}, getJWTSecret())
		if err != nil {
			t.Fatalf("Failed to generate test admin JWT: %v", err)
		}
		reqAuth := httptest.NewRequest("GET", "/api/v1/admin/bookings", nil)
		reqAuth.Header.Set("Authorization", "Bearer "+admToken)
		wAuth := httptest.NewRecorder()
		h.GetAdminBookings(wAuth, reqAuth)
		if wAuth.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for authenticated admin request, got %d", wAuth.Code)
		}
	})

	t.Run("negative_booking_amount_rejected", func(t *testing.T) {
		body, _ := json.Marshal(domain.Booking{
			BaseAmountKRW:  -1000,
			FinalAmountKRW: -1000,
		})
		req := httptest.NewRequest("POST", "/api/v1/bookings", bytes.NewReader(body))
		w := httptest.NewRecorder()
		h.CreateBooking(w, req)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("Expected 400 Bad Request for negative amount, got %d", w.Code)
		}
	})

	t.Run("pay_without_proof_rejected", func(t *testing.T) {
		// First create a valid booking
		validBooking, err := store.CreateDraftBooking(domain.Booking{
			BaseAmountKRW:  100000,
			FinalAmountKRW: 100000,
		})
		if err != nil {
			t.Fatalf("Failed to create draft booking: %v", err)
		}

		// Try to pay without proof or token
		req := httptest.NewRequest("POST", "/api/v1/bookings/"+validBooking.ID+"/pay", bytes.NewReader([]byte(`{}`)))
		req.SetPathValue("id", validBooking.ID)
		w := httptest.NewRecorder()
		h.PayBooking(w, req)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("Expected 400 Bad Request for payment without proof, got %d", w.Code)
		}

		// Pay with proof succeeds
		reqWithProof := httptest.NewRequest("POST", "/api/v1/bookings/"+validBooking.ID+"/pay", bytes.NewReader([]byte(`{"payment_proof":"pg_proof_12345"}`)))
		reqWithProof.SetPathValue("id", validBooking.ID)
		wWithProof := httptest.NewRecorder()
		h.PayBooking(wWithProof, reqWithProof)
		if wWithProof.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for payment with valid proof, got %d", wWithProof.Code)
		}

		// Fake X-Payment-Proof header bypass is explicitly rejected with 401
		fakeBooking, _ := store.CreateDraftBooking(domain.Booking{BaseAmountKRW: 50000, FinalAmountKRW: 50000})
		fakeReq := httptest.NewRequest("POST", "/api/v1/bookings/"+fakeBooking.ID+"/pay", bytes.NewReader([]byte(`{}`)))
		fakeReq.Header.Set("X-Payment-Proof", "evil_hacker_proof")
		fakeReq.SetPathValue("id", fakeBooking.ID)
		wFake := httptest.NewRecorder()
		h.PayBooking(wFake, fakeReq)
		if wFake.Code != http.StatusUnauthorized {
			t.Fatalf("Expected 401 Unauthorized for fake X-Payment-Proof header, got %d", wFake.Code)
		}
	})

	t.Run("empty_suggestion_payload_is_array", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/search/suggest?q=zzznonsensequery999", nil)
		w := httptest.NewRecorder()
		h.SearchSuggest(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d", w.Code)
		}

		var resp struct {
			Code int                  `json:"code"`
			Data []domain.SuggestItem `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to decode suggest response: %v", err)
		}
		if resp.Data == nil {
			t.Fatalf("Expected data to be non-nil empty array [], but got nil")
		}
	})

	t.Run("hotel_search_with_city_parentheses", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/hotels?city="+urlEscape("도쿄 (Tokyo)"), nil)
		w := httptest.NewRecorder()
		h.GetHotels(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d", w.Code)
		}

		var resp struct {
			Code int            `json:"code"`
			Data []domain.Hotel `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to decode hotels response: %v", err)
		}
		if len(resp.Data) == 0 {
			t.Fatalf("Expected at least 1 hotel for '도쿄 (Tokyo)', got 0")
		}
	})

	t.Run("flight_search_with_airport_label", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/flights?origin="+urlEscape("인천국제공항 (Incheon Int'l)"), nil)
		w := httptest.NewRecorder()
		h.GetFlights(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d", w.Code)
		}

		var resp struct {
			Code int             `json:"code"`
			Data []domain.Flight `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to decode flights response: %v", err)
		}
		if len(resp.Data) == 0 {
			t.Fatalf("Expected flights departing from ICN, got 0")
		}
	})
}

func urlEscape(s string) string {
	return url.QueryEscape(s)
}
