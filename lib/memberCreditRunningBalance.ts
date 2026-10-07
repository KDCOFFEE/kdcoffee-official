import type { CreditEntry, CreditReservation, MembershipCommerceState } from "./membershipCommerce";

export type PassbookBalanceState = Pick<MembershipCommerceState, "creditEntries">
  & Partial<Pick<MembershipCommerceState, "creditReservations" | "updatedAt">>;

export function storedCreditBalance(entry: CreditEntry): number | null {
  const after = entry.metadata.balanceAfter;
  const before = entry.metadata.balanceBefore;
  if (!Number.isSafeInteger(after) || Number(after) < 0) return null;
  if (before !== undefined && (!Number.isSafeInteger(before) || Number(before) < 0 || Number(before) + entry.amount !== after)) return null;
  return Number(after);
}

type Source = { remaining: number; debit: number; expires: number; status: CreditEntry["status"] };
type TimelineEvent = { at: number; priority: number; ordinal: number; entry?: CreditEntry; reservation?: CreditReservation; action?: "reserve" | "release" | "consume"; expires?: string };

/** Read-only historical availability projection. Never sum a page in isolation.
 * Physical remainders are replayed from canonical allocations; Owner debits stay
 * separate, matching effectiveCreditRemaining. Expiry affects availability, not
 * the original amount. No canonical entry, reservation or snapshot is written.
 */
export function deriveMemberCreditBalances(state: PassbookBalanceState, memberId: string) {
  const balances = new Map<string, number>();
  const unknown = (reason: string) => ({ balances: new Map<string, number>(), reason });
  if (!state.creditReservations) return unknown("missing_reservation_context");
  const entries = Object.values(state.creditEntries).filter((entry) => entry.memberId === memberId);
  const byId = new Map(entries.map((entry) => [entry.creditEntryId, entry]));
  if (byId.size !== entries.length) return unknown("duplicate_entry_identity");
  const events: TimelineEvent[] = [];
  const ambiguousTimes = new Set<number>();
  const reservations = Object.values(state.creditReservations).filter((item) => item.memberId === memberId);
  const amountValid = (amount: number) => Number.isSafeInteger(amount) && amount >= 0;
  const allocationsValid = (allocations: CreditReservation["allocations"], amount: number) =>
    Array.isArray(allocations) && allocations.every((allocation) => amountValid(allocation.amount)
      && allocation.amount > 0 && (byId.get(allocation.creditEntryId)?.amount ?? 0) > 0)
    && allocations.reduce((sum, allocation) => sum + allocation.amount, 0) === amount;
  for (const [ordinal, entry] of entries.entries()) {
    const at = Date.parse(entry.createdAt);
    const expires = Date.parse(entry.expiresAt);
    if (!Number.isFinite(at) || !Number.isFinite(expires) || !Number.isSafeInteger(entry.amount)
      || !amountValid(entry.remainingAmount)) return unknown("invalid_entry");
    if (entry.amount > 0) {
      events.push({ at: expires, priority: 0, ordinal, expires: entry.creditEntryId });
    } else if (entry.sourceReference.startsWith("admin_credit_adjustment:deduct:")) {
      if (!allocationsValid(entry.adjustmentAllocations ?? [], -entry.amount)) return unknown("incomplete_owner_allocations");
    } else if (!(entry.sourceReference.startsWith("referral_reward_reversal:") || entry.sourceReference.startsWith("retail_promotion_reward_reversal:"))
      || typeof entry.metadata.reversesCreditEntryId !== "string"
      || !byId.has(entry.metadata.reversesCreditEntryId)) return unknown("unlinked_reversal");
    events.push({ at, priority: 1, ordinal, entry });
  }
  for (const [ordinal, reservation] of reservations.entries()) {
    const at = Date.parse(reservation.createdAt), updated = Date.parse(reservation.updatedAt);
    if (!Number.isFinite(at) || !Number.isFinite(updated) || updated < at || !amountValid(reservation.amount)
      || !allocationsValid(reservation.allocations, reservation.amount)
      || !["reserved", "released", "consumed"].includes(reservation.status)) return unknown("incomplete_reservation");
    if (!reservation.amount) continue;
    events.push({ at, priority: 2, ordinal, reservation, action: "reserve" });
    ambiguousTimes.add(at);
    if (reservation.status !== "reserved") {
      events.push({ at: updated, priority: 3, ordinal, reservation, action: reservation.status === "released" ? "release" : "consume" });
      ambiguousTimes.add(updated);
    }
  }
  const lastOperation = events.filter((event) => !event.expires).reduce((latest, event) => Math.max(latest, event.at), 0);
  const asOf = Math.max(lastOperation, Date.parse(state.updatedAt ?? "") || lastOperation);
  events.sort((a, b) => a.at - b.at || a.priority - b.priority || a.ordinal - b.ordinal);
  const sources = new Map<string, Source>();
  let balance = 0;
  let invalid = false;
  const available = (source: Source, at: number) => source.expires <= at
    || !["available", "reserved"].includes(source.status) ? 0 : Math.max(0, source.remaining - source.debit);
  function changeSource(id: string, at: number, change: (source: Source) => void) {
    const source = sources.get(id);
    if (!source) { invalid = true; return; }
    const before = available(source, at);
    change(source);
    balance += available(source, at) - before;
    if (!amountValid(source.remaining) || !amountValid(source.debit) || !amountValid(balance)) invalid = true;
  }
  for (const event of events) {
    if (event.expires) {
      if (event.at > lastOperation) continue;
      // The pre-expiry contribution is removed at the exact boundary.
      const source = sources.get(event.expires);
      if (source) {
        balance -= ["available", "reserved"].includes(source.status) ? Math.max(0, source.remaining - source.debit) : 0;
        source.status = "expired";
      }
      continue;
    }
    const entry = event.entry;
    if (entry) {
      if (entry.amount > 0) {
        const source: Source = { remaining: entry.amount, debit: 0, expires: Date.parse(entry.expiresAt), status: "available" };
        sources.set(entry.creditEntryId, source);
        balance += available(source, event.at);
      } else if (entry.sourceReference.startsWith("admin_credit_adjustment:deduct:")) {
        for (const allocation of entry.adjustmentAllocations ?? []) changeSource(allocation.creditEntryId, event.at, (source) => {
          if (allocation.amount > available(source, event.at)) invalid = true;
          source.debit += allocation.amount;
        });
      } else {
        changeSource(String(entry.metadata.reversesCreditEntryId), event.at, (source) => {
          source.remaining = Math.max(0, source.remaining + entry.amount);
          if (!source.remaining) source.status = "consumed";
        });
      }
      if (!amountValid(balance)) invalid = true;
      // Same-millisecond reservation/entry interleaving is not provable from
      // timestamps alone. Stored snapshots remain usable for these rows.
      if (!ambiguousTimes.has(event.at)) balances.set(entry.creditEntryId, balance);
      const stored = storedCreditBalance(entry);
      if (stored !== null && !ambiguousTimes.has(event.at) && stored !== balance) return unknown("snapshot_sequence_mismatch");
    } else if (event.reservation) {
      for (const allocation of event.reservation.allocations) changeSource(allocation.creditEntryId, event.at, (source) => {
        if (event.action === "reserve") {
          if (allocation.amount > available(source, event.at)) invalid = true;
          source.remaining -= allocation.amount;
          source.status = available(source, event.at) === 0 ? "reserved" : "available";
        } else if (event.action === "release") {
          source.remaining += allocation.amount;
          source.status = source.expires <= event.at ? "expired" : "available";
        } else if (available(source, event.at) === 0) source.status = "consumed";
      });
    }
    if (invalid) return unknown("inconsistent_event_sequence");
  }
  for (const entry of entries.filter((item) => item.amount > 0)) {
    const source = sources.get(entry.creditEntryId)!;
    if (source.remaining !== entry.remainingAmount) return unknown("unexplained_remaining_change");
    const actualAvailable = ["available", "reserved"].includes(entry.status) && Date.parse(entry.expiresAt) > asOf
      ? Math.max(0, entry.remainingAmount - source.debit) : 0;
    if (available(source, asOf) !== actualAvailable) return unknown("unexplained_status_change");
  }
  return { balances, reason: balances.size < entries.length ? "ambiguous_transaction_timestamp" : null };
}
