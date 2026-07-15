import { Box, Text, useApp, useInput } from "ink";
import { useCallback, useRef, useState } from "react";
import {
  type ActivityEntry,
  type ActivityKind,
  type Budget,
  CancelledError,
  INITIAL_BUDGET,
  type TodoItem,
  runStubTurn,
} from "../agent/loop.ts";
import { PromptInput } from "./PromptInput.tsx";
import { ActivityPane } from "./panes/ActivityPane.tsx";
import { BudgetPane, type Ceilings } from "./panes/BudgetPane.tsx";
import { PlanPane } from "./panes/PlanPane.tsx";

export interface AppProps {
  modelLabel: string;
  ceilings: Ceilings;
}

/**
 * Root TUI component: the plan / activity / budget split-view plus the prompt.
 * Day 2 wires it to a stub turn; the real loop swaps in behind the same interface later.
 */
export function App({ modelLabel, ceilings }: AppProps) {
  const { exit } = useApp();
  const [text, setText] = useState("");
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [plan] = useState<TodoItem[]>([]);
  const [budget, setBudget] = useState<Budget>(INITIAL_BUDGET);
  const [running, setRunning] = useState(false);

  const nextId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const pushActivity = useCallback((kind: ActivityKind, textLine: string) => {
    setActivity((prev) => [...prev, { id: nextId.current++, kind, text: textLine }]);
  }, []);

  const submit = useCallback(() => {
    const prompt = text.trim();
    if (!prompt || running) return;
    setText("");
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);

    runStubTurn(prompt, { onActivity: pushActivity }, controller.signal)
      .then(() => setBudget((b) => ({ ...b, turns: b.turns + 1 })))
      .catch((err) => {
        if (err instanceof CancelledError) pushActivity("error", "cancelled.");
        else pushActivity("error", err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setRunning(false);
        abortRef.current = null;
      });
  }, [text, running, pushActivity]);

  useInput((input, key) => {
    // Ctrl-C: cancel an in-flight turn, or exit when idle.
    if (key.ctrl && input === "c") {
      if (running && abortRef.current) abortRef.current.abort();
      else exit();
      return;
    }
    // While a turn runs, ignore editing keys (only Ctrl-C above is honored).
    if (running) return;

    if (key.return) {
      submit();
    } else if (key.backspace || key.delete) {
      setText((t) => t.slice(0, -1));
    } else if (key.escape) {
      setText("");
    } else if (input && !key.ctrl && !key.meta) {
      setText((t) => t + input);
    }
  });

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" paddingX={1}>
        <Text bold>terminal-native coding agent</Text>
        <Text dimColor>● {modelLabel}</Text>
      </Box>

      <Box flexDirection="row" minHeight={14}>
        <Box flexDirection="column" width={36}>
          <Box borderStyle="round" borderColor="gray" flexGrow={1}>
            <PlanPane plan={plan} />
          </Box>
          <Box borderStyle="round" borderColor="gray">
            <BudgetPane budget={budget} ceilings={ceilings} />
          </Box>
        </Box>
        <Box borderStyle="round" borderColor="gray" flexGrow={1}>
          <ActivityPane activity={activity} running={running} />
        </Box>
      </Box>

      <PromptInput text={text} running={running} />
      <Box paddingX={1}>
        <Text dimColor>⏎ submit · ctrl-c {running ? "cancel" : "exit"}</Text>
      </Box>
    </Box>
  );
}
