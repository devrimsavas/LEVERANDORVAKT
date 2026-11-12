import "server-only";
import { getFormatter, getTranslations } from "next-intl/server";
import { formatChangeValue } from "./changeValue";

type Value = Record<string, unknown> | null;

export interface ChangeDisplay {
  before: string;
  after: string;
}

const NONE = "–";

// Before and after texts for a change, in the user's language. Most fields
// store plain values (a name, an address, yes/no); annual accounts and risk
// changes store small objects, which get their own wording here.
export async function getChangeDisplay() {
  const t = await getTranslations("changeValues");
  const level = await getTranslations("risk.level");
  const format = await getFormatter();

  const money = (amount: unknown, currency: unknown) =>
    typeof amount !== "number"
      ? NONE
      : typeof currency === "string"
        ? format.number(amount, {
            style: "currency",
            currency,
            maximumFractionDigits: 0,
          })
        : format.number(amount, { maximumFractionDigits: 0 });

  return (
    field: string,
    oldValue: unknown,
    newValue: unknown,
  ): ChangeDisplay => {
    const before = oldValue as Value;
    const after = newValue as Value;

    switch (field) {
      case "riskLevel": {
        const show = (v: Value) =>
          v && typeof v.level === "string"
            ? t("risk", {
                level: level(v.level as "low"),
                score: Number(v.score ?? 0),
              })
            : NONE;
        return { before: show(before), after: show(after) };
      }
      case "annualAccounts.negativeEquity": {
        const show = (v: Value) =>
          v
            ? t("equity", {
                amount: money(v.equity, v.currency),
                year: String(v.year),
              })
            : NONE;
        return { before: show(before), after: show(after) };
      }
      case "annualAccounts.auditDropped":
        return {
          before: before ? t("audited", { year: String(before.year) }) : NONE,
          after: after ? t("notAudited", { year: String(after.year) }) : NONE,
        };
      case "annualAccounts.filed":
      case "annualAccounts.corrected":
      case "annualAccounts.liquidation":
        return {
          before: NONE,
          after: after ? t("accountsFor", { year: String(after.year) }) : NONE,
        };
      default:
        return {
          before: formatChangeValue(oldValue, t("yes"), t("no")),
          after: formatChangeValue(newValue, t("yes"), t("no")),
        };
    }
  };
}
