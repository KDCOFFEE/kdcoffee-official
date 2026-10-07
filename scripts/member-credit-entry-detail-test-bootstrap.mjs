import "./credit-integration-test-bootstrap.mjs";
import { registerHooks, createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Test-only hook fixture: actual component event handlers/state are executed.
// Outside the fixture, SSR still uses real React. No production module is stubbed.
const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve("react")).href;
const hooks = ["useState", "useRef", "useEffect", "useId", "useContext"];
const source = `import React from ${JSON.stringify(reactUrl)}; export * from ${JSON.stringify(reactUrl)}; export default React;
${hooks.map((name) => `export const ${name}=(...args)=>globalThis.__passbookHookFixture ? globalThis.__passbookHookFixture.${name}(...args) : React.${name}(...args);`).join("\n")}`;
const fixtureUrl = "data:text/javascript," + encodeURIComponent(source);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "react" && /\/components\/(?:member\/(MemberCreditLedger|MemberCreditEntryDetail|MemberCenterCopyProvider)|admin\/MemberCenterCopyManager)\.tsx$/.test(context.parentURL ?? "")) return { url: fixtureUrl, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === fixtureUrl) return { format: "module", source, shortCircuit: true };
    return nextLoad(url, context);
  },
});
