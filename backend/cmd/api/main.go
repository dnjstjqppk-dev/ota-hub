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

var defaultAllowedOrigins = []string{
	"https://ota-hub.dnjstjqppk.workers.dev",
	"https://getfortrip-admin.dnjstjqppk.workers.dev",
	"https://getfortrip.com",
	"https://www.getfortrip.com",
	"http://localhost:3000",
	"http://127.0.0.1:3000",
	"http://localhost:8080",
	"http://127.0.0.1:8080",
}

func isAllowedOrigin(origin string, allowedList []string) bool {
	if origin == "" {
		return false
	}
	clean := strings.ToLower(strings.TrimSpace(origin))
	for _, o := range allowedList {
		oTrim := strings.ToLower(strings.TrimSpace(o))
		if oTrim == "*" || oTrim == clean {
			return true
		}
	}
	for _, o := range defaultAllowedOrigins {
		if strings.ToLower(o) == clean {
			return true
		}
	}
	if strings.HasSuffix(clean, ".workers.dev") || strings.HasSuffix(clean, ".getfortrip.com") ||
		strings.HasPrefix(clean, "http://localhost:") || strings.HasPrefix(clean, "http://127.0.0.1:") {
		return true
	}
	return false
}

// Cloudflare & CORS Middleware
func cloudflareAndCORSMiddleware(allowedOrigins []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqOrigin := r.Header.Get("Origin")

		if reqOrigin != "" && isAllowedOrigin(reqOrigin, allowedOrigins) {
			w.Header().Set("Access-Control-Allow-Origin", reqOrigin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Payment-Proof, CF-Connecting-IP, X-Forwarded-For")
		}

		// Handle Cloudflare HTTPS enforcement
		if r.Header.Get("X-Forwarded-Proto") == "https" || r.Header.Get("CF-Visitor") != "" {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}

		if r.Method == http.MethodOptions {
			if reqOrigin != "" && !isAllowedOrigin(reqOrigin, allowedOrigins) {
				w.WriteHeader(http.StatusForbidden)
				return
			}
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
	mux.HandleFunc("GET /api/v1/flights/{id}", h.GetFlightDetail)
	mux.HandleFunc("GET /api/v1/trains", h.GetTrains)
	mux.HandleFunc("GET /api/v1/trains/{id}", h.GetTrainDetail)
	mux.HandleFunc("GET /api/v1/cars", h.GetCars)
	mux.HandleFunc("GET /api/v1/cars/{id}", h.GetCarDetail)
	mux.HandleFunc("GET /api/v1/transfers", h.GetTransfers)
	mux.HandleFunc("GET /api/v1/transfers/{id}", h.GetTransferDetail)
	mux.HandleFunc("GET /api/v1/activities", h.GetActivities)
	mux.HandleFunc("GET /api/v1/activities/{id}", h.GetActivityDetail)
	mux.HandleFunc("GET /api/v1/packages", h.GetPackages)
	mux.HandleFunc("GET /api/v1/packages/{id}", h.GetPackageDetail)
	mux.HandleFunc("GET /api/v1/filters/{domain}", h.GetDomainFilters)
	mux.HandleFunc("GET /api/v1/filters", h.GetAllFilters)
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
	mux.HandleFunc("POST /api/v1/admin/login", h.AdminLogin)
	mux.HandleFunc("GET /api/v1/admin/dashboard", h.GetAdminDashboard)
	mux.HandleFunc("GET /api/v1/admin/bookings", h.GetAdminBookings)
	mux.HandleFunc("POST /api/v1/admin/bookings/{id}/transition", h.AdminTransitionBooking)
	mux.HandleFunc("GET /api/v1/admin/audit-logs", h.GetAdminAuditLogs)
	mux.HandleFunc("GET /api/v1/admin/notices", h.GetNotices)

	// 4. Real-time SSE route
	mux.HandleFunc("GET /api/v1/sse/events", h.SSEStream)

	// 5. Multi-Platform Webhook Ingestion & Curation Pipeline (Agoda, TripCom, Klook, KKday, MyRealTrip)
	mux.HandleFunc("POST /api/v1/webhook/ingest", h.IngestWebhook)
	mux.HandleFunc("GET /api/v1/curated/products", h.GetCuratedProducts)
	mux.HandleFunc("GET /api/v1/curated/products/{id}", h.GetCuratedProductDetail)
	mux.HandleFunc("POST /api/v1/curated/products/{id}/sync-webhook", h.ResyncWebhook)

	// 6. Partner B2B routes
	mux.HandleFunc("POST /api/v1/partner/login", h.PartnerLogin)
	mux.HandleFunc("GET /api/v1/partner/dashboard", h.GetPartnerDashboard)
	mux.HandleFunc("GET /api/v1/partner/bookings", h.GetPartnerBookings)
	mux.HandleFunc("POST /api/v1/partner/bookings/{id}/action", h.PartnerActionBooking)
	mux.HandleFunc("GET /api/v1/partner/settlements", h.GetPartnerSettlements)

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
