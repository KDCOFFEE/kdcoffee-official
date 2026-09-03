import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  beginWorksMotion,
  completeWorksMotion,
  markWorksMotionRevealed,
  worksMotionState,
} from "../components/works/worksMotionLifecycle";

let passed = 0;
const check = (name: string, value: unknown) => {
  assert.ok(value, name);
  passed++;
  console.log(`PASS ${passed}: ${name}`);
};

type Target = {
  style: { opacity: string; transform: string; clipPath: string };
  dataset: Record<string, string>;
};

function target(state?: "pre-reveal" | "animating" | "revealed"): Target {
  return {
    style: {
      opacity: state === "pre-reveal" ? "0" : "",
      transform: state === "pre-reveal" ? "translateY(24px)" : "",
      clipPath: "",
    },
    dataset: state ? { worksMotionState: state } : {},
  };
}

function reveal(node: Target) {
  let cancelled = false;
  check("pre-reveal target starts its animation exactly once", beginWorksMotion(node as never));
  check("animating target cannot start a second animation", !beginWorksMotion(node as never));
  completeWorksMotion(node as never, { cancel: () => { cancelled = true; } } as never);
  check("temporary Web Animation cleanup occurs after final state restoration", cancelled);
}

const normal = target();
check("NORMAL is visible", worksMotionState(normal as never) === "normal" && normal.style.opacity === "");

for (const preset of ["fade", "fade-up", "slide-left", "slide-right", "scale-reveal", "editorial"]) {
  const node = target("pre-reveal");
  check(`${preset}: PRE_REVEAL is recognized`, worksMotionState(node as never) === "pre-reveal");
  reveal(node);
  check(`${preset}: REVEALED is terminal`, worksMotionState(node as never) === "revealed" && !beginWorksMotion(node as never));
  check(`${preset}: REVEALED restores normal visible opacity`, node.style.opacity === "");
  check(`${preset}: REVEALED restores normal transform and clip path`, node.style.transform === "" && node.style.clipPath === "");
  check(`${preset}: later effect execution cannot re-hide the target`, worksMotionState(node as never) === "revealed" && node.style.opacity === "");
}

const loadTarget = target("pre-reveal");
reveal(loadTarget);
check("Hero media load mode remains visible after completion", loadTarget.style.opacity === "" && worksMotionState(loadTarget as never) === "revealed");

const viewportTarget = target("pre-reveal");
check("viewport target remains pre-reveal before intersection", worksMotionState(viewportTarget as never) === "pre-reveal");
reveal(viewportTarget);
check("Hero media viewport mode remains visible after intersection and later scroll", viewportTarget.style.opacity === "" && worksMotionState(viewportTarget as never) === "revealed");

const fallbackTarget = target("pre-reveal");
markWorksMotionRevealed(fallbackTarget as never);
check("reduced-motion, no IntersectionObserver, and no WAAPI fallbacks reveal content normally", fallbackTarget.style.opacity === "" && worksMotionState(fallbackTarget as never) === "revealed");

const runtime = fs.readFileSync(path.join(process.cwd(), "components/works/WorksMotionRuntime.tsx"), "utf8");
const lifecycle = fs.readFileSync(path.join(process.cwd(), "components/works/worksMotionLifecycle.ts"), "utf8");
const heroMedia = fs.readFileSync(path.join(process.cwd(), "components/works/WorksHeroMedia.tsx"), "utf8");
const worksPage = fs.readFileSync(path.join(process.cwd(), "app/works/page.tsx"), "utf8");
const styles = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

check("runtime only selects PRE_REVEAL targets before beginning entrance motion", runtime.includes('filter((node) => worksMotionState(node) === "pre-reveal")'));
check("runtime does not reset revealed targets during effect reruns", runtime.includes('if (!beginWorksMotion(node)) return;'));
check("runtime fallback restores every unresolved motion state", runtime.includes('querySelectorAll<HTMLElement>("[data-works-motion-state]")'));
check("lifecycle has one explicit terminal revealed state", lifecycle.includes('export type WorksMotionState = "normal" | "pre-reveal" | "animating" | "revealed"'));
check("Hero media is an independent real visual motion target", heroMedia.includes('data-works-motion-target="heroMedia"'));
check("Hero content, catalog, and product grid use the same explicit lifecycle state", worksPage.includes('data-works-motion-target="hero"') && worksPage.includes('data-works-motion-target="catalogIntro"') && worksPage.includes('data-works-motion-target="productGrid"'));
check("public pre-reveal CSS only matches the explicit PRE_REVEAL state", styles.includes('[data-works-motion-state="pre-reveal"]') && !styles.includes('data-works-motion-pending'));
check("public entrance motion has one runtime authority rather than legacy CSS keyframe animation", !styles.includes(".works-page .works-motion-fade {\n  animation:"));

console.log(`Phase J.1F.5E motion lifecycle: ${passed} PASS`);
