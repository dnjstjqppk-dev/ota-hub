package webhook

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
	"getfortrip/backend/internal/domain"
)

// Dispatcher manages outbound synchronization to travel-checkin
type Dispatcher struct {
	endpoint   string
	apiKey     string
	httpClient *http.Client
}

// NewDispatcher initializes the travel-checkin webhook dispatcher
func NewDispatcher() *Dispatcher {
	endpoint := os.Getenv("TRAVEL_CHECKIN_WEBHOOK_URL")
	if endpoint == "" {
		endpoint = "https://api.travel-checkin.com/v1/posts/sync"
	}
	apiKey := os.Getenv("TRAVEL_CHECKIN_API_KEY")

	return &Dispatcher{
		endpoint: endpoint,
		apiKey:   apiKey,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// DispatchCuratedProduct formats the comprehensive payload and posts it to travel-checkin
func (d *Dispatcher) DispatchCuratedProduct(ctx context.Context, p *domain.UniversalProduct) (*domain.TravelCheckinWebhookLog, error) {
	if p.CuratedContent == nil {
		return nil, fmt.Errorf("cannot dispatch product without curated content")
	}

	affURL := ""
	partnerID := ""
	if p.AffiliateReferral != nil {
		affURL = p.AffiliateReferral.FinalReferralURL
		partnerID = p.AffiliateReferral.PartnerID
	}

	payload := domain.TravelCheckinPostPayload{
		Event:     "PRODUCT_CURATED_PUBLISH",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Publisher: "getfortrip",
		SourceOTA: p.Platform,
		Product: domain.TravelCheckinProductDTO{
			ID:             p.ID,
			Slug:           p.Slug,
			Domain:         p.DomainType,
			OriginalTitle:  p.OriginalTitle,
			B2CTitle:       p.CuratedContent.B2CTitle,
			OneLineSummary: p.CuratedContent.OneLineSummary,
			KeyBenefits:    p.CuratedContent.KeyBenefits,
			SEOBlogContent: p.CuratedContent.SEOBlogContent,
			MetaKeywords:   p.CuratedContent.SEOMetaKeywords,
			Pricing: domain.TravelCheckinPrice{
				BasePriceKRW:     p.BasePriceKRW,
				OriginalCurrency: p.OriginalCurrency,
				OriginalPrice:    p.OriginalPrice,
			},
			Location: domain.TravelCheckinLoc{
				CountryName: p.CountryName,
				CityName:    p.CityName,
				Latitude:    p.Latitude,
				Longitude:   p.Longitude,
			},
			ThumbnailURL: p.ThumbnailURL,
			ImageGallery: p.ImageGallery,
			Affiliate: domain.TravelCheckinAff{
				BookingURL: affURL,
				PartnerID:  partnerID,
				Channel:    "travel-checkin-sync",
			},
			PlatformDetails: p.PlatformDetails,
		},
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	logEntry := &domain.TravelCheckinWebhookLog{
		ProductID:      p.ID,
		TargetEndpoint: d.endpoint,
		Payload:        payload,
		SyncStatus:     domain.SyncStatusPending,
		RetryCount:     0,
		MaxRetries:     5,
		CreatedAt:      time.Now(),
	}

	// Prepare HTTP request
	req, err := http.NewRequestWithContext(ctx, "POST", d.endpoint, bytes.NewReader(payloadBytes))
	if err != nil {
		logEntry.SyncStatus = domain.SyncStatusFailed
		logEntry.LastError = err.Error()
		return logEntry, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "getfortrip-pipeline-dispatcher/1.0")
	if d.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+d.apiKey)
	}

	res, err := d.httpClient.Do(req)
	if err != nil {
		// Network or DNS failure
		logEntry.SyncStatus = domain.SyncStatusRetrying
		logEntry.LastError = err.Error()
		logEntry.RetryCount = 1
		return logEntry, nil
	}
	defer res.Body.Close()

	bodyBytes, _ := io.ReadAll(res.Body)
	logEntry.HTTPStatus = res.StatusCode
	logEntry.ResponseBody = string(bodyBytes)

	now := time.Now()
	if res.StatusCode >= 200 && res.StatusCode < 300 {
		logEntry.SyncStatus = domain.SyncStatusSuccess
		logEntry.SyncedAt = &now
	} else {
		logEntry.SyncStatus = domain.SyncStatusFailed
		logEntry.LastError = fmt.Sprintf("travel-checkin returned non-2xx status: %d", res.StatusCode)
	}

	return logEntry, nil
}

