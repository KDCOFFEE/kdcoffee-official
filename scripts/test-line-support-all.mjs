import { spawnSync } from "node:child_process";
for (const file of ["scripts/test-line-auto-reply.mts", "scripts/test-line-support-tree.mts", "scripts/test-line-auto-j6.mts"]) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--import", "./scripts/line-messaging-test-bootstrap.mjs", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
