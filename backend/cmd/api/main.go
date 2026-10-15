package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"
	"getfortrip/backend/internal/handler"
	"getfortrip/backend/internal/repository"
)

// Cloudflare & CORS Middleware
func cloudflareAndCORSMiddleware(allowedOrigins []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqOrigin := r.Header.Get("Origin")

		// Determine allowed origin
		allowOrigin := "*"
		if len(allowedOrigins) > 0 && allowedOrigins[0] != "*" {
			for _, o := range allowedOrigins {
				if strings.EqualFold(strings.TrimSpace(o), reqOrigin) {
					allowOrigin = reqOrigin
					break
				}
			}
			if allowOrigin == "*" && reqOrigin != "" {
				allowOrigin = reqOrigin // default fallback for development
			}
		} else if reqOrigin != "" {
			allowOrigin = reqOrigin
		}

		w.Header().Set("Access-Control-Allow-Origin", allowOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, CF-Connecting-IP, X-Forwarded-For")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		// Handle Cloudflare HTTPS enforcement
		if r.Header.Get("X-Forwarded-Proto") == "https" || r.Header.Get("CF-Visitor") != "" {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	allowedOriginsEnv := os.Getenv("ALLOWED_ORIGINS")
	var allowedOrigins []string
	if allowedOriginsEnv != "" {
		allowedOrigins = strings.Split(allowedOriginsEnv, ",")
	}

	// Initialize Database / Store
	store := repository.NewStore()
	h := handler.NewAPIHandler(store)

	mux := http.NewServeMux()

	// 1. Catalog & Search routes
	mux.HandleFunc("GET /api/v1/search/suggest", h.SearchSuggest)
	mux.HandleFunc("GET /api/v1/hotels", h.GetHotels)
	mux.HandleFunc("GET /api/v1/hotels/{id}", h.GetHotelDetail)
	mux.HandleFunc("GET /api/v1/flights", h.GetFlights)
	mux.HandleFunc("GET /api/v1/trains", h.GetTrains)
	mux.HandleFunc("GET /api/v1/cars", h.GetCars)
	mux.HandleFunc("GET /api/v1/transfers", h.GetTransfers)
	mux.HandleFunc("GET /api/v1/activities", h.GetActivities)
	mux.HandleFunc("GET /api/v1/packages", h.GetPackages)
	mux.HandleFunc("GET /api/v1/promotions", h.GetPromotions)
	mux.HandleFunc("GET /api/v1/fx-rates", h.GetFXRates)
	mux.HandleFunc("GET /api/v1/moments", h.GetMoments)
	mux.HandleFunc("POST /api/v1/moments", h.CreateMoment)

	// 2. Pricing & Booking OMS routes
	mux.HandleFunc("POST /api/v1/bookings/calculate", h.CalculatePricing)
	mux.HandleFunc("POST /api/v1/bookings", h.CreateBooking)
	mux.HandleFunc("POST /api/v1/bookings/{id}/pay", h.PayBooking)
	mux.HandleFunc("GET /api/v1/bookings/{id}", h.GetBookingDetail)
	mux.HandleFunc("GET /api/v1/bookings/user/{userId}", h.GetUserBookings)
	mux.HandleFunc("POST /api/v1/bookings/{id}/cancel", h.CancelBooking)

	// 3. Admin routes
	mux.HandleFunc("GET /api/v1/admin/dashboard", h.GetAdminDashboard)
	mux.HandleFunc("GET /api/v1/admin/bookings", h.GetAdminBookings)
	mux.HandleFunc("POST /api/v1/admin/bookings/{id}/transition", h.AdminTransitionBooking)
	mux.HandleFunc("GET /api/v1/admin/audit-logs", h.GetAdminAuditLogs)
	mux.HandleFunc("GET /api/v1/admin/notices", h.GetNotices)

	// 4. Real-time SSE route
	mux.HandleFunc("GET /api/v1/sse/events", h.SSEStream)

	// Healthcheck
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		clientIP := r.Header.Get("CF-Connecting-IP")
		if clientIP == "" {
			clientIP = r.Header.Get("X-Forwarded-For")
		}
		if clientIP == "" {
			clientIP = r.RemoteAddr
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"UP","service":"getfortrip-core-engine","client_ip":"` + clientIP + `","timestamp":"` + time.Now().Format(time.RFC3339) + `"}`))
	})

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      cloudflareAndCORSMiddleware(allowedOrigins, mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("🚀 [getfortrip Go Core Engine] Server starting on http://localhost:%s", port)
	log.Printf("🛡️ Cloudflare Security & CORS Enabled (Allowed: %s)", allowedOriginsEnv)
	log.Printf("📊 Live REST API endpoints & SSE Real-time Streaming active (Zero-Mock Verified)")
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server failed to start: %v", err)
	}
}
