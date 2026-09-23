import assert from "node:assert/strict";

import {
  DEFAULT_MEMBERSHIP_RULES,
  normalizeMembershipBusinessRules,
} from "../lib/membershipBusinessRules";
import {
  createAtmTransferSnapshot,
  isAtmTransferConfigured,
  publicAtmTransferSettings,
} from "../lib/homeDeliveryPayment";

const legacy = structuredClone(DEFAULT_MEMBERSHIP_RULES) as unknown as Record<string, unknown>;
delete legacy.payment;
const normalized = normalizeMembershipBusinessRules(legacy);
assert.equal(normalized.payment.atmTransfer.bankName, "");
assert.equal(normalized.payment.atmTransfer.showBankbookImageAtCheckout, false);
assert.equal(isAtmTransferConfigured(normalized), false);

const configured = structuredClone(DEFAULT_MEMBERSHIP_RULES);
configured.payment.atmTransfer = {
  bankName: "測試銀行",
  bankCode: "007",
  branchName: "測試分行",
  accountName: "KD Coffee 測試",
  accountNumber: "001122334455",
  instructions: "測試轉帳說明",
  bankbookImageUrl: "/uploads/artworks/payment/test-bankbook.webp",
  showBankbookImageAtCheckout: false,
};
assert.equal(isAtmTransferConfigured(configured), true);
let publicSettings = publicAtmTransferSettings(configured);
assert.equal(publicSettings.configured, true);
assert.equal(publicSettings.accountNumber, "001122334455");
assert.equal(publicSettings.bankbookImageUrl, null);
assert.equal(publicSettings.showBankbookImageAtCheckout, false);

let snapshot = createAtmTransferSnapshot(configured);
assert.equal(snapshot.accountNumber, "001122334455");
assert.equal(snapshot.showBankbookImage, false);

configured.payment.atmTransfer.showBankbookImageAtCheckout = true;
publicSettings = publicAtmTransferSettings(configured);
assert.equal(publicSettings.bankbookImageUrl, "/uploads/artworks/payment/test-bankbook.webp");
assert.equal(publicSettings.showBankbookImageAtCheckout, true);
snapshot = createAtmTransferSnapshot(configured);
assert.equal(snapshot.showBankbookImage, true);

const changed = structuredClone(configured);
changed.payment.atmTransfer.accountNumber = "998877665544";
assert.equal(snapshot.accountNumber, "001122334455", "existing order snapshot must remain immutable");
assert.equal(createAtmTransferSnapshot(changed).accountNumber, "998877665544");

const incomplete = structuredClone(configured);
incomplete.payment.atmTransfer.accountNumber = "";
assert.equal(isAtmTransferConfigured(incomplete), false);
assert.throws(() => createAtmTransferSnapshot(incomplete), /ATM 轉帳資訊尚未完整設定/);

console.log("PASS: Phase 2D ATM transfer settings — 16 checks");
