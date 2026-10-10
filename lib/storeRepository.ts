import "server-only";

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { atomicWriteJson, serializeJson, withFileLock } from "./jsonFileStore";
import { getPersistentDataRoot } from "./storagePaths";
import type { StoreCatalog, StoreCategory, StoreEntity, StoreProduct, StoreSection, StoreHeroSettings } from "./storeTypes";
import { STORE_CATEGORY_FIELDS, STORE_PRODUCT_FIELDS, STORE_SECTION_FIELDS, StoreValidationError, storeInputRecord, validateStoreCatalog, validateStoreProduct, validateStoreProductSeo, validateStoreHero } from "./storeValidation";

export class StoreRepositoryIntegrityError extends Error {
  constructor(message: string) { super(message); this.name = "StoreRepositoryIntegrityError"; }
}

export class StoreRevisionConflictError extends Error {
  constructor(id: string, expected: number, actual: number) {
    super(`Store ${id}: revision conflict (expected ${expected}, actual ${actual})`);
    this.name = "StoreRevisionConflictError";
  }
}
export class StoreEntityNotFoundError extends Error {
  constructor(id: string) { super(`Store entity not found: ${id}`); this.name = "StoreEntityNotFoundError"; }
}

export function emptyStoreCatalog(): StoreCatalog {
  return { schemaVersion: 1, revision: 0, updatedAt: null, sections: [], categories: [], products: [] };
}

export type StoreRepositoryOptions = {
  /** Trusted server configuration/test root, never an Admin request field. */
  dataRoot?: string;
  now?: () => Date;
};
type Entities = { sections: StoreSection; categories: StoreCategory; products: StoreProduct };
type Kind = keyof Entities;
const CLEARABLE_PRODUCT_FIELDS = new Set(["categoryId", "salePrice", "heroMedia", "kdRedemption"]);

function hasCode(error: unknown, code: string) {
  return error instanceof Error && "code" in error && error.code === code;
}
function list<K extends Kind>(catalog: StoreCatalog, kind: K): Entities[K][] {
  return catalog[kind] as Entities[K][];
}
function assertRevision(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) throw new StoreValidationError("expectedRevision: positive safe integer required");
}
function find<K extends Kind>(catalog: StoreCatalog, kind: K, id: string, expected: number): Entities[K] {
  assertRevision(expected);
  const entity = list(catalog, kind).find(item => item.id === id);
  if (!entity) throw new StoreEntityNotFoundError(id);
  if (entity.revision !== expected) throw new StoreRevisionConflictError(id, expected, entity.revision);
  return entity;
}
function touch(entity: StoreEntity, now: string) {
  entity.revision += 1;
  entity.updatedAt = now;
}
function archive(entity: StoreSection | StoreCategory | StoreProduct, now: string) {
  if (entity.archivedAt !== null) return;
  entity.active = false;
  if ("published" in entity) entity.published = false;
  entity.archivedAt = now;
  touch(entity, now);
}

/**
 * One private, independent catalog. All writers lock the same catalog path, read
 * the latest state inside that lock, validate the complete graph, then replace
 * atomically. No Artwork, commerce, wallet, upload or subscription dependencies.
 */
export function createStoreRepository(options: StoreRepositoryOptions = {}) {
  const configured = options.dataRoot ?? (getPersistentDataRoot() || path.join(process.cwd(), "data"));
  if (typeof configured !== "string" || !path.isAbsolute(configured) || configured.includes("\0")) throw new StoreValidationError("Store dataRoot must be an absolute private path");
  const root = path.resolve(configured);
  const publicRoot = path.resolve(process.cwd(), "public");
  const publicRelative = path.relative(publicRoot, root);
  if (root === path.parse(root).root || publicRelative === "" || (!publicRelative.startsWith(`..${path.sep}`) && publicRelative !== ".." && !path.isAbsolute(publicRelative))) {
    throw new StoreValidationError("Store dataRoot cannot be a filesystem root or public directory");
  }
  const directory = path.join(root, "store-domain");
  const catalogPath = path.join(directory, "catalog.json");
  const backupsPath = path.join(directory, "backups");
  const now = () => (options.now?.() ?? new Date()).toISOString();

  async function assertPrivateDirectory() {
    try {
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new StoreRepositoryIntegrityError("Store domain directory must not be a link");
    } catch (error) { if (!hasCode(error, "ENOENT")) throw error; }
  }
  async function read(): Promise<StoreCatalog> {
    await assertPrivateDirectory();
    let json: string;
    try {
      const stat = await fs.lstat(catalogPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024) throw new StoreRepositoryIntegrityError("Store catalog must be a bounded regular file");
      json = await fs.readFile(catalogPath, "utf8");
    } catch (error) {
      if (hasCode(error, "ENOENT")) return emptyStoreCatalog();
      throw error;
    }
    let catalog: unknown;
    try { catalog = JSON.parse(json); } catch { throw new StoreRepositoryIntegrityError("Store catalog JSON is corrupt; refusing replacement"); }
    try { validateStoreCatalog(catalog); }
    catch (error) {
      if (error instanceof StoreValidationError) throw new StoreRepositoryIntegrityError(error.message);
      throw error;
    }
    return catalog;
  }
  async function locked<T>(operation: () => Promise<T>) {
    await assertPrivateDirectory();
    await fs.mkdir(directory, { recursive: true });
    await assertPrivateDirectory();
    return withFileLock(catalogPath, operation);
  }
  async function mutate<T>(operation: (catalog: StoreCatalog, timestamp: string) => T): Promise<T> {
    return locked(async () => {
      const catalog = await read();
      const previous = structuredClone(catalog);
      const timestamp = now();
      const result = operation(catalog, timestamp);
      catalog.revision += 1;
      catalog.updatedAt = timestamp;
      validateStoreCatalog(catalog);
      if (Buffer.byteLength(serializeJson(catalog), "utf8") > 32 * 1024 * 1024) throw new StoreValidationError("Store catalog exceeds private file size limit");
      // A backup must succeed before replacement. Only Store-owned data is saved.
      await fs.mkdir(backupsPath, { recursive: true });
      const backupStat = await fs.lstat(backupsPath);
      if (!backupStat.isDirectory() || backupStat.isSymbolicLink()) throw new StoreRepositoryIntegrityError("Store backup directory must not be a link");
      await atomicWriteJson(path.join(backupsPath, `catalog-r${previous.revision}-${randomUUID()}.json`), previous);
      await atomicWriteJson(catalogPath, catalog);
      return structuredClone(result);
    });
  }
  function patch<K extends Kind>(kind: K, id: string, expectedRevision: number, input: unknown, fields: readonly string[]) {
    assertRevision(expectedRevision);
    const values = structuredClone(storeInputRecord(input, fields, `${kind}.patch`));
    if (kind === "products") validateStoreProductSeo(values);
    if (Object.keys(values).length === 0) throw new StoreValidationError("Store patch must not be empty");
    return mutate((catalog, timestamp) => {
      const entity = find(catalog, kind, id, expectedRevision);
      const record = entity as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(values)) {
        if (kind === "products" && CLEARABLE_PRODUCT_FIELDS.has(key) && value === null) delete record[key];
        else if (kind === "products" && (key === "seoTitle" || key === "seoDescription") && typeof value === "string" && !value.trim()) delete record[key];
        else record[key] = value;
      }
      touch(entity, timestamp);
      return entity;
    });
  }
  function archiveEntity<K extends Kind>(kind: K, id: string, expectedRevision: number) {
    assertRevision(expectedRevision);
    return mutate((catalog, timestamp) => {
      const entity = find(catalog, kind, id, expectedRevision);
      if (entity.archivedAt !== null) throw new StoreValidationError("Store entity is already archived");
      archive(entity, timestamp);
      if (kind === "sections") {
        for (const category of catalog.categories) if (category.sectionId === id) archive(category, timestamp);
        for (const product of catalog.products) if (product.sectionId === id) archive(product, timestamp);
      }
      if (kind === "categories") {
        for (const product of catalog.products) if (product.categoryId === id) archive(product, timestamp);
      }
      return entity;
    });
  }

  return {
    catalogPath,
    read,
    // Trusted server coordination only. Read is lock-free; do not call a writer inside this callback.
    withCatalogLock: locked,
    initialize: () => locked(async () => {
      const catalog = await read();
      try { await fs.lstat(catalogPath); }
      catch (error) {
        if (!hasCode(error, "ENOENT")) throw error;
        await atomicWriteJson(catalogPath, catalog);
      }
      return catalog;
    }),
    createSection: (input: unknown) => {
      const values = structuredClone(storeInputRecord(input, ["id", ...STORE_SECTION_FIELDS], "section.create"));
      return mutate((catalog, timestamp) => {
        const section = {
          shortDescription: "", description: "", active: true, published: false, sortOrder: 0,
          showOnHomepage: false, homepageSortOrder: 0, showInNavigation: false, navigationSortOrder: 0, seoTitle: "", seoDescription: "",
          ...values, revision: 1, createdAt: timestamp, updatedAt: timestamp, archivedAt: null,
        } as StoreSection;
        catalog.sections.push(section);
        return section;
      });
    },
    createCategory: (input: unknown) => {
      const values = structuredClone(storeInputRecord(input, ["id", ...STORE_CATEGORY_FIELDS], "category.create"));
      return mutate((catalog, timestamp) => {
        const category = { description: "", sortOrder: 0, active: true, ...values, revision: 1, createdAt: timestamp, updatedAt: timestamp, archivedAt: null } as StoreCategory;
        catalog.categories.push(category);
        return category;
      });
    },
    createProduct: (input: unknown) => {
      const values = structuredClone(storeInputRecord(input, ["id", ...STORE_PRODUCT_FIELDS, "subscriptionEligible"], "product.create"));
      validateStoreProductSeo(values);
      for (const key of ["seoTitle", "seoDescription"]) if (typeof values[key] === "string" && !values[key].trim()) delete values[key];
      return mutate((catalog, timestamp) => {
        const product = {
          shortDescription: "", description: "", productType: "general", active: true, published: false, sortOrder: 0, featured: false,
          gallery: [], specifications: [], subscriptionEligible: false,
          ...values, revision: 1, createdAt: timestamp, updatedAt: timestamp, archivedAt: null,
        };
        validateStoreProduct(product);
        catalog.products.push(product);
        return product;
      });
    },
    updateHero: (expectedRevision: number, input: unknown) => {
      // Catalog revision 0 is valid only here: a legacy/absent Store has no entities yet.
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new StoreValidationError("expectedRevision: non-negative safe integer required");
      const values = structuredClone(storeInputRecord(input, ["title", "subtitle", "backgroundImage", "mobileBackgroundImage", "titleFontSize", "titleColor", "subtitleFontSize", "subtitleColor", "motionEnabled", "timing"], "hero.patch"));
      if (!Object.keys(values).length) throw new StoreValidationError("Hero patch must not be empty");
      return mutate((catalog) => {
        if (catalog.revision !== expectedRevision) throw new StoreRevisionConflictError("settings.hero", expectedRevision, catalog.revision);
        const hero: Record<string, unknown> = { ...catalog.settings?.hero };
        for (const [key, value] of Object.entries(values)) {
          if (value === null || ((key === "title" || key === "subtitle") && typeof value === "string" && !value.trim())) delete hero[key];
          else hero[key] = value;
        }
        validateStoreHero(hero);
        if (Object.keys(hero).length) catalog.settings = { hero: hero as StoreHeroSettings };
        else delete catalog.settings;
        // mutate increments this catalog's revision atomically before returning its detached snapshot.
        return catalog;
      });
    },
    updateSection: (id: string, expectedRevision: number, input: unknown) => patch("sections", id, expectedRevision, input, STORE_SECTION_FIELDS),
    updateCategory: (id: string, expectedRevision: number, input: unknown) => patch("categories", id, expectedRevision, input, STORE_CATEGORY_FIELDS),
    updateProduct: (id: string, expectedRevision: number, input: unknown) => patch("products", id, expectedRevision, input, STORE_PRODUCT_FIELDS),
    archiveSection: (id: string, expectedRevision: number) => archiveEntity("sections", id, expectedRevision),
    archiveCategory: (id: string, expectedRevision: number) => archiveEntity("categories", id, expectedRevision),
    archiveProduct: (id: string, expectedRevision: number) => archiveEntity("products", id, expectedRevision),
    publishSection: (id: string, expectedRevision: number) => patch("sections", id, expectedRevision, { published: true }, STORE_SECTION_FIELDS),
    unpublishSection: (id: string, expectedRevision: number) => patch("sections", id, expectedRevision, { published: false }, STORE_SECTION_FIELDS),
    publishProduct: (id: string, expectedRevision: number) => patch("products", id, expectedRevision, { published: true }, STORE_PRODUCT_FIELDS),
    unpublishProduct: (id: string, expectedRevision: number) => patch("products", id, expectedRevision, { published: false }, STORE_PRODUCT_FIELDS),
  };
}
