import type { Metadata } from "next";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getNow, getTranslations } from "next-intl/server";
import {
  Alert,
  Button,
  Heading,
  Paragraph,
  Search,
  SearchButton,
  SearchClear,
  SearchInput,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tag,
} from "@digdir/designsystemet-react";
import { ArrowsCirclepathIcon } from "@navikt/aksel-icons";
import { requireUser } from "@/lib/user";
import { getSystemStatus, getUsers } from "@/lib/admin";
import { MAX_USER_SEARCH_LENGTH } from "@/lib/adminTypes";
import { RiskSplit } from "@/components/overview/RiskSplit";
import { RunJobButton } from "@/components/admin/RunJobButton";
import styles from "@/components/admin/admin.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.nav");
  return { title: `${t("admin")} – Leverandørvakt` };
}

type JobState = "running" | "idle" | "notStarted";
const JOB_COLOR = {
  running: "info",
  idle: "neutral",
  notStarted: "warning",
} as const;

// System status, the background jobs and the users. Normal users get "not
// found", so the page does not reveal itself; the API checks the role
// again on every admin call. Search and page are in the URL.
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const user = await requireUser();
  if (user.role !== "admin") notFound();

  const t = await getTranslations("admin");
  const format = await getFormatter();
  const now = await getNow();
  const query = await searchParams;
  const q =
    typeof query.q === "string" ? query.q.slice(0, MAX_USER_SEARCH_LENGTH) : "";
  const page = Math.max(1, Number(query.page) || 1);

  const [status, users] = await Promise.all([
    getSystemStatus(),
    getUsers(page, q),
  ]);

  const when = (iso: string | null) =>
    iso === null ? (
      t("never")
    ) : (
      <time
        dateTime={iso}
        title={format.dateTime(new Date(iso), {
          dateStyle: "long",
          timeStyle: "short",
        })}
      >
        {format.relativeTime(new Date(iso), now)}
      </time>
    );
  const date = (iso: string) => (
    <time dateTime={iso}>
      {format.dateTime(new Date(iso), { dateStyle: "medium" })}
    </time>
  );
  const jobTag = (state: JobState) => (
    <Tag data-color={JOB_COLOR[state]} data-size="sm">
      {t(`jobs.state.${state}`)}
    </Tag>
  );
  const usersLink = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (target > 1) params.set("page", String(target));
    const s = params.toString();
    return `/admin${s ? `?${s}` : ""}#users`;
  };

  const detection = status?.changeDetection;
  const detectionState: JobState = detection?.running
    ? "running"
    : detection?.initialized
      ? "idle"
      : "notStarted";

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.top}>
        <div>
          <Heading level={1} data-size="lg">
            {t("title")}
          </Heading>
          <Paragraph className={styles.lead}>
            {status
              ? t("lead", {
                  time: format.dateTime(new Date(status.generatedAt), {
                    timeStyle: "medium",
                  }),
                })
              : t("leadNoStatus")}
          </Paragraph>
        </div>
        <Button asChild variant="secondary" data-size="sm">
          <NextLink href="/admin" prefetch={false}>
            <ArrowsCirclepathIcon aria-hidden />
            {t("refresh")}
          </NextLink>
        </Button>
      </div>

      {status === null ? (
        <Alert data-color="warning">{t("statusFailed")}</Alert>
      ) : (
        <>
          <section aria-labelledby="jobs" className={styles.section}>
            <Heading id="jobs" level={2} data-size="sm">
              {t("jobs.title")}
            </Heading>
            <div className={styles.grid}>
              <article className={styles.card} aria-labelledby="job-changes">
                <div className={styles.cardHead}>
                  <Heading id="job-changes" level={3} data-size="xs">
                    {t("jobs.changeDetection.title")}
                  </Heading>
                  {jobTag(detectionState)}
                </div>
                <Paragraph data-size="sm" className={styles.muted}>
                  {t("jobs.changeDetection.text")}
                </Paragraph>
                <dl className={styles.facts}>
                  <dt>{t("jobs.changeDetection.lastRun")}</dt>
                  <dd>{when(status.changeDetection.lastRunAt)}</dd>
                  <dt>{t("jobs.changeDetection.updateFeed")}</dt>
                  <dd className={styles.mono}>
                    {status.changeDetection.lastUpdateId ?? "–"}
                  </dd>
                  <dt>{t("jobs.changeDetection.roleFeed")}</dt>
                  <dd className={styles.mono}>
                    {status.changeDetection.lastRoleEventId ?? "–"}
                  </dd>
                </dl>
                <RunJobButton
                  kind="changeDetection"
                  disabled={status.changeDetection.running}
                />
              </article>

              <article className={styles.card} aria-labelledby="job-accounts">
                <div className={styles.cardHead}>
                  <Heading id="job-accounts" level={3} data-size="xs">
                    {t("jobs.accountsCheck.title")}
                  </Heading>
                  {jobTag(status.accountsCheck.running ? "running" : "idle")}
                </div>
                <Paragraph data-size="sm" className={styles.muted}>
                  {t("jobs.accountsCheck.text")}
                </Paragraph>
                <dl className={styles.facts}>
                  <dt>{t("jobs.accountsCheck.lastChecked")}</dt>
                  <dd>{when(status.accountsCheck.lastCompanyCheckedAt)}</dd>
                  <dt>{t("jobs.accountsCheck.due")}</dt>
                  <dd>
                    {t("companies", {
                      count: status.accountsCheck.companiesDue,
                    })}
                  </dd>
                </dl>
                <RunJobButton
                  kind="accountsCheck"
                  disabled={status.accountsCheck.running}
                />
              </article>
            </div>
          </section>

          <section aria-labelledby="numbers" className={styles.section}>
            <Heading id="numbers" level={2} data-size="sm">
              {t("numbers.title")}
            </Heading>
            <ul className={styles.tiles}>
              <li className={styles.tile}>
                <span className={styles.tileLabel}>{t("numbers.users")}</span>
                <span className={styles.tileValue}>
                  {format.number(status.users.total)}
                </span>
                <span className={styles.tileSub}>
                  {t("numbers.admins", { count: status.users.admins })}
                </span>
              </li>
              <li className={styles.tile}>
                <span className={styles.tileLabel}>
                  {t("numbers.companies")}
                </span>
                <span className={styles.tileValue}>
                  {format.number(status.companies.total)}
                </span>
                <span className={styles.tileSub}>
                  {t("numbers.companiesSub", {
                    followed: status.companies.followed,
                    struckOff: status.companies.struckOff,
                  })}
                </span>
              </li>
              <li className={styles.tile}>
                <span className={styles.tileLabel}>
                  {t("numbers.watchlistEntries")}
                </span>
                <span className={styles.tileValue}>
                  {format.number(status.watchlistEntries)}
                </span>
                <span className={styles.tileSub}>
                  {t("numbers.watchlistSub")}
                </span>
              </li>
              <li className={styles.tile}>
                <span className={styles.tileLabel}>
                  {t("numbers.notifications")}
                </span>
                <span className={styles.tileValue}>
                  {format.number(status.notifications.total)}
                </span>
                <span className={styles.tileSub}>
                  {t("numbers.unread", { count: status.notifications.unread })}
                </span>
              </li>
              <li className={styles.tile}>
                <span className={styles.tileLabel}>
                  {t("numbers.questions")}
                </span>
                <span className={styles.tileValue}>
                  {format.number(status.assistant.questionsLast24Hours)}
                </span>
                <span className={styles.tileSub}>
                  {t("numbers.conversations", {
                    count: status.assistant.conversations,
                  })}
                </span>
              </li>
              <li className={styles.tile}>
                <span className={styles.tileLabel}>{t("numbers.model")}</span>
                <span className={`${styles.tileValue} ${styles.tileText}`}>
                  {status.assistant.provider ?? t("numbers.modelOff")}
                </span>
                <span className={styles.tileSub}>{t("numbers.modelSub")}</span>
              </li>
            </ul>
          </section>

          <RiskSplit
            id="risk-all"
            title={t("riskTitle")}
            counts={status.companies.riskLevels}
          />
        </>
      )}

      <section aria-labelledby="users" className={styles.section}>
        <Heading id="users" level={2} data-size="sm">
          {users
            ? t("users.titleCount", { count: users.totalItems })
            : t("users.title")}
        </Heading>
        <form
          action="/admin#users"
          method="get"
          role="search"
          className={styles.search}
        >
          <Search>
            <SearchInput
              name="q"
              defaultValue={q}
              aria-label={t("users.searchLabel")}
              placeholder={t("users.searchPlaceholder")}
              maxLength={MAX_USER_SEARCH_LENGTH}
            />
            <SearchClear aria-label={t("users.clear")} />
            <SearchButton>{t("users.search")}</SearchButton>
          </Search>
        </form>

        {users === null ? (
          <Alert data-color="warning">{t("users.failed")}</Alert>
        ) : users.items.length === 0 ? (
          <Paragraph>
            {q ? t("users.noMatch", { q }) : t("users.empty")}
          </Paragraph>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <Table zebra data-size="sm" className={styles.table}>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>{t("users.name")}</TableHeaderCell>
                    <TableHeaderCell>{t("users.email")}</TableHeaderCell>
                    <TableHeaderCell className={styles.number}>
                      {t("users.followed")}
                    </TableHeaderCell>
                    <TableHeaderCell>{t("users.created")}</TableHeaderCell>
                    <TableHeaderCell>{t("users.lastLogin")}</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.items.map((item) => (
                    <TableRow key={item.userId}>
                      <TableCell>
                        <span className={styles.name}>
                          {item.firstName} {item.lastName}
                          {item.role === "admin" && (
                            <Tag data-color="accent" data-size="sm">
                              {t("users.admin")}
                            </Tag>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className={styles.email}>
                        {item.email}
                      </TableCell>
                      <TableCell className={styles.number}>
                        {format.number(item.followedCompanies)}
                      </TableCell>
                      <TableCell>{date(item.createdAt)}</TableCell>
                      <TableCell>{when(item.lastLoginAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {users.totalPages > 1 && (
              <nav aria-label={t("users.pages")} className={styles.pager}>
                {page > 1 && (
                  <Button asChild variant="secondary" data-size="sm">
                    <NextLink href={usersLink(page - 1)}>
                      {t("users.newer")}
                    </NextLink>
                  </Button>
                )}
                <span>
                  {t("users.pageOf", { page, total: users.totalPages })}
                </span>
                {page < users.totalPages && (
                  <Button asChild variant="secondary" data-size="sm">
                    <NextLink href={usersLink(page + 1)}>
                      {t("users.older")}
                    </NextLink>
                  </Button>
                )}
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  );
}
