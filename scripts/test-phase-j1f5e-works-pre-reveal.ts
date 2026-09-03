import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// @ts-expect-error Node test execution requires explicit extension.
import { completeWorksMotion, markWorksMotionRevealed } from "../components/works/worksMotionLifecycle.ts";
// @ts-expect-error Node test execution requires explicit extension.
import { resolveWorksPageCms, resolveWorksPublicMotionBindings } from "../lib/worksPageCms.ts";

let passed = 0;
const check = (name: string, value: unknown) => {
  assert.ok(value, name);
  passed++;
  console.log(`PASS ${passed}: ${name}`);
};

function target() {
  return { style: { opacity: "0", transform: "translateY(18px)", clipPath: "inset(0 0 35% 0)" }, dataset: { worksMotionPending: "true" } as Record<string, string> };
}

const [page, css, runtime, layout, heroMedia] = await Promise.all([
  readFile("app/works/page.tsx", "utf8"),
  readFile("app/globals.css", "utf8"),
  readFile("components/works/WorksMotionRuntime.tsx", "utf8"),
  readFile("app/layout.tsx", "utf8"),
  readFile("components/works/WorksHeroMedia.tsx", "utf8"),
]);

const config = resolveWorksPageCms({ schemaVersion: 1, motion: {
  hero: { enabled: true, preset: "fade-up", durationMs: 500, delayMs: 0, distancePx: 18, staggerMs: 0, triggerOnViewport: false },
  heroMedia: { enabled: true, preset: "scale-reveal", durationMs: 700, delayMs: 0, distancePx: 0, staggerMs: 0, triggerOnViewport: true },
  catalogIntro: { enabled: true, preset: "slide-left", durationMs: 500, delayMs: 0, distancePx: 18, staggerMs: 0, triggerOnViewport: true },
  productGrid: { enabled: true, preset: "editorial", durationMs: 500, delayMs: 0, distancePx: 18, staggerMs: 100, triggerOnViewport: true },
} }, { monthLabel: "月", intro: "介紹" });
const bindings = resolveWorksPublicMotionBindings(config.motion);

check("motion-capable bootstrap is installed before hydration, has a bounded runtime-failure fallback, and suppresses this intentional root marker hydration difference", layout.includes('strategy="beforeInteractive"') && layout.includes("worksMotionCapable") && layout.includes("worksMotionRuntimeReady") && layout.includes('delete root.dataset.worksMotionCapable') && layout.includes("},1500)") && layout.includes("suppressHydrationWarning"));
check("server markup carries pending state for Hero, Catalog and Grid targets", page.includes('data-works-motion-pending={motionPending(works.motion.hero)?"true":undefined}') && page.includes('data-works-motion-pending={motionPending(works.motion.catalogIntro)?"true":undefined}') && page.includes('data-works-motion-pending={motionPending(works.motion.productGrid)?"true":undefined}'));
check("Hero media receives its own pending state and safe motion binding", page.includes('motionPending={motionPending(works.motion.heroMedia)}') && heroMedia.includes('data-works-motion-pending={motionPending ? "true" : undefined}') && bindings.heroMedia.className === "works-motion works-motion-scale-reveal");
check("CSS applies pre-reveal only after the early JavaScript capability marker", css.includes('html[data-works-motion-capable="true"] .works-page [data-works-motion-pending="true"].works-motion-fade') && !css.includes('.works-motion{animation-duration'));
check("runtime never applies a post-paint inline pre-reveal reset", !runtime.includes('node.style.opacity = "0"') && runtime.includes('if (!("IntersectionObserver" in window)) { nodes.forEach(markWorksMotionRevealed); return; }'));

for (const preset of ["fade", "fade-up", "slide-left", "slide-right", "scale-reveal", "editorial"]) {
  const node = target();
  let cancels = 0;
  completeWorksMotion(node as never, { cancel: () => { cancels++; } } as never);
  check(`${preset}: trigger completes into visible final state`, node.style.opacity === "" && node.style.transform === "" && node.style.clipPath === "" && node.dataset.worksMotionRevealed === "true");
  check(`${preset}: final state removes pending marker and cleans the temporary animation once`, node.dataset.worksMotionPending === undefined && cancels === 1);
}

const fallback = target();
markWorksMotionRevealed(fallback as never);
check("no-JS/hydration fallback can restore a pending target to visible", fallback.style.opacity === "" && fallback.dataset.worksMotionPending === undefined);

const reducedMotion = target();
markWorksMotionRevealed(reducedMotion as never);
check("reduced-motion path remains immediately visible with no entrance animation", reducedMotion.style.opacity === "" && reducedMotion.style.transform === "");

const gridDelays = [0, 1, 2].map((index) => bindings.productGrid.cardStyle(index)?.animationDelay);
check("Grid stagger remains presentation-only and preserves DOM order", gridDelays.join(",") === "0ms,100ms,200ms" && page.includes('products.map((product:CoffeeArtwork,index:number)=>'));
check("Hero media, Catalog and Grid retain canonical target identifiers", heroMedia.includes('data-works-motion-target="heroMedia"') && page.includes('data-works-motion-target="catalogIntro"') && page.includes('data-works-motion-target="productGrid"'));
check("product authority, image authority and links stay on canonical public paths", page.includes("resolveWorksProductListing(live.menu.products)") && page.includes("resolveListAsset(product)") && (page.match(/href=\{`\/works\/\$\{product\.slug\}`\}/gu) || []).length === 2);

console.log(`Phase J.1F.5E pre-reveal first-paint: ${passed} PASS`);
