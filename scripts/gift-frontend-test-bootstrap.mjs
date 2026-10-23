import path from "node:path";
// Standalone test runtime only; production Next enforces server-only boundaries.
// Run with GIFT_TEST_FIXTURE pointing at the unchanged TEMP draft catalog.
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
    if (specifier.endsWith(".css")) return { url: "data:text/javascript,export default new Proxy({},{get:(o,k)=>String(k)})", shortCircuit: true };
    if (["next/link", "next/server", "next/headers", "next/navigation"].includes(specifier)) return nextResolve(specifier + ".js", context);
    const candidate = specifier.startsWith("@/") ? pathToFileURL(path.resolve(process.cwd(), specifier.slice(2))).href
      : context.parentURL?.startsWith("file:") && (specifier.startsWith("./") || specifier.startsWith("../"))
        ? new URL(specifier, context.parentURL).href : null;
    if (candidate) for (const extension of [".ts", ".tsx", ".mts"]) {
      if (existsSync(fileURLToPath(candidate + extension))) return nextResolve(candidate + extension, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".tsx")) return {
      format: "module", shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText,
    };
    return nextLoad(url, context);
  },
});
