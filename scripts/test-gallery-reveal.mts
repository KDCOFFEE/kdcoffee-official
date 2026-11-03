import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGalleryRevealClock, galleryRevealTimes, type GalleryRevealPhase } from '../lib/galleryReveal';
import GalleryReveal from '../components/gallery/GalleryReveal';
import { resolveGalleryWorks } from '../lib/galleryWorks';
import fs from 'node:fs/promises';

let checks = 0;
function test(name: string, run: () => void) { run(); checks++; console.log('PASS ' + name); }
function fixture() {
  let now = 0, id = 0, phase: GalleryRevealPhase = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock = createGalleryRevealClock(value => { phase = value; }, {
    now: () => now,
    set: (fn, delay) => { const key = ++id; timers.set(key, { at: now + delay, fn }); return key as unknown as ReturnType<typeof setTimeout>; },
    clear: key => { timers.delete(key as unknown as number); },
  });
  return { clock, get phase() { return phase; }, get pending() { return timers.size; }, advance(ms: number) {
    const end = now + ms;
    for (;;) { const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0]; if (!next || next[1].at > end) break; now = next[1].at; timers.delete(next[0]); next[1].fn(); }
    now = end;
  } };
}
const f = fixture();
test('buffering does not consume clean artwork time', () => { f.clock.update({ mode: 'pending' }); f.advance(6000); assert.equal(f.phase, 0); });
test('active playback starts with copy hidden', () => { f.clock.update({ mode: 'playing', duration: 8 }); f.advance(749); assert.equal(f.phase, 0); });
test('sequence appears at 750ms', () => { f.advance(1); assert.equal(f.phase, 1); });
test('title and hook remain hidden until 3.5 seconds', () => { f.advance(2749); assert.equal(f.phase, 1); f.advance(1); assert.equal(f.phase, 2); });
test('pause or hidden tab stops elapsed playback time', () => { f.clock.update({ mode: 'paused', duration: 8 }); f.advance(10000); assert.equal(f.phase, 2); assert.equal(f.pending, 0); });
test('full editorial appears at 5 seconds of playback', () => { f.clock.update({ mode: 'playing', duration: 8 }); f.advance(1499); assert.equal(f.phase, 2); f.advance(1); assert.equal(f.phase, 3); });
test('long videos use 3.5/5 second defaults', () => assert.deepEqual(galleryRevealTimes(30), [750, 3500, 5000]));
test('short videos reveal before they finish', () => { assert.deepEqual(galleryRevealTimes(2), [200, 700, 1200]); assert.deepEqual(galleryRevealTimes(1), [0, 0, 0]); });
test('new work gets a fresh controller and phase', () => { f.clock.dispose(); const next = fixture(); next.clock.update({ mode: 'playing' }); assert.equal(next.phase, 0); });
test('intentional early reveal cancels pending timer', () => { const next = fixture(); next.clock.update({ mode: 'playing' }); next.clock.reveal(); assert.equal(next.phase, 3); assert.equal(next.pending, 0); });
for (const reason of ['no video', 'video error', 'autoplay rejection', 'reduced motion', 'save-data']) {
  test(reason + ' follows elapsed time except reduced-motion', () => { const next = fixture(); next.clock.update({ mode: reason === 'reduced motion' ? 'reduced' : 'static' }); if (reason === 'reduced motion') { assert.equal(next.phase, 3); assert.equal(next.pending, 0); } else { assert.equal(next.phase, 0); next.advance(5000); assert.equal(next.phase, 3); } });
}
test('cleanup cancels all remaining timers', () => { const next = fixture(); next.clock.update({ mode: 'playing' }); next.clock.dispose(); assert.equal(next.pending, 0); });
const source = JSON.parse(await fs.readFile('public/data/website-data.json', 'utf8'));
const work = resolveGalleryWorks(source.menu.products)[4];
test('delayed semantic content remains accessible and CTA has canonical destination', () => {
  const html = renderToStaticMarkup(createElement(GalleryReveal, { work, playback: { mode: 'pending' }, index: 4, total: 8 }));
  assert.ok(html.includes('data-phase="0"')); assert.ok(html.includes('<h2>' + work.title)); assert.ok(html.includes('/works/' + work.slug));
  assert.ok(!html.includes('aria-hidden="true"><h2')); assert.ok(!html.includes('閱讀作品'));
});
test('static SSR starts hidden while keeping semantic content', () => {
  assert.ok(renderToStaticMarkup(createElement(GalleryReveal, { work, playback: { mode: 'static' }, index: 4, total: 8 })).includes('data-phase="0"'));
});
console.log(`GALLERY REVEAL ${checks} PASS; virtual playback clock, no waiting/network/data writes.`);
