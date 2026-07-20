import type { Hook } from "../engine.ts";

/** Paths the agent should never overwrite, even inside the sandbox. */
const SENSITIVE = [
  /(^|\/)\.env(\.[\w.-]+)?$/, // .env, .env.local, …
  /(^|\/)\.git\//, // git internals
  /(^|\/)(id_rsa|id_ed25519|id_ecdsa)$/, // ssh private keys
  /\.(pem|key)$/, // certs / private keys
  /(^|\/)\.(aws|ssh|gnupg)\//, // credential dirs
  /(^|\/)credentials$/,
];

/** PreToolUse: block edits to secret/credential files. */
export const protectSensitiveFiles: Hook = {
  name: "protect-sensitive-files",
  preToolUse(call) {
    if (call.tool !== "edit_file") return;
    const path = call.args.path;
    if (typeof path !== "string") return;
    if (SENSITIVE.some((re) => re.test(path))) {
      return { action: "deny", reason: `editing ${path} is blocked (sensitive file)` };
    }
  },
};
