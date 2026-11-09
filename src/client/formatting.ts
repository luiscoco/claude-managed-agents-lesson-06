import { Marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import powershell from "highlight.js/lib/languages/powershell";
import "highlight.js/styles/github-dark.css";

hljs.registerLanguage("powershell", powershell);

// Model output is content, never executable HTML. Parse its formatting, discard
// raw HTML/images, then sanitize the resulting document before attaching it.
const markdown = new Marked({
  gfm: true,
  breaks: true,
  renderer: { html: () => "", image: () => "" },
});

export function highlightCode(code: HTMLElement, language?: string) {
  if (code.dataset.highlighted === "true") return;
  const source = code.textContent ?? "";
  const hint =
    language ??
    code.dataset.language ??
    /(?:^|\s)language-([\w+-]+)/.exec(code.className)?.[1];
  const supported = hint && hljs.getLanguage(hint) ? hint : undefined;
  // An unknown explicit language stays legible plain code; unlabelled blocks
  // use a small set of common course languages for automatic detection.
  const result = supported
    ? hljs.highlight(source, { language: supported, ignoreIllegals: true })
    : !hint
      ? hljs.highlightAuto(source, [
          "typescript",
          "javascript",
          "json",
          "bash",
          "python",
          "css",
          "xml",
          "sql",
          "yaml",
        ])
      : undefined;
  if (result)
    code.innerHTML = result.value; // highlight.js escapes source code.
  else code.textContent = source;
  code.classList.add("hljs");
  code.dataset.highlighted = "true";
  const pre = code.parentElement;
  if (pre?.tagName === "PRE") {
    pre.dataset.language = supported ?? hint ?? result?.language ?? "text";
    pre.tabIndex = 0;
    pre.setAttribute("aria-label", `${pre.dataset.language} code snippet`);
  }
}

export function highlightCodeElements(root: ParentNode) {
  root.querySelectorAll<HTMLElement>("code").forEach((code) => {
    highlightCode(code, code.closest("pre") ? undefined : "typescript");
  });
}

export function createCodeBlock(source: string, language: string) {
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = source;
  pre.append(code);
  highlightCode(code, language);
  return pre;
}

export function renderResponse(source: string) {
  const content = document.createElement("div");
  content.className = "formatted-response";
  content.innerHTML = DOMPurify.sanitize(
    markdown.parse(source, { async: false }),
    {
      ALLOWED_TAGS: [
        "p",
        "br",
        "strong",
        "em",
        "del",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "ul",
        "ol",
        "li",
        "blockquote",
        "pre",
        "code",
        "a",
        "hr",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
      ],
      ALLOWED_ATTR: ["href", "title", "class", "start", "align"],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
    },
  );
  content.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((link) => {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });
  content.querySelectorAll("table").forEach((table) => {
    const scroll = document.createElement("div");
    scroll.className = "response-table";
    scroll.tabIndex = 0;
    scroll.setAttribute("role", "region");
    scroll.setAttribute("aria-label", "Response table");
    table.replaceWith(scroll);
    scroll.append(table);
  });
  highlightCodeElements(content);
  return content;
}
