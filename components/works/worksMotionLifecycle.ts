export type WorksMotionElement = Pick<HTMLElement, "style" | "dataset">;

export type WorksMotionAnimation = Pick<Animation, "cancel">;

export type WorksMotionState = "normal" | "pre-reveal" | "animating" | "revealed";

export type WorksMotionDocumentRoot = {
  dataset: {
    worksMotionCapable?: string;
    worksMotionRuntimeReady?: string;
  };
};

export type WorksMotionTiming = {
  delayMs: number;
  durationMs: number;
  staggerMs: number;
};

export type WorksMotionTarget = "hero" | "heroMedia" | "catalogIntro" | "productGrid";

/**
 * Claims reveal ownership synchronously when the Works route mounts. This is
 * required on App Router navigation because the persistent root layout is not
 * rendered again after the global bootstrap has removed its capability marker.
 */
export function claimWorksMotionRuntime(root: WorksMotionDocumentRoot): void {
  root.dataset.worksMotionCapable = "true";
  root.dataset.worksMotionRuntimeReady = "true";
}

export function releaseWorksMotionRuntime(root: WorksMotionDocumentRoot): void {
  delete root.dataset.worksMotionRuntimeReady;
  delete root.dataset.worksMotionCapable;
}

export function resolveWorksMotionTiming(
  setting: WorksMotionTiming,
  target: WorksMotionTarget,
  index: number,
): { delay: number; duration: number } {
  return {
    duration: setting.durationMs,
    delay: setting.delayMs + (target === "productGrid" ? index * setting.staggerMs : 0),
  };
}

export function worksMotionState(node: WorksMotionElement): WorksMotionState {
  const state = node.dataset.worksMotionState;
  return state === "pre-reveal" || state === "animating" || state === "revealed" ? state : "normal";
}

export function beginWorksMotion(node: WorksMotionElement): boolean {
  if (worksMotionState(node) !== "pre-reveal") return false;
  node.dataset.worksMotionState = "animating";
  return true;
}

export function markWorksMotionRevealed(node: WorksMotionElement): void {
  node.style.opacity = "";
  node.style.transform = "";
  node.style.clipPath = "";
  node.dataset.worksMotionState = "revealed";
  node.dataset.worksMotionRevealed = "true";
}

/**
 * Moves an entrance target back to ordinary, visible DOM styling after its
 * temporary Web Animation has reached the final keyframe.  This deliberately
 * happens before cancellation: cancelling first would reveal a viewport
 * pre-reveal inline style such as opacity: 0.
 */
export function completeWorksMotion(
  node: WorksMotionElement,
  animation: WorksMotionAnimation,
): void {
  markWorksMotionRevealed(node);
  animation.cancel();
}
