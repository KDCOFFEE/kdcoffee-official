import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 15) || (major === 23 && minor < 5)) {
  console.error("Return QA requires Node with registerHooks and native TypeScript stripping; verified with Node v24.18.0.");
  process.exitCode = 1;
} else {
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  const env = { ...process.env, RETURN_QA_PORT: "3161" };
  // The launcher owns loader order; don't inherit a shell's tsx/SSR-test loader.
  delete env.NODE_OPTIONS;
  const child = spawn(process.execPath, [
    "--experimental-strip-types", "--import", new URL("./return-workflow-qa-bootstrap.mjs", import.meta.url).href,
    fileURLToPath(new URL("./serve-return-workflow-qa.mts", import.meta.url)),
  ], { cwd: projectRoot, env, stdio: "inherit", windowsHide: true });
  let stopping = false;
  const stop = () => {
    if (stopping || !child.pid) return;
    stopping = true;
    if (process.platform === "win32") {
      // Stop only this launcher's child tree, including Next's dev worker.
      const cleanup = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      cleanup.on("error", () => child.kill());
    } else child.kill("SIGTERM");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("error", error => { console.error(error.message); process.exitCode = 1; });
  child.on("exit", (code, signal) => {
    if (!stopping && (code || signal)) console.error(`Return QA exited (${code ?? signal}).`);
    process.exitCode = stopping ? 0 : code ?? 1;
  });
}
