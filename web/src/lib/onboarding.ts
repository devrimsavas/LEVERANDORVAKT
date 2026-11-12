import "server-only";
import { apiFetch } from "./api";

// The "getting started" list (GET /api/auth/me/onboarding). The API reads
// each step from the user's own data; only closing the list is stored.
export interface Onboarding {
  steps: {
    followCompany: boolean;
    writeNote: boolean;
    askAssistant: boolean;
  };
  completed: boolean;
  dismissedAt: string | null;
}

// null when the API did not answer
export async function getOnboarding(): Promise<Onboarding | null> {
  const result = await apiFetch<Onboarding>("/api/auth/me/onboarding");
  return result.ok ? result.data : null;
}
