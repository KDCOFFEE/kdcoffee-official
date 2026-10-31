import "./member-copy-test-bootstrap.mjs";
import { registerHooks, createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve("react")).href;
const source = `import React from ${JSON.stringify(reactUrl)}; export * from ${JSON.stringify(reactUrl)};
${["useState", "useRef", "useEffect", "useContext"].map(name => `export const ${name}=(...args)=>globalThis.__returnHooks ? globalThis.__returnHooks.${name}(...args) : React.${name}(...args);`).join("\n")}`;
const hookUrl = "data:text/javascript," + encodeURIComponent(source);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
    if (specifier === "next/headers") return { url: "data:text/javascript,export async function cookies(){return {get:(key)=>globalThis.__returnCookies?.[key] ? {value:globalThis.__returnCookies[key]}:undefined};}", shortCircuit: true };
    if (specifier === "react" && /\/(MemberReturnWorkflow|AdminReturnWorkflow|MemberCenterCopyProvider)\.tsx$/.test(context.parentURL ?? "")) return { url: hookUrl, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".json") && !url.includes("/node_modules/")) return { format: "module", source: `export default ${readFileSync(fileURLToPath(url), "utf8")}`, shortCircuit: true };
    if (url === hookUrl) return { format: "module", source, shortCircuit: true };
    return nextLoad(url, context);
  },
});

// Isolated tests must explicitly inject senders; never contact real services.
globalThis.fetch = async () => { throw new Error("Real network disabled in return tests"); };
