import { approvedReturnLines, type ReturnDomainEvent } from "./orderReturns";
import type { ReturnCreditEntry } from "./returnCreditPreview";

/** Freeze approved unit contributions from the immutable request, never from a current balance.
 * Historical full approvals remain supported; unproven historical partial attribution fails closed. */
export function approvedReturnCreditSelection(request: Extract<ReturnDomainEvent, {type:"RETURN_REQUESTED"}>, approval: Extract<ReturnDomainEvent, {type:"RETURN_APPROVED"}>, zeroCreditProven = false): ReturnCreditEntry[] {
  const saved = request.confirmation?.preview;
  if (!saved) { if (zeroCreditProven) return []; throw Error("missing_return_credit_snapshot"); }
  const approved = approvedReturnLines(request, approval);
  let amount = 0;
  for (const line of approved) {
    const original = saved.lines.find(item => item.returnLineRef === line.returnLineRef);
    if (!original) throw Error("missing_return_credit_line");
    if (line.quantity === original.quantity) amount += original.attributedCreditAmount;
    else {
      const units = original.unitCreditAmounts;
      if (!units || units.length !== original.quantity || units.some(value => !Number.isSafeInteger(value) || value < 0)
        || units.reduce((sum,value)=>sum+value,0) !== original.attributedCreditAmount) throw Error("unproven_partial_credit_attribution");
      amount += units.slice(0,line.quantity).reduce((sum,value)=>sum+value,0);
    }
  }
  const selected: ReturnCreditEntry[] = [];
  for (const source of saved.entries) {
    const take = Math.min(amount,source.amount);
    if (take) selected.push({...source,amount:take});
    amount -= take;
  }
  if (amount !== 0) throw Error("insufficient_selected_credit");
  return selected;
}
