import { selectMemberCreditTransactions, type MemberCreditTransaction } from "./memberCreditTransactions";
import type { CreditEntry } from "./membershipCommerce";
import { deriveMemberCreditBalances, storedCreditBalance, type PassbookBalanceState } from "./memberCreditRunningBalance";
import { selectMemberCreditEntryDetail, type CreditEntrySourceState, type MemberCreditEntryDetail } from "./memberCreditEntryDetail";

export const CREDIT_PASSBOOK_PAGE_SIZE = 20;

export type MemberCreditPassbookRow = {
  date: string;
  change: number;
  balanceAfter: number | null;
  descriptionKey: string;
  detail?: MemberCreditEntryDetail;
  transaction?: MemberCreditTransaction;
};

export type MemberCreditPassbookPage = {
  entries: MemberCreditPassbookRow[];
  nextOffset: number | null;
  nextCursor?: string | null;
};

/** A bounded, opaque sort position; identity always comes from the session. */
export function parseMemberCreditPassbookCursor(cursor: string): [string, string] {
  if (!/^[A-Za-z0-9_-]{1,2048}$/.test(cursor)) throw new Error("Invalid passbook cursor");
  const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "string"
    || (value[0] !== "" && (!/^\d{4}-\d{2}-\d{2}T/.test(value[0]) || !Number.isFinite(Date.parse(value[0]))))
    || typeof value[1] !== "string" || !value[1].length || value[1].length > 512) throw new Error("Invalid passbook cursor");
  return [value[0], value[1]];
}

function descriptionKey(entry: CreditEntry) {
  if (entry.sourceReference.startsWith("admin_credit_adjustment:")) {
    return entry.amount < 0 ? "credit.passbook.adminDeduction" : "credit.passbook.adminGrant";
  }
  if (entry.amount < 0) return "credit.passbook.reversal";
  if (entry.sourceType === "referral") return "credit.passbook.referral";
  if (entry.sourceType === "member_reward") return "credit.passbook.memberReward";
  if (entry.sourceReference.startsWith("retail_promotion_reward:")) return "credit.passbook.retailReward";
  return "credit.passbook.creditIssued";
}

/** Stored snapshots take precedence; otherwise use verified historical replay.
 * Replay sees the entire canonical member ledger before cursor/page selection.
 * remainingAmount alone is never mistaken for an account balance at issuance.
 */
export function selectMemberCreditPassbook(
  state: PassbookBalanceState & CreditEntrySourceState,
  memberId: string,
  offset = 0,
  cursor?: string,
): MemberCreditPassbookPage {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid passbook offset");
  const derived = deriveMemberCreditBalances(state, memberId);
  const position = cursor ? parseMemberCreditPassbookCursor(cursor) : null;
  const memberEntries = Object.values(state.creditEntries).filter((entry) => entry.memberId === memberId);
  // Keep existing entry append order; merge read-only reservation lifecycle rows
  // before pagination so history cannot hide settlement behind grant-only pages.
  const rows = memberEntries.map((entry) => {
    const detail = selectMemberCreditEntryDetail(state, memberId, entry.creditEntryId);
    return { id: entry.creditEntryId, row: {
      date: entry.createdAt, change: entry.amount,
      balanceAfter: storedCreditBalance(entry) ?? derived.balances.get(entry.creditEntryId) ?? null,
      descriptionKey: descriptionKey(entry), ...(detail ? { detail } : {}),
    } as MemberCreditPassbookRow };
  });
  for (const transaction of selectMemberCreditTransactions(state, memberId)) {
    rows.push({ id: "reservation:" + transaction.eventId, row: {
      date: transaction.reservedAt ?? transaction.statusRecordedAt ?? "",
      change: transaction.status === "released" ? 0 : -transaction.amount,
      balanceAfter: null, descriptionKey: "", transaction,
    } });
  }
  const time = (value: string) => Date.parse(value) || 0;
  const appendIndex = new Map(rows.map((item, index) => [item.id, index]));
  const anchor = position ? rows.find(item => item.id === position[1] && item.row.date === position[0]) : null;
  if (position && !anchor) throw new Error("Unknown passbook cursor position");
  const entries = rows.filter(item => !position || time(item.row.date) < time(position[0])
    || (time(item.row.date) === time(position[0]) && appendIndex.get(item.id)! < appendIndex.get(position[1])!))
    .sort((a, b) => time(b.row.date) - time(a.row.date) || appendIndex.get(b.id)! - appendIndex.get(a.id)!);
  const start = cursor ? 0 : offset;
  const selected = entries.slice(start, start + CREDIT_PASSBOOK_PAGE_SIZE);
  const last = selected.at(-1);
  const hasMore = start + CREDIT_PASSBOOK_PAGE_SIZE < entries.length;
  return {
    entries: selected.map(item => item.row),
    nextOffset: hasMore ? offset + CREDIT_PASSBOOK_PAGE_SIZE : null,
    nextCursor: hasMore && last ? Buffer.from(JSON.stringify([last.row.date, last.id])).toString("base64url") : null,
  };
}
