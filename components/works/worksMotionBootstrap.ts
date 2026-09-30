const WORKS_MOTION_RUNTIME_TIMEOUT_MS = 1500;

export type WorksMotionRoot = {
  dataset: {
    worksMotionCapable?: string;
    worksMotionRuntimeReady?: string;
  };
};

export type WorksMotionWindow = Pick<Window, "addEventListener" | "removeEventListener" | "setTimeout" | "clearTimeout">;

export function installWorksMotionBootstrap(root: WorksMotionRoot, runtimeWindow: WorksMotionWindow) {
  let fallbackTimer: number | undefined;

  const clearFallback = () => {
    if (fallbackTimer === undefined) return;
    runtimeWindow.clearTimeout(fallbackTimer);
    fallbackTimer = undefined;
  };

  const markRuntimeReady = () => {
    root.dataset.worksMotionRuntimeReady = "true";
    clearFallback();
  };

  if (root.dataset.worksMotionRuntimeReady === "true") {
    return () => undefined;
  }

  runtimeWindow.addEventListener("works-motion-runtime-ready", markRuntimeReady);

  // Close the event-before-listener race with a durable marker re-check.
  if (root.dataset.worksMotionRuntimeReady === "true") {
    runtimeWindow.removeEventListener("works-motion-runtime-ready", markRuntimeReady);
    return () => undefined;
  }

  fallbackTimer = runtimeWindow.setTimeout(() => {
    if (root.dataset.worksMotionRuntimeReady !== "true") {
      delete root.dataset.worksMotionCapable;
    }
    fallbackTimer = undefined;
  }, WORKS_MOTION_RUNTIME_TIMEOUT_MS);

  return () => {
    runtimeWindow.removeEventListener("works-motion-runtime-ready", markRuntimeReady);
    clearFallback();
  };
}
