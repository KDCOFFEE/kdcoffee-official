import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const serverOnlySource = "export {};";
const serverOnlyUrl = "data:text/javascript," + encodeURIComponent(serverOnlySource);

// Fixture preparation runs outside Next. The child Next server uses its real
// headers/auth/runtime; never load the SSR test bootstrap's cookie/React mocks.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: serverOnlyUrl, format: "module", shortCircuit: true };
    if (specifier === "next/headers") return nextResolve("next/headers.js", context);
    if (specifier.startsWith("@/")) {
      const base = path.resolve(projectRoot, specifier.slice(2));
      for (const candidate of [base, `${base}.ts`, `${base}.mts`]) {
        if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
    if (context.parentURL?.startsWith("file:") && /^\.\.?\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier)) {
      for (const extension of [".ts", ".mts"]) {
        const candidate = new URL(specifier + extension, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    // Own the virtual module completely, including require() callers. It must
    // never reach a downstream loader that treats its URL as a Windows path.
    if (url === serverOnlyUrl) return { format: "module", source: serverOnlySource, shortCircuit: true };
    return nextLoad(url, context);
  },
});
