-- 0043: drop the never-used partner cancellation-request table (P3 #150).
-- Created by 0003, referenced nowhere in the worker, portals, scripts, or
-- tests. The live cancel paths (customer cancel, operator decision, admin
-- force-cancel) all run through bookings + refunds, so this table only
-- collected dust (and a REFERENCES edge the FK audit must consider).
DROP TABLE IF EXISTS partner_cancellations;
