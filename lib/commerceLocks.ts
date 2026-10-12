import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { withFileLock, type FileLockOptions } from "./jsonFileStore";
import { compareCommerceLocks, commerceLockPath, inCommerceLockPlan, isCommerceLockHeld, sealCommerceLockPlan, type CommerceLock } from "./commerceLockProtocol";
export type CommerceLockResource = CommerceLock & { file: string };
export function orderGateResource(orderDir: string, orderNumber: string): CommerceLockResource {
  if (!/^KD[0-9-]+$/.test(orderNumber)) throw new Error("Invalid order gate identity");
  return { rank: 1, key: orderNumber.toLowerCase() + ".json", file: path.join(orderDir, ".order-gates", createHash("sha256").update(orderNumber).digest("hex")) };
}
export async function withOrderGate<T>(orderDir: string, orderNumber: string, operation: () => Promise<T>, options?: FileLockOptions) {
  const gate = orderGateResource(orderDir, orderNumber);
  if (isCommerceLockHeld(gate.file)) return operation();
  await fs.mkdir(path.dirname(gate.file), { recursive: true });
  return withFileLock(gate.file, operation, { ...options, commerceLock: gate });
}
/** All identities must be discovered first. Callback acquisitions are forbidden. */
export async function withCommerceLockPlan<T>(resources: CommerceLockResource[], operation: () => Promise<T>, options?: FileLockOptions) {
  const sorted = [...resources].sort(compareCommerceLocks);
  const paths = sorted.map(resource => commerceLockPath(resource.file));
  if (new Set(paths).size !== paths.length || sorted.some((item, i) => i > 0 && compareCommerceLocks(sorted[i - 1], item) === 0)) throw new Error("Duplicate commerce lock resource");
  return inCommerceLockPlan(paths, async () => {
    const acquire = async (index: number): Promise<T> => {
      if (index === sorted.length) return sealCommerceLockPlan(operation);
      const resource = sorted[index];
      await fs.mkdir(path.dirname(resource.file), { recursive: true });
      return withFileLock(resource.file, () => acquire(index + 1), { ...options, commerceLock: resource });
    };
    return acquire(0);
  });
}
