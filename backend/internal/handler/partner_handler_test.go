package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"getfortrip/backend/internal/repository"
)

func TestPartnerLogin(t *testing.T) {
	store := repository.NewStore()
	h := NewAPIHandler(store)

	body, _ := json.Marshal(map[string]string{
		"email":    "hotel_partner@getfortrip.com",
		"password": "partner1234!",
	})
	req := httptest.NewRequest("POST", "/api/v1/partner/login", bytes.NewReader(body))
	w := httptest.NewRecorder()

	h.PartnerLogin(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d", w.Code)
	}

	var resp struct {
		Code int `json:"code"`
		Data struct {
			CompanyName string `json:"company_name"`
			PartnerType string `json:"partner_type"`
		} `json:"data"`
	}

	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if resp.Data.CompanyName != "(주)하얏트 코리아 호스피탈리티" {
		t.Errorf("Unexpected company name: %s", resp.Data.CompanyName)
	}
}

func TestGetPartnerDashboard(t *testing.T) {
	store := repository.NewStore()
	h := NewAPIHandler(store)

	// Unauthorized test
	reqUnauth := httptest.NewRequest("GET", "/api/v1/partner/dashboard", nil)
	wUnauth := httptest.NewRecorder()
	h.GetPartnerDashboard(wUnauth, reqUnauth)
	if wUnauth.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 Unauthorized for anonymous request, got %d", wUnauth.Code)
	}

	// Authorized test
	req := httptest.NewRequest("GET", "/api/v1/partner/dashboard", nil)
	req.Header.Set("Authorization", "Bearer ptn_sec_tok_live_8829")
	w := httptest.NewRecorder()
	h.GetPartnerDashboard(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d", w.Code)
	}
}

func TestGetPartnerSettlements(t *testing.T) {
	store := repository.NewStore()
	h := NewAPIHandler(store)

	req := httptest.NewRequest("GET", "/api/v1/partner/settlements", nil)
	req.Header.Set("Authorization", "Bearer ptn_sec_tok_live_8829")
	w := httptest.NewRecorder()
	h.GetPartnerSettlements(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d", w.Code)
	}
}

func TestPartnerLoginInvalid(t *testing.T) {
	store := repository.NewStore()
	h := NewAPIHandler(store)

	body, _ := json.Marshal(map[string]string{
		"email":    "attacker@fake.com",
		"password": "pass",
	})
	req := httptest.NewRequest("POST", "/api/v1/partner/login", bytes.NewReader(body))
	w := httptest.NewRecorder()
	h.PartnerLogin(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 Unauthorized for invalid partner login, got %d", w.Code)
	}
}

func TestPartnerActionNonexistentBooking(t *testing.T) {
	store := repository.NewStore()
	h := NewAPIHandler(store)

	req := httptest.NewRequest("POST", "/api/v1/partner/bookings/nonexistent-id/action", bytes.NewReader([]byte(`{"action":"CONFIRM"}`)))
	req.SetPathValue("id", "nonexistent-id")
	req.Header.Set("Authorization", "Bearer ptn_sec_tok_live_8829")
	w := httptest.NewRecorder()
	h.PartnerActionBooking(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("Expected 404 Not Found for nonexistent booking, got %d", w.Code)
	}
}

