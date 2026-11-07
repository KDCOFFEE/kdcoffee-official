"use client";

export default function MediaAltEditor({ alt, decorative, allowDecorative = true, onChange }: {
  alt: string;
  decorative?: boolean;
  allowDecorative?: boolean;
  onChange: (description: { alt: string; decorative: boolean }) => void;
}) {
  return <div>
    <label>替代文字<input value={alt} maxLength={240} disabled={decorative === true}
      onChange={event => onChange({ alt: event.target.value, decorative: false })} /></label>
    {allowDecorative ? <label><input type="checkbox" checked={decorative === true}
      onChange={event => onChange({ alt: event.target.checked ? "" : alt, decorative: event.target.checked })} />裝飾性圖片（不朗讀圖片描述）</label> : null}
    {!decorative && !alt.trim() ? <small role="status">請依圖片內容填寫繁體中文描述；若純為裝飾，請勾選裝飾性圖片。</small> : null}
  </div>;
}
