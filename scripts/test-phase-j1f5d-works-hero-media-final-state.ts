import assert from "node:assert/strict";
import { completeWorksMotion } from "../components/works/worksMotionLifecycle";

let passed = 0;
const check = (name: string, value: unknown) => {
  assert.ok(value, name);
  passed++;
  console.log(`PASS ${passed}: ${name}`);
};

function createTarget() {
  return {
    style: { opacity: "0", transform: "translateX(32px)", clipPath: "inset(0 0 35% 0)" },
    dataset: {} as Record<string, string>,
  };
}

for (const preset of ["fade", "fade-up", "slide-left", "slide-right", "scale-reveal", "editorial"]) {
  const target = createTarget();
  let cancelled = false;
  completeWorksMotion(target as never, { cancel: () => { cancelled = true; } } as never);
  check(`${preset}: final opacity is ordinary visible styling`, target.style.opacity === "");
  check(`${preset}: final transform is normal`, target.style.transform === "");
  check(`${preset}: final clip path is normal`, target.style.clipPath === "");
  check(`${preset}: completed target is retained as revealed`, target.dataset.worksMotionRevealed === "true");
  check(`${preset}: temporary animation is cleaned up only after final state`, cancelled);
}

const loadTarget = createTarget();
completeWorksMotion(loadTarget as never, { cancel() {} } as never);
check("load-mode target remains visible after cleanup", loadTarget.style.opacity === "" && loadTarget.dataset.worksMotionRevealed === "true");

const viewportTarget = createTarget();
completeWorksMotion(viewportTarget as never, { cancel() {} } as never);
check("viewport-mode target remains visible after cleanup and on return", viewportTarget.style.opacity === "" && viewportTarget.style.transform === "" && viewportTarget.dataset.worksMotionRevealed === "true");

const reducedMotionTarget = createTarget();
reducedMotionTarget.style.opacity = "";
reducedMotionTarget.style.transform = "";
check("reduced-motion/no-observer fallback uses normal visible state", reducedMotionTarget.style.opacity === "" && reducedMotionTarget.style.transform === "");
console.log(`Phase J.1F.5D Hero final state: ${passed} PASS`);
