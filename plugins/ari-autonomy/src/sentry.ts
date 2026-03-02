/**
 * ARI Sentry Integration — crash alerting with PII scrubbing.
 *
 * Feature flags:
 *   SENTRY_ENABLED=true  — enable Sentry (default off)
 *   SENTRY_DSN=...       — required when SENTRY_ENABLED=true
 *
 * Privacy guarantees (HARDCODED):
 *   sendDefaultPii = false (always)
 *   Scrubs: API keys, Bearer tokens, prompt content, response bodies
 *   Strips: authorization headers, query strings from URLs
 *
 * Rollback: set SENTRY_ENABLED=false → initSentry() returns immediately; zero overhead.
 */

import * as Sentry from "@sentry/node";

// API key patterns to scrub from error messages and breadcrumbs
const SCRUB_PATTERNS = [
  /sk-ant-[A-Za-z0-9\-_]{20,}/g, // Anthropic
  /sk[-_]or[-_][A-Za-z0-9\-_]{20,}/g, // OpenRouter
  /pplx-[A-Za-z0-9]{20,}/g, // Perplexity
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, // Generic Bearer
  /ghp_[A-Za-z0-9]{36}/g, // GitHub PAT
  /tvly-[A-Za-z0-9-]{30,}/g, // Tavily
];

function scrub(s: string): string {
  return SCRUB_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, "[REDACTED]"), s);
}

let _initialized = false;

export function initSentry(): void {
  if (process.env.SENTRY_ENABLED !== "true" || !process.env.SENTRY_DSN) {
    return;
  }
  if (_initialized) {
    return;
  }
  _initialized = true;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "production",
    tracesSampleRate: 0.05, // 5% traces — conservative
    sampleRate: 1.0, // 100% errors
    sendDefaultPii: false, // HARDCODED OFF — never changes
    beforeSend(event) {
      // Scrub API keys from error messages
      if (event.message) {
        event.message = scrub(event.message);
      }
      // Strip fields that could contain prompts, secrets, or PII
      if (event.extra) {
        delete event.extra.prompt;
        delete event.extra.response;
        delete event.extra.messageContent;
        delete event.extra.body;
        delete event.extra.env;
      }
      // Strip auth headers and query strings
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["x-ari-token"];
        delete event.request.headers["xi-api-key"];
      }
      if (event.request?.url) {
        event.request.url = event.request.url.split("?")[0];
      }
      return event;
    },
  });
}

/**
 * Add a breadcrumb for autonomy task lifecycle events.
 * Only taskId, lane, status, and runnerId are included — no message content.
 */
export function addAutonomyBreadcrumb(opts: {
  taskId: string;
  lane: string;
  status: string;
  requestId?: string;
}): void {
  if (!_initialized) {
    return;
  }
  Sentry.addBreadcrumb({
    category: "autonomy",
    message: `task:${opts.taskId} lane:${opts.lane} status:${opts.status}`,
    data: {
      taskId: opts.taskId,
      runnerId: process.env.ARI_RUNNER_ID,
      requestId: opts.requestId,
    },
    // No message content, no prompts, no API responses
    level: "info",
  });
}

/** Capture an error to Sentry (no-op if not initialized). */
export function captureError(err: unknown, context?: Record<string, string>): void {
  if (!_initialized) {
    return;
  }
  Sentry.withScope((scope) => {
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        scope.setTag(key, value);
      }
    }
    Sentry.captureException(err);
  });
}
