-- TG-16: FTS5 unified search index over the 7 product domains.
-- One row per product; DB triggers keep it in sync (no batch job to rot).
-- Query pattern (search-service.ts):
--   SELECT *, bm25(catalog_fts) AS rank FROM catalog_fts
--   WHERE catalog_fts MATCH :q AND active = 1 ORDER BY rank LIMIT :n
-- plus base-table JOINs for exact facets (price bands, rating, geo, dates).
-- supplier_id is NULL for TRAIN/PACKAGE (no partner column there) — the
-- service falls back to the domain default supplier, like catalog.ts annotate().
-- NOTE: the PG porter does not understand VIRTUAL TABLE (fails loud by
-- design) — TG-16 extends it to emit a tsvector column + index instead.

CREATE VIRTUAL TABLE IF NOT EXISTS catalog_fts USING fts5(
  domain,
  item_id UNINDEXED,
  title,
  city,
  body,
  active UNINDEXED,
  price_krw UNINDEXED,
  rating UNINDEXED,
  supplier_id UNINDEXED,
  tokenize = 'unicode61'
);

-- -- HOTEL ---------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_hotels_fts_ai AFTER INSERT ON hotels BEGIN
  INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  VALUES ('HOTEL', NEW.id, NEW.name_ko || ' ' || NEW.name_en, NEW.city,
    COALESCE(NEW.neighborhood, '') || ' ' || COALESCE(NEW.address, '') || ' ' || COALESCE(NEW.property_type, ''),
    NEW.is_active, NEW.base_price_krw, NEW.review_score, NEW.partner_id);
END;
CREATE TRIGGER IF NOT EXISTS trg_hotels_fts_ad AFTER DELETE ON hotels BEGIN
  DELETE FROM catalog_fts WHERE domain = 'HOTEL' AND item_id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_hotels_fts_au AFTER UPDATE ON hotels BEGIN
  DELETE FROM catalog_fts WHERE domain = 'HOTEL' AND item_id = OLD.id;
  INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  VALUES ('HOTEL', NEW.id, NEW.name_ko || ' ' || NEW.name_en, NEW.city,
    COALESCE(NEW.neighborhood, '') || ' ' || COALESCE(NEW.address, '') || ' ' || COALESCE(NEW.property_type, ''),
    NEW.is_active, NEW.base_price_krw, NEW.review_score, NEW.partner_id);
END;

-- -- FLIGHT --------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_flights_fts_ai AFTER INSERT ON flights BEGIN
  INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  VALUES ('FLIGHT', NEW.id, NEW.airline_name || ' ' || NEW.flight_number, NEW.departure_city || ' ' || NEW.arrival_city,
    NEW.airline_code || ' ' || NEW.departure_airport || ' ' || NEW.arrival_airport || ' ' || COALESCE(NEW.cabin_class, ''),
    NEW.is_active, NEW.base_price_krw, NULL, NEW.partner_id);
END;
CREATE TRIGGER IF NOT EXISTS trg_flights_fts_ad AFTER DELETE ON flights BEGIN
  DELETE FROM catalog_fts WHERE domain = 'FLIGHT' AND item_id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_flights_fts_au AFTER UPDATE ON flights BEGIN
  DELETE FROM catalog_fts WHERE domain = 'FLIGHT' AND item_id = OLD.id;
  INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  VALUES ('FLIGHT', NEW.id, NEW.airline_name || ' ' || NEW.flight_number, NEW.departure_city || ' ' || NEW.arrival_city,
    NEW.airline_code || ' ' || NEW.departure_airport || ' ' || NEW.arrival_airport || ' ' || COALESCE(NEW.cabin_class, ''),
    NEW.is_active, NEW.base_price_krw, NULL, NEW.partner_id);
END;

-- -- TRAIN ---------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_trains_fts_ai AFTER INSERT ON trains BEGIN
  INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  VALUES ('TRAIN', NEW.id, NEW.train_type || ' ' || NEW.train_number, NEW.departure_station || ' ' || NEW.arrival_station,
    COALESCE(NEW.seat_class, ''), NEW.is_active, NEW.price_krw, NULL, NULL);
END;
CREATE TRIGGER IF NOT EXISTS trg_trains_fts_ad AFTER DELETE ON trains BEGIN
  DELETE FROM catalog_fts WHERE domain = 'TRAIN' AND item_id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_trains_fts_au AFTER UPDATE ON trains BEGIN
  DELETE FROM catalog_fts WHERE domain = 'TRAIN' AND item_id = OLD.id;
  INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  VALUES ('TRAIN', NEW.id, NEW.train_type || ' ' || NEW.train_number, NEW.departure_station || ' ' || NEW.arrival_station,
    COALESCE(NEW.seat_class, ''), NEW.is_active, NEW.price_krw, NULL, NULL);
END;

-- -- CAR -----------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_cars_fts_ai AFTER INSERT ON cars BEGIN
  INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  VALUES ('CAR', NEW.id, NEW.company_name || ' ' || NEW.vehicle_model, NEW.pickup_location,
    COALESCE(NEW.vehicle_type, '') || ' ' || COALESCE(NEW.transmission, ''), NEW.is_active, NEW.daily_price_krw, NULL, NEW.partner_id);
END;
CREATE TRIGGER IF NOT EXISTS trg_cars_fts_ad AFTER DELETE ON cars BEGIN
  DELETE FROM catalog_fts WHERE domain = 'CAR' AND item_id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_cars_fts_au AFTER UPDATE ON cars BEGIN
  DELETE FROM catalog_fts WHERE domain = 'CAR' AND item_id = OLD.id;
  INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  VALUES ('CAR', NEW.id, NEW.company_name || ' ' || NEW.vehicle_model, NEW.pickup_location,
    COALESCE(NEW.vehicle_type, '') || ' ' || COALESCE(NEW.transmission, ''), NEW.is_active, NEW.daily_price_krw, NULL, NEW.partner_id);
END;

-- -- TRANSFER ------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_transfers_fts_ai AFTER INSERT ON transfers BEGIN
  INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  VALUES ('TRANSFER', NEW.id, NEW.service_title, NEW.destination_area,
    NEW.airport_code || ' ' || COALESCE(NEW.vehicle_class, ''), NEW.is_active, NEW.price_krw, NULL, NEW.partner_id);
END;
CREATE TRIGGER IF NOT EXISTS trg_transfers_fts_ad AFTER DELETE ON transfers BEGIN
  DELETE FROM catalog_fts WHERE domain = 'TRANSFER' AND item_id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_transfers_fts_au AFTER UPDATE ON transfers BEGIN
  DELETE FROM catalog_fts WHERE domain = 'TRANSFER' AND item_id = OLD.id;
  INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  VALUES ('TRANSFER', NEW.id, NEW.service_title, NEW.destination_area,
    NEW.airport_code || ' ' || COALESCE(NEW.vehicle_class, ''), NEW.is_active, NEW.price_krw, NULL, NEW.partner_id);
END;

-- -- ACTIVITY ------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_activities_fts_ai AFTER INSERT ON activities BEGIN
  INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  VALUES ('ACTIVITY', NEW.id, NEW.title, NEW.city,
    COALESCE(NEW.category, '') || ' ' || COALESCE(NEW.country, '') || ' ' || COALESCE(NEW.description, ''),
    NEW.is_active, NEW.price_krw, NEW.review_score, NEW.partner_id);
END;
CREATE TRIGGER IF NOT EXISTS trg_activities_fts_ad AFTER DELETE ON activities BEGIN
  DELETE FROM catalog_fts WHERE domain = 'ACTIVITY' AND item_id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_activities_fts_au AFTER UPDATE ON activities BEGIN
  DELETE FROM catalog_fts WHERE domain = 'ACTIVITY' AND item_id = OLD.id;
  INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  VALUES ('ACTIVITY', NEW.id, NEW.title, NEW.city,
    COALESCE(NEW.category, '') || ' ' || COALESCE(NEW.country, '') || ' ' || COALESCE(NEW.description, ''),
    NEW.is_active, NEW.price_krw, NEW.review_score, NEW.partner_id);
END;

-- -- PACKAGE -------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_packages_fts_ai AFTER INSERT ON packages BEGIN
  INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  VALUES ('PACKAGE', NEW.id, NEW.title, NEW.destination_city, '',
    NEW.is_active, NEW.total_package_krw, NULL, NULL);
END;
CREATE TRIGGER IF NOT EXISTS trg_packages_fts_ad AFTER DELETE ON packages BEGIN
  DELETE FROM catalog_fts WHERE domain = 'PACKAGE' AND item_id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_packages_fts_au AFTER UPDATE ON packages BEGIN
  DELETE FROM catalog_fts WHERE domain = 'PACKAGE' AND item_id = OLD.id;
  INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  VALUES ('PACKAGE', NEW.id, NEW.title, NEW.destination_city, '',
    NEW.is_active, NEW.total_package_krw, NULL, NULL);
END;

-- Backfill current rows (triggers cover future writes).
INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  SELECT 'HOTEL', id, name_ko || ' ' || name_en, city,
    COALESCE(neighborhood, '') || ' ' || COALESCE(address, '') || ' ' || COALESCE(property_type, ''),
    is_active, base_price_krw, review_score, partner_id FROM hotels;
INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  SELECT 'FLIGHT', id, airline_name || ' ' || flight_number, departure_city || ' ' || arrival_city,
    airline_code || ' ' || departure_airport || ' ' || arrival_airport || ' ' || COALESCE(cabin_class, ''),
    is_active, base_price_krw, NULL, partner_id FROM flights;
INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  SELECT 'TRAIN', id, train_type || ' ' || train_number, departure_station || ' ' || arrival_station,
    COALESCE(seat_class, ''), is_active, price_krw, NULL, NULL FROM trains;
INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  SELECT 'CAR', id, company_name || ' ' || vehicle_model, pickup_location,
    COALESCE(vehicle_type, '') || ' ' || COALESCE(transmission, ''), is_active, daily_price_krw, NULL, partner_id FROM cars;
INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  SELECT 'TRANSFER', id, service_title, destination_area,
    airport_code || ' ' || COALESCE(vehicle_class, ''), is_active, price_krw, NULL, partner_id FROM transfers;
INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  SELECT 'ACTIVITY', id, title, city,
    COALESCE(category, '') || ' ' || COALESCE(country, '') || ' ' || COALESCE(description, ''),
    is_active, price_krw, review_score, partner_id FROM activities;
INSERT INTO catalog_fts (domain, item_id, title, city, body, active, price_krw, rating, supplier_id)
  SELECT 'PACKAGE', id, title, destination_city, '', is_active, total_package_krw, NULL, NULL FROM packages;
