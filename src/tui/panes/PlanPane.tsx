import { Box, Text } from "ink";
import type { TodoItem } from "../../agent/loop.ts";

const STATUS_GLYPH: Record<TodoItem["status"], string> = {
  pending: "○",
  active: "◐",
  done: "●",
};

/** Left-top pane: the TodoWrite-style plan the model will rewrite each turn (Day 3). */
export function PlanPane({ plan }: { plan: TodoItem[] }) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text bold color="blue">
        PLAN
      </Text>
      <Box marginTop={1} flexDirection="column">
        {plan.length === 0 ? (
          <Text dimColor>No plan yet — enter a task below.</Text>
        ) : (
          plan.map((item) => (
            <Text key={item.id} color={item.status === "done" ? "gray" : undefined}>
              {STATUS_GLYPH[item.status]} {item.text}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}
