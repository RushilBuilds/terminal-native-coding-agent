/**
 * Output truncation — the single most important safety valve in the whole agent.
 *
 * A coding agent lives or dies on context discipline: one `rg` over a big repo, one noisy
 * test run, and 8 MB of matches poison the window and torch the budget. Every tool result
 * passes through here so the model only ever sees a bounded, informative slice.
 */

export interface TruncateOptions {
  /** Hard cap on returned characters. Default 12k (~3–4k tokens). */
  maxChars?: number;
  /** Lines kept from the top when truncating. */
  headLines?: number;
  /** Lines kept from the bottom when truncating. */
  tailLines?: number;
}

const DEFAULTS = { maxChars: 12_000, headLines: 160, tailLines: 40 } as const;

export interface TruncateResult {
  text: string;
  truncated: boolean;
  originalChars: number;
}

/**
 * Bound `text` to a character budget. When it overflows, keep the head and tail (both carry
 * signal — errors usually land at the end) and drop the middle with a clear marker so the
 * model knows output was elided rather than the command having produced nothing.
 */
export function truncate(text: string, opts: TruncateOptions = {}): TruncateResult {
  const maxChars = opts.maxChars ?? DEFAULTS.maxChars;
  const headLines = opts.headLines ?? DEFAULTS.headLines;
  const tailLines = opts.tailLines ?? DEFAULTS.tailLines;
  const originalChars = text.length;

  if (originalChars <= maxChars) {
    return { text, truncated: false, originalChars };
  }

  const lines = text.split("\n");
  // If line-based head+tail already fits the budget, use it (readable boundaries).
  if (lines.length > headLines + tailLines) {
    const head = lines.slice(0, headLines).join("\n");
    const tail = lines.slice(-tailLines).join("\n");
    const omitted = lines.length - headLines - tailLines;
    const marker = `\n\n… [truncated ${omitted} lines / ${fmtBytes(originalChars - head.length - tail.length)}] …\n\n`;
    const composed = head + marker + tail;
    if (composed.length <= maxChars) {
      return { text: composed, truncated: true, originalChars };
    }
  }

  // Fallback: raw character head/tail slice for pathological single-line blobs.
  const keep = Math.max(0, maxChars - 64);
  const headChars = Math.floor(keep * 0.8);
  const tailChars = keep - headChars;
  const marker = `\n… [truncated ${fmtBytes(originalChars - keep)}] …\n`;
  const composed = text.slice(0, headChars) + marker + text.slice(originalChars - tailChars);
  return { text: composed, truncated: true, originalChars };
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
