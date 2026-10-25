"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";

export type HomepagePreviewMode = "public" | "studio-stable" | "studio-replay";
type Preview = { mode: HomepagePreviewMode; sectionId?: string; replay?: number; onReplayComplete?: () => void };
const Context = createContext<Preview>({ mode: "public" });
export function useHomepagePreview() { return useContext(Context); }
/** Reuse Next's existing local-image optimizer only for editor preview bitmaps. */
export function studioPreviewImageUrl(src: string, width = 1080) {
  return /^\/(uploads|images)\//.test(src) && /\.(webp|png|jpe?g)(?:[?#]|$)/i.test(src)
    ? `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75` : src;
}
export function HomepagePreviewProvider({ mode, sectionId, replay, onReplayComplete, children }: Preview & { children: ReactNode }) {
  const value = useMemo(() => ({ mode, sectionId, replay, onReplayComplete }), [mode, sectionId, replay, onReplayComplete]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
