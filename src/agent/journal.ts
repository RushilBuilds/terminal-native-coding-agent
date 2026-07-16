import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PlanSchema } from "./plan.ts";

/**
 * Session journal — crash recovery for the agent.
 *
 * Every plan change is written to `.agent/session-<id>.json` (atomically), with the session
 * marked "active" until the turn completes. If the process is killed mid-run, that file is
 * left "active"; on restart {@link SessionJournal.latestResumable} finds it so the TUI can
 * restore where it left off. Graceful completion flips the status to "complete".
 */

export const SESSION_STATUSES = ["active", "complete"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SessionSchema = z.object({
  id: z.string(),
  task: z.string(),
  status: z.enum(SESSION_STATUSES),
  plan: PlanSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Session = z.infer<typeof SessionSchema>;

export class SessionJournal {
  constructor(private readonly dir = ".agent") {}

  /** Begin a new session and write it to disk immediately. */
  start(task: string): Session {
    const now = new Date().toISOString();
    const session: Session = {
      id: randomUUID().slice(0, 8),
      task,
      status: "active",
      plan: [],
      createdAt: now,
      updatedAt: now,
    };
    this.write(session);
    return session;
  }

  /** Persist a session's current state (bumps updatedAt). Returns the written snapshot. */
  update(session: Session, patch: Partial<Pick<Session, "plan" | "status">> = {}): Session {
    const next: Session = { ...session, ...patch, updatedAt: new Date().toISOString() };
    this.write(next);
    return next;
  }

  /** Mark a session finished so it is no longer offered for resume. */
  complete(session: Session): Session {
    return this.update(session, { status: "complete" });
  }

  /** The most recently updated still-active session — a crash left it behind. */
  latestResumable(): Session | null {
    let best: Session | null = null;
    for (const file of this.list()) {
      const s = this.read(file);
      if (!s || s.status !== "active") continue;
      if (!best || s.updatedAt > best.updatedAt) best = s;
    }
    return best;
  }

  private path(id: string): string {
    return join(this.dir, `session-${id}.json`);
  }

  private write(session: Session): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    const target = this.path(session.id);
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, JSON.stringify(session, null, 2));
    renameSync(tmp, target); // atomic swap — never a half-written journal
  }

  private list(): string[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.startsWith("session-") && f.endsWith(".json"))
      .map((f) => join(this.dir, f));
  }

  private read(file: string): Session | null {
    try {
      const parsed = SessionSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
      return parsed.success ? parsed.data : null; // ignore corrupt/partial files
    } catch {
      return null;
    }
  }
}
