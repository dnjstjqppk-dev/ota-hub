package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"getfortrip/backend/internal/domain"
	"getfortrip/backend/internal/repository"
)

func TestIngestWebhookHTTPHandler(t *testing.T) {
	store := repository.NewStore()
	h := NewAPIHandler(store)

	reqPayload := domain.IngestRawRequest{
		Platform:        domain.PlatformKlook,
		SourceURL:       "https://www.klook.com/ko/activity/999-tokyo-skytree/",
		SourceProductID: "999",
		DomainType:      domain.ProductDomainActivity,
		RawJSON: map[string]interface{}{
			"title":     "도쿄 스카이트리 전망대 입장권",
			"city":      "도쿄",
			"country":   "일본",
			"price_krw": 25000.0,
		},
	}

	bodyBytes, _ := json.Marshal(reqPayload)
	req := httptest.NewRequest("POST", "/api/v1/webhook/ingest", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.IngestWebhook(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Expected status 201 Created, got %d: %s", w.Code, w.Body.String())
	}

	var res struct {
		Code int `json:"code"`
		Data struct {
			Success      bool   `json:"success"`
			ProductID    string `json:"product_id"`
			CuratedTitle string `json:"curated_title"`
			ReferralURL  string `json:"referral_url"`
		} `json:"data"`
	}

	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if !res.Data.Success {
		t.Errorf("Expected success to be true")
	}
	if res.Data.ProductID != "gft-klook-999" {
		t.Errorf("Expected product_id gft-klook-999, got %s", res.Data.ProductID)
	}

	// Test GET /api/v1/curated/products
	getReq := httptest.NewRequest("GET", "/api/v1/curated/products", nil)
	getW := httptest.NewRecorder()
	h.GetCuratedProducts(getW, getReq)

	if getW.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", getW.Code)
	}
}

