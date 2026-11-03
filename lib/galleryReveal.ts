import { GALLERY_TIMING_KEYS, resolveGalleryRevealTiming, type GalleryRevealTiming } from './galleryRevealTiming';
export type GalleryPlayback = { mode: 'pending' | 'playing' | 'paused' | 'static' | 'reduced'; duration?: number; readProgress?: () => number | undefined };
export type GalleryRevealPhase = 0 | 1 | 2 | 3;

// Video timings adapt to duration; static timings use the unchanged Owner values.
export function galleryRevealTimes(duration?: number): readonly number[] {
  if (duration && Number.isFinite(duration) && duration > 0 && duration < 6) {
    if (duration < 1.5) return [0, 0, 0];
    return [Math.min(750, duration * 100), Math.min(3500, duration * 350), Math.min(5000, duration * 600)];
  }
  return [750, 3500, 5000];
}

export type GalleryRevealParts = { sequence: boolean; titleHook: boolean; interpretation: boolean; coffeeBridge: boolean; cta: boolean };
export const galleryParts = (visible: boolean): GalleryRevealParts => ({ sequence: visible, titleHook: visible, interpretation: visible, coffeeBridge: visible, cta: visible });
export function galleryRevealSchedule(duration?: number, timing?: GalleryRevealTiming) {
  const configured = resolveGalleryRevealTiming(timing);
  let values = GALLERY_TIMING_KEYS.map(key => configured[key] * 1000);
  let sequence = 750;
  if (duration && Number.isFinite(duration) && duration > 0) {
    if (duration < 1.5) { values = values.map(() => 0); sequence = 0; }
    else if (!timing || Object.keys(timing).length === 0) {
      const defaults = galleryRevealTimes(duration); sequence = defaults[0]; values = [defaults[1], defaults[2], defaults[2], defaults[2]];
    } else {
      const scale = Math.min(1, Math.max(0, duration * 1000 - 600) / Math.max(1, ...values));
      values = values.map(value => value * scale); sequence = Math.min(sequence, duration * 100);
    }
  }
  return { sequence, titleHook: values[0], interpretation: values[1], coffeeBridge: values[2], cta: values[3] };
}
export function createGalleryRevealClock(notify: (phase: GalleryRevealPhase) => void, clock = {
  now: () => performance.now(),
  set: (fn: () => void, delay: number) => setTimeout(fn, delay),
  clear: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
}, timing?: GalleryRevealTiming, notifyParts?: (parts: GalleryRevealParts) => void) {
  let elapsed = 0, started: number | undefined, lastVideoTime: number | undefined, phase: GalleryRevealPhase = 0;
  let parts = galleryParts(false), forced = false, hidden = false, disposed = false;
  let state: GalleryPlayback = { mode: 'pending' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  function cancel() { if (timer !== undefined) clock.clear(timer); timer = undefined; }
  function sample() {
    if (hidden || forced || disposed) return;
    if (started !== undefined) { const now = clock.now(); elapsed += Math.max(0, now - started); started = now; }
    if (state.mode === 'playing' && state.readProgress) {
      const time = state.readProgress();
      if (time === undefined || !Number.isFinite(time) || time < 0) return;
      if (lastVideoTime === undefined) elapsed = Math.max(elapsed, time * 1000);
      else elapsed += Math.max(0, time >= lastVideoTime ? time - lastVideoTime : time) * 1000;
      lastVideoTime = time;
    }
  }
  function publish(next: GalleryRevealParts) {
    // A duration/source/fallback change must not hide a block already revealed.
    for (const key of Object.keys(parts) as Array<keyof GalleryRevealParts>) next[key] ||= parts[key];
    if (Object.keys(parts).some(key => parts[key as keyof GalleryRevealParts] !== next[key as keyof GalleryRevealParts])) { parts = next; notifyParts?.(parts); }
    const nextPhase = Object.values(parts).every(Boolean) ? 3 : parts.titleHook ? 2 : parts.sequence ? 1 : 0;
    if (nextPhase !== phase) { phase = nextPhase; notify(phase); }
  }
  function schedule() {
    if (disposed || forced || hidden) return;
    sample();
    const times = galleryRevealSchedule(state.mode === 'static' ? undefined : state.duration, timing);
    publish(Object.fromEntries(Object.entries(times).map(([key, at]) => [key, elapsed + 0.001 >= at])) as GalleryRevealParts);
    if (phase === 3 || (state.mode !== 'playing' && state.mode !== 'static')) return;
    const videoClock = state.mode === 'playing' && Boolean(state.readProgress);
    if (!videoClock) started = clock.now();
    const next = Math.min(...Object.entries(times).filter(([key, at]) => !parts[key as keyof GalleryRevealParts] && at > elapsed).map(([, at]) => at));
    // One shared timer. Video samples native progress; static schedules the next deadline.
    timer = clock.set(() => { timer = undefined; schedule(); }, videoClock ? 40 : Math.max(1, next - elapsed));
  }
  return {
    update(next: GalleryPlayback) {
      if (disposed) return;
      sample(); cancel(); started = undefined; state = next;
      if (next.mode === 'reduced') { forced = true; publish(galleryParts(true)); }
      else schedule();
    },
    setHidden(next: boolean) {
      if (disposed || hidden === next) return;
      sample(); cancel(); started = undefined; hidden = next;
      if (!hidden && state.mode === 'playing' && state.readProgress) {
        const position = state.readProgress();
        if (position !== undefined && Number.isFinite(position)) lastVideoTime = position;
      }
      schedule();
    },
    reveal() { if (disposed) return; cancel(); started = undefined; forced = true; publish(galleryParts(true)); },
    dispose() { cancel(); started = undefined; disposed = true; },
  };
}
