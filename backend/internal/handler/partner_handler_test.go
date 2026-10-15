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

	req := httptest.NewRequest("GET", "/api/v1/partner/dashboard", nil)
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
	w := httptest.NewRecorder()

	h.GetPartnerSettlements(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d", w.Code)
	}
}

