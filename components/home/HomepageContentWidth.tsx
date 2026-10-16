import type { CSSProperties, ReactNode } from "react";
import { homepagePresentationProps } from "@/lib/homepagePresentationBindings";

/** Stable across no CMS, Base width and future Mobile-only width. display:contents
 * keeps the legacy layout boxes until CSS activates a constrained inner grid.
 */
export default function HomepageContentWidth({ style, children }: { style?: CSSProperties; children: ReactNode }) {
  return <div className="homepage-base-content-grid" {...homepagePresentationProps(style)}>{children}</div>;
}
