import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  assertProductionStorageRootConfigured,
  getArtworkBackupsDir,
  getBackupsDir,
  getCampaignUploadDir,
  getFulfillmentDir,
  getHome003UploadDir,
  getMemberIdentityDir,
  getMembersDir,
  getMembershipCommerceDir,
  getMembershipRulesFile,
  getOrderNotificationUploadsDir,
  getOrdersDir,
  getPagesDataFile,
  getPersistentDataRoot,
  getStoreDir,
} from "@/lib/storagePaths";
import { validateMembershipRulesStore } from "@/lib/membershipBusinessRules";

const STORE_SEED_FILES = [
  "website-data.json",
  "homepage.json",
  "assets.json",
  "monthly-menus.json",
  "pages.json",
] as const;
const MEMBERSHIP_RULES_SEED_FILE = "business-rules.json";

type StoreSeedFile = (typeof STORE_SEED_FILES)[number];

export type SeedMediaClassification =
  | "persistent-local"
  | "external"
  | "git-static"
  | "invalid";

export type SeedMediaPlanEntry = {
  reference: string;
  classification: SeedMediaClassification;
  sourceFile?: string;
  targetFile?: string;
  reason?: string;
};

export type PersistentStorageBootstrapResult = {
  initialized: boolean;
  jsonSeeded: string[];
  jsonExisting: string[];
  mediaSeeded: string[];
  mediaExisting: string[];
  mediaPlan: SeedMediaPlanEntry[];
};

export type PersistentStorageInitializationOptions = {
  repositoryPublicDir?: string;
  repositorySeedDir?: string;
};

let initializationPromise: Promise<void> | null = null;

function errorCode(error: unknown) {
  return error instanceof Error && "code" in error ? error.code : undefined;
}

function collectStrings(value: unknown, output: Set<string>) {
  if (typeof value === "string") {
    output.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, output);
  }
}

function safeSegments(pathname: string) {
  if (pathname.includes("\\") || pathname.includes("\0")) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\\") || decoded.includes("\0")) return null;
  const segments = decoded.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  return segments;
}

function localPlan(
  reference: string,
  sourceSegments: string[],
  targetSegments: string[],
  repositoryPublicDir: string,
  persistentRoot: string,
): SeedMediaPlanEntry {
  return {
    reference,
    classification: "persistent-local",
    sourceFile: path.join(repositoryPublicDir, ...sourceSegments),
    targetFile: path.join(persistentRoot, ...targetSegments),
  };
}

/** Classify a seed reference according to runtime routes that switch to KD_DATA_DIR. */
export function classifySeedMediaReference(
  reference: string,
  repositoryPublicDir: string,
  persistentRoot: string,
): SeedMediaPlanEntry {
  const trimmed = reference.trim();
  if (/^(?:https?:|data:)/iu.test(trimmed)) return { reference, classification: "external" };
  if (!trimmed.startsWith("/")) return { reference, classification: "git-static" };

  const pathname = trimmed.split(/[?#]/u, 1)[0];
  const segments = safeSegments(pathname);
  const persistentPrefix = /^\/(?:uploads\/(?:assets|artworks|order-notifications)|images\/(?:campaigns|home003))(?:\/|$)/u;
  if (!segments) {
    return persistentPrefix.test(pathname)
      ? { reference, classification: "invalid", reason: "unsafe or malformed persistent media path" }
      : { reference, classification: "git-static" };
  }

  if (segments[0] === "uploads" && segments[1] === "assets") {
    if (segments.length !== 4) return { reference, classification: "invalid", reason: "asset seed path must contain one category and one filename" };
    return localPlan(reference, segments, segments, repositoryPublicDir, persistentRoot);
  }
  if (segments[0] === "uploads" && segments[1] === "artworks") {
    if (segments.length !== 4) return { reference, classification: "invalid", reason: "artwork seed path must contain one slug and one filename" };
    return localPlan(reference, segments, segments, repositoryPublicDir, persistentRoot);
  }
  if (segments[0] === "uploads" && segments[1] === "order-notifications") {
    return { reference, classification: "invalid", reason: "transaction notification media is not a permitted store seed" };
  }
  if (segments[0] === "images" && segments[1] === "campaigns") {
    if (segments.length !== 3) return { reference, classification: "invalid", reason: "campaign seed path must contain one filename" };
    return localPlan(reference, segments, ["uploads", "campaigns", segments[2]], repositoryPublicDir, persistentRoot);
  }
  if (segments[0] === "images" && segments[1] === "home003") {
    if (segments.length !== 3) return { reference, classification: "invalid", reason: "HOME003 seed path must contain one filename" };
    return localPlan(reference, segments, ["uploads", "home003", segments[2]], repositoryPublicDir, persistentRoot);
  }
  return { reference, classification: "git-static" };
}

function validateJson(data: Buffer, label: string) {
  try {
    JSON.parse(data.toString("utf8"));
  } catch {
    throw new Error(`Persistent storage bootstrap JSON is invalid: ${label}`);
  }
}

async function validateMediaFile(filePath: string, label: string) {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    throw new Error(`Persistent storage bootstrap media is missing or unreadable: ${label}`, { cause: error });
  }
  if (!stat.isFile() || stat.size < 1) {
    throw new Error(`Persistent storage bootstrap media is empty or not a file: ${label}`);
  }
}

async function targetExists(targetFile: string, validate: () => Promise<void>) {
  try {
    await fs.lstat(targetFile);
    await validate();
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

/**
 * Publish a complete temporary file through an exclusive hard link. link()
 * cannot replace an existing target, so concurrent initializers preserve the
 * first complete authoritative file without an access/copy race.
 */
async function publishIfMissing(
  sourceData: Buffer,
  targetFile: string,
  validateTarget: () => Promise<void>,
) {
  if (await targetExists(targetFile, validateTarget)) return false;
  await fs.mkdir(path.dirname(targetFile), { recursive: true });
  const temporaryFile = path.join(
    path.dirname(targetFile),
    `.${path.basename(targetFile)}.bootstrap.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle;
  let published = false;
  try {
    handle = await fs.open(temporaryFile, "wx", 0o600);
    await handle.writeFile(sourceData);
    await handle.sync();
    await handle.close();
    handle = undefined;
    try {
      await fs.link(temporaryFile, targetFile);
      published = true;
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
    }
    await validateTarget();
    return published;
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    await fs.unlink(temporaryFile).catch((error) => {
      if (errorCode(error) !== "ENOENT") throw error;
    });
  }
}

async function loadSeedDocuments(repositoryDataDir: string) {
  const documents = new Map<StoreSeedFile, { data: Buffer; value: unknown }>();
  for (const fileName of STORE_SEED_FILES) {
    const sourceFile = path.join(repositoryDataDir, fileName);
    let data: Buffer;
    try {
      data = await fs.readFile(sourceFile);
    } catch (error) {
      throw new Error(`Persistent storage bootstrap JSON source is missing: ${fileName}`, { cause: error });
    }
    validateJson(data, fileName);
    documents.set(fileName, { data, value: JSON.parse(data.toString("utf8")) });
  }
  return documents;
}

async function loadMembershipRulesSeedDocument(repositoryMembershipCommerceDir: string) {
  const sourceFile = path.join(repositoryMembershipCommerceDir, MEMBERSHIP_RULES_SEED_FILE);
  let data: Buffer;
  try {
    data = await fs.readFile(sourceFile);
  } catch (error) {
    throw new Error(`Persistent storage bootstrap JSON source is missing: membership-commerce/${MEMBERSHIP_RULES_SEED_FILE}`, { cause: error });
  }
  validateJson(data, `membership-commerce/${MEMBERSHIP_RULES_SEED_FILE}`);
  validateMembershipRulesStore(JSON.parse(data.toString("utf8")));
  return data;
}

export async function initializePersistentStorage(
  options: PersistentStorageInitializationOptions = {},
): Promise<PersistentStorageBootstrapResult> {
  assertProductionStorageRootConfigured();
  const root = getPersistentDataRoot();
  if (!root) {
    return { initialized: false, jsonSeeded: [], jsonExisting: [], mediaSeeded: [], mediaExisting: [], mediaPlan: [] };
  }

  const repositoryPublicDir = path.resolve(options.repositoryPublicDir ?? path.join(process.cwd(), "public"));
  const repositorySeedDir = path.resolve(
    options.repositorySeedDir ??
      (options.repositoryPublicDir
        ? path.join(repositoryPublicDir, "data")
        : path.join(process.cwd(), "bootstrap", "store")),
  );
  const documents = await loadSeedDocuments(repositorySeedDir);
  const membershipRulesSeed = await loadMembershipRulesSeedDocument(
    path.join(process.cwd(), "bootstrap", "membership-commerce"),
  );
  const strings = new Set<string>();
  for (const document of documents.values()) collectStrings(document.value, strings);
  const mediaPlan = [...strings]
    .map((reference) => classifySeedMediaReference(reference, repositoryPublicDir, root))
    .filter((entry) => entry.classification !== "git-static" || entry.reference.startsWith("/"))
    .sort((left, right) => left.reference.localeCompare(right.reference));

  const invalid = mediaPlan.find((entry) => entry.classification === "invalid");
  if (invalid) throw new Error(`Invalid persistent seed media reference: ${invalid.reference} (${invalid.reason})`);
  const localMedia = mediaPlan.filter(
    (entry): entry is SeedMediaPlanEntry & { sourceFile: string; targetFile: string } =>
      entry.classification === "persistent-local" && Boolean(entry.sourceFile) && Boolean(entry.targetFile),
  );
  for (const entry of localMedia) await validateMediaFile(entry.sourceFile, entry.reference);

  const directories = [
    root,
    getStoreDir(),
    getOrdersDir(),
    getMembersDir(),
    getMemberIdentityDir(),
    getMembershipCommerceDir(),
    getFulfillmentDir(),
    getCampaignUploadDir(),
    getHome003UploadDir(),
    getOrderNotificationUploadsDir(),
    getBackupsDir(),
    getArtworkBackupsDir(),
    path.join(root, "uploads", "assets"),
    path.join(root, "uploads", "artworks"),
  ];
  await Promise.all(directories.map((directory) => fs.mkdir(directory, { recursive: true })));

  const result: PersistentStorageBootstrapResult = {
    initialized: true,
    jsonSeeded: [],
    jsonExisting: [],
    mediaSeeded: [],
    mediaExisting: [],
    mediaPlan,
  };

  for (const entry of localMedia) {
    const sourceData = await fs.readFile(entry.sourceFile);
    const seeded = await publishIfMissing(
      sourceData,
      entry.targetFile,
      () => validateMediaFile(entry.targetFile, entry.reference),
    );
    (seeded ? result.mediaSeeded : result.mediaExisting).push(entry.reference);
  }

  for (const fileName of STORE_SEED_FILES) {
    const document = documents.get(fileName)!;
    const targetFile = fileName === "pages.json" ? getPagesDataFile() : path.join(getStoreDir(), fileName);
    const seeded = await publishIfMissing(
      document.data,
      targetFile,
      async () => validateJson(await fs.readFile(targetFile), targetFile),
    );
    (seeded ? result.jsonSeeded : result.jsonExisting).push(fileName);
  }
  const membershipRulesTarget = getMembershipRulesFile();
  const membershipRulesSeeded = await publishIfMissing(
    membershipRulesSeed,
    membershipRulesTarget,
    async () => { validateMembershipRulesStore(JSON.parse((await fs.readFile(membershipRulesTarget)).toString("utf8"))); },
  );
  (membershipRulesSeeded ? result.jsonSeeded : result.jsonExisting).push(`membership-commerce/${MEMBERSHIP_RULES_SEED_FILE}`);
  return result;
}

export async function ensurePersistentStorageInitialized() {
  if (initializationPromise) return initializationPromise;
  initializationPromise = initializePersistentStorage().then(() => undefined);
  try {
    await initializationPromise;
  } catch (error) {
    initializationPromise = null;
    throw error;
  }
}
