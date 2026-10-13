import { promises as fs } from "node:fs";
import path from "node:path";
import { publishJsonExclusive } from "./jsonFileStore";
import { assertCommerceLockHeld } from "./commerceLockProtocol";
import { inventoryHash, inventoryOperationKey } from "./inventoryReceipts";
import type { TransactionEvent } from "./commerceTransactionTypes";
type Envelope = { schemaVersion: 1; sequence: number; previousHash: string | null; event: TransactionEvent; hash: string };
export class CommerceJournalIntegrityError extends Error {
  constructor(message: string) { super(message); this.name = "CommerceJournalIntegrityError"; }
}
export function createCommerceTransactionJournal(orderDir: string, transactionId: string) {
  const key = inventoryOperationKey(transactionId);
  const directory = path.join(orderDir, ".transactions", key);
  const lockFile = path.join(orderDir, ".transaction-locks", key);
  async function read(): Promise<Envelope[]> {
    let names: string[];
    try {
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new CommerceJournalIntegrityError("Unsafe transaction journal");
      names = (await fs.readdir(directory)).filter(name => !name.startsWith(".")).sort();
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    if (names.length > 10000) throw new CommerceJournalIntegrityError("Transaction journal limit");
    const envelopes: Envelope[] = [];
    for (const [index, name] of names.entries()) {
      if (name !== String(index).padStart(8,"0") + ".json") throw new CommerceJournalIntegrityError("Transaction sequence gap");
      const file = path.join(directory,name), stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) throw new CommerceJournalIntegrityError("Invalid transaction event file");
      let envelope: Envelope;
      try { envelope = JSON.parse(await fs.readFile(file,"utf8")); } catch { throw new CommerceJournalIntegrityError("Corrupt transaction event"); }
      if (envelope.schemaVersion !== 1 || envelope.sequence !== index || envelope.previousHash !== (envelopes.at(-1)?.hash ?? null)
        || !envelope.event || typeof envelope.event !== "object"
        || !["RESTORE_PREPARED","RESTORE_PENDING","RESTORED","CANCELLED","PREPARED","APPLIED","ABORT","COMPENSATION_PENDING","COMPENSATED","FINALIZED","ABORTED","REVIEW_REQUIRED"].includes(envelope.event.type)
        || envelope.hash !== inventoryHash({ schemaVersion: 1, sequence: index, previousHash: envelope.previousHash, event: envelope.event })) throw new CommerceJournalIntegrityError("Transaction hash/sequence mismatch");
      if ((index === 0) !== (["PREPARED","RESTORE_PREPARED"].includes(envelope.event.type))) throw new CommerceJournalIntegrityError("Invalid transaction intent placement");
      envelopes.push(envelope);
    }
    return envelopes;
  }
  async function append(event: TransactionEvent) {
    assertCommerceLockHeld(lockFile);
    const previous = await read();
    if (previous.length >= 10000) throw new CommerceJournalIntegrityError("Transaction journal limit");
    const record = { schemaVersion: 1 as const, sequence: previous.length, previousHash: previous.at(-1)?.hash ?? null, event };
    const envelope = { ...record, hash: inventoryHash(record) };
    await fs.mkdir(directory,{recursive:true});
    await publishJsonExclusive(path.join(directory,String(record.sequence).padStart(8,"0") + ".json"),envelope);
    return envelope;
  }
  return { lockFile, directory, read, append };
}
