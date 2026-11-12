"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  Alert,
  Button,
  Paragraph,
  Spinner,
} from "@digdir/designsystemet-react";
import { PaperplaneIcon, RobotSmileIcon } from "@navikt/aksel-icons";
import { askQuestion } from "@/lib/assistantActions";
import {
  MAX_QUESTION_LENGTH,
  type AskError,
  type AssistantStatus,
  type ChatMessage,
} from "@/lib/assistantTypes";
import { Markdown } from "./Markdown";
import styles from "./assistant.module.css";

const EXAMPLES = ["highestRisk", "changes", "accounts", "connections"] as const;
const KNOWN_TOOLS = [
  "list_watchlist",
  "search_companies",
  "get_company",
  "get_company_risk",
  "get_company_changes",
  "get_company_accounts",
  "get_company_roles",
  "find_connections",
  "get_registration_trends",
  "get_notifications",
];

function Avatar() {
  return (
    <span className={styles.avatar}>
      <RobotSmileIcon aria-hidden />
    </span>
  );
}

interface AssistantChatProps {
  conversationId: string | null;
  initialMessages: ChatMessage[];
  status: AssistantStatus | null;
}

export function AssistantChat({
  conversationId: startId,
  initialMessages,
  status,
}: AssistantChatProps) {
  const t = useTranslations("assistant");
  const format = useFormatter();
  const router = useRouter();
  const [conversationId, setConversationId] = useState(startId);
  const [messages, setMessages] = useState(initialMessages);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<AskError | null>(null);
  const [remaining, setRemaining] = useState(status?.remaining ?? 0);
  const [pending, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  // Opening another conversation (or a new one) from the list resets the
  // chat. When the URL changes only because this chat just created its
  // conversation, the chat stays as it is, so nothing typed meanwhile is lost.
  const [shownId, setShownId] = useState(startId);
  if (startId !== shownId) {
    setShownId(startId);
    if (startId !== conversationId) {
      setConversationId(startId);
      setMessages(initialMessages);
      setQuestion("");
      setError(null);
    }
  }

  // Keep the newest message in view
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending]);

  const available = status?.available ?? false;
  const canAsk = available && remaining > 0 && !pending;
  // When the questions are used up, say so instead of only greying out the box
  const shownError = error ?? (available && remaining === 0 ? "limit" : null);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !canAsk) return;
    setError(null);
    setQuestion("");
    setMessages((list) => [
      ...list,
      {
        role: "user",
        content: trimmed,
        toolsUsed: [],
        createdAt: new Date().toISOString(),
      },
    ]);
    startTransition(async () => {
      const result = await askQuestion(conversationId, trimmed);
      if (!result.ok) {
        // Take the question back out, so it can be sent again
        setMessages((list) => list.slice(0, -1));
        setQuestion(trimmed);
        setError(result.error);
        if (result.error === "limit") setRemaining(0);
        return;
      }
      setMessages((list) => [...list, result.message]);
      setRemaining((n) => Math.max(0, n - 1));
      if (result.conversationId !== conversationId) {
        setConversationId(result.conversationId);
        // The new conversation gets its own URL and appears in the list
        router.replace(`/assistant?c=${result.conversationId}`, {
          scroll: false,
        });
      }
      input.current?.focus();
    });
  }

  const toolName = (tool: string) =>
    KNOWN_TOOLS.includes(tool)
      ? t(`tools.${tool}` as "tools.list_watchlist")
      : tool;

  return (
    <div className={styles.chat}>
      {!available && (
        <Alert data-color="warning">
          {status ? t("notAvailable") : t("statusFailed")}
        </Alert>
      )}

      <div className={styles.messages} aria-live="polite" aria-busy={pending}>
        {messages.length === 0 && available && remaining > 0 && (
          <div className={styles.welcome}>
            <Paragraph>{t("intro")}</Paragraph>
            <ul className={styles.examples}>
              {EXAMPLES.map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    className={styles.example}
                    onClick={() => {
                      setQuestion(t(`examples.${key}`));
                      input.current?.focus();
                    }}
                  >
                    {t(`examples.${key}`)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={`${message.createdAt}-${index}`}
            className={styles.row}
            data-role={message.role}
          >
            {message.role === "assistant" && <Avatar />}
            <div className={styles.message} data-role={message.role}>
              <span className="visually-hidden">
                {message.role === "user" ? t("you") : t("assistantName")}:
              </span>
              {message.role === "assistant" ? (
                <>
                  <Markdown text={message.content} />
                  {message.toolsUsed.length > 0 && (
                    <p className={styles.sources}>
                      {t("basedOn", {
                        tools: format.list(
                          [...new Set(message.toolsUsed)].map(toolName),
                          { type: "conjunction" },
                        ),
                      })}
                    </p>
                  )}
                </>
              ) : (
                <p className={styles.userText}>{message.content}</p>
              )}
            </div>
          </div>
        ))}

        {pending && (
          <div className={styles.row} data-role="assistant">
            <Avatar />
            <div className={styles.message} data-role="assistant">
              <span className={styles.thinking}>
                <Spinner aria-hidden data-size="sm" />
                {t("thinking")}
              </span>
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      {shownError && (
        <Alert
          data-color={shownError === "limit" ? "warning" : "danger"}
          role="alert"
        >
          {t(`errors.${shownError}`)}
        </Alert>
      )}

      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          send(question);
        }}
      >
        <label htmlFor="question" className="visually-hidden">
          {t("label")}
        </label>
        <textarea
          id="question"
          ref={input}
          className={styles.input}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter starts a new line
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              send(question);
            }
          }}
          rows={2}
          maxLength={MAX_QUESTION_LENGTH}
          placeholder={t("placeholder")}
          disabled={!available || remaining === 0}
        />
        <div className={styles.composerFoot}>
          <span className={styles.remaining}>
            {status && available
              ? t("remaining", { remaining, limit: status.dailyLimit })
              : ""}
          </span>
          <Button
            type="submit"
            disabled={!canAsk || question.trim() === ""}
            loading={pending}
          >
            {!pending && <PaperplaneIcon aria-hidden />}
            {t("send")}
          </Button>
        </div>
      </form>
    </div>
  );
}
