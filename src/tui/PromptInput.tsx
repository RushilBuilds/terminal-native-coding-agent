import { Box, Text } from "ink";

/**
 * The prompt line. Presentational only — App owns the text buffer and key handling so
 * there's a single source of truth for input and cancellation.
 */
export function PromptInput({ text, running }: { text: string; running: boolean }) {
  return (
    <Box marginTop={1}>
      <Text color={running ? "gray" : "cyan"} bold>
        ❯{" "}
      </Text>
      {running ? (
        <Text dimColor>{text || "working…"}</Text>
      ) : (
        <Text>
          {text}
          <Text inverse> </Text>
        </Text>
      )}
    </Box>
  );
}
