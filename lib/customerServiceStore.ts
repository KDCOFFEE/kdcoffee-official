import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWriteJson, withFileLock } from "./jsonFileStore";
import { getPersistentDataRoot } from "./storagePaths";
import { DEFAULT_SERVICE_HERO } from "./customerServiceHero";
import { isMeaningfulAssetText } from "./assetMetadata";
import { assertServiceHeroAvailable } from "./customerServiceHeroServer";
import { DEFAULT_SERVICE_DOCUMENT, ServiceValidationError, validateServiceDocument, validateServiceState, type ServiceState } from "./customerServiceContent";

export class ServiceConflictError extends Error {}
export class ServiceStorageError extends Error {}
export function getCustomerServiceFile() {
  // Runtime content lives on the configured private volume, never in a deployment trace.
  const root = path.resolve(/* turbopackIgnore: true */ getPersistentDataRoot() || path.join(process.cwd(), "data"));
  const relative = path.relative(path.resolve(process.cwd(), "public"), root);
  if (root === path.parse(root).root || relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))) throw new ServiceStorageError();
  return path.join(/* turbopackIgnore: true */ root, "customer-service", "content.json");
}
async function assertDirectory(directory: string) {
  try { const stat = await fs.lstat(/* turbopackIgnore: true */ directory); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ServiceStorageError(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
/** No initialization, migration, repair or write on a public or Admin GET. */
export async function readCustomerServiceState(): Promise<ServiceState> {
  const file = getCustomerServiceFile();
  await assertDirectory(path.dirname(file));
  try {
    const stat = await fs.lstat(/* turbopackIgnore: true */ file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new ServiceStorageError();
    const value: unknown = JSON.parse(await fs.readFile(/* turbopackIgnore: true */ file, "utf8"));
    validateServiceState(value);
    return { ...value, document: { ...value.document, config: { ...value.document.config, hero: value.document.config.hero ?? { ...DEFAULT_SERVICE_HERO } } } };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: 1, revision: 0, document: structuredClone(DEFAULT_SERVICE_DOCUMENT) };
    throw new ServiceStorageError("客服內容暫時無法安全讀取。");
  }
}
/** One presentation document, one lock, an inside-lock revision check, backup and atomic replacement. */
export async function saveCustomerServiceState(input: { revision: number; document: unknown }): Promise<ServiceState> {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new ServiceValidationError("版本不正確，請重新載入。");
  validateServiceDocument(input.document);
  const document = structuredClone(input.document);
  document.config.hero ??= { ...DEFAULT_SERVICE_HERO };
  if (!isMeaningfulAssetText(document.config.hero.alt)) throw new ServiceValidationError("請填寫圖片描述，不能使用素材識別碼或儲存路徑作為 ALT。");
  await assertServiceHeroAvailable(document.config.hero);
  if (Buffer.byteLength(JSON.stringify(document), "utf8") > 900_000) throw new ServiceValidationError("客服內容超過儲存上限。");
  const file = getCustomerServiceFile(), directory = path.dirname(file);
  await assertDirectory(directory); await fs.mkdir(directory, { recursive: true }); await assertDirectory(directory);
  return withFileLock(file, async () => {
    const current = await readCustomerServiceState();
    if (current.revision !== input.revision || current.revision >= Number.MAX_SAFE_INTEGER) throw new ServiceConflictError();
    if (JSON.stringify(current.document) === JSON.stringify(document)) return current;
    const next: ServiceState = { schemaVersion: 1, revision: current.revision + 1, document };
    const backups = path.join(directory, "backups");
    await assertDirectory(backups); await fs.mkdir(backups, { recursive: true }); await assertDirectory(backups);
    await atomicWriteJson(path.join(backups, `content-r${current.revision}-${randomUUID()}.json`), current);
    await atomicWriteJson(file, next);
    return next;
  });
}
