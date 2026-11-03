'use client';
import { GALLERY_EDITORIAL_LIMITS, type GalleryEditorial } from '@/lib/galleryEditorial';
import css from './GalleryEditorialControls.module.css';

const fields = [
  ['hook', '吸引句', '用一句話抓住作品的情緒，建議 10–28 字。'],
  ['interpretation', '作品詮釋', '描述作品的光影、人物、場景或情緒，讓訪客進入作品世界。建議 45–100 字。'],
  ['coffeeBridge', '咖啡連結', '把作品氣質自然連結到這支咖啡的感受。建議 30–70 字。'],
] as const;

export default function GalleryEditorialControls({ value, onChange }: {
  value?: GalleryEditorial; onChange: (value: GalleryEditorial) => void;
}) {
  return <section className={css.section} aria-label="作品詮釋文案">
    <h3>作品詮釋文案</h3>
    <p>此處是這件作品專屬的 KD 藝術詮釋，請勿將自撰文字標示為藝術家的引言。留空時沿用既有文案。</p>
    {fields.map(([key, label, help]) => <label key={key} className={css.field}>
      <span>{label}</span><small>{help}</small>
      <textarea value={value?.[key] || ''} maxLength={GALLERY_EDITORIAL_LIMITS[key]} rows={key === 'hook' ? 2 : 3}
        onChange={event => onChange({ ...value, [key]: event.target.value })}/>
      <small>{Array.from(value?.[key] || '').length} / {GALLERY_EDITORIAL_LIMITS[key]} 字</small>
    </label>)}
  </section>;
}
