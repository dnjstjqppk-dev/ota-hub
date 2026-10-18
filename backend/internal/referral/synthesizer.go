package referral

import (
	"fmt"
	"getfortrip/backend/internal/domain"
	"net/url"
	"os"
	"strings"
)

// Synthesizer generates affiliate referral links for all 5 platforms
type Synthesizer struct {
	AgodaCID          string
	TripComAllianceID string
	KlookAID          string
	KKdayCID          string
	MyRealTripPID     string
}

// NewSynthesizer initializes partner configurations from environment or sensible defaults
func NewSynthesizer() *Synthesizer {
	getEnv := func(k, fallback string) string {
		v := os.Getenv(k)
		if v != "" {
			return v
		}
		return fallback
	}

	return &Synthesizer{
		AgodaCID:          getEnv("AGODA_PARTNER_CID", "1928374"),
		TripComAllianceID: getEnv("TRIPCOM_ALLIANCE_ID", "4829102"),
		KlookAID:          getEnv("KLOOK_AFFILIATE_AID", "59102"),
		KKdayCID:          getEnv("KKDAY_CAMPAIGN_CID", "18293"),
		MyRealTripPID:     getEnv("MYREALTRIP_PARTNER_ID", "MRT_GFT_99"),
	}
}

// CleanURL removes external tracking query parameters to obtain a canonical URL
func (s *Synthesizer) CleanURL(rawURL string) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return rawURL, err
	}

	trackingParams := []string{
		"cid", "tag", "pcs",
		"Allianceid", "SID", "OUID", "trip_sub",
		"aid", "aff_adid", "aff_label", "aff_label1", "aff_klick_id",
		"ud1", "ud2",
		"mrt_partner_id", "utm_source", "utm_medium", "utm_campaign", "utm_content",
	}

	q := parsed.Query()
	for _, p := range trackingParams {
		q.Del(p)
	}

	parsed.RawQuery = q.Encode()
	return parsed.String(), nil
}

// BuildReferralURL creates the final monetized URL for the given platform and product slug
func (s *Synthesizer) BuildReferralURL(platform domain.OTAPlatform, rawSourceURL, subTrackingID string) (*domain.AffiliateReferral, error) {
	cleanURL, err := s.CleanURL(rawSourceURL)
	if err != nil {
		cleanURL = rawSourceURL
	}

	parsed, err := url.Parse(cleanURL)
	if err != nil {
		return nil, fmt.Errorf("invalid URL: %w", err)
	}

	q := parsed.Query()
	partnerID := ""

	if subTrackingID == "" {
		subTrackingID = "gft_curated"
	}

	switch platform {
	case domain.PlatformAgoda:
		partnerID = s.AgodaCID
		q.Set("pcs", "1")
		q.Set("cid", partnerID)
		q.Set("tag", subTrackingID)
		q.Set("hl", "ko-kr")

	case domain.PlatformTripCom:
		partnerID = s.TripComAllianceID
		q.Set("Allianceid", partnerID)
		q.Set("SID", subTrackingID)
		q.Set("OUID", "getfortrip")

	case domain.PlatformKlook:
		partnerID = s.KlookAID
		q.Set("aid", partnerID)
		q.Set("aff_adid", subTrackingID)
		q.Set("aff_label1", "getfortrip")

	case domain.PlatformKKday:
		partnerID = s.KKdayCID
		q.Set("cid", partnerID)
		q.Set("ud1", subTrackingID)
		q.Set("ud2", "getfortrip")

	case domain.PlatformMyRealTrip:
		partnerID = s.MyRealTripPID
		q.Set("mrt_partner_id", partnerID)
		q.Set("utm_source", "getfortrip")
		q.Set("utm_medium", "curated_webhook")
		q.Set("utm_campaign", subTrackingID)

	default:
		return nil, fmt.Errorf("unsupported platform: %s", platform)
	}

	parsed.RawQuery = q.Encode()
	finalURL := parsed.String()

	return &domain.AffiliateReferral{
		Platform:         platform,
		OriginalURL:      rawSourceURL,
		CleanURL:         cleanURL,
		FinalReferralURL: finalURL,
		PartnerID:        partnerID,
		SubTrackingID:    subTrackingID,
		ClickCount:       0,
	}, nil
}

// ExtractPlatform identifies which OTA platform a URL belongs to
func (s *Synthesizer) ExtractPlatform(rawURL string) domain.OTAPlatform {
	lower := strings.ToLower(rawURL)
	switch {
	case strings.Contains(lower, "myrealtrip.com"):
		return domain.PlatformMyRealTrip
	case strings.Contains(lower, "agoda.com"):
		return domain.PlatformAgoda
	case strings.Contains(lower, "klook.com"):
		return domain.PlatformKlook
	case strings.Contains(lower, "kkday.com"):
		return domain.PlatformKKday
	case strings.Contains(lower, "."+"trip"+"."+"com") || strings.Contains(lower, "//"+"trip"+"."+"com") || strings.Contains(lower, "ctrip.com"):
		return domain.PlatformTripCom
	default:
		return ""
	}
}
