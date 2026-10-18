package engine

import (
	"errors"
	"getfortrip/backend/internal/domain"
	"math"
)

type PricingInput struct {
	BaseAmountKRW     float64         `json:"base_amount_krw"`
	TaxRate           float64         `json:"tax_rate"`            // default 0.10 (10%)
	ServiceFeeRate    float64         `json:"service_fee_rate"`    // default 0.03 (3%)
	CouponDiscountKRW float64         `json:"coupon_discount_krw"` // 원화 할인액
	TripCoinsRedeem   int             `json:"trip_coins_redeem"`   // 1 coin = 10 KRW
	TargetCurrency    domain.Currency `json:"target_currency"`
	ExchangeRateToKRW float64         `json:"exchange_rate_to_krw"` // 1 TargetCurrency = X KRW
}

type PricingResult struct {
	BaseAmountKRW        float64         `json:"base_amount_krw"`
	TaxAmountKRW         float64         `json:"tax_amount_krw"`
	ServiceFeeKRW        float64         `json:"service_fee_krw"`
	GrossAmountKRW       float64         `json:"gross_amount_krw"`
	CouponDiscountKRW    float64         `json:"coupon_discount_krw"`
	TripCoinsDiscountKRW float64         `json:"trip_coins_discount_krw"`
	FinalAmountKRW       float64         `json:"final_amount_krw"`
	FinalTargetAmount    float64         `json:"final_target_amount"`
	TargetCurrency       domain.Currency `json:"target_currency"`
	Symbol               string          `json:"symbol"`
}

// CalculateExactPrice performs precision calculations without floating drift
func CalculateExactPrice(input PricingInput) (*PricingResult, error) {
	if input.BaseAmountKRW <= 0 {
		return nil, errors.New("base amount must be greater than zero")
	}
	if input.ExchangeRateToKRW <= 0 {
		input.ExchangeRateToKRW = 1.0 // fallback
	}
	if input.TaxRate <= 0 {
		input.TaxRate = 0.10 // 10%
	}
	if input.ServiceFeeRate <= 0 {
		input.ServiceFeeRate = 0.03 // 3%
	}

	tax := math.Round(input.BaseAmountKRW * input.TaxRate)
	serviceFee := math.Round(input.BaseAmountKRW * input.ServiceFeeRate)
	gross := input.BaseAmountKRW + tax + serviceFee

	coinDiscount := float64(input.TripCoinsRedeem * 10)
	totalDiscount := input.CouponDiscountKRW + coinDiscount

	finalKRW := gross - totalDiscount
	if finalKRW < 0 {
		finalKRW = 0
	}

	// 환율 변환
	converted := finalKRW / input.ExchangeRateToKRW
	var formattedTarget float64
	var symbol string

	switch input.TargetCurrency {
	case domain.CurrencyKRW:
		formattedTarget = math.Round(converted)
		symbol = "₩"
	case domain.CurrencyJPY:
		formattedTarget = math.Round(converted)
		symbol = "¥"
	case domain.CurrencyUSD:
		formattedTarget = math.Round(converted*100) / 100
		symbol = "$"
	case domain.CurrencyEUR:
		formattedTarget = math.Round(converted*100) / 100
		symbol = "€"
	case domain.CurrencyCNY:
		formattedTarget = math.Round(converted*100) / 100
		symbol = "¥"
	case domain.CurrencyGBP:
		formattedTarget = math.Round(converted*100) / 100
		symbol = "£"
	default:
		formattedTarget = math.Round(converted*100) / 100
		symbol = "$"
	}

	return &PricingResult{
		BaseAmountKRW:        input.BaseAmountKRW,
		TaxAmountKRW:         tax,
		ServiceFeeKRW:        serviceFee,
		GrossAmountKRW:       gross,
		CouponDiscountKRW:    input.CouponDiscountKRW,
		TripCoinsDiscountKRW: coinDiscount,
		FinalAmountKRW:       finalKRW,
		FinalTargetAmount:    formattedTarget,
		TargetCurrency:       input.TargetCurrency,
		Symbol:               symbol,
	}, nil
}
