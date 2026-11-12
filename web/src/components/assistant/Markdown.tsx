import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./assistant.module.css";

// Only web links are kept; anything else (javascript:, data:, ...) is
// removed. react-markdown never runs HTML from the text: it is shown as
// plain text, so a model answer cannot put a script on the page.
function safeUrl(url: string): string {
  const cleaned = defaultUrlTransform(url);
  return /^https?:\/\//i.test(cleaned) ? cleaned : "";
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrl}
        components={{
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          table: ({ children }) => (
            <div className={styles.tableWrap}>
              <table>{children}</table>
            </div>
          ),
          img: () => null,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
