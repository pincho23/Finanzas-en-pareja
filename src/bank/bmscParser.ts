export type TransactionKind = "income" | "expense";
export type TransactionChannel = "ach" | "pos" | "atm" | "unknown";

export type ParsedBankTransaction = {
  kind: TransactionKind;
  channel: TransactionChannel;
  amount: number;
  currency: "BOB";
  occurredAt: string;
  counterparty: string | null;
  concept: string | null;
  accountLast4: string | null;
  cardLast4: string | null;
  notificationReference: string | null;
  source: "bmsc_email";
};

const compact = (value: string) => value.replace(/\s+/g, " ").trim();

const cleanCounterparty = (value?: string) => {
  if (!value) return null;
  return compact(value)
    .replace(/\s+del banco\s+.+$/i, "")
    .replace(/\s+por un monto.+$/i, "")
    .trim();
};

const parseBolivianDate = (date: string, time: string, meridiem: string) => {
  const dateParts = date.split("/").map(Number);
  const timeParts = time.split(":").map(Number);
  const day = dateParts[0] ?? 0;
  const month = dateParts[1] ?? 0;
  const year = dateParts[2] ?? 0;
  let hour = timeParts[0] ?? 0;
  const minute = timeParts[1] ?? 0;
  const second = timeParts[2] ?? 0;
  const normalizedMeridiem = meridiem.toLowerCase().replace(/\s/g, "");
  if (normalizedMeridiem.startsWith("p") && hour !== 12) hour += 12;
  if (normalizedMeridiem.startsWith("a") && hour === 12) hour = 0;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}-04:00`;
};

export function parseBmscNotification(raw: string): ParsedBankTransaction {
  const text = compact(raw);
  const amountMatch = text.match(/(?:por\s+un\s+)?monto(?:\s+de)?\s*(?:Bs\.?|BOB)?\s*([\d.,]*\d)/i);
  const dateMatch = text.match(/(?:realizada?\s+el\s+)?(\d{2}\/\d{2}\/\d{4})(?:\s+a\s+las)?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*(a\.?\s*m\.?|p\.?\s*m\.)/i);
  if (!amountMatch || !dateMatch) {
    throw new Error("La notificacion BMSC no contiene importe o fecha reconocibles");
  }

  const isAch = /Transferencia\s+ACH/i.test(text);
  const isCredit = isAch && /(?:Cr[eé]dito|Abono).{0,40}Transferencia\s+ACH|Transferencia\s+ACH.{0,80}recibida/i.test(text);
  const isDebitAch = isAch && !isCredit;
  const isPos = /(?:Compra(?:\s+en\s+punto\s+de\s+venta)?|POS).*?(?:POS|comercio)/i.test(text);
  const isAtm = /(?:Retiro|Cajero\s+Autom[aá]tico|ATM).*?(?:ATM|cajero)/i.test(text);

  let channel: TransactionChannel = "unknown";
  if (isCredit || isDebitAch) channel = "ach";
  if (isPos) channel = "pos";
  if (isAtm) channel = "atm";

  const achConcept = text.match(/Transferencia ACH,\s+por concepto de\s+(.+?),\s+(?:a|de) su cuenta/i)?.[1];
  const achParty = text.match(/(?:de|a)\s+(.+?)\s+del BANCO/i)?.[1];
  const posMerchant = text.match(/\(POS\)\s+en el comercio\s+(.+?)\s+con su tarjeta/i)?.[1];
  const atmLocation = text.match(/\(ATM\),\s+ubicado en\s+(.+?),\s+con su tarjeta/i)?.[1];
  const account = text.match(/su cuenta\s+(\d{4,})/i)?.[1] ?? null;
  const cardMasked = text.match(/tarjeta.+?n[uú]mero\s+([\d*]+)/i)?.[1] ?? null;
  const reference = text.match(/n[uú]mero de notificaci[oó]n:\s*([\w-]+)/i)?.[1] ?? null;

  return {
    kind: isCredit ? "income" : "expense",
    channel,
    amount: Number((amountMatch[1] ?? "0").replace(/,/g, "")),
    currency: "BOB",
    occurredAt: parseBolivianDate(dateMatch[1] ?? "", dateMatch[2] ?? "", dateMatch[3] ?? ""),
    counterparty: cleanCounterparty(achParty ?? posMerchant ?? atmLocation),
    concept: achConcept ? compact(achConcept) : null,
    accountLast4: account?.slice(-4) ?? null,
    cardLast4: cardMasked?.replace(/\D/g, "").slice(-4) || null,
    notificationReference: reference,
    source: "bmsc_email"
  };
}
