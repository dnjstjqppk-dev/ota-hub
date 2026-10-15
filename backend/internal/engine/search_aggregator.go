package engine

import (
	"context"
	"sync"
	"time"
	"getfortrip/backend/internal/domain"
)

type SupplierResult struct {
	SupplierName string
	Hotels       []domain.Hotel
	Flights      []domain.Flight
	Duration     time.Duration
	Err          error
}

// SearchAggregator executes high-concurrency parallel queries across multiple suppliers
type SearchAggregator struct {
	Timeout time.Duration
}

func NewSearchAggregator(timeout time.Duration) *SearchAggregator {
	if timeout <= 0 {
		timeout = 3 * time.Second
	}
	return &SearchAggregator{Timeout: timeout}
}

// AggregateHotels queries multiple supplier endpoints in parallel using goroutines
func (sa *SearchAggregator) AggregateHotels(ctx context.Context, city string, localHotels []domain.Hotel) []domain.Hotel {
	ctxWithTimeout, cancel := context.WithTimeout(ctx, sa.Timeout)
	defer cancel()

	resultsChan := make(chan []domain.Hotel, 2)
	var wg sync.WaitGroup

	// Supplier 1: Internal High-Speed Database
	wg.Add(1)
	go func() {
		defer wg.Done()
		var matched []domain.Hotel
		for _, h := range localHotels {
			if city == "" || h.City == city {
				matched = append(matched, h)
			}
		}
		select {
		case resultsChan <- matched:
		case <-ctxWithTimeout.Done():
		}
	}()

	// Supplier 2: Simulated Global GDS / OTA Partner Channel
	wg.Add(1)
	go func() {
		defer wg.Done()
		// Simulate network latency (20ms)
		time.Sleep(20 * time.Millisecond)
		select {
		case resultsChan <- []domain.Hotel{}:
		case <-ctxWithTimeout.Done():
		}
	}()

	go func() {
		wg.Wait()
		close(resultsChan)
	}()

	var aggregated []domain.Hotel
	seen := make(map[string]bool)

	for res := range resultsChan {
		for _, item := range res {
			if !seen[item.ID] {
				seen[item.ID] = true
				aggregated = append(aggregated, item)
			}
		}
	}

	return aggregated
}

