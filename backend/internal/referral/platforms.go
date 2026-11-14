package referral

import (
	"time"
)

// OTAPlatform defines the supported external travel platforms.
// Moved from internal/domain/curation.go by TG-01 so the referral package is
// self-contained; the serving-shaped domain package was deleted.
type OTAPlatform string

const (
	PlatformAgoda      OTAPlatform = "AGODA"
	PlatformTripCom    OTAPlatform = "TRIP_COM"
	PlatformKlook      OTAPlatform = "KLOOK"
	PlatformKKday      OTAPlatform = "KKDAY"
	PlatformMyRealTrip OTAPlatform = "MYREALTRIP"
)

// AffiliateReferral is the minted referral link record (moved verbatim).
type AffiliateReferral struct {
	ID               string      `json:"id"`
	ProductID        string      `json:"product_id"`
	Platform         OTAPlatform `json:"platform"`
	OriginalURL      string      `json:"original_url"`
	CleanURL         string      `json:"clean_url"`
	FinalReferralURL string      `json:"final_referral_url"`
	PartnerID        string      `json:"partner_id"`
	SubTrackingID    string      `json:"sub_tracking_id"`
	ClickCount       int         `json:"click_count"`
	LastClickedAt    *time.Time  `json:"last_clicked_at,omitempty"`
	CreatedAt        time.Time   `json:"created_at"`
	UpdatedAt        time.Time   `json:"updated_at"`
}
