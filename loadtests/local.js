/**
 * k6 local smoke — Phase 0 harness validation.
 *
 * Purpose: prove the k6 + API wiring works before Phase 5 runs the real peak
 * stage against AWS. Small VU count, short duration, thresholds loose enough
 * that a local Docker API on a laptop will pass.
 *
 * Usage:
 *   # Terminal 1: docker compose up -d && npm run dev
 *   # Terminal 2:
 *   k6 run loadtests/local.js
 *
 * What it exercises:
 *   - GET /health              (unauthenticated)
 *   - GET /tasks?projectId=... (dev auth via X-Dev-User-Id)
 *
 * Real peak (2,000+ req/min, multi-stage) lives in loadtests/load.js and
 * runs in Phase 5 against the deployed HTTP API.
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.API_BASE_URL ?? "http://localhost:3000";
const DEV_USER = __ENV.DEV_USER_ID ?? "bench-user";
const PROJECT_ID = __ENV.PROJECT_ID ?? "p_0001";

export const options = {
  scenarios: {
    health: {
      executor: "constant-vus",
      vus: 5,
      duration: "20s",
      exec: "health",
    },
    listTasks: {
      executor: "constant-vus",
      vus: 5,
      duration: "20s",
      exec: "listTasks",
      startTime: "20s",
    },
  },
  thresholds: {
    "http_req_failed{scenario:health}": ["rate<0.01"],
    "http_req_failed{scenario:listTasks}": ["rate<0.05"],
    "http_req_duration{scenario:health}": ["p(95)<200"],
    "http_req_duration{scenario:listTasks}": ["p(95)<500"],
  },
};

function devHeaders() {
  return {
    headers: {
      "X-Dev-User-Id": DEV_USER,
      "X-Dev-User-Email": `${DEV_USER}@example.com`,
    },
  };
}

export function health() {
  const res = http.get(`${BASE}/health`);
  check(res, { "health 200": (r) => r.status === 200 });
  sleep(0.1);
}

export function listTasks() {
  const res = http.get(`${BASE}/tasks?projectId=${PROJECT_ID}`, devHeaders());
  check(res, {
    "tasks 2xx/4xx (not 5xx)": (r) => r.status < 500,
  });
  sleep(0.1);
}
