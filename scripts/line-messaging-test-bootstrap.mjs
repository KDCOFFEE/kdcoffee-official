import "./member-auth-test-bootstrap.mjs";
import { registerHooks } from "node:module";

// Standalone Node tests only. Next retains the server-only boundary in production.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export{}", shortCircuit: true };
    }
    return nextResolve(specifier === "next/server" ? "next/server.js" : specifier, context);
  },
});

// An omitted injected fetcher must never turn a regression into a real send.
globalThis.fetch = async () => {
  throw new Error("Real network is disabled in LINE messaging regression tests");
};
