"use client";

import { useEffect } from "react";
import { installWorksMotionBootstrap } from "./worksMotionBootstrap";

export { installWorksMotionBootstrap } from "./worksMotionBootstrap";

/**
 * Maintains the Works runtime markers without rendering a script element.
 * RootLayout emits the capability marker so pre-reveal CSS is available
 * before hydration and first paint.
 */
export default function WorksMotionBootstrapClient() {
  useEffect(() => {
    return installWorksMotionBootstrap(document.documentElement, window);
  }, []);

  return null;
}
