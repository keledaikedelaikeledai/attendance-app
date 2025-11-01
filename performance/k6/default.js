/* global __ENV */
import { check, sleep } from 'k6'
import http from 'k6/http'

// Configuration via environment variables
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const K6_USER = __ENV.K6_USER || ''
const K6_PASS = __ENV.K6_PASS || ''
const K6_DEBUG = __ENV.K6_DEBUG === '1'

export const options = {
  // example stress profile: ramp up -> sustain -> ramp down
  stages: [
    { duration: '20s', target: 10 },
    { duration: '40s', target: 50 },
    { duration: '40s', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    // 95% of requests should finish within 1s (adjust as appropriate)
    http_req_duration: ['p(95)<1000'],
  },
  // adjust vus/vuActivity if you want different default behavior
}

function login() {
  if (!K6_USER || !K6_PASS) return null
  const payload = JSON.stringify({ username: K6_USER, password: K6_PASS })
  const headers = { 'Content-Type': 'application/json' }
  const res = http.post(`${BASE_URL}/api/auth/login`, payload, { headers })
  if (K6_DEBUG) console.info('[k6] login status', res.status)
  // if login uses cookies the subsequent requests will contain the cookie automatically
  return res
}

export default function () {
  // lightweight health check
  const h = http.get(`${BASE_URL}/api/health`)
  check(h, { 'health 200': r => r.status === 200 })

  // attempt login if credentials provided
  let loginRes = null
  if (K6_USER && K6_PASS) {
    loginRes = login()
    check(loginRes, { 'login ok': r => r && r.status === 200 })
  }

  // Read admin attendance (requires auth)
  const month = (new Date()).toISOString().slice(0, 7)
  const att = http.get(`${BASE_URL}/api/admin/attendance?month=${month}`)
  check(att, { 'admin attendance 200': r => r.status === 200 || r.status === 401 })

  // Simulate a user clock-in/clock-out sequence (may be a 401 if not allowed)
  const jsonHeaders = { 'Content-Type': 'application/json' }
  const clockIn = http.post(`${BASE_URL}/api/attendance/clock-in`, JSON.stringify({ note: 'k6 test' }), { headers: jsonHeaders })
  check(clockIn, { 'clock-in 200|201': r => r.status === 200 || r.status === 201 || r.status === 401 })
  sleep(Math.random() * 2)
  const clockOut = http.post(`${BASE_URL}/api/attendance/clock-out`, JSON.stringify({ note: 'k6 test' }), { headers: jsonHeaders })
  check(clockOut, { 'clock-out 200|201': r => r.status === 200 || r.status === 201 || r.status === 401 })

  // fetch report endpoint as a heavier read
  const rep = http.get(`${BASE_URL}/api/attendance/report?month=${month}`)
  check(rep, { 'report 200': r => r.status === 200 || r.status === 401 })

  sleep(Math.random() * 3)
}
