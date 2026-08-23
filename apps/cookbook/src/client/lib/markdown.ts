import { marked } from "marked";

const ALLOWED_ATTRIBUTES = new Set(["href", "title"]);
const REMOVED_ELEMENTS = "script,style,iframe,object,embed,form,input,button";

export function safeMarkdown(markdown: string): string {
  const html = marked.parse(markdown, { async: false });
  const document = new DOMParser().parseFromString(html, "text/html");

  document.querySelectorAll(REMOVED_ELEMENTS).forEach((node) => node.remove());
  document.querySelectorAll("*").forEach((node) => {
    for (const attributeName of node.getAttributeNames()) {
      if (!ALLOWED_ATTRIBUTES.has(attributeName)) {
        node.removeAttribute(attributeName);
      }
    }

    if (node instanceof HTMLAnchorElement) {
      configureLink(node);
    }
  });

  return document.body.innerHTML;
}

function configureLink(link: HTMLAnchorElement): void {
  const href = link.getAttribute("href") ?? "";
  if (!/^(https?:|\/|#)/i.test(href)) {
    link.removeAttribute("href");
    return;
  }

  link.target = "_blank";
  link.rel = "noopener noreferrer";
}
