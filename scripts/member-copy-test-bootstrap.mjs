import { registerHooks } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

// Isolated SSR fixture: only presentation hooks are stubbed, never domain modules.
registerHooks({
  resolve(specifier, context, nextResolve) {
    // Standalone tests only; Next enforces the server-only boundary in production.
    if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "next/navigation") return { url: "data:text/javascript,export function usePathname(){return '/member';} export function useSearchParams(){return new URLSearchParams();}", shortCircuit: true };
    if (specifier === "next/link") return nextResolve("next/link.js", context);
    if (specifier.startsWith("@/")) {
      const base = path.resolve(specifier.slice(2));
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`]) if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
    }
    if (context.parentURL?.startsWith("file:") && /^\.\.?\//u.test(specifier) && !/\.[a-z]+$/u.test(specifier)) {
      for (const extension of [".ts", ".tsx"]) { const candidate = new URL(specifier + extension, context.parentURL); if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context); }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".css")) return { format: "module", source: "export default new Proxy({}, {get:(_,key)=>String(key)});", shortCircuit: true };
    if (url.endsWith(".tsx")) return { format: "module", source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true };
    return nextLoad(url, context);
  },
});
