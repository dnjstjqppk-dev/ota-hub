# getfortrip Revenue Settlement & Financial Reconciliation Report

**Document ID:** GFT-FIN-REC-20261018  
**Platform:** getfortrip Global OTA (`ota-hub.dnjstjqppk.workers.dev` -> `getfortrip.com`)  
**Audit Date:** 2026-10-18  
**Author:** getfortrip Finance & Tech Lead / SRE  
**Status:** PRODUCTION RATIFIED

---

## 1. Executive Summary & Dual Revenue Model

getfortrip operates an agile, zero-inventory meta-search & affiliate distribution architecture alongside an enterprise-ready direct OTA ledger. This hybrid structure eliminates inventory risk and working capital liabilities while capturing maximum yield from global travel conversions.

```
+-----------------------------------------------------------------------------------------+
|                                getfortrip Revenue Streams                               |
+-----------------------------------------------------------------------------------------+
                                             |
             +-------------------------------+-------------------------------+
             |                                                               |
             v                                                               v
  [Model A: Affiliate & Meta-Search]                             [Model B: Direct OTA Ledger]
  - Outlink Redirect Tracking                                     - In-App Checkout Ledger
  - Server-to-Server (S2S) Webhook Postbacks                     - Tokenized PG (Toss/PortOne)
  - Gross Commission: 3.5% ~ 8.5% of GMV                          - Merchant Markup: 10% ~ 18%
  - Payout Settlement: Net+30 / Net+60 days                       - Settlement: T+2 PG Batch
  - Inventory Risk: ZERO (Hosted by Supplier)                     - Cancellation Escrow Managed
```

---

## 2. Model A: Affiliate Outlink & S2S Postback Reconciliation

### 2.1 Partner Commission & Attribution Matrix

| Affiliate Partner | Vertical | Commission Model | Cookie / Attribution Window | Payout Cycle | Minimum Threshold |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Trip.com Affiliate** | Hotels, Flights, Rail | 5.0% ~ 7.0% Hotel GMV, $3.5/flight | 30 Days (First/Last Touch hybrid) | Net+30 Days | $100 USD |
| **Agoda Partners** | Hotels & Accommodations | 4.5% ~ 6.0% Room GMV | 30 Days Last Click | Net+45 Days | $200 USD |
| **Booking.com (TP)** | Global Hotels | 4.0% ~ 5.5% Room GMV | Session / 30 Days | Net+30 Days | $50 USD |
| **Klook Affiliate** | Tours, Attractions, SIM/eSIM | 4.0% ~ 8.0% Activity GMV | 30 Days | Net+30 Days | $100 USD |
| **TravelPayouts** | Multi-vertical (Flights, eSIM) | 1.5% ~ 5.0% Gross Basket | 30 Days | Net+20 Days | $50 USD |

### 2.2 S2S Webhook Ledger & Verification Mechanism
Every completed outbound transaction triggers an authenticated server-to-server webhook postback:
- **Endpoint:** `POST /api/v1/affiliate/webhook`
- **Security:** HMAC-SHA256 signature (`X-Signature`), ±300-second timestamp freshness window (`X-Timestamp`).
- **Database Table:** `affiliate_conversions`
  - Columns: `id`, `partner_id`, `click_id`, `booking_id`, `amount`, `currency`, `commission_amount`, `status`, `created_at`, `verified_at`.
- **Deduplication:** Unique composite index on `(partner_id, booking_id)` prevents double-crediting.

---

## 3. Model B: Direct OTA Ledger & PG Escrow Mechanism

### 3.1 Ledger State Machine & Transition Invariants

```
+-----------------------------------------------------------------------------------+
|  [UNPAID]  -- (HMAC Webhook Authorized) -->  [CONFIRMED]  -->  [VOUCHER ISSUED]   |
|     |                                              |                              |
|     +-- (Payment Timeout 15m)                      +-- (User Cancel / Refund)     |
|     v                                              v                              |
|  [EXPIRED]                                   [REFUND_ESCROW] --> [REFUNDED]       |
+-----------------------------------------------------------------------------------+
```

- **Invariant 1:** Unpaid bookings strictly have `voucher_code = NULL`.
- **Invariant 2:** Direct client `/pay` endpoint is strictly disabled (`403 DIRECT_CONFIRMATION_FORBIDDEN`). Only verified S2S PG/supplier webhooks can transition status to `CONFIRMED`.
- **Invariant 3:** Client-submitted amounts on booking creation are validated against system pricing rules (no negative numbers, no currency mismatches).

---

## 4. Reconciliation Ledger Simulation & Discrepancy Thresholds

### 4.1 Daily Automated Reconciliation Algorithm
1. **Extraction:** Query all `affiliate_conversions` and direct `bookings` for `T - 1` calendar day.
2. **Matching:** Match outbound redirect `click_id` in `click_logs` with incoming conversion `click_id`.
3. **Variance Check:**
   $$\Delta_{\text{amount}} = |\text{Reported GMV} - \text{Expected Basket GMV}|$$
   - If $\Delta \le 1.5\%$: Auto-reconcile (currency fluctuation tolerance).
   - If $\Delta > 1.5\%$: Flag for manual financial audit (`FIN_REVIEW_REQUIRED`).
4. **Foreign Exchange Handling:** All multi-currency settlements (USD, JPY, EUR) are converted to KRW base ledger using daily official KEB Hana Bank closing rates.

---

## 5. Compliance & Audit Summary

- **Tax Invoicing:** VAT (10%) applied only to net commission earnings for domestic partner transactions.
- **PCI-DSS:** Zero credit card numbers or CVVs stored in getfortrip D1 database; all payment processing delegated to level-1 PCI-DSS compliant PG gateways.
- **Audit Ledger:** All financial actions logged to `admin_audit_logs` with tamper-evident actor ID and timestamp.

