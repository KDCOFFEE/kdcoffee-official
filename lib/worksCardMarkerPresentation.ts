import type { CSSProperties } from "react";
import type { WorksCardMarkerPresentation } from "./worksPageCms";

/** Public and Admin preview share geometry. Inline resets keep historic global
 * overlay styles from turning plain editorial content into a badge or dark grid.
 * Inputs are resolved/validated by worksPageCms, never arbitrary client CSS.
 */
export function worksCardMarkerPresentationBindings(value: WorksCardMarkerPresentation, hasTag = false) {
  const displayMode = value.mode === "image" && value.imageAsset ? "image" : "text";
  const frameStyle: CSSProperties = {
    position: "absolute", inset: 0, display: "block", background: "transparent",
    color: "inherit", font: "inherit", letterSpacing: "normal", zIndex: 8, pointerEvents: "none",
  };
  const anchorStyle: CSSProperties = {
    position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
    width: displayMode === "image" ? (value.imageSize ?? 65) + "%" : "max-content", maxWidth: "calc(100% - 32px)", zIndex: 1,
  };
  if (value.textPosition === "top") Object.assign(anchorStyle, { top: 42, transform: "translateX(-50%)" });
  if (value.textPosition === "bottom") Object.assign(anchorStyle, {
    top: "auto", bottom: hasTag ? 56 : 16, transform: "translateX(-50%)",
  });
  const labelStyle: CSSProperties = {
    position: "relative", display: "block", padding: 0, border: "none", borderRadius: 0,
    background: "transparent", boxShadow: "none", textShadow: "none",
    color: value.textColor, fontSize: value.textFontSize, fontWeight: 500,
    lineHeight: 1.45, letterSpacing: ".08em", textAlign: "center",
    overflowWrap: "anywhere", pointerEvents: "none",
  };
  const imageStyle: CSSProperties = {
    display: "block", width: "100%", height: "auto", maxHeight: 160, objectFit: "contain",
    background: "transparent", border: "none", borderRadius: 0, boxShadow: "none", pointerEvents: "none",
  };
  let dim: { className: string; style: CSSProperties } | null = null;
  if (value.dimMode !== "none" && value.dimStrength > 0) {
    const style: CSSProperties = {
      position: "absolute", pointerEvents: "none", background: "rgb(25,20,17)", opacity: value.dimStrength / 100,
    };
    if (value.dimMode === "full") Object.assign(style, { inset: 0 });
    else {
      Object.assign(style, { left: 0, right: 0, height: value.bandSize + "%" });
      const feather = value.bandFeather ?? 0;
      if (feather > 0) style.background = "linear-gradient(to bottom,transparent 0%,rgb(25,20,17) " + feather + "%,rgb(25,20,17) " + (100 - feather) + "%,transparent 100%)";
      if (value.bandPosition === "center") Object.assign(style, { top: "50%", transform: "translateY(-50%)" });
      else style[value.bandPosition] = 0;
    }
    dim = { className: "works-sold-out-dim works-sold-out-dim--" + value.dimMode, style };
  }
  return {
    displayMode, frameStyle, anchorStyle, anchorClass: "works-sold-out-anchor works-sold-out-anchor--" + value.textPosition,
    labelStyle, labelClass: "works-sold-out-text", imageStyle, dim,
  };
}
