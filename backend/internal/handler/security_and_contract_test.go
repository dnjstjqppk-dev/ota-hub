package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"getfortrip/backend/internal/domain"
	"getfortrip/backend/internal/repository"
)

func TestSecurityAndContract(t *testing.T) {
	t.Setenv("JWT_SECRET", "p2g-test-jwt-secret-min-32-chars-ok!")
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
		secret, _ := getJWTSecret()
		admToken, err := GenerateJWT(JWTClaims{ID: "adm_001", Role: "ADMIN"}, secret)
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

	t.Run("pay_endpoint_retired_410", func(t *testing.T) {
		// #66: the endpoint confirmed bookings on any Authorization header
		// ("Payment verified via PG gateway") without contacting a PG. Every
		// variant now 410s toward the worker payments API.
		validBooking, err := store.CreateDraftBooking(domain.Booking{
			BaseAmountKRW:  100000,
			FinalAmountKRW: 100000,
		})
		if err != nil {
			t.Fatalf("Failed to create draft booking: %v", err)
		}

		cases := map[string]*http.Request{}
		bare := httptest.NewRequest("POST", "/api/v1/bookings/"+validBooking.ID+"/pay", bytes.NewReader([]byte(`{}`)))
		bare.SetPathValue("id", validBooking.ID)
		cases["bare"] = bare
		withProof := httptest.NewRequest("POST", "/api/v1/bookings/"+validBooking.ID+"/pay", bytes.NewReader([]byte(`{"payment_proof":"pg_proof_12345"}`)))
		withProof.SetPathValue("id", validBooking.ID)
		cases["with_proof"] = withProof
		withAuth := httptest.NewRequest("POST", "/api/v1/bookings/"+validBooking.ID+"/pay", bytes.NewReader([]byte(`{}`)))
		withAuth.SetPathValue("id", validBooking.ID)
		withAuth.Header.Set("Authorization", "Bearer anything-at-all")
		cases["with_auth_header"] = withAuth

		for name, req := range cases {
			w := httptest.NewRecorder()
			h.PayBooking(w, req)
			if w.Code != http.StatusGone {
				t.Fatalf("Expected 410 Gone for pay case %s, got %d", name, w.Code)
			}
			if !bytes.Contains(w.Body.Bytes(), []byte("worker payments API")) {
				t.Fatalf("Pay 410 for %s must point at the worker API, got: %s", name, w.Body.String())
			}
		}
	})

	t.Run("pricing_endpoint_deprecated", func(t *testing.T) {
		// #67: legacy Go pricing disagrees with the worker quote engine.
		// Served with deprecation markers until removal.
		req := httptest.NewRequest("POST", "/api/v1/bookings/calculate", bytes.NewReader([]byte(`{"base_amount_krw":100000,"target_currency":"KRW"}`)))
		w := httptest.NewRecorder()
		h.CalculatePricing(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK for deprecated pricing, got %d", w.Code)
		}
		if w.Header().Get("Deprecation") != "true" {
			t.Fatalf("Expected Deprecation: true header, got %q", w.Header().Get("Deprecation"))
		}
		if !strings.Contains(w.Header().Get("Warning"), "/api/v1/quotes") {
			t.Fatalf("Expected Warning to name the worker quotes API, got %q", w.Header().Get("Warning"))
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
