import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import type { FileHandle } from "fs/promises";
import type { Stats } from "fs";
import path from "path";
import { inCommerceLock, inferCommerceLock, type CommerceLock } from "./commerceLockProtocol";

const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_LOCK_RETRY_MS = 50;
const LOCK_RELEASE_RETRY_DELAYS_MS = [40, 80, 160] as const;
const TEST_LAB_WINDOWS_WRITE_RETRY_DELAYS_MS = [40, 80, 160, 320, 640] as const;

function isMembershipTestLabPath(filePath: string) {
  return path.resolve(filePath).split(path.sep).includes("membership-test-lab");
}

function isTransientWindowsReplaceError(error: unknown) {
  if (process.platform !== "win32") return false;
  return ["EPERM", "EACCES", "EBUSY"].some((code) => hasErrorCode(error, code));
}

export class FileLockTimeoutError extends Error {
  constructor(filePath: string, timeoutMs: number) {
    super(`等待檔案鎖逾時（${timeoutMs}ms）：${filePath}`);
    this.name = "FileLockTimeoutError";
  }
}

type LockReleasePhase = "identity" | "close" | "unlink";
/** The operation has finished; only cleanup of its owned lock failed. */
export class FileLockReleaseError extends Error {
  readonly lockPath: string;
  readonly phase: LockReleasePhase;
  readonly attempts: number;
  readonly code?: string;
  constructor(lockPath: string, phase: LockReleasePhase, attempts: number, cause: unknown) {
    super(`Lock release failed (${phase}): ${lockPath}`, { cause });
    this.name = "FileLockReleaseError";
    this.lockPath = lockPath; this.phase = phase; this.attempts = attempts;
    this.code = cause instanceof Error && "code" in cause ? String(cause.code) : undefined;
  }
}

function hasErrorCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function retryOwnedLockRelease<T>(lockPath: string, phase: LockReleasePhase, action: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await action(); }
    catch (error) {
      const delay = LOCK_RELEASE_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !["EPERM", "EACCES", "EBUSY"].some(code => hasErrorCode(error, code))) {
        throw new FileLockReleaseError(lockPath, phase, attempt + 1, error);
      }
      await wait(delay);
    }
  }
}

async function releaseOwnedLock(handle: FileHandle, lockPath: string) {
  let identity: Stats | undefined, releaseError: unknown;
  try { identity = await retryOwnedLockRelease(lockPath, "identity", () => handle.stat()); }
  catch (error) { releaseError = error; }
  try { await retryOwnedLockRelease(lockPath, "close", () => handle.close()); }
  catch (error) { releaseError ??= error; }
  // If identity or close is uncertain, retain the lock instead of guessing.
  if (releaseError) throw releaseError;
  const owned = identity!;
  await retryOwnedLockRelease(lockPath, "unlink", async () => {
    try {
      const current = await fs.lstat(lockPath);
      if (!current.isFile() || current.dev !== owned.dev || current.ino !== owned.ino) {
        throw Object.assign(new Error("Lock ownership changed; no cleanup attempted"), { code: "LOCK_OWNERSHIP_CHANGED" });
      }
      await fs.unlink(lockPath);
    } catch (error) { if (!hasErrorCode(error, "ENOENT")) throw error; }
  });
}

export function serializeJson(data: unknown) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

async function atomicWriteJsonOnce(filePath: string, data: unknown) {
  const targetPath = path.resolve(filePath);
  const dir = path.dirname(targetPath);
  const tempPath = path.join(
    dir,
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.${randomBytes(6).toString("hex")}.tmp`,
  );
  let handle: FileHandle | undefined;
  let committed = false;

  try {
    handle = await fs.open(tempPath, "wx", 0o600);
    await handle.writeFile(serializeJson(data), "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(tempPath, targetPath);
    committed = true;
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    if (!committed) {
      await fs.unlink(tempPath).catch((error: unknown) => {
        if (!hasErrorCode(error, "ENOENT")) throw error;
      });
    }
  }
}

export async function atomicWriteJson(filePath: string, data: unknown) {
  const retryDelays = isMembershipTestLabPath(filePath)
    ? TEST_LAB_WINDOWS_WRITE_RETRY_DELAYS_MS
    : [];

  for (let attempt = 0; ; attempt += 1) {
    try {
      await atomicWriteJsonOnce(filePath, data);
      return;
    } catch (error) {
      const delay = retryDelays[attempt];
      if (delay == null || !isTransientWindowsReplaceError(error)) throw error;
      await wait(delay);
    }
  }
}

export type FileLockOptions = {
  timeoutMs?: number;
  retryDelayMs?: number;
  commerceLock?: CommerceLock;
};

async function withFileLockCore<T>(
  filePath: string,
  operation: () => Promise<T>,
  options: FileLockOptions = {},
) {
  const targetPath = path.resolve(filePath);
  const lockPath = `${targetPath}.lock`;
  const timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS);
  const retryDelayMs = Math.max(1, options.retryDelayMs ?? DEFAULT_LOCK_RETRY_MS);
  const startedAt = Date.now();
  let lockHandle: FileHandle | undefined;

  while (!lockHandle) {
    try {
      lockHandle = await fs.open(lockPath, "wx", 0o600);
      await lockHandle.writeFile(
        `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`,
        "utf8",
      );
      await lockHandle.sync();
    } catch (error) {
      if (lockHandle) {
        await lockHandle.close().catch(() => undefined);
        lockHandle = undefined;
        await fs.unlink(lockPath).catch(() => undefined);
      }
      if (!hasErrorCode(error, "EEXIST")) throw error;
      const elapsed = Date.now() - startedAt;
      if (elapsed >= timeoutMs) throw new FileLockTimeoutError(targetPath, timeoutMs);
      await wait(Math.min(retryDelayMs, timeoutMs - elapsed));
    }
  }

  let operationFailed = false;
  try {
    return await operation();
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    // 不自動刪除 stale lock；只有持有本次 lock handle 的流程會釋放自己的鎖。
    try { await releaseOwnedLock(lockHandle, lockPath); }
    catch (error) {
      if (!operationFailed) throw error;
      // Cleanup must never replace the operation's original rejection.
      try {
        console.warn(JSON.stringify({ event: "file_lock_release_failed_after_operation_error", lockPath, phase: error instanceof FileLockReleaseError ? error.phase : undefined, code: error instanceof FileLockReleaseError ? error.code : undefined }));
      } catch { /* Logging cannot mask the original operation error. */ }
    }
  }
}

/** Ordering is checked before acquiring the filesystem lock. Never removes stale locks. */
export function withFileLock<T>(filePath: string, operation: () => Promise<T>, options: FileLockOptions = {}): Promise<T> {
  return inCommerceLock(filePath, options.commerceLock ?? inferCommerceLock(filePath), () => withFileLockCore(filePath, operation, options));
}
/** Publish complete JSON once. Readers never observe a partially written new file. */
export async function publishJsonExclusive(filePath: string, data: unknown) {
  const target = path.resolve(filePath);
  const temporary = path.join(path.dirname(target), "." + path.basename(target) + "." + randomBytes(12).toString("hex") + ".tmp");
  let handle: FileHandle | undefined;
  try {
    handle = await fs.open(temporary, "wx", 0o600);
    await handle.writeFile(serializeJson(data), "utf8");
    await handle.sync();
    await handle.close(); handle = undefined;
    await fs.link(temporary, target);
    if (process.platform !== "win32") {
      const directory = await fs.open(path.dirname(target), "r");
      try { await directory.sync(); } finally { await directory.close(); }
    }
  } finally {
    await handle?.close().catch(() => undefined);
    await fs.unlink(temporary).catch(error => { if (!hasErrorCode(error, "ENOENT")) throw error; });
  }
}
