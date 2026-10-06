import "./member-auth-test-bootstrap.mjs";
import "./member-copy-test-bootstrap.mjs";
import { registerHooks } from "node:module";

// Only Next's request-local browser/session boundary is replaced. Real auth,
// identity, pricing, stock, rules, ledger and order files run against mkdtemp.
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith("/public/data/website-data.json")) return { format: "module", source: "export default { menu: {products:[]}, artworks:[], pages:[] };", shortCircuit: true };
    return nextLoad(url, context);
  },
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/headers") return {
      url: "data:text/javascript,export async function cookies(){return {get:(key)=>{const value=key==='kd_admin_session'?globalThis.__creditTestAdminCookie:globalThis.__creditTestCookie;return value?{value}:undefined;}};}", shortCircuit: true,
    };
    if (specifier === "next/navigation") return {
      url: "data:text/javascript,export function usePathname(){return '/member';} export function useSearchParams(){return new URLSearchParams();} export function useRouter(){return {push(){},refresh(){}};}", shortCircuit: true,
    };
    return nextResolve(specifier, context);
  },
});
