export type GasChangeKind = "actual" | "planned";

export type GasChange = {
  id: string;
  changeDate: string;
  kind: GasChangeKind;
  notes: string | null;
  source?: "remote" | "local";
};

export type GasForecast = {
  nextDate: string;
  averageDays: number;
  intervalCount: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const dateAtNoon = (value: string) => new Date(`${value}T12:00:00`);

export const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const normalizeDateInput = (value: string): string | null => {
  const trimmed = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const localMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  const year = Number(isoMatch?.[1] ?? localMatch?.[3]);
  const month = Number(isoMatch?.[2] ?? localMatch?.[2]);
  const day = Number(isoMatch?.[3] ?? localMatch?.[1]);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day, 12);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return toIsoDate(parsed);
};

export const formatGasDate = (value: string) => dateAtNoon(value).toLocaleDateString("es-BO", {
  day: "numeric",
  month: "long",
  year: "numeric"
});

export function calculateGasForecast(changes: GasChange[], today = new Date()): GasForecast | null {
  const todayIso = toIsoDate(today);
  const actualDates = Array.from(new Set(
    changes
      .filter((item) => item.kind === "actual" && item.changeDate <= todayIso)
      .map((item) => item.changeDate)
  )).sort();

  if (actualDates.length < 2) return null;

  const recentDates = actualDates.slice(-7);
  const intervals = recentDates.slice(1).map((value, index) => Math.round(
    (dateAtNoon(value).getTime() - dateAtNoon(recentDates[index]!).getTime()) / DAY_MS
  )).filter((days) => days > 0);

  if (!intervals.length) return null;
  const averageDays = Math.round(intervals.reduce((sum, days) => sum + days, 0) / intervals.length);
  const next = dateAtNoon(actualDates[actualDates.length - 1]!);
  next.setDate(next.getDate() + averageDays);

  return { nextDate: toIsoDate(next), averageDays, intervalCount: intervals.length };
}
