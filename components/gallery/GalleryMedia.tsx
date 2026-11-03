'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { GalleryWork } from '@/lib/galleryWorks';
import type { GalleryPlayback } from '@/lib/galleryReveal';
import css from './GalleryExperience.module.css';

export default function GalleryMedia({ work, active, eager = false, onPlayback, previewDevice }: { work: GalleryWork; active: boolean; eager?: boolean; onPlayback?: (state: GalleryPlayback) => void; previewDevice?: 'desktop' | 'mobile' }) {
  const video = useRef<HTMLVideoElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [allowMotion, setAllowMotion] = useState(false);
  const [visible, setVisible] = useState(false);
  const [videoFailed, setVideoFailed] = useState('');
  const [playing, setPlaying] = useState(false);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [playedSource, setPlayedSource] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const viewport = matchMedia('(max-width: 900px)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const update = () => { setMobile(viewport.matches); setAllowMotion(!query.matches && !connection?.saveData); setPreferencesReady(true); setReducedMotion(query.matches); };
    update(); query.addEventListener('change', update); viewport.addEventListener('change', update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .15 });
    if (host.current) observer.observe(host.current);
    return () => { query.removeEventListener('change', update); viewport.removeEventListener('change', update); observer.disconnect(); };
  }, []);
  const isMobile = previewDevice ? previewDevice === 'mobile' : mobile;
  const source = isMobile ? work.mobileVideo || work.stageVideo : work.stageVideo;
  const videoEnabled = active && allowMotion && visible && videoFailed !== source && Boolean(source);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let disposed = false;
    const sync = () => {
      if (videoEnabled && !manuallyPaused && !document.hidden) { element.muted = true; void element.play().catch((error: unknown) => {
        if (disposed || document.hidden || (error instanceof DOMException && error.name === 'AbortError')) return;
        setPlaying(false); setVideoFailed(source);
      }); }
      else element.pause();
    };
    sync(); document.addEventListener('visibilitychange', sync);
    return () => { disposed = true; document.removeEventListener('visibilitychange', sync); element.pause(); };
  }, [videoEnabled, manuallyPaused, source]);
  useEffect(() => {
    if (!preferencesReady) return;
    const mode = !active ? 'pending' : reducedMotion ? 'reduced' : !visible ? 'paused' : !source || !allowMotion || videoFailed === source ? 'static' : playing && videoEnabled ? 'playing' : playedSource === source ? 'paused' : 'pending';
    onPlayback?.({ mode, duration, readProgress: () => {
      const current = video.current;
      return current && !current.paused && current.readyState >= 3 && !document.hidden ? current.currentTime : undefined;
    } });
  }, [active, source, allowMotion, preferencesReady, videoFailed, playing, videoEnabled, playedSource, duration, reducedMotion, visible, onPlayback]);
  const image = [isMobile && work.mobileVideo ? work.mobilePosterImage : '', work.posterImage, work.stageImage].find(candidate => candidate && !failedImages.includes(candidate)) || '';
  return <div ref={host} className={css.media}>
    {image ? <Image src={image} alt={work.imageAlt} fill sizes="(max-width: 900px) 78vw, 92vw" loading={eager ? 'eager' : 'lazy'} unoptimized={image.startsWith('https:')} onError={() => setFailedImages(previous => [...previous, image])} /> : <div className={css.noMedia}><span>KD COFFEE</span><p>{work.title}</p><small>作品視覺準備中</small></div>}
    {videoEnabled ? <video ref={video} key={source} src={source} poster={image || undefined} autoPlay muted playsInline loop preload="metadata" className={playing || playedSource === source ? css.videoReady : css.videoWaiting} aria-label={`${work.title}動態作品`} onLoadedMetadata={event => setDuration(event.currentTarget.duration)} onPlaying={() => { setPlaying(true); setPlayedSource(source); }} onPause={() => setPlaying(false)} onWaiting={() => setPlaying(false)} onError={() => { setVideoFailed(source); setPlaying(false); }} /> : null}
    {videoEnabled ? <button type="button" className={css.motionButton} aria-label={manuallyPaused ? '播放作品動態' : '暫停作品動態'} aria-pressed={manuallyPaused} onClick={() => setManuallyPaused(value => !value)}><svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4">{manuallyPaused ? <path d="M5.5 3.5 12 8l-6.5 4.5Z" strokeLinejoin="round"/> : <path d="M5.5 3.5v9m5-9v9"/>}</svg></button> : null}
  </div>;
}
