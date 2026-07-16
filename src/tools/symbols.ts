import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname } from "node:path";
import Parser from "web-tree-sitter";
import { z } from "zod";
import { resolveInside } from "./paths.ts";
import { truncate } from "./truncate.ts";
import { defineTool } from "./types.ts";

type SyntaxNode = Parser.SyntaxNode;

const require = createRequire(import.meta.url);

/** File extension → tree-sitter-wasms grammar name. Extend freely; 36 grammars ship. */
const GRAMMAR_BY_EXT: Record<string, string> = {
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".rb": "ruby",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".hpp": "cpp",
};

/** Node types (across grammars) that represent a declaration worth listing. */
const DECL_TYPES = new Set([
  "function_declaration",
  "function_definition",
  "function_item",
  "method_definition",
  "method_declaration",
  "class_declaration",
  "class_definition",
  "class_specifier",
  "interface_declaration",
  "type_alias_declaration",
  "struct_item",
  "struct_specifier",
  "enum_declaration",
  "enum_item",
  "enum_specifier",
  "impl_item",
  "trait_item",
  "module",
  "namespace_declaration",
]);

let parserPromise: Promise<Parser> | undefined;
const languageCache = new Map<string, Parser.Language>();

async function getParser(): Promise<Parser> {
  if (!parserPromise) {
    parserPromise = (async () => {
      const coreWasm = require.resolve("web-tree-sitter/tree-sitter.wasm");
      await Parser.init({ locateFile: () => coreWasm });
      return new Parser();
    })();
  }
  return parserPromise;
}

async function loadLanguage(grammar: string): Promise<Parser.Language> {
  const cached = languageCache.get(grammar);
  if (cached) return cached;
  const wasm = require.resolve(`tree-sitter-wasms/out/tree-sitter-${grammar}.wasm`);
  const lang = await Parser.Language.load(wasm);
  languageCache.set(grammar, lang);
  return lang;
}

function nameOf(node: SyntaxNode): string {
  const byField = node.childForFieldName("name");
  if (byField) return byField.text;
  for (const child of node.namedChildren) {
    if (!child) continue;
    if (child.type.includes("identifier") || child.type === "constant") return child.text;
  }
  return "";
}

function kindOf(type: string): string {
  return type.replace(/_(declaration|definition|specifier|item)$/, "").replace(/_/g, " ");
}

/** Depth-first walk collecting declarations as indented `kind name  :line` outline entries. */
function collect(node: SyntaxNode, depth: number, out: string[]): void {
  for (const child of node.namedChildren) {
    if (!child) continue;
    let nextDepth = depth;
    if (DECL_TYPES.has(child.type)) {
      const name = nameOf(child);
      const indent = "  ".repeat(depth);
      out.push(`${indent}${kindOf(child.type)} ${name}  :${child.startPosition.row + 1}`);
      nextDepth = depth + 1;
    }
    collect(child, nextDepth, out);
  }
}

export const symbolsTool = defineTool({
  name: "symbols",
  description:
    "List the code structure (functions, classes, methods, types) of a source file using " +
    "tree-sitter, as an indented outline with line numbers. Faster than reading a whole file " +
    "to understand its shape.",
  inputShape: {
    path: z.string().describe("Source file path relative to the working directory."),
  },
  async execute(args, ctx) {
    let full: string;
    try {
      full = resolveInside(ctx.cwd, args.path);
    } catch (e) {
      return `ERROR: ${(e as Error).message}`;
    }
    const grammar = GRAMMAR_BY_EXT[extname(args.path).toLowerCase()];
    if (!grammar) {
      return `ERROR: no tree-sitter grammar for ${extname(args.path) || "this file"}. Supported: ${[
        ...new Set(Object.keys(GRAMMAR_BY_EXT)),
      ].join(", ")}.`;
    }

    let source: string;
    try {
      source = await readFile(full, "utf8");
    } catch (e) {
      return `ERROR: cannot read ${args.path}: ${(e as Error).message}`;
    }

    try {
      const parser = await getParser();
      parser.setLanguage(await loadLanguage(grammar));
      const tree = parser.parse(source);
      if (!tree?.rootNode) return "ERROR: failed to parse file.";
      const out: string[] = [];
      collect(tree.rootNode, 0, out);
      tree.delete();
      if (out.length === 0) return "(no top-level declarations found)";
      return truncate(out.join("\n")).text;
    } catch (e) {
      return `ERROR: tree-sitter failed: ${(e as Error).message}`;
    }
  },
});
