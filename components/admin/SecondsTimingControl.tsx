'use client';
/** The existing Homepage range + seconds pair, with its DOM/classes preserved. */
export default function SecondsTimingControl({ seconds, onChange, max = 10 }: { seconds: number; onChange: (seconds: number) => void; max?: number }) {
  return <><input type="range" min="0" max={max} step="0.1" value={seconds} onChange={event => onChange(Number(event.target.value))}/><span className="hero-timing-value"><input type="number" min="0" max={max} step="0.1" value={seconds.toFixed(1)} onChange={event => onChange(Number(event.target.value))}/><span>秒</span></span></>;
}
