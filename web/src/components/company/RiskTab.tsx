import { getFormatter, getTranslations } from "next-intl/server";
import { Alert, Heading, Paragraph, Tag } from "@digdir/designsystemet-react";
import { getCompanyRisk } from "@/lib/companies";
import type { RiskParams } from "@/lib/companyTypes";
import { SEVERITY_COLOR } from "@/lib/notificationTypes";
import { RiskTag } from "./RiskTag";
import styles from "./company.module.css";

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

// Turns a signal's params into values for its text: amounts with their
// currency, dates in the user's language, everything else as it is
function textValues(params: RiskParams, format: Formatter) {
  const money = (value: unknown, currency: unknown) =>
    typeof value === "number"
      ? typeof currency === "string"
        ? format.number(value, {
            style: "currency",
            currency,
            maximumFractionDigits: 0,
          })
        : format.number(value, { maximumFractionDigits: 0 })
      : "";
  const date = (value: unknown) =>
    typeof value === "string"
      ? format.dateTime(new Date(value), { dateStyle: "long" })
      : "";

  return {
    // Years as plain text (2025, not "2,025"); count stays a number for
    // plural forms
    ...Object.fromEntries(
      Object.entries(params).map(([key, value]) => [
        key,
        key === "count" ? value : value === null ? "" : String(value),
      ]),
    ),
    equity: money(params.equity, params.currency),
    result: money(params.result, params.currency),
    previousResult: money(params.previousResult, params.previousCurrency),
    deadline: date(params.deadline),
    // "none" picks the wording for a struck-off date that is not known
    date: params.date ? date(params.date) : "none",
    foundedDate: date(params.foundedDate),
    since: date(params.since),
    ratio:
      typeof params.ratio === "number"
        ? format.number(params.ratio / 100, {
            style: "percent",
            maximumFractionDigits: 1,
          })
        : "",
    // "none" picks the "no accounts filed" wording in the messages
    lastFiledYear: String(params.lastFiledYear ?? "none"),
  };
}

export async function RiskTab({
  orgNumber,
  followed,
}: {
  orgNumber: string;
  followed: boolean;
}) {
  const t = await getTranslations("risk");
  const severity = await getTranslations("notifications.severity");
  const format = await getFormatter();
  const result = await getCompanyRisk(orgNumber, followed);

  if (result.status !== "ok") {
    return <Alert data-color="warning">{t("unavailable")}</Alert>;
  }
  const risk = result.data;

  // Signal and limitation codes come from the API; a code this app does not
  // know yet gets a general text
  const signalText = (
    code: string,
    part: "title" | "detail",
    params: RiskParams,
  ) => {
    const key = `signals.${code}.${part}` as Parameters<typeof t>[0];
    return t.has(key)
      ? t(key, textValues(params, format) as never)
      : t(`signals.unknown.${part}`);
  };
  const limitationText = (code: string, params: RiskParams) => {
    const key = `limitations.${code}` as Parameters<typeof t>[0];
    return t.has(key)
      ? t(key, textValues(params, format) as never)
      : t("limitations.unknown");
  };

  return (
    <div className={styles.stack}>
      <div className={styles.riskSummary}>
        <div>
          <span className={styles.riskLabel}>{t("levelLabel")}</span>
          <RiskTag level={risk.level} large />
        </div>
        <div>
          <span className={styles.riskLabel}>{t("scoreLabel")}</span>
          <span className={styles.score}>
            {t("score", { score: risk.score })}
          </span>
        </div>
        <Paragraph data-size="sm" className={styles.source}>
          {t("assessedAt", {
            date: format.dateTime(new Date(risk.assessedAt), {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          })}
        </Paragraph>
      </div>

      <section className={styles.stack} aria-labelledby="signals">
        <Heading id="signals" level={2} data-size="xs">
          {t("signalsTitle")}
        </Heading>
        {risk.signals.length === 0 ? (
          <Paragraph>{t("noSignals")}</Paragraph>
        ) : (
          <ul className={styles.signals}>
            {risk.signals.map((signal) => (
              <li
                key={signal.code}
                className={styles.signal}
                data-severity={signal.severity}
              >
                <div className={styles.signalHead}>
                  <Tag
                    data-color={SEVERITY_COLOR[signal.severity]}
                    data-size="sm"
                  >
                    {severity(signal.severity)}
                  </Tag>
                  <span className={styles.signalTitle}>
                    {signalText(signal.code, "title", signal.params)}
                  </span>
                  {signal.points > 0 && (
                    <span className={styles.points}>
                      {t("points", { points: signal.points })}
                    </span>
                  )}
                </div>
                <Paragraph data-size="sm">
                  {signalText(signal.code, "detail", signal.params)}
                </Paragraph>
              </li>
            ))}
          </ul>
        )}
      </section>

      {risk.limitations.length > 0 && (
        <Alert data-color="info">
          <Heading level={2} data-size="2xs">
            {t("limitationsTitle")}
          </Heading>
          <ul className={styles.limitations}>
            {risk.limitations.map((limitation) => (
              <li key={limitation.code}>
                {limitationText(limitation.code, limitation.params)}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <details className={styles.howItWorks}>
        <summary>{t("howTitle")}</summary>
        <Paragraph data-size="sm">{t("howText")}</Paragraph>
      </details>

      <Paragraph data-size="sm" className={styles.source}>
        {t("disclaimer")}
      </Paragraph>
    </div>
  );
}
