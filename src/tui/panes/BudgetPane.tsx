import { Box, Text } from "ink";
import type { Budget } from "../../agent/loop.ts";

export interface Ceilings {
  maxTurns: number;
  maxTokens: number;
  maxUsd: number;
}

function Row({ label, value, ceiling }: { label: string; value: string; ceiling: string }) {
  return (
    <Box justifyContent="space-between">
      <Text dimColor>{label}</Text>
      <Text>
        {value}
        <Text dimColor> / {ceiling}</Text>
      </Text>
    </Box>
  );
}

/**
 * Left-bottom pane: live token/turn/cost accounting against the per-task ceilings.
 * Real numbers get wired in on Day 7; for now they read zero until the loop calls a model.
 */
export function BudgetPane({ budget, ceilings }: { budget: Budget; ceilings: Ceilings }) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="blue">
        BUDGET
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Row label="turns" value={String(budget.turns)} ceiling={String(ceilings.maxTurns)} />
        <Row
          label="tokens"
          value={budget.tokens.toLocaleString()}
          ceiling={ceilings.maxTokens.toLocaleString()}
        />
        <Row
          label="spend"
          value={`$${budget.usd.toFixed(2)}`}
          ceiling={`$${ceilings.maxUsd.toFixed(2)}`}
        />
      </Box>
    </Box>
  );
}
