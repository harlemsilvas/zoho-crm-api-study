#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const input = process.argv[2]
  ? await readFile(process.argv[2], "utf8")
  : await new Promise((resolve, reject) => {
      let value = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { value += chunk; });
      process.stdin.on("end", () => resolve(value));
      process.stdin.on("error", reject);
    });

const records = input
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .flatMap((line) => {
    try {
      const record = JSON.parse(line);
      return record && typeof record === "object" ? [record] : [];
    } catch {
      return [];
    }
  });

const http = records.filter((record) => record.event === "http_request_completed");
const http5xx = http.filter((record) => Number(record.status) >= 500);
const http4xx = http.filter((record) => Number(record.status) >= 400 && Number(record.status) < 500);
const durations = http
  .map((record) => Number(record.duration_ms))
  .filter(Number.isFinite)
  .sort((left, right) => left - right);
const percentile95 = durations.length === 0
  ? null
  : durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)];

const result = {
  parsed_events: records.length,
  http_requests: http.length,
  http_4xx: http4xx.length,
  http_5xx: http5xx.length,
  http_error_rate_pct: http.length === 0
    ? null
    : Math.round((http5xx.length / http.length) * 10000) / 100,
  http_duration_p95_ms: percentile95,
  zoho_operations_failed: records.filter((record) => record.event === "zoho_operation_failed").length,
  token_refresh_failed: records.filter((record) => record.event === "zoho_token_refresh_failed").length,
};

process.stdout.write(`${JSON.stringify(result)}\n`);
