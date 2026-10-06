import "./member-auth-test-bootstrap.mjs";
import { registerHooks } from "node:module";

// Route response/cookie serialization stays real. Only Next's request-local
// cookie jar and the presentation seed are replaced for isolated route tests.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "next/headers") return {
      url: "data:text/javascript,export async function cookies(){return globalThis.__publicOriginTestCookies;}", shortCircuit: true,
    };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("/public/data/website-data.json")) return {
      format: "module", source: "export default {menu:{products:[]},artworks:[],pages:[]};", shortCircuit: true,
    };
    return nextLoad(url, context);
  },
});
