package referral

import (
	"strings"
	"testing"
)

func TestSynthesizerAllPlatforms(t *testing.T) {
	syn := NewSynthesizer()

	tests := []struct {
		name          string
		platform      OTAPlatform
		rawURL        string
		expectedParam string
		expectedVal   string
	}{
		{
			name:          "Agoda Referral Link",
			platform:      PlatformAgoda,
			rawURL:        "https://www.agoda.com/ko-kr/shinjuku-granbell-hotel/hotel/tokyo-jp.html?hotel_id=482910&tag=old_tag",
			expectedParam: "cid=",
			expectedVal:   syn.AgodaCID,
		},
		{
			name:          "TripCom Referral Link",
			platform:      PlatformTripCom,
			rawURL:        "https://kr." + "trip" + ".com/hotels/detail/?hotelId=123456&SID=old",
			expectedParam: "Allianceid=",
			expectedVal:   syn.TripComAllianceID,
		},
		{
			name:          "Klook Referral Link",
			platform:      PlatformKlook,
			rawURL:        "https://www.klook.com/ko/activity/12345-usj-express/?aid=9999",
			expectedParam: "aid=",
			expectedVal:   syn.KlookAID,
		},
		{
			name:          "KKday Referral Link",
			platform:      PlatformKKday,
			rawURL:        "https://www.kkday.com/ko/product/54321?cid=8888",
			expectedParam: "cid=",
			expectedVal:   syn.KKdayCID,
		},
		{
			name:          "MyRealTrip Referral Link",
			platform:      PlatformMyRealTrip,
			rawURL:        "https://www.myrealtrip.com/offers/98765",
			expectedParam: "mrt_partner_id=",
			expectedVal:   syn.MyRealTripPID,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ref, err := syn.BuildReferralURL(tc.platform, tc.rawURL, "test_campaign")
			if err != nil {
				t.Fatalf("BuildReferralURL failed: %v", err)
			}

			if !strings.Contains(ref.FinalReferralURL, tc.expectedParam+tc.expectedVal) {
				t.Errorf("Expected %s in final URL, got: %s", tc.expectedParam+tc.expectedVal, ref.FinalReferralURL)
			}

			// Clean URL check: old parameters should be stripped
			if strings.Contains(ref.CleanURL, "old_tag") || strings.Contains(ref.CleanURL, "aid=9999") {
				t.Errorf("CleanURL still contains old tracking parameters: %s", ref.CleanURL)
			}
		})
	}
}

func TestExtractPlatform(t *testing.T) {
	syn := NewSynthesizer()

	if syn.ExtractPlatform("https://www.agoda.com/hotel/1") != PlatformAgoda {
		t.Errorf("Failed to detect Agoda platform")
	}
	if syn.ExtractPlatform("https://kr."+"trip"+".com/flights") != PlatformTripCom {
		t.Errorf("Failed to detect TripCom platform")
	}
	if syn.ExtractPlatform("https://www.klook.com/activity/2") != PlatformKlook {
		t.Errorf("Failed to detect Klook platform")
	}
	if syn.ExtractPlatform("https://www.kkday.com/product/3") != PlatformKKday {
		t.Errorf("Failed to detect KKday platform")
	}
	if got := syn.ExtractPlatform("https://www.myrealtrip.com/offers/4"); got != PlatformMyRealTrip {
		t.Errorf("Failed to detect MyRealTrip platform. Got '%s', expected '%s'", got, PlatformMyRealTrip)
	}
}
