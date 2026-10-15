package curation

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
	"getfortrip/backend/internal/domain"
)

// GeminiClient handles AI-driven B2C rewriting and content structuration
type GeminiClient struct {
	apiKey     string
	model      string
	httpClient *http.Client
}

// NewGeminiClient instantiates a new client for Gemini AI
func NewGeminiClient() *GeminiClient {
	apiKey := os.Getenv("GEMINI_API_KEY")
	model := os.Getenv("GEMINI_MODEL")
	if model == "" {
		model = "gemini-2.5-flash"
	}

	return &GeminiClient{
		apiKey: apiKey,
		model:  model,
		httpClient: &http.Client{
			Timeout: 45 * time.Second,
		},
	}
}

// GeminiResponseDTO matches the structured output schema
type GeminiResponseDTO struct {
	B2CTitle        string   `json:"b2c_title"`
	OneLineSummary  string   `json:"one_line_summary"`
	KeyBenefits     []string `json:"key_benefits"`
	SEOBlogContent  string   `json:"seo_blog_content"`
	SEOMetaKeywords []string `json:"seo_meta_keywords"`
}

// RewriteProduct analyzes raw scrape data and generates unique, high-conversion B2C content
func (g *GeminiClient) RewriteProduct(ctx context.Context, p *domain.UniversalProduct, rawScrape *domain.IngestRawRequest) (*domain.CuratedContent, error) {
	// If API key is missing, fall back to high-fidelity rule-based synthesis for development
	if g.apiKey == "" {
		return g.generateFallbackContent(p, rawScrape), nil
	}

	prompt := g.buildPrompt(p, rawScrape)
	reqBody := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"role": "user",
				"parts": []map[string]interface{}{
					{"text": prompt},
				},
			},
		},
		"generationConfig": map[string]interface{}{
			"temperature":       0.65,
			"topP":              0.95,
			"responseMimeType": "application/json",
			"responseSchema": map[string]interface{}{
				"type": "OBJECT",
				"properties": map[string]interface{}{
					"b2c_title": map[string]interface{}{
						"type":        "STRING",
						"description": "클릭률을 극대화하는 세련되고 감성적인 새로운 상품명",
					},
					"one_line_summary": map[string]interface{}{
						"type":        "STRING",
						"description": "고객의 구매 심리를 자극하는 매력적인 1줄 요약",
					},
					"key_benefits": map[string]interface{}{
						"type": "ARRAY",
						"items": map[string]interface{}{
							"type": "STRING",
						},
						"description": "이 상품을 반드시 선택해야 하는 핵심 이유 정확히 3가지",
					},
					"seo_blog_content": map[string]interface{}{
						"type":        "STRING",
						"description": "travel-checkin 연동용 SEO 최적화 마크다운 형식의 독창적인 여행 가이드 및 본문",
					},
					"seo_meta_keywords": map[string]interface{}{
						"type": "ARRAY",
						"items": map[string]interface{}{
							"type": "STRING",
						},
						"description": "검색엔진 최적화를 위한 핵심 키워드 5개",
					},
				},
				"required": []string{"b2c_title", "one_line_summary", "key_benefits", "seo_blog_content", "seo_meta_keywords"},
			},
		},
	}

	payloadBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal Gemini request: %w", err)
	}

	endpoint := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", g.model, g.apiKey)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create http request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	res, err := g.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("gemini API call failed: %w", err)
	}
	defer res.Body.Close()

	bodyBytes, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read gemini response body: %w", err)
	}

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("gemini API error (HTTP %d): %s", res.StatusCode, string(bodyBytes))
	}

	// Parse response
	var geminiResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
		UsageMetadata struct {
			PromptTokenCount     int `json:"promptTokenCount"`
			CandidatesTokenCount int `json:"candidatesTokenCount"`
		} `json:"usageMetadata"`
	}

	if err := json.Unmarshal(bodyBytes, &geminiResp); err != nil {
		return nil, fmt.Errorf("failed to parse gemini response: %w", err)
	}

	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("gemini returned empty candidates")
	}

	text := geminiResp.Candidates[0].Content.Parts[0].Text
	var structured GeminiResponseDTO
	if err := json.Unmarshal([]byte(text), &structured); err != nil {
		return nil, fmt.Errorf("failed to parse structured JSON from gemini: %w (raw: %s)", err, text)
	}

	return &domain.CuratedContent{
		ProductID:        p.ID,
		B2CTitle:         structured.B2CTitle,
		OneLineSummary:   structured.OneLineSummary,
		KeyBenefits:      structured.KeyBenefits,
		SEOBlogContent:   structured.SEOBlogContent,
		SEOMetaKeywords:  structured.SEOMetaKeywords,
		AIModelVersion:   g.model,
		PromptTokens:     geminiResp.UsageMetadata.PromptTokenCount,
		CompletionTokens: geminiResp.UsageMetadata.CandidatesTokenCount,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}, nil
}

func (g *GeminiClient) buildPrompt(p *domain.UniversalProduct, rawScrape *domain.IngestRawRequest) string {
	rawJSONStr := "{}"
	if rawScrape.RawJSON != nil {
		if b, err := json.Marshal(rawScrape.RawJSON); err == nil {
			rawJSONStr = string(b)
		}
	}

	rawSnippet := rawScrape.RawHTML
	if len(rawSnippet) > 3000 {
		rawSnippet = rawSnippet[:3000] + "...[truncated]"
	}

	return fmt.Sprintf(`당신은 글로벌 B2C 여행 OTA 플랫폼 'getfortrip'의 수석 여행 에디터이자 SEO 카피라이터입니다.

수신된 원본 크롤링 데이터(아래 제공)를 바탕으로, 구글/네이버의 '중복 문서 페널티(Duplicate Content Penalty)'를 완벽하게 회피할 수 있도록 독창적인 B2C 콘텐츠로 재집필(Rewrite)하십시오.

[작성 가이드라인]
1. 원본 OTA 텍스트의 단순 복사/붙여넣기를 엄격히 금지합니다. 문장 구조와 표현을 완전히 새롭게 창작하십시오.
2. 2030 한국인 자유여행자들의 감성을 자극하고 예약 전환율을 극대화하는 세련된 톤앤매너를 유지하십시오.
3. b2c_title: 30자 내외로 상품의 핵심 가치와 감성을 담은 제목
4. one_line_summary: 스크롤을 멈추게 하는 한 줄 캐치프레이즈
5. key_benefits: 여행자가 이 상품을 선택해야 하는 명확한 이유 3가지 (문자열 배열, 정확히 3개)
6. seo_blog_content: travel-checkin 연동용 완벽한 마크다운 가이드. H2, H3 헤딩, 방문 팁, 추천 일정, 바우처 사용법, 준비물, 주의사항, getfortrip 최저가 혜택 안내를 포함할 것.

[상품 메타데이터]
- 플랫폼: %s
- 원본 상품명: %s
- 카테고리: %s
- 도시/국가: %s, %s
- 기준 가격: %.0f KRW
- 원본 스펙 JSON: %s
- 원본 텍스트 발췌: %s
`, p.Platform, p.OriginalTitle, p.DomainType, p.CityName, p.CountryName, p.BasePriceKRW, rawJSONStr, rawSnippet)
}

func (g *GeminiClient) generateFallbackContent(p *domain.UniversalProduct, rawScrape *domain.IngestRawRequest) *domain.CuratedContent {
	titlePrefix := fmt.Sprintf("[%s 완벽 가이드]", p.CityName)
	cleanName := strings.TrimSpace(p.OriginalTitle)

	b2cTitle := fmt.Sprintf("%s %s - 최저가 혜택 & 필수 코스", titlePrefix, cleanName)
	if len(b2cTitle) > 100 {
		b2cTitle = b2cTitle[:97] + "..."
	}

	oneLineSummary := fmt.Sprintf("%s 여행의 실패 없는 선택! %s의 핵심 매력을 가장 합리적인 가격과 간편한 모바일 바우처로 경험해 보세요.", p.CityName, cleanName)

	keyBenefits := []string{
		fmt.Sprintf("공식 제휴 즉시 확정 및 모바일 바우처 제공으로 현장 대기 시간 최소화 (%s)", p.CityName),
		fmt.Sprintf("getfortrip 회원 전용 특별 할인 및 수수료 없는 투명한 최저가 (%.0f원~)", p.BasePriceKRW),
		"한국어 고객센터 실시간 지원 및 취소/환불 규정 사전 안내로 안심 예약",
	}

	seoBlog := fmt.Sprintf(`## %s 여행, 왜 '%s'을(를) 선택해야 할까요?

%s 여행을 준비 중이시라면 절대 놓쳐선 안 될 필수 코스, 바로 **%s**입니다. 

### 1. 한눈에 보는 핵심 매력 포인트
- **합리적인 가격**: 현장 매표소보다 저렴한 온라인 단독 특가 (%.0f원부터 시작)
- **간편한 모바일 입장**: 실물 티켓 교환 번거로움 없이 스마트폰 바우처로 빠른 입장
- **자유로운 일정 조율**: 여행자의 동선에 맞춘 최적화된 선택 옵션

### 2. 방문 전 꼭 알아두어야 할 실전 꿀팁
1. **방문 추천 시간대**: 혼잡을 피하기 위해 오전 첫 타임 또는 오후 3시 이후 방문을 추천합니다.
2. **필수 준비물**: 모바일 바우처 확인을 위한 스마트폰 배터리 충전 및 편안한 복장.
3. **취소 및 환불 안내**: getfortrip 상세 페이지에서 일정 변경 및 무료 취소 기한을 꼭 확인하세요.

### 3. getfortrip과 함께하는 스마트한 여행
지금 getfortrip에서 예약하고, 복잡한 준비 없이 여행의 설렘에만 집중해 보세요!
`, p.CityName, cleanName, p.CityName, cleanName, p.BasePriceKRW)

	keywords := []string{
		p.CityName + "여행",
		p.CountryName + "자유여행",
		cleanName,
		"getfortrip할인",
		p.CityName + "가볼만한곳",
	}

	return &domain.CuratedContent{
		ProductID:        p.ID,
		B2CTitle:         b2cTitle,
		OneLineSummary:   oneLineSummary,
		KeyBenefits:      keyBenefits,
		SEOBlogContent:   seoBlog,
		SEOMetaKeywords:  keywords,
		AIModelVersion:   "gemini-2.5-flash-synthetic",
		PromptTokens:     150,
		CompletionTokens: 420,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}
}

