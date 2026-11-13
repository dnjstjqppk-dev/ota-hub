package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"getfortrip/backend/internal/domain"
	"getfortrip/backend/internal/repository"
)

// #122/#123 (P2g) hardening tests: JWT fallback removal, SSE/booking auth,
// computed partner figures, ingest auth + resync nil-guard.

const p2gTestSecret = "p2g-test-jwt-secret-min-32-chars-ok!"

func mintP2GToken(t *testing.T, claims JWTClaims) string {
	t.Helper()
	tok, err := GenerateJWT(claims, p2gTestSecret)
	if err != nil {
		t.Fatalf("Failed to mint test JWT: %v", err)
	}
	return tok
}

func authedP2GRequest(method, target, token string) *http.Request {
	req := httptest.NewRequest(method, target, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return req
}

func TestJWT122_NoFallbackSecret(t *testing.T) {
	t.Setenv("ADMIN_PASSWORD", "admin-pass-122")
	store := repository.NewStore()
	h := NewAPIHandler(store)

	login := func() int {
		body := `{"email":"admin@getfortrip.com","password":"admin-pass-122"}`
		req := httptest.NewRequest("POST", "/api/v1/admin/login", strings.NewReader(body))
		w := httptest.NewRecorder()
		h.AdminLogin(w, req)
		return w.Code
	}

	// Unset secret: login fails closed, it must not mint on a fallback.
	t.Setenv("JWT_SECRET", "")
	if code := login(); code != http.StatusServiceUnavailable {
		t.Fatalf("Expected 503 with JWT_SECRET unset, got %d", code)
	}
	// Short secret: same (worker parity gate is 32 chars).
	t.Setenv("JWT_SECRET", "too-short")
	if code := login(); code != http.StatusServiceUnavailable {
		t.Fatalf("Expected 503 with a short JWT_SECRET, got %d", code)
	}
	// Configured: login works again.
	t.Setenv("JWT_SECRET", p2gTestSecret)
	if code := login(); code != http.StatusOK {
		t.Fatalf("Expected 200 with JWT_SECRET set, got %d", code)
	}

	// A token signed with the retired hardcoded fallback string is dead.
	forged, err := GenerateJWT(JWTClaims{ID: "adm_001", Role: "SUPER_ADMIN"}, "gft_internal_secure_jwt_signing_key_2026_min32chars")
	if err != nil {
		t.Fatalf("Failed to mint fallback-signed token: %v", err)
	}
	req := authedP2GRequest("GET", "/api/v1/admin/bookings", forged)
	w := httptest.NewRecorder()
	h.GetAdminBookings(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 for a fallback-signed token, got %d", w.Code)
	}
}

func TestSSE122_RequiresAuth(t *testing.T) {
	t.Setenv("JWT_SECRET", p2gTestSecret)
	store := repository.NewStore()
	h := NewAPIHandler(store)

	// Anonymous: rejected before any stream headers.
	w := httptest.NewRecorder()
	h.SSEStream(w, httptest.NewRequest("GET", "/api/v1/sse/events", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 for anonymous SSE, got %d", w.Code)
	}
	// Forged token: rejected too.
	wBad := httptest.NewRecorder()
	h.SSEStream(wBad, authedP2GRequest("GET", "/api/v1/sse/events", "forged.token.here"))
	if wBad.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 for forged SSE token, got %d", wBad.Code)
	}

	// Authenticated: the stream opens. Cancel the context up front so the
	// test does not wait for the 2s heartbeat tick.
	token := mintP2GToken(t, JWTClaims{ID: "u1", Role: "USER"})
	for name, req := range map[string]*http.Request{
		"header": func() *http.Request { return authedP2GRequest("GET", "/api/v1/sse/events", token) }(),
		"query":  func() *http.Request { return httptest.NewRequest("GET", "/api/v1/sse/events?token="+token, nil) }(),
	} {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		r := req.WithContext(ctx)
		w := httptest.NewRecorder()
		h.SSEStream(w, r)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 for authed SSE via %s, got %d", name, w.Code)
		}
		if ct := w.Header().Get("Content-Type"); ct != "text/event-stream" {
			t.Fatalf("Expected event-stream content type via %s, got %q", name, ct)
		}
		if acao := w.Header().Get("Access-Control-Allow-Origin"); acao == "*" {
			t.Fatalf("SSE must not force Access-Control-Allow-Origin * anymore")
		}
	}
}

func seedBooking122(t *testing.T, store *repository.InMemoryStore, userID string, final float64) *domain.Booking {
	t.Helper()
	// IDs are UnixNano-based, and the Windows clock is too coarse for two
	// back-to-back mints — without the pause the second seed overwrites the
	// first under the same ID. (Store finding, reported with P2g.)
	time.Sleep(5 * time.Millisecond)
	b, err := store.CreateDraftBooking(domain.Booking{
		UserID:         userID,
		BaseAmountKRW:  final,
		FinalAmountKRW: final,
	})
	if err != nil {
		t.Fatalf("Failed to seed booking: %v", err)
	}
	return b
}

func TestBookingIDOR122(t *testing.T) {
	t.Setenv("JWT_SECRET", p2gTestSecret)
	store := repository.NewStore()
	h := NewAPIHandler(store)
	mine := seedBooking122(t, store, "user-a", 100000)

	own := mintP2GToken(t, JWTClaims{ID: "user-a", Role: "USER"})
	other := mintP2GToken(t, JWTClaims{ID: "user-b", Role: "USER"})
	admin := mintP2GToken(t, JWTClaims{ID: "adm_001", Role: "SUPER_ADMIN"})

	detail := func(token, id string) int {
		req := authedP2GRequest("GET", "/api/v1/bookings/"+id, token)
		req.SetPathValue("id", id)
		w := httptest.NewRecorder()
		h.GetBookingDetail(w, req)
		return w.Code
	}
	if code := detail("", mine.ID); code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 for anonymous booking read, got %d", code)
	}
	if code := detail(other, mine.ID); code != http.StatusForbidden {
		t.Fatalf("Expected 403 for cross-user booking read, got %d", code)
	}
	if code := detail(own, mine.ID); code != http.StatusOK {
		t.Fatalf("Expected 200 for own booking read, got %d", code)
	}
	if code := detail(admin, mine.ID); code != http.StatusOK {
		t.Fatalf("Expected 200 for admin booking read, got %d", code)
	}
	if code := detail(admin, "b-missing"); code != http.StatusNotFound {
		t.Fatalf("Expected 404 for missing booking, got %d", code)
	}

	list := func(token, userID string) (int, int) {
		req := authedP2GRequest("GET", "/api/v1/bookings/user/"+userID, token)
		req.SetPathValue("userId", userID)
		w := httptest.NewRecorder()
		h.GetUserBookings(w, req)
		if w.Code != http.StatusOK {
			return w.Code, -1
		}
		var resp struct {
			Data []domain.Booking `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to decode user bookings: %v", err)
		}
		return w.Code, len(resp.Data)
	}
	if code, _ := list("", "user-a"); code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 for anonymous booking list, got %d", code)
	}
	if code, _ := list(other, "user-a"); code != http.StatusForbidden {
		t.Fatalf("Expected 403 for cross-user booking list, got %d", code)
	}
	if code, n := list(own, "user-a"); code != http.StatusOK || n != 1 {
		t.Fatalf("Expected own list 200 with 1 row, got %d/%d", code, n)
	}
	if code, n := list(admin, "user-a"); code != http.StatusOK || n != 1 {
		t.Fatalf("Expected admin list 200 with 1 row, got %d/%d", code, n)
	}

	cancel := func(token, id string) int {
		req := authedP2GRequest("POST", "/api/v1/bookings/"+id+"/cancel", token)
		req.SetPathValue("id", id)
		w := httptest.NewRecorder()
		h.CancelBooking(w, req)
		return w.Code
	}
	if code := cancel("", mine.ID); code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 for anonymous cancel, got %d", code)
	}
	if code := cancel(other, mine.ID); code != http.StatusForbidden {
		t.Fatalf("Expected 403 for cross-user cancel, got %d", code)
	}
	if code := cancel(admin, "b-missing"); code != http.StatusNotFound {
		t.Fatalf("Expected 404 for missing cancel, got %d", code)
	}
	// DRAFT cannot cancel directly (DRAFT -> PENDING_PAYMENT -> PAID ->
	// ISSUING -> CONFIRMED -> CANCEL_REQUESTED is the legal walk).
	for _, next := range []domain.BookingStatus{domain.StatusPendingPayment, domain.StatusPaid, domain.StatusIssuing, domain.StatusConfirmed} {
		if _, err := store.TransitionBookingStatus(mine.ID, next, "122 test setup", "TEST"); err != nil {
			t.Fatalf("Setup transition to %s failed: %v", next, err)
		}
	}
	if code := cancel(own, mine.ID); code != http.StatusOK {
		t.Fatalf("Expected 200 for own cancel, got %d", code)
	}
	if got := store.Bookings[mine.ID].Status; got != domain.StatusCancelReq {
		t.Fatalf("Expected own cancel to request cancellation, got %s", got)
	}
}

func TestPartnerDashboard122_Computed(t *testing.T) {
	t.Setenv("JWT_SECRET", p2gTestSecret)
	t.Setenv("GO_PARTNER_PASSWORD", "test-partner-pass-122")
	store := repository.NewStore()
	h := NewAPIHandler(store)
	store.Bookings = make(map[string]domain.Booking)

	fetch := func(email string) map[string]any {
		_, token := loginPartner(t, h, email, "test-partner-pass-122")
		req := authedP2GRequest("GET", "/api/v1/partner/dashboard", token)
		w := httptest.NewRecorder()
		h.GetPartnerDashboard(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 for %s dashboard, got %d", email, w.Code)
		}
		var resp struct {
			Data map[string]any `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to decode dashboard: %v", err)
		}
		return resp.Data
	}

	// Empty books: zeros, but the seeded catalog still counts and the rating
	// is the seeded mean (4.8), not the old fixed 4.9.
	empty := fetch("hotel_partner@getfortrip.com")
	if empty["monthly_gross_krw"] != float64(0) || empty["pending_bookings_count"] != float64(0) {
		t.Fatalf("Expected zero gross/pending on empty books, got %v", empty)
	}
	if empty["active_products_count"] != float64(9) {
		t.Fatalf("Expected 9 seeded products, got %v", empty["active_products_count"])
	}
	if empty["average_rating"] != 4.8 {
		t.Fatalf("Expected seeded mean rating 4.8, got %v", empty["average_rating"])
	}

	seedBooking122(t, store, "user-a", 100000)
	seedBooking122(t, store, "user-b", 50000)
	hotel := fetch("hotel_partner@getfortrip.com")
	if hotel["monthly_gross_krw"] != float64(150000) || hotel["monthly_net_krw"] != float64(135000) {
		t.Fatalf("Expected hotel gross/net 150000/135000, got %v", hotel)
	}
	if hotel["pending_bookings_count"] != float64(2) {
		t.Fatalf("Expected 2 pending, got %v", hotel["pending_bookings_count"])
	}
	if hotel["commission_rate_percent"] != float64(10) {
		t.Fatalf("Expected hotel commission 10, got %v", hotel["commission_rate_percent"])
	}
	// The flight partner's own directory rate (0.95) drives its figures.
	flight := fetch("flight_partner@getfortrip.com")
	if flight["monthly_net_krw"] != float64(142500) || flight["commission_rate_percent"] != float64(5) {
		t.Fatalf("Expected flight net/commission 142500/5, got %v", flight)
	}
}

func TestPartnerSettlements122_Computed(t *testing.T) {
	t.Setenv("JWT_SECRET", p2gTestSecret)
	t.Setenv("GO_PARTNER_PASSWORD", "test-partner-pass-122")
	store := repository.NewStore()
	h := NewAPIHandler(store)
	store.Bookings = make(map[string]domain.Booking)

	fetch := func() []map[string]any {
		_, token := loginPartner(t, h, "partner@getfortrip.com", "test-partner-pass-122")
		req := authedP2GRequest("GET", "/api/v1/partner/settlements", token)
		w := httptest.NewRecorder()
		h.GetPartnerSettlements(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 for settlements, got %d", w.Code)
		}
		var resp struct {
			Data []map[string]any `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to decode settlements: %v", err)
		}
		return resp.Data
	}

	if rows := fetch(); rows == nil || len(rows) != 0 {
		t.Fatalf("Expected an empty (non-nil) settlement list, got %v", rows)
	}
	b := seedBooking122(t, store, "user-a", 100000)
	rows := fetch()
	if len(rows) != 1 {
		t.Fatalf("Expected 1 settlement row, got %d", len(rows))
	}
	row := rows[0]
	if row["booking_id"] != b.ID || row["gross_krw"] != float64(100000) ||
		row["fee_krw"] != float64(10000) || row["net_payout_krw"] != float64(90000) ||
		row["status"] != "SCHEDULED" {
		t.Fatalf("Unexpected settlement row: %v", row)
	}
	// Terminal booking states surface as terminal settlement states.
	done := store.Bookings[b.ID]
	done.Status = domain.StatusCompleted
	store.Bookings[b.ID] = done
	if rows := fetch(); rows[0]["status"] != "PAID" {
		t.Fatalf("Expected PAID for a completed booking, got %v", rows[0])
	}
	done.Status = domain.StatusCancelled
	store.Bookings[b.ID] = done
	if rows := fetch(); rows[0]["status"] != "VOID" {
		t.Fatalf("Expected VOID for a cancelled booking, got %v", rows[0])
	}
}

func ingestPayload123() []byte {
	body, _ := json.Marshal(domain.IngestRawRequest{
		Platform:        domain.PlatformKlook,
		SourceURL:       "https://www.klook.com/activity/4242-test/",
		SourceProductID: "4242",
		DomainType:      domain.ProductDomainActivity,
		RawJSON: map[string]interface{}{
			"title":     "E2E 테스트 입장권",
			"city":      "오사카",
			"country":   "일본",
			"price_krw": 10000.0,
		},
	})
	return body
}

func TestIngest123_AdminOnly(t *testing.T) {
	t.Setenv("JWT_SECRET", p2gTestSecret)
	store := repository.NewStore()
	h := NewAPIHandler(store)

	post := func(token string) int {
		req := httptest.NewRequest("POST", "/api/v1/webhook/ingest", bytes.NewReader(ingestPayload123()))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		h.IngestWebhook(w, req)
		return w.Code
	}
	if code := post(""); code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 for anonymous ingest, got %d", code)
	}
	partner := mintP2GToken(t, JWTClaims{ID: "ptn_htl_01", Role: "PARTNER", PartnerID: "ptn_htl_01"})
	if code := post(partner); code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 for partner (non-admin) ingest, got %d", code)
	}
	admin := mintP2GToken(t, JWTClaims{ID: "adm_001", Role: "SUPER_ADMIN"})
	if code := post(admin); code != http.StatusCreated {
		t.Fatalf("Expected 201 for admin ingest, got %d", code)
	}
	// Rule-based synthesis (no GEMINI_API_KEY) reports zero token burn.
	saved := store.GetUniversalProduct("gft-klook-4242")
	if saved == nil || saved.CuratedContent == nil {
		t.Fatalf("Expected ingested product with curated content")
	}
	if saved.CuratedContent.PromptTokens != 0 || saved.CuratedContent.CompletionTokens != 0 {
		t.Fatalf("Expected zero token counts for synthetic content, got %+v", saved.CuratedContent)
	}
}

func TestResync123_AuthAndNilGuard(t *testing.T) {
	t.Setenv("JWT_SECRET", p2gTestSecret)
	store := repository.NewStore()
	h := NewAPIHandler(store)
	admin := mintP2GToken(t, JWTClaims{ID: "adm_001", Role: "SUPER_ADMIN"})

	resync := func(token, id string) int {
		req := authedP2GRequest("POST", "/api/v1/curated/products/"+id+"/sync-webhook", token)
		req.SetPathValue("id", id)
		w := httptest.NewRecorder()
		h.ResyncWebhook(w, req)
		return w.Code
	}
	if code := resync("", "gft-klook-4242"); code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 for anonymous resync, got %d", code)
	}
	if code := resync(admin, "gft-missing"); code != http.StatusNotFound {
		t.Fatalf("Expected 404 for missing resync, got %d", code)
	}
	// A product row without a recorded referral refuses instead of panicking.
	store.UpsertUniversalProduct(&domain.UniversalProduct{
		ID: string(domain.PlatformKlook) + "-noref", Platform: domain.PlatformKlook,
		SourceProductID: "noref", DomainType: domain.ProductDomainActivity,
	})
	bareID := string(domain.PlatformKlook) + "-noref"
	bare := store.GetUniversalProduct(bareID)
	if bare == nil || bare.AffiliateReferral != nil {
		t.Fatalf("Test setup broken: expected a referral-less product")
	}
	if code := resync(admin, bareID); code != http.StatusConflict {
		t.Fatalf("Expected 409 for referral-less resync, got %d", code)
	}
	// A pipeline-ingested product resyncs cleanly.
	ingestReq := httptest.NewRequest("POST", "/api/v1/webhook/ingest", bytes.NewReader(ingestPayload123()))
	ingestReq.Header.Set("Content-Type", "application/json")
	ingestReq.Header.Set("Authorization", "Bearer "+admin)
	ingestW := httptest.NewRecorder()
	h.IngestWebhook(ingestW, ingestReq)
	if ingestW.Code != http.StatusCreated {
		t.Fatalf("Setup ingest failed: %d", ingestW.Code)
	}
	if code := resync(admin, "gft-klook-4242"); code != http.StatusOK {
		t.Fatalf("Expected 200 for referral-backed resync, got %d", code)
	}
}
