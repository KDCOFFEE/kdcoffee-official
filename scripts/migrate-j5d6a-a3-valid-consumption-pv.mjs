import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function explicitRoot() {
  const configured = process.env.KD_DATA_DIR?.trim();
  if (configured) return configured;

  const railway = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
  if (railway) return railway;

  return "";
}

function dataPaths() {
  const root = explicitRoot();

  return {
    commerceFile: root
      ? path.join(root, "membership-commerce", "commerce-state.json")
      : path.join(process.cwd(), "data", "membership-commerce", "commerce-state.json"),

    ordersDir: root
      ? path.join(root, "orders")
      : path.join(process.cwd(), "data", "orders"),
  };
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function orderSnapshotPV(order) {
  if (!Array.isArray(order.items) || order.items.length === 0) {
    return {
      ok: false,
      reason: "ORDER_HAS_NO_ITEMS",
      pv: null,
    };
  }

  let total = 0;

  for (const item of order.items) {
    if (!isRecord(item)) {
      return {
        ok: false,
        reason: "INVALID_ORDER_ITEM",
        pv: null,
      };
    }

    const quantityRaw = safeNumber(item.quantity);
    const quantity = quantityRaw == null ? 1 : Math.max(1, quantityRaw);

    let pv = null;

    if (item.effectivePV !== undefined && item.effectivePV !== null) {
      pv = safeNumber(item.effectivePV);
    } else if (item.basePV !== undefined && item.basePV !== null) {
      pv = safeNumber(item.basePV);
    }

    if (pv == null || pv < 0) {
      return {
        ok: false,
        reason: "PV_EVIDENCE_MISSING",
        pv: null,
      };
    }

    total += pv * quantity;
  }

  if (!Number.isFinite(total) || total < 0) {
    return {
      ok: false,
      reason: "PV_TOTAL_INVALID",
      pv: null,
    };
  }

  return {
    ok: true,
    reason: "COMPLETE_ORDER_SNAPSHOT",
    pv: total,
  };
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { commerceFile, ordersDir } = dataPaths();

  const raw = await fs.readFile(commerceFile, "utf8");
  const state = JSON.parse(raw);

  if (!isRecord(state.validConsumptionEvents)) {
    throw new Error("validConsumptionEvents missing or invalid");
  }

  const planned = [];
  const blocked = [];

  for (const [eventId, event] of Object.entries(state.validConsumptionEvents)) {
    if (!isRecord(event)) {
      blocked.push({
        eventId,
        orderId: null,
        reason: "INVALID_EVENT",
      });
      continue;
    }

    if (event.validConsumptionPV !== undefined && event.validConsumptionPV !== null) {
      continue;
    }

    const orderId = typeof event.sourceOrderId === "string"
      ? event.sourceOrderId
      : "";

    if (!orderId) {
      blocked.push({
        eventId,
        orderId: null,
        reason: "ORDER_ID_MISSING",
      });
      continue;
    }

    const orderFile = path.join(ordersDir, `${orderId}.json`);

    let order;

    try {
      order = await readJson(orderFile);
    } catch {
      blocked.push({
        eventId,
        orderId,
        reason: "ORDER_MISSING_OR_UNREADABLE",
      });
      continue;
    }

    const evidence = orderSnapshotPV(order);

    if (!evidence.ok) {
      blocked.push({
        eventId,
        orderId,
        reason: evidence.reason,
      });
      continue;
    }

    planned.push({
      eventId,
      orderId,
      validConsumptionPV: evidence.pv,
    });
  }

  console.log("");
  console.log("=== J.5D.6A A3 HISTORICAL KD POINT MIGRATION ===");
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  console.log(`Commerce file: ${commerceFile}`);
  console.log(`Orders dir: ${ordersDir}`);
  console.log(`Planned backfills: ${planned.length}`);
  console.log(`Blocked records: ${blocked.length}`);
  console.log("");

  for (const row of planned) {
    console.log(
      `PLAN ${row.eventId} | ${row.orderId} | validConsumptionPV=${row.validConsumptionPV}`,
    );
  }

  for (const row of blocked) {
    console.log(
      `BLOCKED ${row.eventId} | ${row.orderId ?? "-"} | ${row.reason}`,
    );
  }

  if (blocked.length > 0) {
    throw new Error(
      "Migration blocked: one or more historical events lack complete immutable order PV evidence",
    );
  }

  if (!apply) {
    console.log("");
    console.log("DRY RUN PASS: no files modified.");
    return;
  }

  if (planned.length === 0) {
    console.log("");
    console.log("APPLY PASS: nothing to migrate.");
    return;
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);

  const backupFile = `${commerceFile}.pre-j5d6a-a3-${timestamp}.bak`;

  await fs.copyFile(commerceFile, backupFile);

  const backupRaw = await fs.readFile(backupFile, "utf8");

  if (sha256(backupRaw) !== sha256(raw)) {
    throw new Error("Backup verification failed");
  }

  for (const row of planned) {
    const event = state.validConsumptionEvents[row.eventId];

    if (!isRecord(event)) {
      throw new Error(`Event disappeared before apply: ${row.eventId}`);
    }

    if (event.validConsumptionPV !== undefined && event.validConsumptionPV !== null) {
      throw new Error(`Event changed before apply: ${row.eventId}`);
    }

    event.validConsumptionPV = row.validConsumptionPV;
  }

  const tempFile = `${commerceFile}.j5d6a-a3.tmp`;

  await fs.writeFile(
    tempFile,
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8",
  );

  const verify = JSON.parse(await fs.readFile(tempFile, "utf8"));

  for (const row of planned) {
    const migrated = verify.validConsumptionEvents?.[row.eventId];

    if (!isRecord(migrated)) {
      throw new Error(`Verification missing event: ${row.eventId}`);
    }

    if (Number(migrated.validConsumptionPV) !== row.validConsumptionPV) {
      throw new Error(`Verification mismatch: ${row.eventId}`);
    }
  }

  await fs.rename(tempFile, commerceFile);

  console.log("");
  console.log(`Backup: ${backupFile}`);
  console.log(`Applied backfills: ${planned.length}`);
  console.log("APPLY PASS: only validConsumptionPV fields were added.");
}

main().catch((error) => {
  console.error("");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});