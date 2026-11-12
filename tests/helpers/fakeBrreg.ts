import { afterEach, beforeEach, vi } from "vitest";
import type { FakeBrreg } from "./fakeRegister.js";
import { createFakeBrreg } from "./fakeRegister.js";

export * from "./fakeRegister.js";

// Replaces fetch with the fake register for every test in the file,
// starting each test with an empty register
export function useFakeBrreg(): FakeBrreg {
  const { fake, reset, fetch } = createFakeBrreg();

  beforeEach(() => {
    reset();
    vi.stubGlobal("fetch", fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  return fake;
}
