package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCORSProtection(t *testing.T) {
	dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := cloudflareAndCORSMiddleware(nil, dummyHandler)

	t.Run("untrusted_origin_not_reflected", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/health", nil)
		req.Header.Set("Origin", "https://evil-hacker.com")
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		allowOrigin := w.Header().Get("Access-Control-Allow-Origin")
		if allowOrigin == "https://evil-hacker.com" {
			t.Fatalf("Security failure: untrusted origin reflected in Access-Control-Allow-Origin")
		}
		if allowCreds := w.Header().Get("Access-Control-Allow-Credentials"); allowCreds == "true" && allowOrigin == "https://evil-hacker.com" {
			t.Fatalf("Security failure: credentials allowed for untrusted origin")
		}
	})

	t.Run("allowed_origin_permitted", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/health", nil)
		req.Header.Set("Origin", "https://ota-hub.dnjstjqppk.workers.dev")
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		allowOrigin := w.Header().Get("Access-Control-Allow-Origin")
		if allowOrigin != "https://ota-hub.dnjstjqppk.workers.dev" {
			t.Fatalf("Expected allowed origin to be reflected, got: %s", allowOrigin)
		}
		if allowCreds := w.Header().Get("Access-Control-Allow-Credentials"); allowCreds != "true" {
			t.Fatalf("Expected credentials to be true for allowed origin")
		}
	})

	t.Run("options_preflight_rejected_for_evil_origin", func(t *testing.T) {
		req := httptest.NewRequest("OPTIONS", "/health", nil)
		req.Header.Set("Origin", "https://malicious.org")
		w := httptest.NewRecorder()

		handler.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("Expected 403 Forbidden for unallowed OPTIONS preflight, got %d", w.Code)
		}
	})
}

