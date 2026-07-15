import { Box, Text } from "ink";
import type { ActivityEntry, ActivityKind } from "../../agent/loop.ts";

const KIND_STYLE: Record<ActivityKind, { color: string; label: string }> = {
  user: { color: "cyan", label: "❯" },
  system: { color: "gray", label: "•" },
  tool: { color: "green", label: "⚙" },
  error: { color: "red", label: "✕" },
};

/**
 * Main pane: the streaming activity log (prompts, tool calls, results). Shows the most
 * recent `maxRows` entries so a long run never pushes the layout around.
 */
export function ActivityPane({
  activity,
  running,
  maxRows = 200,
}: {
  activity: ActivityEntry[];
  running: boolean;
  maxRows?: number;
}) {
  const visible = activity.slice(-maxRows);
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text bold color="blue">
        ACTIVITY
      </Text>
      <Box marginTop={1} flexDirection="column">
        {visible.length === 0 ? (
          <Text dimColor>Waiting for a task…</Text>
        ) : (
          visible.map((e) => {
            const style = KIND_STYLE[e.kind];
            return (
              <Text key={e.id} color={style.color}>
                {style.label} {e.text}
              </Text>
            );
          })
        )}
        {running && <Text color="yellow">◐ working… (Ctrl-C to cancel)</Text>}
      </Box>
    </Box>
  );
}
