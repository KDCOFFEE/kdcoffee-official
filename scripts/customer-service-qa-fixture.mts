/** Only synthetic, worktree-local fixtures. Never loads a .env or a production volume. */
import fs from "node:fs/promises";
import path from "node:path";
import { createSessionToken } from "../lib/memberAuth";
import { createAdminSessionValue } from "../lib/adminAuth";
import { provisionCanonicalMember } from "../lib/memberIdentity";
import { initializePersistentStorage } from "../lib/persistentStorageInit";
import { emptyStoreCatalog } from "../lib/storeRepository";
const root = path.resolve(process.env.KD_DATA_DIR || "");
const expected = path.resolve("qa-output/cs1");
if (!root.startsWith(expected + path.sep)) throw new Error("Worktree-local QA data root required");
await initializePersistentStorage();
await fs.mkdir(path.join(root, "store-domain"), { recursive: true });
await fs.writeFile(path.join(root, "store-domain/catalog.json"), JSON.stringify(emptyStoreCatalog()));
let memberId = "";
await provisionCanonicalMember({ provider: "email", subject: "cs1-owner@example.test", persistMember: async (id, memberNumber) => {
  memberId = id;
  await fs.writeFile(path.join(root, "members", `${id}.json`), JSON.stringify({ id, memberNumber, displayName: "客服測試會員", email: "cs1-owner@example.test", authProvider: "email", createdAt: "2026-10-01T00:00:00.000Z", lastLoginAt: "2026-10-27T00:00:00.000Z" }));
} });
for (const index of [1, 2, 3, 4, 5]) {
  const order = { orderNumber: `KD20261027-00000${index}`, member: { memberId: index === 5 ? "another-member" : memberId }, createdAt: `2026-10-${String(index + 20).padStart(2, "0")}T06:00:00.000Z`, status: index === 4 ? "ready_for_pickup" : index === 3 ? "shipped" : "new_order", orderMode: index === 4 ? "studio_pickup" : index === 3 ? "home_delivery" : "711_cod", customer: { email: "private-not-for-client@example.test" }, privateCs1Marker: "MUST_NOT_LEAK_TO_BROWSER", items: [] };
  await fs.writeFile(path.join(root, "orders", `${order.orderNumber}.json`), JSON.stringify(order));
}
await fs.writeFile(path.join(root, "qa-sessions.json"), JSON.stringify({ member: createSessionToken(memberId), owner: createAdminSessionValue({ role: "owner" }), admin: createAdminSessionValue({ adminId: "cs1-admin", role: "admin" }) }));
console.log("Synthetic QA fixtures prepared inside CS.1 worktree.");
