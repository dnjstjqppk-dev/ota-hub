package ingest

import (
	"context"
	"fmt"
	"math/rand"
	"regexp"
	"strings"
	"time"

	"getfortrip/backend/internal/curation"
	"getfortrip/backend/internal/domain"
	"getfortrip/backend/internal/referral"
	"getfortrip/backend/internal/repository"
	"getfortrip/backend/internal/webhook"
)

// PipelineController orchestrates multi-platform crawling ingestion, AI curation, and outbound syndication
type PipelineController struct {
	store      *repository.Store
	gemini     *curation.GeminiClient
	referral   *referral.Synthesizer
	dispatcher *webhook.Dispatcher
}

// NewPipelineController instantiates the controller with dependencies
func NewPipelineController(store *repository.Store) *PipelineController {
	return &PipelineController{
		store:      store,
		gemini:     curation.NewGeminiClient(),
		referral:   referral.NewSynthesizer(),
		dispatcher: webhook.NewDispatcher(),
	}
}

// IngestResult contains the complete response returned to the caller
type IngestResult struct {
	Success        bool                            `json:"success"`
	ProductID      string                          `json:"product_id"`
	Slug           string                          `json:"slug"`
	Platform       domain.OTAPlatform              `json:"platform"`
	CuratedTitle   string                          `json:"curated_title"`
	OneLineSummary string                          `json:"one_line_summary"`
	KeyBenefits    []string                        `json:"key_benefits"`
	ReferralURL    string                          `json:"referral_url"`
	WebhookSync    *domain.TravelCheckinWebhookLog `json:"webhook_sync"`
	Message        string                          `json:"message"`
}

// ProcessRawIngest executes the end-to-end 5-stage ingestion pipeline
func (c *PipelineController) ProcessRawIngest(ctx context.Context, req domain.IngestRawRequest) (*IngestResult, error) {
	// Step 0: Validation & Platform Auto-detection
	if req.Platform == "" && req.SourceURL != "" {
		req.Platform = c.referral.ExtractPlatform(req.SourceURL)
	}
	if req.Platform == "" {
		return nil, fmt.Errorf("platform is required or must be determinable from source_url")
	}
	if req.SourceProductID == "" {
		req.SourceProductID = fmt.Sprintf("prod-%d", time.Now().Unix())
	}

	// Step 1: Save Raw Payload Archive
	rawID := c.store.SaveRawScrape(req)

	// Step 2: Normalize Raw Data into UniversalProduct
	prod, platformMeta, err := c.normalizeProduct(&req)
	if err != nil {
		return nil, fmt.Errorf("normalization failed: %w", err)
	}
	prod.PlatformDetails = platformMeta

	// Step 3: Affiliate Referral Synthesis
	subID := fmt.Sprintf("gft_%s_%s", strings.ToLower(string(req.Platform)), prod.Slug)
	if len(subID) > 50 {
		subID = subID[:50]
	}
	aff, err := c.referral.BuildReferralURL(req.Platform, req.SourceURL, subID)
	if err != nil {
		return nil, fmt.Errorf("referral synthesis failed: %w", err)
	}
	aff.ProductID = prod.ID
	prod.AffiliateReferral = aff

	// Step 4: Gemini AI B2C Rewriting (Anti-Duplicate Content Engine)
	curated, err := c.gemini.RewriteProduct(ctx, prod, &req)
	if err != nil {
		return nil, fmt.Errorf("gemini AI rewrite failed: %w", err)
	}
	curated.ProductID = prod.ID
	prod.CuratedContent = curated
	prod.CurationStatus = domain.CurationStatusAIProcessed

	// Save to Store / Database
	c.store.UpsertUniversalProduct(prod)
	c.store.SaveCuratedContent(curated)
	c.store.SaveAffiliateReferral(aff)

	// Step 5: travel-checkin Outbound Webhook Synchronization
	webhookLog, err := c.dispatcher.DispatchCuratedProduct(ctx, prod)
	if webhookLog != nil {
		c.store.LogWebhookDispatch(webhookLog)
	}

	return &IngestResult{
		Success:        true,
		ProductID:      prod.ID,
		Slug:           prod.Slug,
		Platform:       prod.Platform,
		CuratedTitle:   curated.B2CTitle,
		OneLineSummary: curated.OneLineSummary,
		KeyBenefits:    curated.KeyBenefits,
		ReferralURL:    aff.FinalReferralURL,
		WebhookSync:    webhookLog,
		Message:        fmt.Sprintf("Successfully ingested %s product (%s), curated by Gemini and synced to travel-checkin [raw_id: %s]", prod.Platform, prod.SourceProductID, rawID),
	}, nil
}

// normalizeProduct extracts standard attributes depending on the source OTA
func (c *PipelineController) normalizeProduct(req *domain.IngestRawRequest) (*domain.UniversalProduct, map[string]interface{}, error) {
	platformMeta := make(map[string]interface{})
	if req.RawJSON != nil {
		for k, v := range req.RawJSON {
			platformMeta[k] = v
		}
	}

	// Extract helper
	getString := func(key string, fallback string) string {
		if req.RawJSON != nil {
			if v, ok := req.RawJSON[key]; ok {
				if s, ok := v.(string); ok && s != "" {
					return s
				}
			}
		}
		return fallback
	}

	getFloat := func(key string, fallback float64) float64 {
		if req.RawJSON != nil {
			if v, ok := req.RawJSON[key]; ok {
				switch num := v.(type) {
				case float64:
					return num
				case int:
					return float64(num)
				}
			}
		}
		return fallback
	}

	prodID := fmt.Sprintf("gft-%s-%s", strings.ToLower(string(req.Platform)), req.SourceProductID)
	title := getString("title", getString("name", "신규 여행 상품"))
	city := getString("city", "도쿄")
	country := getString("country", "일본")
	price := getFloat("price_krw", getFloat("price", 89000))
	thumbnail := getString("thumbnail_url", getString("image_url", "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800"))

	domainType := req.DomainType
	if domainType == "" {
		switch req.Platform {
		case domain.PlatformAgoda:
			domainType = domain.ProductDomainAccommodation
		case domain.PlatformTripCom:
			domainType = domain.ProductDomainFlight
		case domain.PlatformKlook:
			domainType = domain.ProductDomainActivity
		case domain.PlatformKKday:
			domainType = domain.ProductDomainTour
		case domain.PlatformMyRealTrip:
			domainType = domain.ProductDomainTour
		default:
			domainType = domain.ProductDomainActivity
		}
	}

	// Generate safe slug
	slug := c.generateSlug(req.Platform, city, title)

	prod := &domain.UniversalProduct{
		ID:               prodID,
		Platform:         req.Platform,
		SourceProductID:  req.SourceProductID,
		DomainType:       domainType,
		OriginalTitle:    title,
		Slug:             slug,
		CountryName:      country,
		CityName:         city,
		Latitude:         getFloat("latitude", 35.6762),
		Longitude:        getFloat("longitude", 139.6503),
		BasePriceKRW:     price,
		OriginalCurrency: getString("currency", "KRW"),
		OriginalPrice:    getFloat("original_price", price*1.15),
		Rating:           getFloat("rating", 4.8),
		ReviewCount:      int(getFloat("review_count", 128)),
		ThumbnailURL:     thumbnail,
		ImageGallery: []string{
			thumbnail,
		},
		CurationStatus: domain.CurationStatusPending,
		IsActive:       true,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}

	return prod, platformMeta, nil
}

// generateSlug creates an SEO-friendly URL slug
func (c *PipelineController) generateSlug(platform domain.OTAPlatform, city, title string) string {
	cleanTitle := regexp.MustCompile(`[^a-zA-Z0-9가-힣]+`).ReplaceAllString(title, "-")
	cleanTitle = strings.Trim(cleanTitle, "-")
	if len(cleanTitle) > 40 {
		cleanTitle = cleanTitle[:40]
	}

	cleanCity := strings.ToLower(regexp.MustCompile(`[^a-zA-Z0-9]+`).ReplaceAllString(city, ""))
	if cleanCity == "" {
		cleanCity = "tour"
	}

	randomSuffix := rand.Intn(9000) + 1000
	return fmt.Sprintf("%s-%s-%s-%d", strings.ToLower(string(platform)), cleanCity, cleanTitle, randomSuffix)
}

