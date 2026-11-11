import type { Municipality } from "../types/trends.js";

// Kartverket's open municipality register. Brreg has no list of
// municipalities, and the list changes with municipal reforms (the last
// one in 2024), so it is fetched instead of being written into the code.
const MUNICIPALITIES_URL = "https://ws.geonorge.no/kommuneinfo/v1/kommuner";

interface KartverketMunicipality {
  kommunenummer: string;
  kommunenavnNorsk: string;
}

export class KartverketError extends Error {}

// All municipalities, sorted by name in Norwegian order
export async function fetchMunicipalities(): Promise<Municipality[]> {
  const response = await fetch(MUNICIPALITIES_URL);
  if (!response.ok) {
    throw new KartverketError(
      `Kartverket answered ${response.status} ${response.statusText}`,
    );
  }
  const data = (await response.json()) as KartverketMunicipality[];
  return data
    .map((m) => ({ number: m.kommunenummer, name: m.kommunenavnNorsk }))
    .sort((a, b) => a.name.localeCompare(b.name, "nb"));
}
