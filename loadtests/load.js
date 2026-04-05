/**
 * k6 load test — targets HTTP API after you obtain a Cognito JWT.
 *
 * Usage:
 *   export API_BASE_URL="https://xxxx.execute-api.us-east-1.amazonaws.com"
 *   export JWT="eyJ..."
 *   k6 run loadtests/load.js
 *
 * Peak stage uses 120 VUs with ~50ms think time → on the order of 2,000+ HTTP
 * requests/minute to /health (see k6 summary for exact RPM). Adjust stages as needed.
 */
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "1m", target: 60 },
    { duration: "2m", target: 120 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<5000"],
  },
};

const base = __ENV.API_BASE_URL;

export default function () {
  if (!base) {
    throw new Error("Set API_BASE_URL (HTTP API invoke URL)");
  }
  const url = `${base.replace(/\/$/, "")}/health`;
  const res = http.get(url);
  check(res, { "status is 200": (r) => r.status === 200 });
  sleep(0.05);
}
