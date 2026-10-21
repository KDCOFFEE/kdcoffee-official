import type { WorksCardMarkerPresentation } from "@/lib/worksPageCms";
import { worksCardMarkerPresentationBindings } from "@/lib/worksCardMarkerPresentation";

/** Passive inner visual shared by system, marketing and Admin previews.
 * A single accessible equivalent accompanies decorative image overlays.
 */
export default function WorksCardMarkerVisual({ value, hasTag = false }: {
  value: WorksCardMarkerPresentation; hasTag?: boolean;
}) {
  const bindings = worksCardMarkerPresentationBindings(value, hasTag);
  return <>
    {bindings.dim && <span className={bindings.dim.className} style={bindings.dim.style} aria-hidden="true" />}
    <span className={bindings.anchorClass} style={bindings.anchorStyle}>
      {bindings.displayMode === "image" ? <>
        <img className="works-sold-out-image works-card-marker-image" src={value.imageAsset!.media.url} alt="" aria-hidden="true" style={bindings.imageStyle} />
        <span style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}>{value.text}</span>
      </> : <span className={bindings.labelClass} style={bindings.labelStyle}>{value.text || "暫時完售"}</span>}
    </span>
  </>;
}
