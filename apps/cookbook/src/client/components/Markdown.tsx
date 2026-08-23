import { useMemo } from "preact/hooks";
import { safeMarkdown } from "../lib/markdown";

interface MarkdownProps {
  content: string;
  preview?: boolean;
}

export function Markdown({ content, preview = false }: MarkdownProps) {
  const html = useMemo(() => safeMarkdown(content), [content]);
  return (
    <div
      class={`markdown${preview ? " preview" : ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
