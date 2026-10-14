import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { withCommerceLockPlan, orderGateResource, type CommerceLockResource } from "./commerceLocks";
import { assertCommerceLockHeld } from "./commerceLockProtocol";
import { createCommerceTransactionJournal } from "./commerceTransactionJournal";
import { createOrderFile, withOrderFileUpdateLock } from "./orderFiles";
import { inventoryHash, inventoryOperationKey, normalizeInventoryDemand } from "./inventoryReceipts";
import type { InventoryParticipant, ParticipantOperation, ParticipantObservation, TransactionIntent, TransactionResult, CancellationSnapshot, CancellationRestoreIntent, CancellationRestoreResult } from "./commerceTransactionTypes";
export class CommerceTransactionConflictError extends Error {
  constructor(message: string) { super(message); this.name = "CommerceTransactionConflictError"; }
}
type Hook = (phase: "PREPARED" | "APPLIED" | "COMPENSATED" | "BEFORE_FINALIZE" | "FINALIZED", domain?: string) => Promise<void>;
export function createCommerceTransactionCoordinator(options: {
  orderDir: string; participants: InventoryParticipant[]; hook?: Hook;
  writeFinalOrder?: typeof withOrderFileUpdateLock;
}) {
  const registry = new Map(options.participants.map(item => [item.domain,item]));
  if (registry.size !== options.participants.length || new Set(options.participants.map(item=>item.registryRank)).size !== registry.size) throw new Error("Duplicate participant registration");
  function validate(input: TransactionIntent): TransactionIntent {
    if (!input || input.schemaVersion !== 1 || typeof input.transactionId !== "string" || !input.transactionId || input.transactionId.length > 160
      || !/^[a-f0-9]{64}$/.test(input.requestHash) || !/^KD[0-9-]+$/.test(input.orderNumber)
      || !["new_order","confirmed","waiting_merchant_create_cod_shipment","waiting_studio_pickup_confirmation"].includes(input.finalStatus)
      || !input.order || typeof input.order !== "object" || Array.isArray(input.order)
      || !Array.isArray(input.participants) || !input.participants.length || input.participants.length > 32) throw new Error("Invalid canonical transaction intent");
    const participants = input.participants.map(item=>{
      const adapter=registry.get(item.domain);
      if (!adapter || adapter.registryRank !== item.registryRank || adapter.resource.rank !== 2) throw new Error("Unknown or changed participant registry");
      return {...item,demands:normalizeInventoryDemand(item.demands)};
    }).sort((a,b)=>a.registryRank-b.registryRank);
    if (new Set(participants.map(item=>item.domain)).size !== participants.length) throw new Error("Duplicate participant intent");
    // Hash and journal must represent exactly the same immutable JSON value.
    try {
      const snapshot=structuredClone({...input,participants});
      const json=JSON.stringify(snapshot);
      if (Buffer.byteLength(json,"utf8") > 1024 * 1024) throw new Error("Intent exceeds journal size budget");
      const persisted=JSON.parse(json);
      if (!isDeepStrictEqual(persisted,snapshot)) throw new Error("Intent cannot round-trip through JSON");
      return persisted as TransactionIntent;
    } catch { throw new Error("Canonical transaction intent must be lossless bounded JSON"); }
  }
  function operation(intent: TransactionIntent, domain: string): ParticipantOperation {
    const item=intent.participants.find(entry=>entry.domain===domain)!;
    return {transactionId:intent.transactionId,operationId:"apply:"+inventoryOperationKey(intent.transactionId+":"+domain),demands:item.demands};
  }
  function compensationId(intent: TransactionIntent,domain:string) { return "compensate:"+inventoryOperationKey(intent.transactionId+":"+domain); }
  function evidence(intent: TransactionIntent, observations: Record<string,ParticipantObservation>) {
    return intent.participants.map(item=>{
      const observation=observations[item.domain];
      if(observation?.state!=="APPLIED"||!observation.apply)throw new Error("All required domains must have durable apply evidence");
      return {domain:item.domain,operationId:observation.apply.operationId,receiptHash:inventoryHash(observation.apply)};
    });
  }
  async function inspectFinal(intent: TransactionIntent, expectedReceipts?: ReturnType<typeof evidence>): Promise<"FINALIZED"|"PENDING"|"UNKNOWN"|"ABSENT"> {
    try {
      const order=JSON.parse(await fs.readFile(path.join(options.orderDir,intent.orderNumber+".json"),"utf8"));
      if(order.orderNumber!==intent.orderNumber||order.inventoryTransaction?.transactionId!==intent.transactionId
        ||order.inventoryTransaction?.intentHash!==inventoryHash(intent))return "UNKNOWN";
      if(order.inventoryTransaction.state==="inventory_committed"){
        if(expectedReceipts && inventoryHash(order.inventoryTransaction.participantReceipts)!==inventoryHash(expectedReceipts))return "UNKNOWN";
        return "FINALIZED";
      }
      return order.inventoryTransaction.state==="inventory_pending" ? "PENDING" : "UNKNOWN";
    } catch(error){return (error as NodeJS.ErrnoException).code==="ENOENT" ? "ABSENT":"UNKNOWN";}
  }
  function resourcesFor(input: TransactionIntent): CommerceLockResource[] {
    const journal=createCommerceTransactionJournal(options.orderDir,input.transactionId);
    return [
      {file:journal.lockFile,rank:0 as const,key:input.transactionId},
      orderGateResource(options.orderDir,input.orderNumber),
      ...input.participants.map(item=>registry.get(item.domain)!.resource),
      {file:path.join(options.orderDir,input.orderNumber+".json"),rank:3 as const,key:input.orderNumber.toLowerCase()+".json"},
    ];
  }
  async function execute(raw: TransactionIntent, newRequest: boolean, alreadyLocked = false): Promise<TransactionResult> {
    const input=validate(raw), journal=createCommerceTransactionJournal(options.orderDir,input.transactionId);
    const resources=resourcesFor(input);
    if (alreadyLocked) for (const resource of resources) assertCommerceLockHeld(resource.file);
    const locked=async():Promise<TransactionResult>=>{
      let entries;
      try { entries=await journal.read(); } catch { return {state:"REVIEW_REQUIRED",observations:{}}; }
      const prepared=entries[0]?.event;
      if(prepared&&prepared.type!=="PREPARED")return {state:"REVIEW_REQUIRED",observations:{}};
      const intent=prepared?.type==="PREPARED"?validate(prepared.intent):input;
      if(inventoryHash(intent)!==inventoryHash(input))throw new CommerceTransactionConflictError("Same transaction has different intent");
      const observations:Record<string,ParticipantObservation>={};
      const inspectAll=async()=>{
        for(const item of intent.participants) {
          try{observations[item.domain]=await registry.get(item.domain)!.inspect(operation(intent,item.domain),compensationId(intent,item.domain));}
          catch{observations[item.domain]={state:"UNKNOWN"};}
        }
      };
      const review=async(reason:string):Promise<TransactionResult>=>{
        try{await journal.append({type:"REVIEW_REQUIRED",reason});}catch{/* Pending order remains blocked. */}
        return {state:"REVIEW_REQUIRED",observations};
      };
      if(!entries.length) {
        if(!newRequest)return {state:"REVIEW_REQUIRED",observations};
        await journal.append({type:"PREPARED",intent});
        await options.hook?.("PREPARED");
        entries=await journal.read();
      }
      await inspectAll();
      for(const entry of entries){
        const event=entry.event;
        if(event.type==="APPLIED"||event.type==="COMPENSATED"){
          const receipt=event.type==="APPLIED"?observations[event.domain]?.apply:observations[event.domain]?.compensation;
          if(!receipt||inventoryHash(receipt)!==event.receiptHash)return review("Journal and participant receipt disagree");
        }
      }
      if(entries.some(item=>item.event.type==="REVIEW_REQUIRED"))return {state:"REVIEW_REQUIRED",observations};
      if(Object.values(observations).some(item=>item.state==="UNKNOWN"))return review("Participant result unknown");
      const final=await inspectFinal(intent);
      if(final==="UNKNOWN")return review("Order persistence ambiguous");
      if(entries.some(item=>item.event.type==="FINALIZED")||final==="FINALIZED"){
        if(!intent.participants.every(item=>observations[item.domain].state==="APPLIED"))return review("Final order participant evidence inconsistent");
        if(final!=="FINALIZED"||await inspectFinal(intent,evidence(intent,observations))!=="FINALIZED")return review("Finalization receipt disagrees with order");
        if(!entries.some(item=>item.event.type==="FINALIZED"))await journal.append({type:"FINALIZED"});
        return {state:"FINALIZED",observations};
      }
      if(final==="ABSENT") {
        try{
          const pending={...intent.order,orderNumber:intent.orderNumber,status:"inventory_pending",
            inventoryTransaction:{protocolVersion:1,transactionId:intent.transactionId,intentHash:inventoryHash(intent),state:"inventory_pending"}};
          await createOrderFile(options.orderDir,intent.orderNumber,pending,()=>{throw new CommerceTransactionConflictError("Order number collision requires replanning");});
        }catch{
          const current=await inspectFinal(intent);
          if(current!=="PENDING")return review("Pending order could not be confirmed");
        }
      }
      let abort=entries.some(item=>item.event.type==="ABORT"||item.event.type==="COMPENSATION_PENDING"||item.event.type==="COMPENSATED"||item.event.type==="ABORTED");
      if(!abort) {
        for(const item of intent.participants) {
          if(observations[item.domain].state==="COMPENSATED")return review("Compensation without durable abort intent");
          if(observations[item.domain].state==="APPLIED")continue;
          if(observations[item.domain].state!=="NOT_APPLIED")return review("Participant not eligible to apply");
          const adapter=registry.get(item.domain)!, op=operation(intent,item.domain);
          try{
            await adapter.apply(op);
            await options.hook?.("APPLIED",item.domain);
          }catch{
            observations[item.domain]=await adapter.inspect(op,compensationId(intent,item.domain));
            if(observations[item.domain].state==="UNKNOWN")return review("Apply result ambiguous");
            if(observations[item.domain].state!=="APPLIED"){
              // ABORT must be durable before any compensation can run.
              await journal.append({type:"ABORT",reason:"Participant apply failed"});
              abort=true;break;
            }
          }
          observations[item.domain]=await adapter.inspect(op,compensationId(intent,item.domain));
          if(observations[item.domain].state!=="APPLIED")return review("Apply lacks durable receipt");
          await journal.append({type:"APPLIED",domain:item.domain,receiptHash:inventoryHash(observations[item.domain].apply)});
        }
      }
      if(abort) {
        await inspectAll();
        if(Object.values(observations).some(item=>item.state==="UNKNOWN"))return review("Unknown participant prevents compensation");
        for(const item of [...intent.participants].reverse()){
          const observation=observations[item.domain];
          if(observation.state==="NOT_APPLIED"||observation.state==="COMPENSATED")continue;
          if(observation.state!=="APPLIED")return review("Invalid compensation state");
          await journal.append({type:"COMPENSATION_PENDING",domain:item.domain});
          const op=operation(intent,item.domain);
          try{
            await registry.get(item.domain)!.restore({...op,operationId:compensationId(intent,item.domain),parentOperationId:op.operationId});
            await options.hook?.("COMPENSATED",item.domain);
          }catch{
            observations[item.domain]=await registry.get(item.domain)!.inspect(op,compensationId(intent,item.domain));
            if(observations[item.domain].state==="UNKNOWN")return review("Compensation result ambiguous");
            if(observations[item.domain].state!=="COMPENSATED")return {state:"PENDING",observations};
          }
          observations[item.domain]=await registry.get(item.domain)!.inspect(op,compensationId(intent,item.domain));
          if(observations[item.domain].state!=="COMPENSATED")return review("Compensation lacks durable receipt");
          await journal.append({type:"COMPENSATED",domain:item.domain,receiptHash:inventoryHash(observations[item.domain].compensation)});
        }
        if(!intent.participants.every(item=>["NOT_APPLIED","COMPENSATED"].includes(observations[item.domain].state)))return review("Abort not fully compensated");
        await journal.append({type:"ABORTED"});
        return {state:"ABORTED",observations};
      }
      const receipts=evidence(intent,observations);
      await options.hook?.("BEFORE_FINALIZE");
      try {
        await (options.writeFinalOrder ?? withOrderFileUpdateLock)(options.orderDir,intent.orderNumber,async(order,persist)=>{
          if(order.status!=="inventory_pending"||order.inventoryTransaction&&typeof order.inventoryTransaction==="object"&&(order.inventoryTransaction as Record<string,unknown>).intentHash!==inventoryHash(intent))throw new Error("Order changed before finalize");
          for(const [field,value] of Object.entries(intent.order)){
            if(field!=="status"&&field!=="orderNumber"&&inventoryHash(order[field])!==inventoryHash(value))throw new Error("Immutable order intent changed");
          }
          return persist({...order,status:intent.finalStatus,
            inventoryTransaction:{protocolVersion:1,transactionId:intent.transactionId,intentHash:inventoryHash(intent),state:"inventory_committed",participantReceipts:receipts}});
        });
      }catch{
        const current=await inspectFinal(intent,receipts);
        if(current==="UNKNOWN"||current==="ABSENT")return review("Finalization result ambiguous");
        if(current!=="FINALIZED")return {state:"PENDING",observations};
      }
      if(await inspectFinal(intent,receipts)!=="FINALIZED")return review("Final order receipt verification failed");
      await options.hook?.("FINALIZED");
      await journal.append({type:"FINALIZED"});
      return {state:"FINALIZED",observations};
    };
    return (alreadyLocked ? locked() : withCommerceLockPlan(resources,locked,{timeoutMs:15000})).catch(error=>{
      if(error instanceof CommerceTransactionConflictError)throw error;
      // IO/journal/lock failures cannot authorize downstream success or remove stale locks.
      return {state:"PENDING" as const,observations:{}};
    });
  }

  /** Cancellation RESTORE uses its own durable journal, never aborts a finalized creation. */
  async function restore(originalRaw: TransactionIntent, cancellation: CancellationSnapshot, callbacks: {
    validateOrder(order: Record<string, unknown>): Promise<void>;
    commitOrder(order: Record<string, unknown>, intent: CancellationRestoreIntent, receipts: Array<{domain: string; operationId: string; receiptHash: string}>,
      persist: (order: Record<string, unknown>) => Promise<Record<string, unknown>>): Promise<void>;
    hook?: (phase: "PREPARED" | "RESTORED" | "BEFORE_CANCELLED" | "CANCELLED", domain?: string) => Promise<void>;
    finalizeOnly?: boolean;
    authorizationResources?: CommerceLockResource[];
  }): Promise<CancellationRestoreResult> {
    const original = validate(originalRaw);
    const transactionId = "order-cancel:" + inventoryOperationKey(original.orderNumber + ":" + original.transactionId);
    const originalJournal = createCommerceTransactionJournal(options.orderDir, original.transactionId);
    const journal = createCommerceTransactionJournal(options.orderDir, transactionId);
    const resources = [
      { file: originalJournal.lockFile, rank: 0 as const, key: original.transactionId },
      { file: journal.lockFile, rank: 0 as const, key: transactionId },
      orderGateResource(options.orderDir, original.orderNumber),
      ...original.participants.map(item => registry.get(item.domain)!.resource),
      { file: path.join(options.orderDir, original.orderNumber + ".json"), rank: 3 as const, key: original.orderNumber.toLowerCase() + ".json" },
      ...(callbacks.authorizationResources ?? []),
    ];
    const observations: Record<string, ParticipantObservation> = {};
    let intent: CancellationRestoreIntent | undefined;
    let newlyCancelled = false;
    const receiptRefs = () => original.participants.map(item => {
      const receipt = observations[item.domain]?.compensation;
      if (observations[item.domain]?.state !== "COMPENSATED" || !receipt) throw new Error("Every restore receipt must be proven");
      return { domain: item.domain, operationId: receipt.operationId, receiptHash: inventoryHash(receipt) };
    });
    const restoreId = (domain: string) => "cancel-restore:" + inventoryOperationKey(transactionId + ":" + domain);
    const result = (state: CancellationRestoreResult["state"]): CancellationRestoreResult => ({
      state, transactionId, observations, intent, newlyCancelled,
    });
    const locked = async (): Promise<CancellationRestoreResult> => {
      let creation, entries;
      try { creation = await originalJournal.read(); entries = await journal.read(); }
      catch { return result("REVIEW_REQUIRED"); }
      const prepared = creation[0]?.event;
      if (prepared?.type !== "PREPARED" || inventoryHash(prepared.intent) !== inventoryHash(original) ||
        !creation.some(entry => entry.event.type === "FINALIZED") ||
        creation.some(entry => ["ABORT","ABORTED","REVIEW_REQUIRED","COMPENSATED"].includes(entry.event.type))) return result("REVIEW_REQUIRED");
      const orderPath = path.join(options.orderDir, original.orderNumber + ".json");
      let order: Record<string, unknown>;
      try { order = JSON.parse(await fs.readFile(orderPath, "utf8")); } catch { return result("REVIEW_REQUIRED"); }
      await callbacks.validateOrder(order);
      const transaction = order.inventoryTransaction as Record<string, unknown> | undefined;
      if (transaction?.protocolVersion !== 1 || transaction.transactionId !== original.transactionId ||
        transaction.intentHash !== inventoryHash(original) || transaction.state !== "inventory_committed") return result("REVIEW_REQUIRED");
      // Financial/line snapshots stay exactly those used to create the original APPLY plan.
      for (const field of ["items","subtotal","shipping","total","orderMode","idempotencyKey","idempotencyRequestHash"]) {
        if (inventoryHash(order[field]) !== inventoryHash(original.order[field])) return result("REVIEW_REQUIRED");
      }
      for (const item of original.participants) {
        const op = operation(original, item.domain);
        observations[item.domain] = await registry.get(item.domain)!.inspect(op, restoreId(item.domain));
        const apply = observations[item.domain].apply;
        if (!apply || !["APPLIED","COMPENSATED"].includes(observations[item.domain].state) ||
          !creation.some(entry => entry.event.type === "APPLIED" && entry.event.domain === item.domain &&
            entry.event.receiptHash === inventoryHash(apply))) return result("REVIEW_REQUIRED");
      }
      const expectedApply = original.participants.map(item => ({
        domain: item.domain, operationId: observations[item.domain].apply!.operationId,
        receiptHash: inventoryHash(observations[item.domain].apply),
      }));
      if (inventoryHash(transaction.participantReceipts) !== inventoryHash(expectedApply)) return result("REVIEW_REQUIRED");
      const participants = original.participants.map(item => ({ ...item,
        applyOperationId: observations[item.domain].apply!.operationId,
        applyReceiptHash: inventoryHash(observations[item.domain].apply),
      }));
      if (entries.length) {
        const first = entries[0].event;
        if (first.type !== "RESTORE_PREPARED") return result("REVIEW_REQUIRED");
        intent = first.intent;
        if (intent.schemaVersion !== 1 || intent.transactionId !== transactionId ||
          intent.originalTransactionId !== original.transactionId || intent.orderNumber !== original.orderNumber ||
          intent.originalIntentHash !== inventoryHash(original) || inventoryHash(intent.participants) !== inventoryHash(participants)) return result("REVIEW_REQUIRED");
      } else {
        if (callbacks.finalizeOnly || original.participants.some(item => observations[item.domain].state === "COMPENSATED") ||
          order.status === "cancelled") return result("REVIEW_REQUIRED");
        intent = { schemaVersion: 1, transactionId, originalTransactionId: original.transactionId,
          originalIntentHash: inventoryHash(original), orderNumber: original.orderNumber, participants, cancellation };
        await journal.append({ type: "RESTORE_PREPARED", intent });
        await callbacks.hook?.("PREPARED");
      }
      if (entries.some(entry => entry.event.type === "REVIEW_REQUIRED")) return result("REVIEW_REQUIRED");
      const review = async (reason: string) => {
        await journal.append({ type: "REVIEW_REQUIRED", reason });
        return result("REVIEW_REQUIRED");
      };
      for (const entry of entries) {
        if (entry.event.type === "RESTORED" && (!observations[entry.event.domain]?.compensation ||
          inventoryHash(observations[entry.event.domain].compensation) !== entry.event.receiptHash)) return review("Restore journal and receipt disagree");
      }
      if (entries.some(entry => entry.event.type === "CANCELLED" || entry.event.type === "FINALIZED") &&
        (order.status !== "cancelled" || original.participants.some(item => observations[item.domain].state !== "COMPENSATED"))) {
        return review("Cancelled persistence and restore evidence disagree");
      }
      if (callbacks.finalizeOnly) {
        const marker = order.canonicalCancellation as Record<string, unknown> | undefined;
        const summary = order.fulfillmentSummary as Record<string, unknown> | undefined;
        const returned = order.inventoryReturn as Record<string, unknown> | undefined;
        if (order.status !== "cancelled" || marker?.state !== "completed" || summary?.state !== "cancelled" ||
          returned?.operationId !== transactionId || inventoryHash(returned.participantReceipts) !== inventoryHash(receiptRefs())) return result("PENDING");
        if (!entries.some(entry => entry.event.type === "FINALIZED")) await journal.append({ type: "FINALIZED" });
        return result("FINALIZED");
      }
      for (const item of original.participants) {
        if (observations[item.domain].state === "COMPENSATED") continue;
        if (order.status === "cancelled") return review("Cancelled order lacks required restore");
        const op = operation(original, item.domain);
        const beforeHash = observations[item.domain].snapshotHash;
        if (!beforeHash || !/^[a-f0-9]{64}$/.test(beforeHash)) return review("Restore pre-write evidence unavailable");
        const pending = [...entries].reverse().find(entry => entry.event.type === "RESTORE_PENDING" && entry.event.domain === item.domain)?.event;
        if (pending?.type === "RESTORE_PENDING" && pending.beforeHash !== beforeHash) return review("Missing restore receipt after changed participant snapshot");
        await journal.append({ type: "RESTORE_PENDING", domain: item.domain, beforeHash });
        try {
          await registry.get(item.domain)!.restore({ ...op, operationId: restoreId(item.domain), parentOperationId: op.operationId });
          await callbacks.hook?.("RESTORED", item.domain);
        } catch (error) {
          observations[item.domain] = await registry.get(item.domain)!.inspect(op, restoreId(item.domain));
          if (observations[item.domain].state === "UNKNOWN") return review("Restore result unknown");
          if (observations[item.domain].state !== "COMPENSATED") {
            if (observations[item.domain].snapshotHash !== beforeHash) return review("Restore failure changed snapshot without receipt");
            if (error instanceof Error && error.name === "InventoryParticipantRejectedError") return review("Restore identity missing or budget rejected");
            return result("PENDING");
          }
        }
        observations[item.domain] = await registry.get(item.domain)!.inspect(op, restoreId(item.domain));
        if (observations[item.domain].state !== "COMPENSATED") return review("Restore lacks durable receipt");
        await journal.append({ type: "RESTORED", domain: item.domain, receiptHash: inventoryHash(observations[item.domain].compensation) });
      }
      const receipts = receiptRefs();
      await callbacks.hook?.("BEFORE_CANCELLED");
      if (order.status !== "cancelled") {
        try {
          await withOrderFileUpdateLock(options.orderDir, original.orderNumber, (current, persist) =>
            callbacks.commitOrder(current, intent!, receipts, persist));
          newlyCancelled = true;
        } catch { return result("PENDING"); }
      }
      const current = JSON.parse(await fs.readFile(orderPath, "utf8"));
      const returned = current.inventoryReturn;
      if (current.status !== "cancelled" || returned?.operationId !== transactionId ||
        inventoryHash(returned.participantReceipts) !== inventoryHash(receipts)) return review("Cancelled order receipt mismatch");
      await callbacks.hook?.("CANCELLED");
      if (!entries.some(entry => entry.event.type === "CANCELLED")) await journal.append({ type: "CANCELLED" });
      return result("FINALIZED");
    };
    // Policy/authorization errors stay typed; ambiguous IO never authorizes completion.
    return withCommerceLockPlan(resources, locked, { timeoutMs: 15_000 });
  }

  return {
    restore,
    run:(intent:TransactionIntent)=>execute(intent,true),
    /** Trusted orchestration only: discover all resources before acquiring a sealed plan. */
    resources:(intent:TransactionIntent)=>resourcesFor(validate(intent)),
    /** Reuses exactly the same execution/recovery engine; every required lock must be held. */
    runLocked:(intent:TransactionIntent)=>execute(intent,true,true),
    /** Existing-only execution under the caller's complete sealed plan. */
    recoverLocked:(intent:TransactionIntent)=>execute(intent,false,true),
    recover:async(transactionId:string):Promise<TransactionResult>=>{
      try{
        const entries=await createCommerceTransactionJournal(options.orderDir,transactionId).read();
        const first=entries[0]?.event;
        if(first?.type!=="PREPARED")return {state:"REVIEW_REQUIRED",observations:{}};
        return execute(first.intent,false);
      }catch{return {state:"REVIEW_REQUIRED",observations:{}};}
    },
  };
}
