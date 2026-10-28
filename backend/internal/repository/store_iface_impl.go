package repository

import (
	"fmt"

	"getfortrip/backend/internal/domain"
)

func (s *InMemoryStore) GetHotels() []domain.Hotel {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.Hotel, 0, len(s.Hotels))
	for _, h := range s.Hotels {
		out = append(out, h)
	}
	return out
}

func (s *InMemoryStore) GetFlights() []domain.Flight {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.Flight, 0, len(s.Flights))
	for _, f := range s.Flights {
		out = append(out, f)
	}
	return out
}

func (s *InMemoryStore) GetTrains() []domain.Train {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.Train, 0, len(s.Trains))
	for _, t := range s.Trains {
		out = append(out, t)
	}
	return out
}

func (s *InMemoryStore) GetCars() []domain.CarRental {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.CarRental, 0, len(s.Cars))
	for _, c := range s.Cars {
		out = append(out, c)
	}
	return out
}

func (s *InMemoryStore) GetTransfers() []domain.AirportTransfer {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.AirportTransfer, 0, len(s.Transfers))
	for _, t := range s.Transfers {
		out = append(out, t)
	}
	return out
}

func (s *InMemoryStore) GetActivities() []domain.Activity {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.Activity, 0, len(s.Activities))
	for _, a := range s.Activities {
		out = append(out, a)
	}
	return out
}

func (s *InMemoryStore) GetPackages() []domain.DynamicPackage {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.DynamicPackage, 0, len(s.Packages))
	for _, p := range s.Packages {
		out = append(out, p)
	}
	return out
}

func (s *InMemoryStore) GetPromotions() []domain.Promotion {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.Promotion, 0, len(s.Promotions))
	for _, p := range s.Promotions {
		out = append(out, p)
	}
	return out
}

func (s *InMemoryStore) GetTripMoments() []domain.TripMoment {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.TripMoment, 0, len(s.TripMoments))
	for _, m := range s.TripMoments {
		out = append(out, m)
	}
	return out
}

func (s *InMemoryStore) SaveTripMoment(m domain.TripMoment) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.TripMoments[m.ID] = m
	return nil
}

func (s *InMemoryStore) GetBooking(id string) (*domain.Booking, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	b, ok := s.Bookings[id]
	if !ok {
		return nil, false
	}
	cp := b
	return &cp, true
}

func (s *InMemoryStore) SaveBooking(booking domain.Booking) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Bookings[booking.ID] = booking
	return nil
}

func (s *InMemoryStore) GetBookings() []domain.Booking {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.Booking, 0, len(s.Bookings))
	for _, b := range s.Bookings {
		out = append(out, b)
	}
	return out
}

func (s *InMemoryStore) GetBookingsByUser(userId string) []domain.Booking {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.Booking, 0)
	for _, b := range s.Bookings {
		if b.UserID == userId {
			out = append(out, b)
		}
	}
	return out
}

func (s *InMemoryStore) GetUser(id string) (*domain.User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.Users[id]
	if !ok {
		return nil, false
	}
	cp := u
	return &cp, true
}

func (s *InMemoryStore) CreateUser(u domain.User) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.Users[u.ID]; ok {
		return fmt.Errorf("user already exists")
	}
	s.Users[u.ID] = u
	return nil
}

func (s *InMemoryStore) GetUserByEmail(email string) (*domain.User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, u := range s.Users {
		if u.Email == email {
			cp := u
			return &cp, true
		}
	}
	return nil, false
}

func (s *InMemoryStore) GetSavedTravelers(userId string) ([]domain.SavedTraveler, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ts := s.Travelers[userId]
	out := make([]domain.SavedTraveler, len(ts))
	copy(out, ts)
	return out, nil
}

func (s *InMemoryStore) SaveSavedTraveler(t domain.SavedTraveler) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Travelers[t.UserID] = append(s.Travelers[t.UserID], t)
	return nil
}

func (s *InMemoryStore) GetFXRates() []domain.ExchangeRate {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.ExchangeRate, 0, len(s.ExchangeRate))
	for _, r := range s.ExchangeRate {
		out = append(out, r)
	}
	return out
}

func (s *InMemoryStore) GetFXRate(currency domain.Currency) (domain.ExchangeRate, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	r, ok := s.ExchangeRate[currency]
	return r, ok
}

func (s *InMemoryStore) SaveFXRate(r domain.ExchangeRate) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ExchangeRate[r.Currency] = r
	return nil
}

func (s *InMemoryStore) GetAuditLogs() []domain.AdminAuditLog {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.AdminAuditLog, len(s.AuditLogs))
	copy(out, s.AuditLogs)
	return out
}

func (s *InMemoryStore) CreateAuditLog(log domain.AdminAuditLog) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.AuditLogs = append(s.AuditLogs, log)
	return nil
}

func (s *InMemoryStore) GetNotices() []domain.Notice {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.Notice, len(s.Notices))
	copy(out, s.Notices)
	return out
}

func (s *InMemoryStore) CreateNotice(n domain.Notice) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Notices = append(s.Notices, n)
	return nil
}

func (s *InMemoryStore) GetCSTickets() []domain.CSTicket {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.CSTicket, 0, len(s.CSTickets))
	for _, t := range s.CSTickets {
		out = append(out, t)
	}
	return out
}

func (s *InMemoryStore) CreateCSTicket(t domain.CSTicket) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.CSTickets[t.ID] = t
	return nil
}

func (s *InMemoryStore) Close() error {
	return nil
}
