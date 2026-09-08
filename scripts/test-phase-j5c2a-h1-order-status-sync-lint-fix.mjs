import fs from "node:fs";

const source = fs.readFileSync("components/admin/OrderStatusForm.tsx", "utf8");

const checks = [
  ["no effect-based prop sync", !source.includes("useEffect") && !source.includes("setStatus(initialStatus);")],
  ["wrapper remounts form when server status changes", source.includes("OrderStatusFormInner") && source.includes("const refreshKey = `${props.orderNumber}:${props.initialStatus}:${props.initialTracking || \"\"}`;")],
  ["notification action id no longer reads a ref during render", !source.includes("notificationActionId.current") && source.includes("const [notificationActionId, setNotificationActionId]")],
  ["notification action id can still rotate after save", source.includes("setNotificationActionId(crypto.randomUUID())")],
  ["existing order save path preserved", source.includes("runOrderStatusSave") && source.includes("/api/admin/orders/")],
];

let pass = 0;
for (const [name, ok] of checks) {
  if (!ok) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
  } else {
    pass += 1;
    console.log(`PASS ${++pass}: ${name}`);
  }
}
if (!process.exitCode) console.log(`\nJ.5C.2A-H1 targeted regression complete: ${pass} PASS`);
