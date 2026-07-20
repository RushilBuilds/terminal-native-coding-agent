import type { Hook } from "../engine.ts";

/** Secret-shaped patterns to strip from tool output before it re-enters the context/logs. */
const SECRETS: RegExp[] = [
  /sk-[a-zA-Z0-9-]{20,}/g, // OpenAI / OpenRouter keys
  /AKIA[0-9A-Z]{16}/g, // AWS access key ids
  /ghp_[A-Za-z0-9]{36}/g, // GitHub personal tokens
  /xox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack tokens
  /Bearer\s+[A-Za-z0-9._-]{20,}/g, // bearer tokens
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(?:token|secret|password|passwd|api[_-]?key)\b(\s*[=:]\s*)("?)[^\s"']{6,}\2/gi,
];

/**
 * PostToolUse: redact anything that looks like a credential from tool results, so a leaked
 * key in a file or command output never reaches the model, the transcript, or the logs.
 */
export const redactSecrets: Hook = {
  name: "redact-secrets",
  postToolUse({ result }) {
    let out = result;
    for (const re of SECRETS) {
      out = out.replace(re, (match, sep) =>
        typeof sep === "string" ? match.replace(/([=:]\s*).*/, "$1[REDACTED]") : "[REDACTED]",
      );
    }
    return out === result ? undefined : out;
  },
};
