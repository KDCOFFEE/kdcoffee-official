import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// @ts-expect-error Node's TypeScript stripping requires an explicit extension.
import { installWorksMotionBootstrap } from "../components/works/worksMotionBootstrap.ts";
// @ts-expect-error Node's TypeScript stripping requires an explicit extension.
import { beginWorksMotion, claimWorksMotionRuntime, completeWorksMotion, releaseWorksMotionRuntime, resolveWorksMotionTiming, worksMotionState } from "../components/works/worksMotionLifecycle.ts";
// @ts-expect-error Node's TypeScript stripping requires an explicit extension.
import { resolveWorksPageCms, resolveWorksPublicMotionBindings } from "../lib/worksPageCms.ts";

let checks = 0;
const check = (condition: unknown, label: string) => {
  assert.ok(condition, label);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`);
};

const [layout, bootstrap, runtime, lifecycle, page, css, heroMedia, pagesJson] = await Promise.all([
  readFile("app/layout.tsx", "utf8"),
  readFile("components/works/worksMotionBootstrap.ts", "utf8"),
  readFile("components/works/WorksMotionRuntime.tsx", "utf8"),
  readFile("components/works/worksMotionLifecycle.ts", "utf8"),
  readFile("app/works/page.tsx", "utf8"),
  readFile("app/globals.css", "utf8"),
  readFile("components/works/WorksHeroMedia.tsx", "utf8"),
  readFile("public/data/pages.json", "utf8"),
]);

check(layout.includes('data-works-motion-capable="true"'), "deterministic SSR capability marker exists");
check(!layout.includes("next/script") && !layout.includes("<Script"), "RootLayout does not render a Script bootstrap");
check(layout.includes("<WorksMotionBootstrapClient />"), "RootLayout retains the client bootstrap without raw script markup");
check(!layout.includes("suppressHydrationWarning"), "first-paint marker does not hide a hydration mismatch");
check(runtime.includes("claimWorksMotionRuntime(documentRoot)"), "Works runtime synchronously claims capability and readiness");
check(runtime.includes('window.dispatchEvent(new Event("works-motion-runtime-ready"))'), "runtime keeps the readiness notification event");

type Root = { dataset: { worksMotionCapable?: string; worksMotionRuntimeReady?: string } };
const alreadyReadyRoot: Root = { dataset: { worksMotionCapable: "true", worksMotionRuntimeReady: "true" } };
let alreadyReadyTimers = 0;
let alreadyReadyListeners = 0;
const cleanupAlreadyReady = installWorksMotionBootstrap(alreadyReadyRoot, {
  addEventListener() { alreadyReadyListeners += 1; },
  removeEventListener() { alreadyReadyListeners -= 1; },
  setTimeout() { alreadyReadyTimers += 1; return 1; },
  clearTimeout() {},
} as never);
check(alreadyReadyTimers === 0, "already-ready runtime never arms the 1500ms fallback");
check(alreadyReadyListeners === 0, "already-ready runtime does not depend on replaying its event");
cleanupAlreadyReady();
check(alreadyReadyRoot.dataset.worksMotionRuntimeReady === "true", "bootstrap cleanup preserves a valid runtime-ready marker");

const listeners = new Map<string, EventListener>();
let fallback: (() => void) | undefined;
let timeoutDelay = 0;
let clearedTimer = false;
const fakeWindow = {
  addEventListener(type: string, listener: EventListener) { listeners.set(type, listener); },
  removeEventListener(type: string) { listeners.delete(type); },
  setTimeout(callback: () => void, delay: number) { fallback = callback; timeoutDelay = delay; return 19; },
  clearTimeout(timer: number) { if (timer === 19) clearedTimer = true; },
};
const laterReadyRoot: Root = { dataset: { worksMotionCapable: "true" } };
const cleanupLaterReady = installWorksMotionBootstrap(laterReadyRoot, fakeWindow as never);
check(timeoutDelay === 1500, "genuinely absent runtime retains the bounded 1500ms safety window");
listeners.get("works-motion-runtime-ready")?.(new Event("works-motion-runtime-ready"));
check(laterReadyRoot.dataset.worksMotionRuntimeReady === "true", "later readiness event publishes durable ready state");
check(clearedTimer, "later readiness cancels the pending fallback immediately");
fallback?.();
check(laterReadyRoot.dataset.worksMotionCapable === "true", "stale fallback callback cannot clear a ready runtime capability");
cleanupLaterReady();
check(laterReadyRoot.dataset.worksMotionRuntimeReady === "true", "listener cleanup does not erase runtime ownership");

let missingFallback: (() => void) | undefined;
const missingRoot: Root = { dataset: { worksMotionCapable: "true" } };
installWorksMotionBootstrap(missingRoot, {
  addEventListener() {}, removeEventListener() {},
  setTimeout(callback: () => void) { missingFallback = callback; return 23; },
  clearTimeout() {},
} as never);
missingFallback?.();
check(missingRoot.dataset.worksMotionCapable === undefined, "fallback reveals content when the runtime truly never starts");

const navigationRoot: Root = { dataset: {} };
claimWorksMotionRuntime(navigationRoot);
check(navigationRoot.dataset.worksMotionCapable === "true", "client navigation re-establishes first-paint capability");
check(navigationRoot.dataset.worksMotionRuntimeReady === "true", "client navigation publishes persistent runtime readiness");
releaseWorksMotionRuntime(navigationRoot);
check(navigationRoot.dataset.worksMotionCapable === undefined && navigationRoot.dataset.worksMotionRuntimeReady === undefined, "route cleanup releases both route-scoped markers");

const slowConfig = resolveWorksPageCms({ schemaVersion: 1, motion: {
  hero: { enabled: false, preset: "none", durationMs: 500, delayMs: 0, distancePx: 0, staggerMs: 0, triggerOnViewport: false },
  heroMedia: { enabled: false, preset: "none", durationMs: 500, delayMs: 0, distancePx: 0, staggerMs: 0, triggerOnViewport: false },
  catalogIntro: { enabled: false, preset: "none", durationMs: 500, delayMs: 0, distancePx: 0, staggerMs: 0, triggerOnViewport: true },
  productGrid: { enabled: true, preset: "slide-right", durationMs: 5_000, delayMs: 4_200, distancePx: 36, staggerMs: 1_000, triggerOnViewport: true },
} }, { monthLabel: "九月", intro: "作品" });
const slowBindings = resolveWorksPublicMotionBindings(slowConfig.motion);
const firstTiming = resolveWorksMotionTiming(slowConfig.motion.productGrid, "productGrid", 0);
const thirdTiming = resolveWorksMotionTiming(slowConfig.motion.productGrid, "productGrid", 2);
check(firstTiming.duration === 5_000, "Admin 5.0 second duration reaches Web Animation timing");
check(firstTiming.delay === 4_200, "Admin 4.2 second delay reaches Web Animation timing");
check(slowBindings.productGrid.style?.["--works-motion-distance"] === "36px", "Admin 36px movement reaches public bindings");
check(thirdTiming.delay === 6_200, "Admin 1.0 second product-card interval produces canonical stagger");
check(resolveWorksMotionTiming(slowConfig.motion.catalogIntro, "catalogIntro", 9).delay === slowConfig.motion.catalogIntro.delayMs, "stagger applies only to the product-card group");
check(slowConfig.motion.productGrid.triggerOnViewport, "viewport trigger survives CMS resolution");
check(runtime.includes("{ threshold: 0.15 }"), "IntersectionObserver uses the canonical 0.15 threshold");
check(runtime.includes("if (!setting.triggerOnViewport) { play(); return; }"), "non-viewport motion starts without bypassing timing");
check(runtime.includes("if (entries.some((entry) => entry.isIntersecting)) { play(); observer.disconnect(); }"), "in-viewport targets play once and disconnect their observer");
check(runtime.includes("{ ...timing") && runtime.includes('fill: "both"'), "configured delay keeps the first keyframe applied before animation start");
check(css.includes('html[data-works-motion-capable="true"] .works-page [data-works-motion-state="pre-reveal"]'), "capable pre-reveal CSS hides targets before runtime paint");

const node = {
  style: { opacity: "0", transform: "translateX(36px)", clipPath: "" },
  dataset: { worksMotionState: "pre-reveal" },
};
check(beginWorksMotion(node as never), "first viewport trigger begins a pre-reveal target");
check(!beginWorksMotion(node as never), "a second trigger cannot double-animate an active target");
let cancelled = false;
completeWorksMotion(node as never, { cancel() { cancelled = true; } } as never);
check(cancelled && worksMotionState(node as never) === "revealed", "animation completion produces one terminal revealed state");
check(node.style.opacity === "" && node.style.transform === "", "terminal state is permanently visible");
check(runtime.includes('matchMedia("(prefers-reduced-motion: reduce)").matches'), "runtime explicitly detects reduced-motion preference");
check(runtime.includes("revealAll(); return releaseRuntime;"), "reduced motion bypasses entrance animation and safely reveals targets");
check(runtime.includes('if (!beginWorksMotion(node)) return;'), "ordinary motion path preserves single-run lifecycle gating");
check(!heroMedia.includes("onLoad") && !heroMedia.includes("onLoadingComplete"), "image loading is not treated as reveal completion");
check(!runtime.includes('node.style.opacity = "0"'), "runtime never hides already-painted content with an inline reset");
check(page.includes('data-works-motion-state={motionPending(works.motion.productGrid)?"pre-reveal":undefined}'), "SSR emits pre-reveal only for motion-enabled product cards");
check(!runtime.includes("window.location.reload"), "motion lifecycle uses no reload workaround");

const savedStore = JSON.parse(pagesJson);
const savedMotion = resolveWorksPageCms(savedStore.systemPages?.works, { monthLabel: "目前", intro: "目前" }).motion;
check(savedMotion.catalogIntro.delayMs === 4_200 && savedMotion.catalogIntro.durationMs === 5_000 && savedMotion.catalogIntro.distancePx === 36, "actual saved slow values resolve without default substitution");
check(savedMotion.catalogIntro.staggerMs === 1_000 && savedMotion.catalogIntro.triggerOnViewport, "actual saved intro interval and viewport flag are preserved");
check(!savedMotion.productGrid.enabled && savedMotion.productGrid.preset === "none", "actual saved product-card group is explicitly disabled");
check(lifecycle.includes("claimWorksMotionRuntime") && lifecycle.includes("releaseWorksMotionRuntime"), "one lifecycle module owns route marker transitions");
check(bootstrap.includes("durable marker re-check") && bootstrap.includes("clearFallback"), "bootstrap documents and implements event-order race closure");

console.log(`Works motion runtime handshake checks passed: ${checks}`);
