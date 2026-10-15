package engine

import (
	"testing"
	"getfortrip/backend/internal/domain"
)

func TestCalculateExactPrice(t *testing.T) {
	input := PricingInput{
		BaseAmountKRW:     580000,
		TaxRate:           0.10, // 58,000
		ServiceFeeRate:    0.03, // 17,400
		CouponDiscountKRW: 50000,
		TripCoinsRedeem:   500,  // 5,000
		TargetCurrency:    domain.CurrencyKRW,
		ExchangeRateToKRW: 1.0,
	}

	res, err := CalculateExactPrice(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// 580000 + 58000 + 17400 = 655400
	// Discounts = 50000 + 5000 = 55000
	// Final = 600400
	if res.GrossAmountKRW != 655400 {
		t.Errorf("expected gross 655400, got %f", res.GrossAmountKRW)
	}
	if res.FinalAmountKRW != 600400 {
		t.Errorf("expected final 600400, got %f", res.FinalAmountKRW)
	}
}

func TestStateMachineTransitions(t *testing.T) {
	// Legal: DRAFT -> PENDING_PAYMENT
	if err := ValidateTransition(domain.StatusDraft, domain.StatusPendingPayment); err != nil {
		t.Errorf("expected legal transition DRAFT->PENDING_PAYMENT, got: %v", err)
	}

	// Illegal: DRAFT -> CONFIRMED
	if err := ValidateTransition(domain.StatusDraft, domain.StatusConfirmed); err == nil {
		t.Errorf("expected error for illegal transition DRAFT->CONFIRMED, got nil")
	}

	// Legal: PAID -> ISSUING
	if err := ValidateTransition(domain.StatusPaid, domain.StatusIssuing); err != nil {
		t.Errorf("expected legal transition PAID->ISSUING, got: %v", err)
	}
}

