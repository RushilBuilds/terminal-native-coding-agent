import { Box, Text } from "ink";
import { type Plan, planProgress } from "../../agent/plan.ts";

const STATUS_GLYPH: Record<Plan[number]["status"], string> = {
  pending: "○",
  active: "◐",
  done: "●",
};

/** Left-top pane: the TodoWrite-style plan the loop rewrites each turn, with progress. */
export function PlanPane({ plan }: { plan: Plan }) {
  const { done, total } = planProgress(plan);
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="blue">
          PLAN
        </Text>
        {total > 0 && (
          <Text dimColor>
            {done}/{total}
          </Text>
        )}
      </Box>
      <Box marginTop={1} flexDirection="column">
        {plan.length === 0 ? (
          <Text dimColor>No plan yet — enter a task below.</Text>
        ) : (
          plan.map((item) => (
            <Text
              key={item.id}
              color={
                item.status === "done" ? "gray" : item.status === "active" ? "yellow" : undefined
              }
            >
              {STATUS_GLYPH[item.status]} {item.text}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}
