import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getPersistentDataRoot } from "./storagePaths";
import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import { createStoreRepository } from "./storeRepository";
import { giftProductFallback, GiftCmsValidationError, validateGiftCmsState, validateGiftLanding, validateGiftProduct, validateStoreLanding, type GiftCmsState, type GiftLandingDocument, type GiftProductDocument, type StoreLandingDocument } from "./giftCms";

export class GiftCmsConflictError extends Error {}
export class GiftCmsNotFoundError extends Error {}
export class GiftCmsStorageError extends Error {}
export function getGiftCmsFile() {
  const root = path.resolve(getPersistentDataRoot() || path.join(process.cwd(), "data"));
  const publicRoot = path.resolve(process.cwd(), "public");
  const relative = path.relative(publicRoot, root);
  if (root === path.parse(root).root || relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))) throw new GiftCmsStorageError();
  return path.join(root, "gift-cms", "content.json");
}
async function assertDirectory(directory: string) {
  try { const stat = await fs.lstat(directory); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new GiftCmsStorageError(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
/** Missing CMS is valid. GET never creates a directory, file or resolved defaults. */
export async function readGiftCmsState(): Promise<GiftCmsState> {
  const file = getGiftCmsFile(); await assertDirectory(path.dirname(file));
  try {
    const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw new GiftCmsStorageError();
    const value: unknown = JSON.parse(await fs.readFile(file, "utf8")); validateGiftCmsState(value); return value;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: 1, revision: 0, products: {} }; throw new GiftCmsStorageError(); }
}
/** One CMS lock and inside-lock read. Store is read-only; IDs never become paths. */
export async function saveGiftCmsDocument(input: { revision: number; scope: "landing" | "product" | "storeLanding" | "storeProduct"; slug?: string; document: unknown }) {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new GiftCmsValidationError();
  if (input.scope === "landing") validateGiftLanding(input.document); else if(input.scope === "storeLanding") validateStoreLanding(input.document); else if (input.scope === "product" || input.scope === "storeProduct") validateGiftProduct(input.document); else throw new GiftCmsValidationError();
  const file = getGiftCmsFile(), dir = path.dirname(file); await assertDirectory(dir); await fs.mkdir(dir, { recursive: true }); await assertDirectory(dir);
  return withFileLock(file, async () => {
    const current = await readGiftCmsState(); if (current.revision !== input.revision) throw new GiftCmsConflictError();
    let productId: string | undefined;
    if (input.scope === "product" || input.scope === "storeProduct") {
      const products = (await createStoreRepository().read()).products.filter(p => p.slug === input.slug && (input.scope === "storeProduct" || p.productType === "gift"));
      if (products.length !== 1) throw new GiftCmsNotFoundError(); productId = products[0].id;
    }
    if(input.scope === "storeLanding") {
      const catalog=await createStoreRepository().read(), nav=(input.document as StoreLandingDocument).navigation;
      if(nav.sections.some(n=>!catalog.sections.some(s=>s.id===n.id)) || nav.categories.some(n=>!catalog.categories.some(c=>c.id===n.id))) throw new GiftCmsValidationError("分類已更新，請重新載入。");
    }
    const document = structuredClone(input.document) as GiftLandingDocument | GiftProductDocument | StoreLandingDocument;
    const previous = productId ? current.products[productId] : input.scope === "storeLanding" ? current.storeLanding : current.landing;
    if (JSON.stringify(previous) === JSON.stringify(document)) return { revision: current.revision, document, outcome: "NO_CHANGE" as const };
    if (current.revision >= Number.MAX_SAFE_INTEGER) throw new GiftCmsConflictError();
    const next: GiftCmsState = { ...current, revision: current.revision + 1, ...(productId ? { products: { ...current.products, [productId]: document as GiftProductDocument } } : input.scope === "storeLanding" ? { storeLanding: document as StoreLandingDocument } : { landing: document as GiftLandingDocument }) };
    validateGiftCmsState(next); if (Buffer.byteLength(JSON.stringify(next), "utf8") > 8 * 1024 * 1024) throw new GiftCmsValidationError("頁面內容總量超過儲存上限。");
    const backups = path.join(dir, "backups"); await assertDirectory(backups); await fs.mkdir(backups, { recursive: true }); await assertDirectory(backups);
    await atomicWriteJson(path.join(backups, `content-r${current.revision}-${randomUUID()}.json`), current);
    await atomicWriteJson(file, next);
    return { revision: next.revision, document, outcome: "SAVED" as const };
  });
}

/** Presentation-only read, called only after the canonical Store public gate. */
export async function readGiftProductEditorial(productId: string, description: string) {
  return (await readGiftCmsState()).products[productId] ?? giftProductFallback({ description });
}

/** Invoked only after canonical Store public eligibility succeeds. */
export async function readStoreProductEditorial(slug: string, description: string) {
 const products=(await createStoreRepository().read()).products.filter(p=>p.slug===slug);
 if(products.length!==1)throw new GiftCmsNotFoundError();
 const source=products[0],saved=(await readGiftCmsState()).products[source.id];
 return saved ?? (source.productType === "gift" ? giftProductFallback({description}) : undefined);
}
