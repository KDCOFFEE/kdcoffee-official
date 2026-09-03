export type WorksMotionElement = Pick<HTMLElement, "style" | "dataset">;

export type WorksMotionAnimation = Pick<Animation, "cancel">;

export type WorksMotionState = "normal" | "pre-reveal" | "animating" | "revealed";

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
