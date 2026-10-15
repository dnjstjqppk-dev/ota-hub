package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"getfortrip/backend/internal/domain"
	"getfortrip/backend/internal/repository"
)

func TestGetDomainFilters(t *testing.T) {
	store := repository.NewStore()
	h := NewAPIHandler(store)

	domains := []string{"hotels", "flights", "trains", "cars", "transfers", "things-to-do", "packages"}

	for _, d := range domains {
		req := httptest.NewRequest("GET", "/api/v1/filters/"+d, nil)
		req.SetPathValue("domain", d)
		w := httptest.NewRecorder()

		h.GetDomainFilters(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Domain %s: expected 200 OK, got %d", d, w.Code)
		}

		var resp struct {
			Code int                            `json:"code"`
			Data []domain.DomainFilterDefinition `json:"data"`
		}

		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Domain %s: failed to unmarshal: %v", d, err)
		}

		if len(resp.Data) == 0 {
			t.Errorf("Domain %s: expected filter definitions, got 0", d)
		}
	}
}

func TestGetAllFilters(t *testing.T) {
	store := repository.NewStore()
	h := NewAPIHandler(store)

	req := httptest.NewRequest("GET", "/api/v1/filters", nil)
	w := httptest.NewRecorder()

	h.GetAllFilters(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d", w.Code)
	}

	var resp struct {
		Code int                                         `json:"code"`
		Data map[string][]domain.DomainFilterDefinition `json:"data"`
	}

	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	expectedKeys := []string{"HOTEL", "FLIGHT", "TRAIN", "CAR", "TRANSFER", "ACTIVITY", "PACKAGE"}
	for _, key := range expectedKeys {
		if _, exists := resp.Data[key]; !exists {
			t.Errorf("Expected domain key %s in all filters", key)
		}
	}
}

func TestCatalogFilteringWithFacets(t *testing.T) {
	store := repository.NewStore()
	h := NewAPIHandler(store)

	// Test Flights with stops filter
	reqFlight := httptest.NewRequest("GET", "/api/v1/flights?stops=0", nil)
	wFlight := httptest.NewRecorder()
	h.GetFlights(wFlight, reqFlight)
	if wFlight.Code != http.StatusOK {
		t.Fatalf("GetFlights failed: %d", wFlight.Code)
	}

	// Test Cars with category filter
	reqCar := httptest.NewRequest("GET", "/api/v1/cars?category=SUV", nil)
	wCar := httptest.NewRecorder()
	h.GetCars(wCar, reqCar)
	if wCar.Code != http.StatusOK {
		t.Fatalf("GetCars failed: %d", wCar.Code)
	}

	// Test Transfers with tier filter
	reqTransfer := httptest.NewRequest("GET", "/api/v1/transfers?tier=PREMIUM", nil)
	wTransfer := httptest.NewRecorder()
	h.GetTransfers(wTransfer, reqTransfer)
	if wTransfer.Code != http.StatusOK {
		t.Fatalf("GetTransfers failed: %d", wTransfer.Code)
	}
}

