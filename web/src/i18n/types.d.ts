import type messages from "../../messages/en.json";
import type { Locale } from "./config";

// Makes translation keys type-checked: a missing or misspelled key is a
// compile error. en.json is the source; nb.json must have the same keys.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
