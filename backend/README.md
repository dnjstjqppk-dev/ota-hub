# backend/ — Go offline toolbox (TG-01 remit)

Serving truth is the TypeScript worker (`worker/`). Go holds ONLY pure offline
utilities with unit tests — no HTTP servers, no DB stores, no serving duplicates.

Kept:

- `internal/referral/` — affiliate referral-URL minting for 5 OTA platforms
  (Agoda, TripCom, Klook, KKday, MyRealTrip) + tests. Pure URL building; the
  worker's affiliate route does click/postback attribution, so the two
  complement instead of duplicating.
  NOTE: the default partner IDs are placeholders — set real IDs via env
  (`AGODA_PARTNER_CID`, `TRIPCOM_ALLIANCE_ID`, `KLOOK_AFFILIATE_AID`,
  `KKDAY_CAMPAIGN_CID`, `MYREALTRIP_PARTNER_ID`) before any production use.

Deleted by TG-01 (see git log): `cmd/api`,
`internal/{curation,domain,engine,handler,ingest,repository,webhook}` — a shadow
serving stack (server, handlers, JWT, store, pricing, state machine, mock search
aggregator) plus an unwired AI-curation pipeline. Recover from git history if
needed; do not resurrect the shadow stack.

Re-entry rule: new Go code is allowed only for batch/offline work the worker
cannot do (long aggregations, bulk syncs, settlement batches), with tests.
Anything request-serving belongs in `worker/`.
