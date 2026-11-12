import type { Metadata } from "next";
import NextLink from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  Alert,
  Button,
  Heading,
  Paragraph,
} from "@digdir/designsystemet-react";
import { PlusIcon, RobotSmileIcon } from "@navikt/aksel-icons";
import {
  getAssistantStatus,
  getConversation,
  getConversations,
} from "@/lib/assistant";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { DeleteConversationButton } from "@/components/assistant/DeleteConversationButton";
import styles from "@/components/assistant/assistant.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.nav");
  return { title: `${t("assistant")} – Leverandørvakt` };
}

const UUID = /^[0-9a-f-]{36}$/i;

// The open conversation is in the URL (?c=...), so it survives a reload
export default async function AssistantPage({
  searchParams,
}: PageProps<"/assistant">) {
  const t = await getTranslations("assistant");
  const format = await getFormatter();
  const { c } = await searchParams;
  const openId = typeof c === "string" && UUID.test(c) ? c : null;

  const [status, conversations, open] = await Promise.all([
    getAssistantStatus(),
    getConversations(),
    openId ? getConversation(openId) : Promise.resolve(null),
  ]);

  const list = (
    <nav aria-label={t("conversations")} className={styles.list}>
      <Button asChild variant="secondary" data-size="sm">
        <NextLink href="/assistant">
          <PlusIcon aria-hidden />
          {t("newConversation")}
        </NextLink>
      </Button>
      {conversations === null ? (
        <Paragraph data-size="sm">{t("listFailed")}</Paragraph>
      ) : conversations.length === 0 ? (
        <Paragraph data-size="sm" className={styles.muted}>
          {t("noConversations")}
        </Paragraph>
      ) : (
        <ul>
          {conversations.map((conversation) => (
            <li key={conversation.id} className={styles.listItem}>
              <NextLink
                href={`/assistant?c=${conversation.id}`}
                aria-current={conversation.id === openId ? "page" : undefined}
                className={styles.listLink}
              >
                <span className={styles.listTitle}>{conversation.title}</span>
                <span className={styles.listDate}>
                  {format.dateTime(new Date(conversation.updatedAt), {
                    dateStyle: "medium",
                  })}
                </span>
              </NextLink>
              <DeleteConversationButton
                id={conversation.id}
                title={conversation.title}
                isOpen={conversation.id === openId}
              />
            </li>
          ))}
        </ul>
      )}
    </nav>
  );

  return (
    <div className={`container ${styles.page}`}>
      <div>
        <Heading level={1} data-size="lg" className={styles.title}>
          <span className={styles.avatar} data-size="lg">
            <RobotSmileIcon aria-hidden />
          </span>
          {t("title")}
        </Heading>
        <Paragraph className={styles.lead}>{t("lead")}</Paragraph>
      </div>

      <div className={styles.layout}>
        <aside className={styles.side}>
          {/* On phones the list folds away above the chat */}
          <details className={styles.listFold}>
            <summary>{t("conversations")}</summary>
            {list}
          </details>
          <div className={styles.listWide}>{list}</div>
        </aside>

        <section className={styles.main} aria-label={t("chatLabel")}>
          {openId && open === null ? (
            <Alert data-color="warning">{t("notFound")}</Alert>
          ) : (
            <AssistantChat
              conversationId={openId}
              initialMessages={open?.messages ?? []}
              status={status}
            />
          )}
        </section>
      </div>
    </div>
  );
}
