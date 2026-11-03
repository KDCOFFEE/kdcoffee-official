'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { GalleryWork } from '@/lib/galleryWorks';
import { createGalleryRevealClock, galleryParts, type GalleryPlayback } from '@/lib/galleryReveal';
import type { GalleryRevealTiming } from '@/lib/galleryRevealTiming';
import { resolveGalleryRevealAnimation, galleryRevealMotionStyle, type GalleryRevealGroup } from '@/lib/galleryRevealAnimation';
import css from './GalleryExperience.module.css';

const returnKey = 'kd-gallery-detail-return';
export default function GalleryReveal({ work, playback, index, total, preview = false }: { work: GalleryWork; playback: GalleryPlayback; index: number; total: number; preview?: boolean }) {
  const animation = resolveGalleryRevealAnimation(work.revealAnimation);
  const motion = (group: GalleryRevealGroup) => ({ 'data-motion': animation[group], style: galleryRevealMotionStyle(animation[group]) as CSSProperties });
  const timingKey = JSON.stringify(work.revealTiming || {});
  const timing = useMemo(() => JSON.parse(timingKey) as GalleryRevealTiming, [timingKey]);
  const [parts, setParts] = useState(galleryParts(false));
  const phase = Object.values(parts).every(Boolean) ? 3 : parts.titleHook ? 2 : parts.sequence ? 1 : 0;
  const early = useRef(false);
  const timeline = useRef<ReturnType<typeof createGalleryRevealClock> | null>(null);
  useEffect(() => {
    const controller = createGalleryRevealClock(() => {}, undefined, timing, setParts);
    timeline.current = controller;
    const visibility = () => controller.setHidden(document.hidden);
    visibility(); document.addEventListener('visibilitychange', visibility);
    if (early.current) controller.reveal();
    try {
      const saved = JSON.parse(sessionStorage.getItem(returnKey) || 'null');
      if (!preview && saved?.slug === work.slug && Date.now() - saved.at < 300000) {
        controller.reveal(); sessionStorage.removeItem(returnKey);
      }
    } catch { /* Storage is optional; URL remains authoritative. */ }
    return () => { document.removeEventListener('visibilitychange', visibility); controller.dispose(); timeline.current = null; };
  }, [work.slug, timing, preview]);
  useEffect(() => { timeline.current?.update(playback); }, [playback, work.slug, timing, preview]);
  function reveal() { early.current = true; timeline.current?.reveal(); }
  function remember() {
    if (preview) return;
    try { sessionStorage.setItem(returnKey, JSON.stringify({ slug: work.slug, at: Date.now() })); } catch { /* Private browsing must not block navigation. */ }
  }
  return <div className={css.reveal} data-phase={phase} onFocusCapture={reveal}>
    <p className={css.sequence} data-visible={parts.sequence}>{String(index + 1).padStart(2, '0')} <span>/ {String(total).padStart(2, '0')}</span></p>
    <div className={css.caption}>
      <div className={css.titleReveal} data-visible={parts.titleHook} {...motion('titleHook')}>
        <h2>{work.title}</h2>
        {work.englishTitle ? <p className={css.englishTitle}>{work.englishTitle}</p> : null}
        {work.hook ? <p className={css.interpretation}>{work.hook}</p> : null}
      </div>
      <div className={css.fullReveal}>
        <div className={css.partReveal} data-part="interpretation" data-visible={parts.interpretation} {...motion('interpretation')}>{work.interpretation ? <p className={css.story}>{work.interpretation}</p> : null}</div>
        <div className={css.partReveal} data-part="coffeeBridge" data-visible={parts.coffeeBridge} {...motion('coffeeBridge')}>{work.coffeeBridge ? <p className={css.coffeeBridge}>{work.coffeeBridge}</p> : null}</div>
        <div className={css.partReveal} data-part="cta" data-visible={parts.cta} {...motion('cta')}><Link href={`/works/${work.slug}`} className={css.enter} onClick={remember}>走進作品 <span aria-hidden="true">→</span></Link></div>
      </div>
    </div>
  </div>;
}
