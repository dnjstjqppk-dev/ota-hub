package engine

import (
	"fmt"
	"getfortrip/backend/internal/domain"
)

// AllowedTransitions map defines all valid state machine paths
var AllowedTransitions = map[domain.BookingStatus][]domain.BookingStatus{
	domain.StatusDraft: {
		domain.StatusPendingPayment,
		domain.StatusCancelled,
	},
	domain.StatusPendingPayment: {
		domain.StatusPaid,
		domain.StatusCancelled,
	},
	domain.StatusPaid: {
		domain.StatusIssuing,
		domain.StatusRefunded,
	},
	domain.StatusIssuing: {
		domain.StatusConfirmed,
		domain.StatusIssueFailed,
	},
	domain.StatusIssueFailed: {
		domain.StatusConfirmed,
		domain.StatusRefunded,
	},
	domain.StatusConfirmed: {
		domain.StatusCompleted,
		domain.StatusCancelReq,
	},
	domain.StatusCancelReq: {
		domain.StatusRefunded,
		domain.StatusConfirmed,
	},
}

// CanTransition checks if the transition from current to target is allowed
func CanTransition(current, target domain.BookingStatus) bool {
	allowedList, exists := AllowedTransitions[current]
	if !exists {
		return false
	}
	for _, s := range allowedList {
		if s == target {
			return true
		}
	}
	return false
}

// ValidateTransition returns an error if the transition is prohibited
func ValidateTransition(current, target domain.BookingStatus) error {
	if !CanTransition(current, target) {
		return fmt.Errorf("illegal state transition from %s to %s", current, target)
	}
	return nil
}

