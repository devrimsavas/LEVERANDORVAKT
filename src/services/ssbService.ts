// Statistics Norway's classification service (Klass). Brreg gives each
// company a full industry code with its name (e.g. 62.100), but not the
// names of the main industries the codes belong to (62), so those come
// from the official standard, SN2025 (classification 6).
const KLASS_URL = "https://data.ssb.no/api/klass/v1/classifications/6/codesAt";

interface KlassResponse {
  codes: { code: string; name: string; level: string }[];
}

export class SsbError extends Error {}

// Names of the main industries (two-digit codes) valid on the given date
export async function fetchIndustryDivisions(
  date: Date,
): Promise<Record<string, string>> {
  const url = new URL(KLASS_URL);
  url.searchParams.set("date", date.toISOString().slice(0, 10));
  url.searchParams.set("selectLevel", "2");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new SsbError(
      `SSB answered ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as KlassResponse;
  return Object.fromEntries(data.codes.map((c) => [c.code, c.name]));
}
