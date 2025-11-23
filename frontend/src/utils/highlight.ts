import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import typescript from "highlight.js/lib/languages/typescript";

// Register a small set of languages we expect to render.
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("go", go);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("typescript", typescript);

const extensionToLanguage: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript", // highlight.js lacks tsx; TS is the closest
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  go: "go",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
};

const escapeHtml = (str: string) =>
  str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const guessLanguageFromPath = (path?: string): string => {
  if (!path) return "plaintext";
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return extensionToLanguage[ext] ?? "plaintext";
};

/**
 * Returns syntax-highlighted HTML per line. Falls back to escaped plain text.
 */
export const highlightToHtmlLines = (
  code: string,
  language: string,
): string[] => {
  if (!code) return [];
  const lang = language || "plaintext";

  try {
    if (lang === "plaintext") {
      return code.split(/\r?\n/).map(escapeHtml);
    }
    const { value } = hljs.highlight(code, {
      language: lang,
      ignoreIllegals: true,
    });
    return value.split(/\r?\n/);
  } catch (err) {
    console.warn("highlight fallback for language:", lang, err);
    return code.split(/\r?\n/).map(escapeHtml);
  }
};
