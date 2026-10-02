import "./member-auth-test-bootstrap.mjs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";

globalThis.__orderEmailTest = { after: [], member: null, profileUpdates: [], failScheduling: false, failFinalization: false };
const sourceUrl = (relative) => pathToFileURL(path.join(process.cwd(), relative)).href;
const shim = (source) => ({ url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true });
registerHooks({
  // Match Next's JSON-module handling for standalone Node route tests.
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".json") && !url.includes("/node_modules/")) {
      return { format: "module", source: `export default ${readFileSync(fileURLToPath(url), "utf8")}`, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return shim("export{}");
    if (specifier === "next/headers") return shim(`
      export async function cookies() { return { get: () => undefined, getAll: () => [], has: () => false }; }
      export async function headers() { return new Headers(); }
    `);
    if (specifier === "next/server") return shim(`
      export { NextResponse } from ${JSON.stringify(sourceUrl("node_modules/next/server.js"))};
      export function after(callback) {
        if (globalThis.__orderEmailTest.failScheduling) throw new Error("Synthetic scheduling failure");
        globalThis.__orderEmailTest.after.push(callback);
      }
    `);
    if (specifier === "@/lib/memberAuth" || specifier === "./memberAuth") return shim(`
      export * from ${JSON.stringify(sourceUrl("lib/memberAuth.ts"))};
      export async function getCurrentMember() { return globalThis.__orderEmailTest.member; }
      export async function updateMemberProfile(memberId, patch) { globalThis.__orderEmailTest.profileUpdates.push({memberId, patch}); }
    `);
    if (specifier === "./orderFiles" && context.parentURL?.endsWith("/lib/orderInventoryTransaction.ts")) return shim(`
      export * from ${JSON.stringify(sourceUrl("lib/orderFiles.ts"))};
      import { updateOrderFile as update } from ${JSON.stringify(sourceUrl("lib/orderFiles.ts"))};
      export async function updateOrderFile(...args) {
        if (globalThis.__orderEmailTest.failFinalization) throw new Error("Synthetic finalization failure");
        return update(...args);
      }
    `);
    return nextResolve(specifier, context);
  },
});

// Every test must explicitly inject a mock; accidental live sends fail closed.
globalThis.fetch = async () => { throw new Error("Real network is disabled in order confirmation tests"); };
