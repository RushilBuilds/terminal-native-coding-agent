import { type ZodObject, type ZodRawShape, z } from "zod";

/** Runtime context every tool receives. `cwd` is the root all file paths resolve against. */
export interface ToolContext {
  cwd: string;
}

/** A tool the agent can call. `inputShape` is a zod raw shape (MCP + JSON-Schema friendly). */
export interface ToolDefinition {
  name: string;
  description: string;
  inputShape: ZodRawShape;
  execute: (args: unknown, ctx: ToolContext) => Promise<string>;
}

/**
 * Define a tool with a typed handler. The returned definition validates its arguments with
 * the zod shape before invoking the handler, so tools are safe whether they're called through
 * MCP (which validates too) or directly in a unit test.
 */
export function defineTool<S extends ZodRawShape>(def: {
  name: string;
  description: string;
  inputShape: S;
  execute: (args: z.infer<ZodObject<S>>, ctx: ToolContext) => Promise<string>;
}): ToolDefinition {
  const object = z.object(def.inputShape);
  return {
    name: def.name,
    description: def.description,
    inputShape: def.inputShape,
    execute: (args, ctx) => def.execute(object.parse(args), ctx),
  };
}
