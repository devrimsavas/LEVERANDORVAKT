import { getTranslations } from "next-intl/server";
import { Card, Heading, Paragraph, Tag } from "@digdir/designsystemet-react";
import { BellIcon } from "@navikt/aksel-icons";
import styles from "@/app/page.module.css";

// A picture of the product in use: example notifications as they will
// look in the app. Every company in it is made up.
const ITEMS = [
  { key: "bankruptcy", color: "danger" },
  { key: "auditor", color: "warning" },
  { key: "accounts", color: "warning" },
  { key: "address", color: "info" },
] as const;

export async function HeroPreview() {
  const t = await getTranslations("home.preview");

  return (
    <figure className={styles.preview}>
      <Card data-color="neutral" className={styles.previewCard}>
        <div className={styles.previewHeader}>
          <BellIcon aria-hidden />
          <Heading level={2} data-size="2xs">
            {t("title")}
          </Heading>
        </div>
        <ul className={styles.previewList}>
          {ITEMS.map((item) => (
            <li key={item.key} className={styles.previewItem}>
              <Tag data-color={item.color} data-size="sm">
                {t(`items.${item.key}.tag`)}
              </Tag>
              <div>
                <Paragraph data-size="sm" className={styles.previewCompany}>
                  {t(`items.${item.key}.company`)}
                </Paragraph>
                <Paragraph data-size="sm">
                  {t(`items.${item.key}.text`)}
                </Paragraph>
              </div>
              <span className={styles.previewTime}>
                {t(`items.${item.key}.time`)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <figcaption className={styles.previewCaption}>{t("caption")}</figcaption>
    </figure>
  );
}
