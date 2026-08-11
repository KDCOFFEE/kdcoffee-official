import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import type { FileHandle } from "fs/promises";
import path from "path";

const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_LOCK_RETRY_MS = 50;

export class FileLockTimeoutError extends Error {
  constructor(filePath: string, timeoutMs: number) {
    super(`等待檔案鎖逾時（${timeoutMs}ms）：${filePath}`);
    this.name = "FileLockTimeoutError";
  }
}

function hasErrorCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function serializeJson(data: unknown) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export async function atomicWriteJson(filePath: string, data: unknown) {
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

export type FileLockOptions = {
  timeoutMs?: number;
  retryDelayMs?: number;
};

export async function withFileLock<T>(
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

  try {
    return await operation();
  } finally {
    // 不自動刪除 stale lock；只有持有本次 lock handle 的流程會釋放自己的鎖。
    let releaseError: unknown;
    try {
      await lockHandle.close();
    } catch (error) {
      releaseError = error;
    }
    try {
      await fs.unlink(lockPath);
    } catch (error) {
      if (!hasErrorCode(error, "ENOENT")) releaseError ??= error;
    }
    if (releaseError) throw releaseError;
  }
}
