import "./credit-integration-test-bootstrap.mjs";
import { registerHooks, createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve("react")).href;
const source = `import React from ${JSON.stringify(reactUrl)}; export * from ${JSON.stringify(reactUrl)}; export default React;
${["useState", "useRef", "useEffect", "useId"].map(name => `export const ${name}=(...args)=>globalThis.__cancelCreditFixture ? globalThis.__cancelCreditFixture.${name}(...args) : React.${name}(...args);`).join("\n")}`;
const fixtureUrl = "data:text/javascript," + encodeURIComponent(source);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "react" && /\/components\/member\/CancelCreditConfirmation\.tsx$/.test(context.parentURL ?? "")) return { url: fixtureUrl, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === fixtureUrl) return { format: "module", source, shortCircuit: true };
    return nextLoad(url, context);
  },
});
