import assert from "node:assert/strict";
import { parseBmscNotification } from "./bmscParser.ts";

const cases = [
  {
    name: "debito ACH",
    input: "Débito Transferencia ACH, por concepto de PAGO DE PRODUCTOS, de su cuenta 9999000011 a la cuenta 8888000022 de FARMACORP del BANCO DE CREDITO DE BOLIVIA S.A., por un monto de Bs 130.95. La transacción fue realizada el 03/09/2026 a las 07:23:12 p.m. número de notificación: NTR-DEMO0001.",
    expected: { kind: "expense", channel: "ach", amount: 130.95, occurredAt: "2026-09-03T19:23:12-04:00" }
  },
  {
    name: "compra POS",
    input: "Compra en punto de venta (POS) en el comercio HIPERMAXI ACHUMANI LA PAZ BO con su tarjeta de débito/crédito VISA DEBIT número 111111******2222 por un monto de Bs 178.43. La transacción fue realizada el 07/07/2026 a las 07:22:07 p.m. número de notificación: NTR-DEMO0002.",
    expected: { kind: "expense", channel: "pos", amount: 178.43, occurredAt: "2026-07-07T19:22:07-04:00" }
  },
  {
    name: "retiro ATM",
    input: "Retiro en Cajero Automático (ATM), ubicado en UBICACION DE PRUEBA LA PAZ BO, con su tarjeta VISA DEBIT número 111111******2222 por un monto de Bs 500.00. La transacción fue realizada el 01/07/2026 a las 03:51:02 p.m. número de notificación: NTR-DEMO0003.",
    expected: { kind: "expense", channel: "atm", amount: 500, occurredAt: "2026-07-01T15:51:02-04:00" }
  },
  {
    name: "credito ACH",
    input: "Crédito Transferencia ACH, por concepto de Prueba, a su cuenta 9999000011 de la cuenta 7777000033 de PERSONA DE PRUEBA del BANCO UNION S.A., por un monto de Bs 1.00. La transacción fue realizada el 16/08/2026 a las 10:38:55 p.m. número de notificación: NTR-DEMO0004.",
    expected: { kind: "income", channel: "ach", amount: 1, occurredAt: "2026-08-16T22:38:55-04:00" }
  }
] as const;

for (const testCase of cases) {
  const parsed = parseBmscNotification(testCase.input);
  assert.equal(parsed.kind, testCase.expected.kind);
  assert.equal(parsed.channel, testCase.expected.channel);
  assert.equal(parsed.amount, testCase.expected.amount);
  assert.equal(parsed.occurredAt, testCase.expected.occurredAt);
  assert.equal(parsed.accountLast4 === null || parsed.accountLast4.length === 4, true);
  console.log(`✓ ${testCase.name}`);
}
