package domain

import (
	"time"
)

// OTAPlatform defines the supported external travel platforms
type OTAPlatform string

const (
	PlatformAgoda      OTAPlatform = "AGODA"
	PlatformTripCom    OTAPlatform = "TRIP_COM"
	PlatformKlook      OTAPlatform = "KLOOK"
	PlatformKKday      OTAPlatform = "KKDAY"
	PlatformMyRealTrip OTAPlatform = "MYREALTRIP"
)

// ProductDomain defines the unified product domain category
type ProductDomain string

const (
	ProductDomainAccommodation ProductDomain = "ACCOMMODATION"
	ProductDomainFlight        ProductDomain = "FLIGHT"
	ProductDomainTrain         ProductDomain = "TRAIN"
	ProductDomainActivity      ProductDomain = "ACTIVITY"
	ProductDomainTour          ProductDomain = "TOUR"
	ProductDomainTransport     ProductDomain = "TRANSPORT"
	ProductDomainConnectivity  ProductDomain = "CONNECTIVITY"
)

// CurationStatus represents the pipeline lifecycle of curated content
type CurationStatus string

const (
	CurationStatusPending     CurationStatus = "PENDING"
	CurationStatusAIProcessed CurationStatus = "AI_PROCESSED"
	CurationStatusFailed      CurationStatus = "FAILED"
	CurationStatusPublished   CurationStatus = "PUBLISHED"
)

// SyncStatus represents the status of outbound webhook synchronization
type SyncStatus string

const (
	SyncStatusPending  SyncStatus = "PENDING"
	SyncStatusSuccess  SyncStatus = "SUCCESS"
	SyncStatusFailed   SyncStatus = "FAILED"
	SyncStatusRetrying SyncStatus = "RETRYING"
)

// IngestRawRequest is the inbound webhook payload sent by Python crawlers
type IngestRawRequest struct {
	Platform        OTAPlatform            `json:"platform"`
	SourceURL       string                 `json:"source_url"`
	SourceProductID string                 `json:"source_product_id"`
	DomainType      ProductDomain          `json:"domain_type"`
	RawHTML         string                 `json:"raw_html,omitempty"`
	RawJSON         map[string]interface{} `json:"raw_json,omitempty"`
	Metadata        map[string]interface{} `json:"metadata,omitempty"`
}

// UniversalProduct represents the master catalog record in getfortrip
type UniversalProduct struct {
	ID               string         `json:"id"`
	Platform         OTAPlatform    `json:"platform"`
	SourceProductID  string         `json:"source_product_id"`
	DomainType       ProductDomain  `json:"domain_type"`
	OriginalTitle    string         `json:"original_title"`
	Slug             string         `json:"slug"`
	CountryName      string         `json:"country_name"`
	CityName         string         `json:"city_name"`
	Latitude         float64        `json:"latitude"`
	Longitude        float64        `json:"longitude"`
	BasePriceKRW     float64        `json:"base_price_krw"`
	OriginalCurrency string         `json:"original_currency"`
	OriginalPrice    float64        `json:"original_price"`
	Rating           float64        `json:"rating"`
	ReviewCount      int            `json:"review_count"`
	ThumbnailURL     string         `json:"thumbnail_url"`
	ImageGallery     []string       `json:"image_gallery"`
	CurationStatus   CurationStatus `json:"curation_status"`
	IsActive         bool           `json:"is_active"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`

	// Joined/Hydrated relationships
	CuratedContent    *CuratedContent        `json:"curated_content,omitempty"`
	AffiliateReferral *AffiliateReferral     `json:"affiliate_referral,omitempty"`
	PlatformDetails   map[string]interface{} `json:"platform_details,omitempty"`
}

// CuratedContent represents the Gemini AI-generated B2C copy & SEO guide
type CuratedContent struct {
	ID               string    `json:"id"`
	ProductID        string    `json:"product_id"`
	B2CTitle         string    `json:"b2c_title"`
	OneLineSummary   string    `json:"one_line_summary"`
	KeyBenefits      []string  `json:"key_benefits"`
	SEOBlogContent   string    `json:"seo_blog_content"`
	SEOMetaKeywords  []string  `json:"seo_meta_keywords"`
	AIModelVersion   string    `json:"ai_model_version"`
	PromptTokens     int       `json:"prompt_tokens"`
	CompletionTokens int       `json:"completion_tokens"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// AffiliateReferral represents synthesized outbound deep links
type AffiliateReferral struct {
	ID               string    `json:"id"`
	ProductID        string    `json:"product_id"`
	Platform         OTAPlatform `json:"platform"`
	OriginalURL      string    `json:"original_url"`
	CleanURL         string    `json:"clean_url"`
	FinalReferralURL string    `json:"final_referral_url"`
	PartnerID        string    `json:"partner_id"`
	SubTrackingID    string    `json:"sub_tracking_id"`
	ClickCount       int       `json:"click_count"`
	LastClickedAt    *time.Time `json:"last_clicked_at,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// TravelCheckinWebhookLog tracks outbound push synchronization
type TravelCheckinWebhookLog struct {
	ID             string      `json:"id"`
	ProductID      string      `json:"product_id"`
	TargetEndpoint string      `json:"target_endpoint"`
	Payload        interface{} `json:"payload"`
	HTTPStatus     int         `json:"http_status"`
	ResponseBody   string      `json:"response_body"`
	SyncStatus     SyncStatus  `json:"sync_status"`
	RetryCount     int         `json:"retry_count"`
	MaxRetries     int         `json:"max_retries"`
	LastError      string      `json:"last_error,omitempty"`
	SyncedAt       *time.Time  `json:"synced_at,omitempty"`
	CreatedAt      time.Time   `json:"created_at"`
}

// TravelCheckinPostPayload is the standard contract dispatched to travel-checkin
type TravelCheckinPostPayload struct {
	Event     string                 `json:"event"`
	Timestamp string                 `json:"timestamp"`
	Publisher string                 `json:"publisher"`
	SourceOTA OTAPlatform            `json:"source_ota"`
	Product   TravelCheckinProductDTO `json:"product"`
}

type TravelCheckinProductDTO struct {
	ID              string             `json:"id"`
	Slug            string             `json:"slug"`
	Domain          ProductDomain      `json:"domain"`
	OriginalTitle   string             `json:"original_title"`
	B2CTitle        string             `json:"b2c_title"`
	OneLineSummary  string             `json:"one_line_summary"`
	KeyBenefits     []string           `json:"key_benefits"`
	SEOBlogContent  string             `json:"seo_blog_content"`
	MetaKeywords    []string           `json:"meta_keywords"`
	Pricing         TravelCheckinPrice `json:"pricing"`
	Location        TravelCheckinLoc   `json:"location"`
	ThumbnailURL    string             `json:"thumbnail_url"`
	ImageGallery    []string           `json:"image_gallery"`
	Affiliate       TravelCheckinAff   `json:"affiliate"`
	PlatformDetails map[string]interface{} `json:"platform_details,omitempty"`
}

type TravelCheckinPrice struct {
	BasePriceKRW    float64 `json:"base_price_krw"`
	OriginalCurrency string  `json:"original_currency"`
	OriginalPrice   float64 `json:"original_price"`
}

type TravelCheckinLoc struct {
	CountryName string  `json:"country_name"`
	CityName    string  `json:"city_name"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
}

type TravelCheckinAff struct {
	BookingURL string `json:"booking_url"`
	PartnerID  string `json:"partner_id"`
	Channel    string `json:"channel"`
}

