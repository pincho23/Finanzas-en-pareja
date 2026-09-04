import { createClient } from "npm:@supabase/supabase-js@2";

type Payload = {
  household_id: string;
  message_id: string;
  subject?: string;
  body: string;
};

type ParsedTransaction = {
  kind: "income" | "expense";
  channel: "ach" | "pos" | "atm" | "unknown";
  amount: number;
  occurredAt: string;
  counterparty: string | null;
  concept: string | null;
  accountLast4: string | null;
  cardLast4: string | null;
};

const compact = (value: string) => value.replace(/\s+/g, " ").trim();

function parseBmscEmail(raw: string): ParsedTransaction {
  const text = compact(raw);
  const amountMatch = text.match(/(?:por\s+un\s+)?monto(?:\s+de)?\s*(?:Bs\.?|BOB)?\s*([\d.,]*\d)/i);
  const dateMatch = text.match(/(?:realizada?\s+el\s+)?(\d{2}\/\d{2}\/\d{4})(?:\s+a\s+las)?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*(a\.?\s*m\.?|p\.?\s*m\.)/i);
  if (!amountMatch || !dateMatch) throw new Error("Formato BMSC no reconocido");

  const ach = /Transferencia\s+ACH/i.test(text);
  const credit = ach && /(?:Cr[eé]dito|Abono).{0,40}Transferencia\s+ACH|Transferencia\s+ACH.{0,80}recibida/i.test(text);
  const debitAch = ach && !credit;
  const pos = /(?:Compra(?:\s+en\s+punto\s+de\s+venta)?|POS).*?(?:POS|comercio)/i.test(text);
  const atm = /(?:Retiro|Cajero\s+Autom[aá]tico|ATM).*?(?:ATM|cajero)/i.test(text);
  const channel = credit || debitAch ? "ach" : pos ? "pos" : atm ? "atm" : "unknown";
  if (channel === "unknown") throw new Error("Tipo de movimiento BMSC no reconocido");

  const [day, month, year] = (dateMatch[1] ?? "").split("/").map(Number);
  let [hour, minute, second = 0] = (dateMatch[2] ?? "").split(":").map(Number);
  const meridiem = (dateMatch[3] ?? "").toLowerCase().replace(/\s/g, "");
  if (meridiem.startsWith("p") && hour !== 12) hour = (hour ?? 0) + 12;
  if (meridiem.startsWith("a") && hour === 12) hour = 0;
  const pad = (value: number | undefined) => String(value ?? 0).padStart(2, "0");

  const achParty = text.match(/(?:de|a)\s+(.+?)\s+del BANCO/i)?.[1];
  const posMerchant = text.match(/\(POS\)\s+en el comercio\s+(.+?)\s+con su tarjeta/i)?.[1];
  const atmLocation = text.match(/\(ATM\),\s+ubicado en\s+(.+?),\s+con su tarjeta/i)?.[1];
  const account = text.match(/su cuenta\s+(\d{4,})/i)?.[1];
  const card = text.match(/tarjeta.+?n[uú]mero\s+([\d*]+)/i)?.[1];

  return {
    kind: credit ? "income" : "expense",
    channel,
    amount: Number((amountMatch[1] ?? "0").replace(/,/g, "")),
    occurredAt: `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}-04:00`,
    counterparty: compact(achParty ?? posMerchant ?? atmLocation ?? "") || null,
    concept: compact(text.match(/Transferencia ACH,\s+por concepto de\s+(.+?),\s+(?:a|de) su cuenta/i)?.[1] ?? "") || null,
    accountLast4: account?.slice(-4) ?? null,
    cardLast4: card?.replace(/\D/g, "").slice(-4) || null
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("BMSC_INGEST_SECRET");
  if (!expectedSecret || request.headers.get("x-ingest-secret") !== expectedSecret) return json({ error: "Unauthorized" }, 401);

  try {
    const payload = await request.json() as Payload;
    if (!/^[0-9a-f-]{36}$/i.test(payload.household_id) || !payload.message_id || !payload.body) return json({ error: "Invalid payload" }, 400);
    const parsed = parseBmscEmail(payload.body);
    const fingerprintBytes = new TextEncoder().encode(`bmsc:${payload.message_id}`);
    const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", fingerprintBytes))).map((b) => b.toString(16).padStart(2, "0")).join("");

    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    const serverKey = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const client = createClient(Deno.env.get("SUPABASE_URL")!, serverKey!);
    const { data, error } = await client.from("transactions").upsert({
      household_id: payload.household_id,
      kind: parsed.kind,
      amount: parsed.amount,
      currency: "BOB",
      occurred_at: parsed.occurredAt,
      description: parsed.concept ?? parsed.counterparty,
      counterparty: parsed.counterparty,
      channel: parsed.channel,
      source: "bmsc_email",
      source_fingerprint: fingerprint,
      account_last4: parsed.accountLast4,
      card_last4: parsed.cardLast4,
      status: "pending"
    }, { onConflict: "household_id,source_fingerprint", ignoreDuplicates: true }).select("id").maybeSingle();
    if (error) throw error;

    if (data?.id) {
      const { data: tokens } = await client.from("push_tokens").select("token").eq("household_id", payload.household_id);
      if (tokens?.length) await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(tokens.map(({ token }) => ({ to: token, sound: "default", title: parsed.kind === "income" ? "Nuevo ingreso" : "Nuevo gasto", body: `${parsed.kind === "income" ? "+" : "−"} Bs ${parsed.amount.toFixed(2)} · ${parsed.counterparty ?? parsed.channel.toUpperCase()}`, data: { transactionId: data.id } }))) });
    }

    return json({ ok: true, created: Boolean(data?.id) });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 400);
  }
});
