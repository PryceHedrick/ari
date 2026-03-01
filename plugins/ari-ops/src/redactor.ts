/**
 * ARI Ops Redactor — pure, sync, throw-safe credential scrubbing.
 *
 * All patterns are applied before any span summary hits the write queue or DB.
 * On any exception, returns [REDACTION_ERROR] rather than the original string.
 */

const REDACT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /sk-ant-[A-Za-z0-9\-_]{20,}/g, label: "anthropic-key" },
  { pattern: /sk-or-[A-Za-z0-9\-_]{20,}/g, label: "openrouter-key" },
  { pattern: /pplx-[A-Za-z0-9]{20,}/g, label: "perplexity-key" },
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, label: "bearer-token" },
  { pattern: /[?&](?:key|token|secret|api_key)=[^&\s"]+/gi, label: "url-query-secret" },
  // Discord bot token pattern: 24 chars . 6 chars . 27 chars
  { pattern: /\b[A-Za-z0-9]{24}\.[A-Za-z0-9]{6}\.[A-Za-z0-9\-_]{27}\b/g, label: "discord-token" },
];

/** Redact known credential patterns from a string. Never throws. */
export function redact(text: string): string {
  try {
    let result = text;
    for (const { pattern } of REDACT_PATTERNS) {
      result = result.replace(pattern, "[REDACTED]");
    }
    return result;
  } catch {
    return "[REDACTION_ERROR]";
  }
}

/** Deep-redact all string values inside a plain object/array. Never throws. */
export function redactObj(obj: unknown): unknown {
  try {
    if (typeof obj === "string") {
      return redact(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map(redactObj);
    }
    if (obj !== null && typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        result[k] = redactObj(v);
      }
      return result;
    }
    return obj;
  } catch {
    return "[REDACTION_ERROR]";
  }
}
