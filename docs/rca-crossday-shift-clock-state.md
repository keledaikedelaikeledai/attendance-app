# Root Cause Analysis (RCA): Crossday Shift Showing `Clock In` Instead of `Clock Out`

## Incident Summary

Users assigned to crossday shifts (example: `malam` 19:00–07:00) were shown a `Clock In` button on the next calendar day before shift end, even though they were still in an active shift session. This caused accidental duplicate actions (`clock-in` then `clock-out`) on the morning date.

## Impact

- **User-facing impact:** Incorrect attendance action state in the main attendance page.
- **Data impact:** Extra `clock-in`/`clock-out` logs on the next day, potentially inflating early-leave metrics and creating inconsistent report interpretation.
- **Operational impact:** Admin/user confusion when reviewing monthly attendance reports.

## Detection

Issue was detected from real API outputs:

- Shift definitions included crossday shift:
  - `malam`: `start=19:00`, `end=07:00`
- User report for `2026-04` showed:
  - `clock-in` on `2026-04-01` (night shift)
  - then another `clock-in` + `clock-out` on `2026-04-02` early morning

Expected behavior: user should have been prompted to `Clock Out` (continuation of previous night shift) until 07:00.

## Timeline (Condensed)

1. User clocks in for `malam` shift on April 1 night.
2. On April 2 early morning (before shift end), frontend requests attendance state via `/api/attendance`.
3. Endpoint computes state from **today’s date only** and does not infer active session from previous date.
4. Response returns `clockedIn=false`, UI renders `Clock In` button.
5. User performs unintended second `clock-in`.

## Technical Root Cause

The status endpoint `server/api/attendance/index.get.ts` derived attendance state from logs filtered by the requested date (`today`) only.

For crossday shifts:
- clock-in can be recorded under previous date,
- while current time is still inside that previous shift’s active window,
- but endpoint did not backtrack to previous date for open overnight session.

As a result, business state (“still on same shift”) and API state (“no active session today”) diverged.

## Contributing Factors

1. **Date-bounded state model:** active session detection was tightly coupled to one calendar date.
2. **Crossday shift complexity:** shift spans midnight, while log partitioning uses date keys.
3. **UI trust in backend flag:** homepage button state is directly driven by `clockedIn` from API.
4. **Missing regression test:** no automated scenario test for overnight active-session continuity.

## Corrective Action Implemented

Updated `server/api/attendance/index.get.ts`:

- Keep existing same-day detection.
- If no active session for today, check previous day for:
  - open `clock-in` without `clock-out`,
  - shift definition that crosses midnight (`start > end`),
  - current time still before shift end window.
- If matched, return session as active (`clockedIn=true`) and reuse previous-day shift context/logs.

This ensures early-morning state for overnight shifts correctly shows `Clock Out`.

## Why This Fix Works

The fix aligns API state with business semantics:

- An overnight shift remains active across calendar boundary until shift end.
- UI receives correct active-session status and renders proper action.

## Verification Performed

- Lint run completed successfully (non-blocking ecosystem warnings only).
- Production build completed successfully (`bun run build` exit code 0).
- Changed file diagnostics for `server/api/attendance/index.get.ts`: no errors.

## Preventive Actions

1. **Automated regression tests**
   - Add API-level test cases for crossday scenarios:
     - `clock-in` before midnight, no `clock-out`, query after midnight before end => `clockedIn=true`.
     - query after shift end without `clock-out` => `clockedIn=false` (or policy-defined behavior).
2. **Domain helper centralization**
   - Create shared helper for “active shift window” calculations used by `clock-in`, `clock-out`, and `index` status endpoints.
3. **Observability**
   - Add structured logs for state resolution path (`same-day` vs `previous-day-crossday`) to simplify incident debugging.
4. **Data quality guardrail**
   - Optional: prevent duplicate `clock-in` if an overnight shift is still open.

## Owner / Follow-up Checklist

- [ ] Add regression tests for overnight status continuity.
- [ ] Consolidate crossday shift resolution logic into reusable utility.
- [ ] Add monitoring/dashboard metric for duplicate same-user consecutive `clock-in` events.
- [ ] Review monthly report aggregation for side effects from historical duplicate entries.
