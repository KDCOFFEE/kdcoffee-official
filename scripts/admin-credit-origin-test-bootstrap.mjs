import "./public-origin-test-bootstrap.mjs";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Observe calls at the route boundary, but execute the real commerce function.
// Auth/session, ledger, audit and persistence use the test's temporary root.
const commerceUrl = pathToFileURL(path.join(process.cwd(), "lib/membershipCommerce.ts")).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/membershipCommerce") {
      const source = `import {adjustMemberCreditByAdmin as real} from ${JSON.stringify(commerceUrl)};
        export {MembershipCommerceError} from ${JSON.stringify(commerceUrl)};
        export async function adjustMemberCreditByAdmin(input){globalThis.__adminCreditOriginTest.mutationCalls++;return real(input);}`;
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
