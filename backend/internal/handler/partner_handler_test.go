package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"getfortrip/backend/internal/repository"
)

// #65: partner auth is env-password + signed JWT. No credential lives in the
// repo and the static bearer-prefix bypass is gone.
func loginPartner(t *testing.T, h *APIHandler, email, password string) (int, string) {
	t.Helper()
	body, _ := json.Marshal(map[string]string{
		"email":    email,
		"password": password,
	})
	req := httptest.NewRequest("POST", "/api/v1/partner/login", bytes.NewReader(body))
	w := httptest.NewRecorder()
	h.PartnerLogin(w, req)
	if w.Code != http.StatusOK {
		return w.Code, ""
	}
	var resp struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse login response: %v", err)
	}
	return w.Code, resp.Data.Token
}

func TestPartnerLogin(t *testing.T) {
	t.Setenv("GO_PARTNER_PASSWORD", "test-partner-pass-65")
	store := repository.NewStore()
	h := NewAPIHandler(store)

	body, _ := json.Marshal(map[string]string{
		"email":    "hotel_partner@getfortrip.com",
		"password": "test-partner-pass-65",
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
			Token       string `json:"token"`
		} `json:"data"`
	}

	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if resp.Data.CompanyName != "(주)하얏트 코리아 호스피탈리티" {
		t.Errorf("Unexpected company name: %s", resp.Data.CompanyName)
	}

	// The issued token is a verifiable PARTNER JWT, not a static string.
	claims, err := ValidateJWT(resp.Data.Token, getJWTSecret())
	if err != nil {
		t.Fatalf("Login token is not a valid JWT: %v", err)
	}
	if claims.Role != "PARTNER" || claims.PartnerID != "ptn_htl_01" {
		t.Errorf("Unexpected login claims: %+v", claims)
	}
}

func TestPartnerLoginUnconfigured(t *testing.T) {
	// Unset env fails closed: no login without a configured password.
	os.Unsetenv("GO_PARTNER_PASSWORD")
	store := repository.NewStore()
	h := NewAPIHandler(store)

	body, _ := json.Marshal(map[string]string{
		"email":    "hotel_partner@getfortrip.com",
		"password": "anything",
	})
	req := httptest.NewRequest("POST", "/api/v1/partner/login", bytes.NewReader(body))
	w := httptest.NewRecorder()
	h.PartnerLogin(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("Expected 503 when GO_PARTNER_PASSWORD is unset, got %d", w.Code)
	}
}

func TestGetPartnerDashboard(t *testing.T) {
	t.Setenv("GO_PARTNER_PASSWORD", "test-partner-pass-65")
	store := repository.NewStore()
	h := NewAPIHandler(store)

	// Unauthorized test
	reqUnauth := httptest.NewRequest("GET", "/api/v1/partner/dashboard", nil)
	wUnauth := httptest.NewRecorder()
	h.GetPartnerDashboard(wUnauth, reqUnauth)
	if wUnauth.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 Unauthorized for anonymous request, got %d", wUnauth.Code)
	}

	// The retired static bearer prefix no longer authenticates.
	reqStatic := httptest.NewRequest("GET", "/api/v1/partner/dashboard", nil)
	reqStatic.Header.Set("Authorization", "Bearer [REDACTED]")
	wStatic := httptest.NewRecorder()
	h.GetPartnerDashboard(wStatic, reqStatic)
	if wStatic.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 for the retired static token, got %d", wStatic.Code)
	}

	// Authorized test with a login-issued JWT
	_, token := loginPartner(t, h, "hotel_partner@getfortrip.com", "test-partner-pass-65")
	req := httptest.NewRequest("GET", "/api/v1/partner/dashboard", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	h.GetPartnerDashboard(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d", w.Code)
	}
}

func TestGetPartnerSettlements(t *testing.T) {
	t.Setenv("GO_PARTNER_PASSWORD", "test-partner-pass-65")
	store := repository.NewStore()
	h := NewAPIHandler(store)

	_, token := loginPartner(t, h, "partner@getfortrip.com", "test-partner-pass-65")
	req := httptest.NewRequest("GET", "/api/v1/partner/settlements", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	h.GetPartnerSettlements(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d", w.Code)
	}
}

func TestPartnerLoginInvalid(t *testing.T) {
	t.Setenv("GO_PARTNER_PASSWORD", "test-partner-pass-65")
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

	// Known email with the wrong password.
	badPass, _ := json.Marshal(map[string]string{
		"email":    "hotel_partner@getfortrip.com",
		"password": "wrong-password",
	})
	reqBad := httptest.NewRequest("POST", "/api/v1/partner/login", bytes.NewReader(badPass))
	wBad := httptest.NewRecorder()
	h.PartnerLogin(wBad, reqBad)
	if wBad.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 Unauthorized for wrong password, got %d", wBad.Code)
	}
}

func TestPartnerActionNonexistentBooking(t *testing.T) {
	t.Setenv("GO_PARTNER_PASSWORD", "test-partner-pass-65")
	store := repository.NewStore()
	h := NewAPIHandler(store)

	_, token := loginPartner(t, h, "flight_partner@getfortrip.com", "test-partner-pass-65")
	req := httptest.NewRequest("POST", "/api/v1/partner/bookings/nonexistent-id/action", bytes.NewReader([]byte(`{"action":"CONFIRM"}`)))
	req.SetPathValue("id", "nonexistent-id")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	h.PartnerActionBooking(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("Expected 404 Not Found for nonexistent booking, got %d", w.Code)
	}
}
