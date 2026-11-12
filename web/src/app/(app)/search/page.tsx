import type { Metadata } from "next";
import NextLink from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Alert,
  Heading,
  Paragraph,
  Search,
  SearchButton,
  SearchClear,
  SearchInput,
} from "@digdir/designsystemet-react";
import { ChevronRightIcon } from "@navikt/aksel-icons";
import { searchCompanies } from "@/lib/companies";
import { formatOrgNumber, parseOrgNumber } from "@/lib/orgNumber";
import { orgFormName } from "@/lib/orgForm";
import { companyStatuses } from "@/components/company/companyStatus";
import { StatusTags } from "@/components/company/StatusTags";
import styles from "./search.module.css";

const MIN_QUERY_LENGTH = 2;
const RESULT_LIMIT = 20;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("search");
  return { title: `${t("title")} – Leverandørvakt` };
}

// Designsystemet components are client components: in a server component
// their parts are imported by name (SearchInput), not as Search.Input.
// The form is a plain GET form: the query is in the URL (?q=...), so a
// search can be bookmarked, shared and opened again with the back button
export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  const t = await getTranslations("search");
  const forms = await getTranslations("orgForms");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  // An organization number goes straight to the company
  const orgNumber = parseOrgNumber(query);
  if (orgNumber) redirect(`/companies/${orgNumber}`);

  const result =
    query.length >= MIN_QUERY_LENGTH ? await searchCompanies(query) : null;

  return (
    <div className={`container ${styles.page}`}>
      <Heading level={1} data-size="lg">
        {t("title")}
      </Heading>
      <Paragraph>{t("lead")}</Paragraph>

      <form action="/search" method="get" role="search" className={styles.form}>
        <Search>
          <SearchInput
            name="q"
            defaultValue={query}
            aria-label={t("label")}
            placeholder={t("placeholder")}
            minLength={MIN_QUERY_LENGTH}
          />
          <SearchClear aria-label={t("clear")} />
          <SearchButton>{t("button")}</SearchButton>
        </Search>
      </form>

      {query.length > 0 && query.length < MIN_QUERY_LENGTH && (
        <Paragraph>{t("tooShort", { min: MIN_QUERY_LENGTH })}</Paragraph>
      )}

      {result?.status === "unavailable" && (
        <Alert data-color="warning">{t("unavailable")}</Alert>
      )}

      {result?.status === "ok" && (
        <section aria-labelledby="results" className={styles.results}>
          <Heading id="results" level={2} data-size="xs">
            {result.data.length === 0
              ? t("noResults", { query })
              : t("resultCount", { count: result.data.length, query })}
          </Heading>
          {result.data.length === RESULT_LIMIT && (
            <Paragraph data-size="sm">
              {t("limited", { limit: RESULT_LIMIT })}
            </Paragraph>
          )}
          <ul className={styles.list}>
            {result.data.map((company) => (
              <li key={company.orgNumber}>
                <NextLink
                  href={`/companies/${company.orgNumber}`}
                  className={styles.result}
                >
                  <span className={styles.resultMain}>
                    <span className={styles.name}>{company.name}</span>
                    <span className={styles.meta}>
                      {formatOrgNumber(company.orgNumber)}
                      {" · "}
                      {orgFormName(forms, company.organizationForm) ??
                        company.organizationForm}
                      {company.address?.city && ` · ${company.address.city}`}
                    </span>
                    {company.industryDescription && (
                      <span className={styles.meta}>
                        {company.industryDescription}
                      </span>
                    )}
                  </span>
                  <StatusTags statuses={companyStatuses(company, false)} />
                  <ChevronRightIcon aria-hidden className={styles.chevron} />
                </NextLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
