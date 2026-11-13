package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"getfortrip/backend/internal/domain"
	"getfortrip/backend/internal/ingest"
)

// IngestWebhook handles POST /api/v1/webhook/ingest
// Receives crawled raw HTML/JSON from Python crawlers for Agoda, TripCom, Klook, KKday, MyRealTrip.
//
// #123: admin-JWT only. Every call burns a Gemini rewrite (billed per token
// when GEMINI_API_KEY is set) and mints monetized referral URLs, so anonymous
// callers must never reach the pipeline. Configure via backend/.env
// (JWT_SECRET + ADMIN_PASSWORD); affiliate IDs are optional overrides there,
// development defaults otherwise.
func (h *APIHandler) IngestWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed. Use POST.")
		return
	}
	if !checkAdminAuth(r) {
		writeError(w, http.StatusUnauthorized, "admin authentication required")
		return
	}

	var req domain.IngestRawRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request JSON: "+err.Error())
		return
	}

	pipeline := ingest.NewPipelineController(h.store)
	result, err := pipeline.ProcessRawIngest(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Pipeline processing error: "+err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, result)
}

// GetCuratedProducts handles GET /api/v1/curated/products
func (h *APIHandler) GetCuratedProducts(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	platform := domain.OTAPlatform(q.Get("platform"))
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 {
		limit = 50
	}

	products := h.store.GetCuratedProducts(platform, limit)
	writeJSON(w, http.StatusOK, products)
}

// GetCuratedProductDetail handles GET /api/v1/curated/products/{id}
func (h *APIHandler) GetCuratedProductDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "Missing product id in path")
		return
	}

	p := h.store.GetUniversalProduct(id)
	if p == nil {
		writeError(w, http.StatusNotFound, "Curated product not found")
		return
	}

	writeJSON(w, http.StatusOK, p)
}

// ResyncWebhook handles POST /api/v1/curated/products/{id}/sync-webhook
//
// #123: admin-JWT only (same billable pipeline as IngestWebhook), and a
// product without a recorded referral refuses with 409 instead of panicking
// on a nil AffiliateReferral.
func (h *APIHandler) ResyncWebhook(w http.ResponseWriter, r *http.Request) {
	if !checkAdminAuth(r) {
		writeError(w, http.StatusUnauthorized, "admin authentication required")
		return
	}
	id := r.PathValue("id")
	p := h.store.GetUniversalProduct(id)
	if p == nil {
		writeError(w, http.StatusNotFound, "Product not found")
		return
	}
	if p.AffiliateReferral == nil {
		writeError(w, http.StatusConflict, "Product has no recorded referral to resync from")
		return
	}

	pipeline := ingest.NewPipelineController(h.store)
	webhookLog, err := pipeline.ProcessRawIngest(r.Context(), domain.IngestRawRequest{
		Platform:        p.Platform,
		SourceURL:       p.AffiliateReferral.CleanURL,
		SourceProductID: p.SourceProductID,
		DomainType:      p.DomainType,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Resync failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, webhookLog)
}
