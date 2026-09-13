// Use the ESM distribution: Paseo's neutral bundler ignores main/module fields,
// and its eager CJS interop would snapshot Prism before CJS initialization.
import { Prism } from "prism-react-renderer/dist/index.mjs";
import { useEffect, useState } from "react";

export interface SyntaxColors {
  foreground: string;
  foregroundMuted: string;
  accent: string;
  surface1: string;
  statusSuccess?: string;
  statusWarning?: string;
}
export interface SyntaxToken {
  content: string;
  color?: string;
}
export const MAX_HIGHLIGHT_CHARS = 100_000;
// This vendored Prism instance has no global registration or automatic DOM scan.
// Use tokenize only, never its HTML/React renderer. Its function-based runtime
// also works in Hermes when Paseo evaluates the bundle without Metro transforms.
// Bash is not bundled by prism-react-renderer; this deliberately small grammar
// colors shell strings/comments/control words without claiming full shell parsing.
Prism.languages.bash = {
  comment: { pattern: /(^|[\t ])#.*/m, lookbehind: true, greedy: true },
  string: { pattern: /"(?:\\[\s\S]|[^"\\])*"|'[^']*'/, greedy: true },
  variable: /\$(?:\w+|\{[^}\r\n]*\}|[?$!#@*-])/,
  keyword: /\b(?:if|then|else|elif|fi|for|while|until|do|done|case|esac|in|function|select|return|export|local)\b/,
  operator: /&&|\|\||[|&;<>]/,
  punctuation: /[(){}[\]]/,
};
const supported = new Set(["bash", "css", "go", "html", "javascript", "json", "markdown", "python", "rust", "typescript", "yaml", "jsx", "tsx"]);
const tokensCache = new Map<string, { size: number; tokens: SyntaxToken[][] }>();
let cachedChars = 0;

export function syntaxKey(colors: SyntaxColors): string {
  return [colors.foreground, colors.foregroundMuted, colors.accent, colors.surface1, colors.statusSuccess, colors.statusWarning].join("|");
}
function tokenLines(stream: Prism.TokenStream, colors: SyntaxColors, json: boolean): SyntaxToken[][] {
  const lines: SyntaxToken[][] = [[]];
  function visit(value: Prism.TokenStream, color: string): void {
    if (typeof value === "string") {
      const parts = value.split("\n");
      for (let index = 0; index < parts.length; index++) {
        if (index) lines.push([]);
        if (parts[index]) lines[lines.length - 1]!.push({ content: parts[index]!, color });
      }
    } else if (Array.isArray(value)) {
      for (const child of value) visit(child, color);
    } else {
      const types = [value.type, ...typeof value.alias === "string" ? [value.alias] : value.alias ?? []];
      // Accent is a control/background color in some host themes (including a
      // dark green shared by light and dark Paseo). Keys need foreground contrast.
      const nextColor = json && types.includes("property") ? colors.foreground
        : json && types.includes("string") ? colors.statusSuccess ?? colors.accent
        : json && types.some(type => ["number", "boolean", "null"].includes(type)) ? colors.statusWarning ?? colors.accent
        : types.some((type) => ["comment", "punctuation", "operator"].includes(type))
        ? colors.foregroundMuted
        : types.some((type) => ["string", "char", "keyword", "template-string"].includes(type))
          ? colors.accent : color;
      visit(value.content, nextColor);
    }
  }
  visit(stream, colors.foreground);
  return lines;
}
function normalizeLanguage(language: string): string {
  const normalized = language.toLowerCase().trim();
  const aliases: Record<string, string> = { sh: "bash", shell: "bash", shellscript: "bash", js: "javascript", ts: "typescript", yml: "yaml", md: "markdown", py: "python", rs: "rust" };
  return Object.prototype.hasOwnProperty.call(aliases, normalized) ? aliases[normalized]! : normalized;
}
export async function highlightCode(code: string, language: string, colors: SyntaxColors): Promise<SyntaxToken[][] | null> {
  const lang = normalizeLanguage(language);
  if (!code || code.length > MAX_HIGHLIGHT_CHARS || !supported.has(lang)) return null;
  const key = syntaxKey(colors) + ":" + lang + ":" + code;
  const cached = tokensCache.get(key);
  if (cached) {
    tokensCache.delete(key);
    tokensCache.set(key, cached);
    return cached.tokens;
  }
  try {
    const tokens = tokenLines(Prism.tokenize(code, Prism.languages[lang]!), colors, lang === "json");
    tokensCache.set(key, { size: code.length, tokens });
    cachedChars += code.length;
    while (tokensCache.size > 40 || cachedChars > 500_000) {
      const oldest = tokensCache.keys().next().value!;
      cachedChars -= tokensCache.get(oldest)!.size;
      tokensCache.delete(oldest);
    }
    return tokens;
  } catch {
    return null;
  }
}
export function useSyntaxTokens(code: string, language: string, colors: SyntaxColors): SyntaxToken[][] | null {
  const key = syntaxKey(colors);
  const [result, setResult] = useState<{ code: string; language: string; key: string; tokens: SyntaxToken[][] | null }>();
  useEffect(() => {
    let cancelled = false;
    void highlightCode(code, language, colors).then((tokens) => {
      if (!cancelled) setResult({ code, language, key, tokens });
    });
    return () => { cancelled = true; };
  }, [code, language, key]);
  // Never display tokens from a previous streaming value or theme, even for one render.
  return result?.code === code && result.language === language && result.key === key ? result.tokens : null;
}
