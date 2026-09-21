import assert from "node:assert/strict";
import { calculateGasForecast, normalizeDateInput, type GasChange } from "./gasForecast.ts";

const changes: GasChange[] = [
  { id: "1", changeDate: "2026-06-01", kind: "actual", notes: null },
  { id: "2", changeDate: "2026-06-21", kind: "actual", notes: null },
  { id: "3", changeDate: "2026-07-13", kind: "actual", notes: null },
  { id: "4", changeDate: "2026-08-02", kind: "actual", notes: null },
  { id: "5", changeDate: "2026-09-30", kind: "planned", notes: null }
];

assert.deepEqual(calculateGasForecast(changes, new Date(2026, 8, 21, 12)), {
  nextDate: "2026-08-23",
  averageDays: 21,
  intervalCount: 3
});
assert.equal(normalizeDateInput("21/09/2026"), "2026-09-21");
assert.equal(normalizeDateInput("2026-02-30"), null);
assert.equal(calculateGasForecast(changes.slice(0, 1)), null);

console.log("Gas forecast tests passed");
