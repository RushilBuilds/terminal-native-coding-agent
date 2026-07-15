#!/usr/bin/env bun
/**
 * Entry point for the terminal-native coding agent.
 *
 * Day 1: this only points at the `ask` smoke-test CLI. The Ink TUI and full
 * plan/act/observe/recover loop land on Day 2+ and will be launched from here.
 */
process.stderr.write(
  `${[
    "terminal-native-coding-agent",
    "",
    "The interactive TUI arrives on Day 2. For now, try a single round-trip:",
    '  bun run ask "say hi"',
    "",
  ].join("\n")}\n`,
);
