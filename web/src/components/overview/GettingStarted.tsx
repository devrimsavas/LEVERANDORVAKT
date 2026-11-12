import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Heading, Link, Paragraph } from "@digdir/designsystemet-react";
import { CheckmarkIcon } from "@navikt/aksel-icons";
import type { Onboarding } from "@/lib/onboarding";
import { DismissOnboardingButton } from "./DismissOnboardingButton";
import styles from "./overview.module.css";

type Step = keyof Onboarding["steps"];
const STEPS: Step[] = ["followCompany", "writeNote", "askAssistant"];

interface GettingStartedProps {
  steps: Onboarding["steps"];
  // The first followed company, where a note can be written
  firstCompany: { orgNumber: string; name: string } | null;
  // A new user with no companies gets the large panel without a close
  // button; later the list is smaller and can be closed for good
  canClose: boolean;
}

// A checklist of the three things that make the app useful. Each step is
// ticked from the user's own data, so it is right on every device.
export async function GettingStarted({
  steps,
  firstCompany,
  canClose,
}: GettingStartedProps) {
  const t = await getTranslations("overview.start");
  const done = STEPS.filter((step) => steps[step]).length;
  const allDone = done === STEPS.length;

  const action = (step: Step) => {
    if (steps[step]) return null;
    if (step === "followCompany")
      return { href: "/search", text: t("followCompany.link") };
    if (step === "writeNote")
      return firstCompany
        ? {
            href: `/companies/${firstCompany.orgNumber}`,
            text: t("writeNote.link", { name: firstCompany.name }),
          }
        : null;
    return { href: "/assistant", text: t("askAssistant.link") };
  };

  return (
    <section
      className={styles.welcome}
      data-compact={canClose || undefined}
      aria-labelledby="get-started"
    >
      <div className={styles.startHead}>
        <Heading id="get-started" level={2} data-size={canClose ? "sm" : "md"}>
          {allDone ? t("doneTitle") : t("title")}
        </Heading>
        {canClose && (
          <DismissOnboardingButton
            label={t("close")}
            failedLabel={t("closeFailed")}
          />
        )}
      </div>
      <Paragraph>{allDone ? t("doneLead") : t("lead")}</Paragraph>
      <p className={styles.progress}>
        {t("progress", { done, total: STEPS.length })}
      </p>
      <ol className={styles.startSteps}>
        {STEPS.map((step, index) => {
          const link = action(step);
          return (
            <li key={step} data-done={steps[step] || undefined}>
              <span className={styles.stepNumber} aria-hidden="true">
                {steps[step] ? <CheckmarkIcon /> : index + 1}
              </span>
              <span className={styles.stepText}>
                <strong>{t(`${step}.title`)}</strong>
                {steps[step] && (
                  <span className="visually-hidden"> ({t("stepDone")})</span>
                )}
                <span>{t(`${step}.text`)}</span>
                {link && (
                  <Link asChild data-size="sm">
                    <NextLink href={link.href}>{link.text}</NextLink>
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div className={styles.startFoot}>
        {!steps.followCompany && (
          <Button asChild data-size="lg">
            <NextLink href="/search">{t("button")}</NextLink>
          </Button>
        )}
        <Link asChild>
          <NextLink href="/guide">{t("guide")}</NextLink>
        </Link>
      </div>
    </section>
  );
}
