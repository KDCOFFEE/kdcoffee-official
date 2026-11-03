'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { galleryWorkLocation, resolveGalleryActiveIndex } from '@/lib/galleryNavigation';
import type { GalleryWork } from '@/lib/galleryWorks';
import GalleryStage from './GalleryStage';
import css from './GalleryExperience.module.css';

const number = (value: number) => String(value).padStart(2, '0');
export default function GalleryExperience({ works, initialWorkSlug = '' }: { works: GalleryWork[]; initialWorkSlug?: string }) {
  const searchParams = useSearchParams();
  const requested = searchParams.getAll('work');
  const requestedIndex = resolveGalleryActiveIndex(works, requested.length > 1 ? requested : requested[0] ?? initialWorkSlug);
  const active = requestedIndex;
  const slides = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const localChange = useRef<string | null>(null);
  const current = works[active];
  function align(index: number, smooth = true) {
    const rail = slides.current, panel = rail?.children[index] as HTMLElement | undefined;
    if (rail && panel) rail.scrollTo({ left: panel.offsetLeft - (rail.clientWidth - panel.clientWidth) / 2, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
  }
  function changeActive(index: number) {
    const next = Math.max(0, Math.min(works.length - 1, index));
    if (!works[next]) return;
    if (new URLSearchParams(window.location.search).get('work') !== works[next].slug) {
      localChange.current = works[next].slug;
      window.history.replaceState(null, '', galleryWorkLocation(window.location.href, works[next].slug));
    }
  }
  function select(index: number) { changeActive(index); align(index); }
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault(); select(event.key === 'Home' ? 0 : event.key === 'End' ? works.length - 1 : active + (event.key === 'ArrowRight' ? 1 : -1));
  }
  function onScroll() {
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const rail = slides.current; if (!rail) return;
      const center = rail.scrollLeft + rail.clientWidth / 2;
      const distances = Array.from(rail.children, child => Math.abs((child as HTMLElement).offsetLeft + child.clientWidth / 2 - center));
      const next = distances.indexOf(Math.min(...distances));
      if (next !== active) changeActive(next);
    }, 100);
  }
  useLayoutEffect(() => {
    if (slides.current) slides.current.dataset.initializing = 'false';
    if (localChange.current === works[requestedIndex]?.slug) {
      localChange.current = null;
      return;
    }
    align(requestedIndex, false);
  }, [requestedIndex, works]);
  useEffect(() => {
    const rail = track.current, item = rail?.children[active] as HTMLElement | undefined;
    if (rail && item) rail.scrollTo({ left: item.offsetLeft - rail.clientWidth / 2 + item.clientWidth / 2, behavior: 'instant' });
  }, [active]);
  useEffect(() => { const onResize = () => align(active, false); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize); }, [active]);
  useEffect(() => () => clearTimeout(settle.current), []);
  if (!current) return <section className={css.empty}><p>展覽正在準備中。</p><Link href="/works">瀏覽咖啡作品 →</Link></section>;
  return <section className={css.exhibition} aria-label="作品展覽" aria-roledescription="輪播" onKeyDown={keyboard}>
    <div className={css.stageAndDetails}>
      <div className={css.stageColumn}>

        <div ref={slides} className={css.slides} data-initializing="true" onScroll={onScroll} aria-label="作品畫冊" tabIndex={0}>
          {works.map((work, index) => <div key={work.slug} className={css.slide} role="group" aria-roledescription="作品" aria-label={`${number(index + 1)} / ${number(works.length)} ${work.title}`} aria-hidden={index !== active} inert={index !== active}>
            <GalleryStage work={work} active={index === active} index={index} total={works.length}/>
          </div>)}
        </div>
        {works.length > 1 ? <div className={css.stageControls}><span>{number(active + 1)} <i>/ {number(works.length)}</i></span><div><button type="button" onClick={() => select(active - 1)} disabled={active === 0} aria-label="上一支作品">←</button><button type="button" onClick={() => select(active + 1)} disabled={active === works.length - 1} aria-label="下一支作品">→</button></div></div> : null}
      </div>

    </div>
    <div className={css.trackHeader}><span>作品索引 <i> / COLLECTION INDEX</i></span><p>選擇一支作品，展開下一段風景。</p></div>
    <div ref={track} className={css.track} aria-label="作品索引">
      {works.map((work, index) => <div key={work.slug} className={`${css.trackItem} ${active === index ? css.selected : ''}`}>
        <button type="button" onClick={() => select(index)} aria-label={`觀看${work.title}`} aria-current={active === index ? 'true' : undefined}>
          <span className={css.thumbnail}><small className={css.trackNumber}>{number(index + 1)}</small>{work.thumbnailImage ? <Image src={work.thumbnailImage} alt="" fill sizes="150px" loading="lazy" unoptimized={work.thumbnailImage.startsWith('https:')} onError={event => { event.currentTarget.style.visibility = 'hidden'; }} /> : <span>KD</span>}</span>
        </button><Link href={`/works/${work.slug}`} prefetch={false} className={css.trackText}><small>{number(index + 1)}</small><b>{work.title}</b></Link>
      </div>)}
    </div>
    <p className={css.srOnly} aria-live="polite" aria-atomic="true">目前作品：{current.title}，第 {active + 1} 支，共 {works.length} 支。</p>
  </section>;
}
