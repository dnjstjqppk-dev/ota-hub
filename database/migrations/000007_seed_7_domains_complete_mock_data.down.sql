DELETE FROM dynamic_package_bundles WHERE id IN ('pkg_tokyo_4d3n');
DELETE FROM activity_catalog WHERE id IN ('act_disney_tokyo');
DELETE FROM airport_transfer_catalog WHERE id IN ('tf_icn_van_01', 'tf_nrt_sedan_01');
DELETE FROM car_rental_catalog WHERE id IN ('car_avante_01', 'car_yaris_01');
DELETE FROM train_journeys WHERE id IN ('trn_ktx_01', 'trn_shinkansen_01');
DELETE FROM flight_schedules WHERE id IN ('flt_ke703', 'flt_oz102');
DELETE FROM hotel_room_options WHERE hotel_id IN ('htl_tokyo_01', 'htl_seoul_01');
DELETE FROM hotel_properties WHERE id IN ('htl_tokyo_01', 'htl_seoul_01');
