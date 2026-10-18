package ingest

import (
	"context"
	"getfortrip/backend/internal/domain"
	"getfortrip/backend/internal/repository"
	"testing"
)

func TestIngestPipeline5Platforms(t *testing.T) {
	store := repository.NewStore()
	ctrl := NewPipelineController(store)
	ctx := context.Background()

	testCases := []struct {
		name       string
		request    domain.IngestRawRequest
		expectedID string
	}{
		{
			name: "Agoda Hotel Ingestion",
			request: domain.IngestRawRequest{
				Platform:        domain.PlatformAgoda,
				SourceURL:       "https://www.agoda.com/hotel/tokyo-hotel.html?hotel_id=88310",
				SourceProductID: "88310",
				DomainType:      domain.ProductDomainAccommodation,
				RawJSON: map[string]interface{}{
					"title":     "신주쿠 그란벨 호텔 도쿄",
					"city":      "도쿄",
					"country":   "일본",
					"price_krw": 158000.0,
					"rating":    4.7,
				},
			},
			expectedID: "gft-agoda-88310",
		},
		{
			name: "TripCom Transport Ingestion",
			request: domain.IngestRawRequest{
				Platform:        domain.PlatformTripCom,
				SourceURL:       "https://kr." + "trip" + ".com/flights/detail?flightId=TC-9921",
				SourceProductID: "TC-9921",
				DomainType:      domain.ProductDomainFlight,
				RawJSON: map[string]interface{}{
					"title":     "인천 - 오사카 간사이 직항 왕복 특가",
					"city":      "오사카",
					"country":   "일본",
					"price_krw": 289000.0,
				},
			},
			expectedID: "gft-trip_com-TC-9921",
		},
		{
			name: "Klook Attraction Ingestion",
			request: domain.IngestRawRequest{
				Platform:        domain.PlatformKlook,
				SourceURL:       "https://www.klook.com/activity/1234-usj-express",
				SourceProductID: "1234",
				DomainType:      domain.ProductDomainActivity,
				RawJSON: map[string]interface{}{
					"title":     "유니버설 스튜디오 재팬 익스프레스 패스 4",
					"city":      "오사카",
					"country":   "일본",
					"price_krw": 185000.0,
				},
			},
			expectedID: "gft-klook-1234",
		},
		{
			name: "KKday Day Tour Ingestion",
			request: domain.IngestRawRequest{
				Platform:        domain.PlatformKKday,
				SourceURL:       "https://www.kkday.com/product/5521",
				SourceProductID: "5521",
				DomainType:      domain.ProductDomainTour,
				RawJSON: map[string]interface{}{
					"title":     "예스진지 1일 버스투어 (한국어 가이드)",
					"city":      "타이베이",
					"country":   "대만",
					"price_krw": 35000.0,
				},
			},
			expectedID: "gft-kkday-5521",
		},
		{
			name: "MyRealTrip Guided Tour Ingestion",
			request: domain.IngestRawRequest{
				Platform:        domain.PlatformMyRealTrip,
				SourceURL:       "https://www.myrealtrip.com/offers/7788",
				SourceProductID: "7788",
				DomainType:      domain.ProductDomainTour,
				RawJSON: map[string]interface{}{
					"title":     "루브르 박물관 공인 한국어 도슨트 투어",
					"city":      "파리",
					"country":   "프랑스",
					"price_krw": 79000.0,
				},
			},
			expectedID: "gft-myrealtrip-7788",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			res, err := ctrl.ProcessRawIngest(ctx, tc.request)
			if err != nil {
				t.Fatalf("ProcessRawIngest failed: %v", err)
			}

			if res.ProductID != tc.expectedID {
				t.Errorf("Expected product ID %s, got %s", tc.expectedID, res.ProductID)
			}

			if res.CuratedTitle == "" {
				t.Errorf("CuratedTitle is empty")
			}
			if len(res.KeyBenefits) != 3 {
				t.Errorf("Expected 3 key benefits, got %d", len(res.KeyBenefits))
			}
			if res.ReferralURL == "" {
				t.Errorf("ReferralURL is empty")
			}

			// Verify in store
			saved := store.GetUniversalProduct(tc.expectedID)
			if saved == nil {
				t.Fatalf("Product not saved in store: %s", tc.expectedID)
			}
			if saved.CuratedContent == nil {
				t.Errorf("CuratedContent not attached to saved product")
			}
			if saved.AffiliateReferral == nil {
				t.Errorf("AffiliateReferral not attached to saved product")
			}
		})
	}

	// Verify querying curated products
	allCurated := store.GetCuratedProducts("", 10)
	if len(allCurated) != 5 {
		t.Errorf("Expected 5 curated products in store, got %d", len(allCurated))
	}

	klookOnly := store.GetCuratedProducts(domain.PlatformKlook, 10)
	if len(klookOnly) != 1 {
		t.Errorf("Expected 1 Klook product, got %d", len(klookOnly))
	}
}
