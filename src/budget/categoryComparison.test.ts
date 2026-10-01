import assert from "node:assert/strict";
import { summarizeMonthlyCategories, type MovementForComparison } from "./categoryComparison.ts";

const movements: MovementForComparison[] = [
  { amount: 200, occurredAt: "2026-09-01T12:00:00-04:00", category: null, allocations: [
    { category: "Alimentación", amount: 100, month: "2026-09-01" },
    { category: "Salud", amount: 100, month: "2026-09-01" }
  ] },
  { amount: -125, occurredAt: "2026-09-20T12:00:00-04:00", category: "Alimentación" },
  { amount: -60, occurredAt: "2026-09-21T12:00:00-04:00", category: "Salud" },
  { amount: -500, occurredAt: "2026-08-20T12:00:00-04:00", category: "Alimentación" }
];

assert.deepEqual(summarizeMonthlyCategories(movements, "2026-09-01"), [
  { category: "Alimentación", income: 100, expense: 125, balance: -25 },
  { category: "Salud", income: 100, expense: 60, balance: 40 }
]);

console.log("Category comparison tests passed");
