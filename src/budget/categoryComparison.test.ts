import assert from "node:assert/strict";
import { monthlyIncomeTotal, summarizeMonthlyCategories, type MovementForComparison } from "./categoryComparison.ts";

const movements: MovementForComparison[] = [
  { amount: 120, occurredAt: "2026-09-01T12:00:00-04:00", category: null },
  { amount: 80, occurredAt: "2026-09-10T12:00:00-04:00", category: null },
  { amount: -125, occurredAt: "2026-09-20T12:00:00-04:00", category: "Alimentación" },
  { amount: -60, occurredAt: "2026-09-21T12:00:00-04:00", category: "Salud" },
  { amount: -500, occurredAt: "2026-08-20T12:00:00-04:00", category: "Alimentación" }
];

const allocations = [
  { category: "Alimentación", amount: 100, month: "2026-09-01" },
  { category: "Salud", amount: 100, month: "2026-09-01" }
];

assert.equal(monthlyIncomeTotal(movements, "2026-09-01"), 200);
assert.equal(monthlyIncomeTotal(movements, "2026-08-01"), 0);

const septemberSummary = summarizeMonthlyCategories(movements, allocations, "2026-09-01");

assert.deepEqual(septemberSummary, [
  { category: "Alimentación", income: 100, expense: 125, balance: -25 },
  { category: "Salud", income: 100, expense: 60, balance: 40 }
]);
assert.equal(septemberSummary.reduce((total, item) => total + item.expense, 0), 185);

console.log("Category comparison tests passed");
