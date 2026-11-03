'use client';
import { useState } from 'react';
import type { GalleryWork } from '@/lib/galleryWorks';
import type { GalleryPlayback } from '@/lib/galleryReveal';
import GalleryMedia from './GalleryMedia';
import GalleryReveal from './GalleryReveal';
import css from './GalleryExperience.module.css';

export default function GalleryStage({ work, active, index, total, previewDevice }: { work: GalleryWork; active: boolean; index: number; total: number; previewDevice?: 'desktop' | 'mobile' }) {
  const [playback, setPlayback] = useState<GalleryPlayback>({ mode: 'pending' });
  return <div className={css.cinematicStage}>
    <GalleryMedia work={work} active={active} eager={active} onPlayback={setPlayback} previewDevice={previewDevice}/>
    {active ? <GalleryReveal key={`${work.slug}-${JSON.stringify(work.revealTiming || {})}-${JSON.stringify(work.revealAnimation || {})}`} work={work} playback={playback} index={index} total={total} preview={Boolean(previewDevice)}/> : null}
  </div>;
}
