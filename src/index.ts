#!/usr/bin/env bun
/**
 * Entry point for the terminal-native coding agent.
 *
 * Launches the interactive Ink TUI (plan / activity / budget split-view). The full
 * plan → act → observe → recover loop is wired in behind the same interface from Day 4.
 */
import { startTui } from "./tui/run.tsx";

await startTui();
