# k6 stress test scripts for Attendance App

This folder contains a basic k6 script to stress-test a few important endpoints in the Attendance App.

Quick start

- Install k6: https://k6.io/docs/getting-started/installation
- Copy the example env to a real env file or export env vars:

```bash
cp performance/k6/config.example.env .env.k6
export $(cat .env.k6 | xargs)
```

- Run locally (requires k6 installed):

```bash
npm run k6:run
# or
k6 run performance/k6/default.js
```

- To run on k6 Cloud (if you have an account):

```bash
npm run k6:cloud
```

What the script does

- Hits `/api/health` to validate basic availability.
- Attempts to log in using `K6_USER`/`K6_PASS` and reuses the session for subsequent authenticated endpoints.
- Fetches `/api/admin/attendance?month=YYYY-MM` (admin read endpoint).
- POSTs to `/api/attendance/clock-in` and `/api/attendance/clock-out` (simulate light user activity).

Notes & customization

- By default the script stages (ramp-up/ramp-down) a short load; edit `default.js` to tune stages, virtual users, duration and thresholds.
- If your auth endpoint or payload differs, update the `loginPayload()` helper in the script.
- For secure environments, do not commit real credentials. Use CI secrets or CI environment variables for cloud runs.
