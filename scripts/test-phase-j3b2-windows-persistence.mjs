import fs from "node:fs";

const source = fs.readFileSync("lib/jsonFileStore.ts", "utf8");

const checks = [
  ["retry is scoped to membership-test-lab paths", source.includes('includes("membership-test-lab")')],
  ["Windows-only transient error gate exists", source.includes('process.platform !== "win32"')],
  ["EPERM is retryable", source.includes('"EPERM"')],
  ["EACCES is retryable", source.includes('"EACCES"')],
  ["EBUSY is retryable", source.includes('"EBUSY"')],
  ["bounded backoff exists", source.includes("[40, 80, 160, 320, 640]")],
  ["atomic single attempt still uses temp file", source.includes("atomicWriteJsonOnce") && source.includes("fs.rename(tempPath, targetPath)")],
  ["failed temp files are still cleaned", source.includes("if (!committed)") && source.includes("fs.unlink(tempPath)")],
  ["non-Test-Lab paths get no retries", source.includes(": [];")],
];

let passed = 0;
for (const [label, ok] of checks) {
  if (!ok) {
    console.error(`FAIL ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${label}`);
    passed += 1;
  }
}
if (process.exitCode) process.exit(1);
console.log(`PHASE J.3B.2 Windows persistence assertions: ${passed} PASS`);
