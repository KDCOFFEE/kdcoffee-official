"use client";

import { useEffect, useRef, useState } from "react";

const steps = [
  {
    no: "01",
    label: "AIR IN",
    title: "熱風由底部進入",
    text: "穩定熱風從豆床下方均勻進入，提供烘焙能量；不是依賴咖啡豆長時間接觸高溫金屬表面。",
    visual: "air",
  },
  {
    no: "02",
    label: "FLUIDIZE",
    title: "豆床開始流化",
    text: "熱風穿過豆床後，咖啡豆由中央被托起，表層翻動並向外回落，形成持續循環的流化狀態。",
    visual: "bed",
  },
  {
    no: "03",
    label: "EVEN HEAT",
    title: "每一顆豆持續交換位置",
    text: "豆子在熱風中反覆翻滾，降低局部過熱與受熱落差，讓整批咖啡豆更均勻地發展。",
    visual: "heat",
  },
  {
    no: "04",
    label: "CLEAN CUP",
    title: "減少焦苦與煙燻干擾",
    text: "降低豆子貼附高溫表面的時間，也減少煙氣反覆沾附，讓杯中表現更乾淨、層次更清楚。",
    visual: "clean",
  },
  {
    no: "05",
    label: "ORIGIN",
    title: "留下花香、果香與甜感",
    text: "精準控制熱風、溫度與時間，讓烘焙成為原始風味的放大器，而不是遮蓋個性的濾鏡。",
    visual: "flavor",
  },
] as const;

type VisualType = (typeof steps)[number]["visual"];

function StepVisual({ type }: { type: VisualType }) {
  if (type === "air") {
    return (
      <svg viewBox="0 0 520 360" className="process-svg" role="img" aria-label="熱風由底部進入示意">
        <path className="process-base" d="M95 292 Q260 320 425 292" />
        {[150, 205, 260, 315, 370].map((x, index) => (
          <g key={x} className="air-arrow" style={{ animationDelay: `${index * -0.22}s` }}>
            <path d={`M${x} 286 C${x - 10} 245 ${x + 12} 200 ${x} 150`} />
            <path d={`M${x - 8} 162 L${x} 148 L${x + 8} 162`} />
          </g>
        ))}
        <text x="260" y="335" textAnchor="middle">BOTTOM-UP HOT AIR</text>
      </svg>
    );
  }

  if (type === "bed") {
    const bedBeans = Array.from({ length: 108 }, (_, index) => {
      const row = Math.floor(index / 18);
      const col = index % 18;
      const x = 118 + col * 16 + (row % 2) * 7;
      const centerLift = Math.max(0, 1 - Math.abs(x - 260) / 150);
      const y = 286 - row * 13 - centerLift * (10 + row * 2) + ((col * 7 + row * 5) % 5);
      return { x, y, angle: ((index * 29) % 74) - 37, row, delay: -((index % 13) * 0.11) };
    });

    const surfaceBeans = Array.from({ length: 22 }, (_, index) => {
      const side = index % 2 === 0 ? -1 : 1;
      const lane = Math.floor(index / 2);
      const x = 260 + side * (14 + lane * 11);
      const y = 220 + Math.min(lane, 8) * 4 + (lane % 3) * 3;
      return { x, y, angle: side * (18 + lane * 3), delay: -(index * 0.13) };
    });

    return (
      <svg viewBox="0 0 520 360" className="process-svg fluidized-svg" role="img" aria-label="厚實豆床被熱風托起並形成中央鼓起與外圈回落">
        <defs>
          <linearGradient id="bedGlow" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#b99159" stopOpacity="0" />
            <stop offset="100%" stopColor="#d9bc82" stopOpacity=".58" />
          </linearGradient>
        </defs>

        <path className="process-base" d="M82 306 Q260 326 438 306" />
        {[205, 232, 260, 288, 315].map((x, index) => (
          <g key={x} className="bed-air-stream" style={{ animationDelay: `${index * -0.18}s` }}>
            <path d={`M${x} 310 C${x + (index - 2) * 3} 282 ${x - (index - 2) * 4} 246 ${x} 202`} />
            <path d={`M${x - 6} 214 L${x} 201 L${x + 6} 214`} />
          </g>
        ))}

        <g className="fluid-bed-mass">
          {bedBeans.map((bean, index) => (
            <ellipse
              key={index}
              className={`process-bean bed-mass-bean bed-row-${bean.row}`}
              cx={bean.x}
              cy={bean.y}
              rx="8.2"
              ry="5.2"
              transform={`rotate(${bean.angle} ${bean.x} ${bean.y})`}
              style={{ animationDelay: `${bean.delay}s` }}
            />
          ))}
        </g>

        <g className="fluid-surface-layer">
          {surfaceBeans.map((bean, index) => (
            <ellipse
              key={index}
              className={`process-bean surface-roll-bean surface-${index % 4}`}
              cx={bean.x}
              cy={bean.y}
              rx="9"
              ry="5.5"
              transform={`rotate(${bean.angle} ${bean.x} ${bean.y})`}
              style={{ animationDelay: `${bean.delay}s` }}
            />
          ))}
        </g>

        <g className="lifted-beans">
          {[
            { x: 244, y: 205, d: -0.1 }, { x: 267, y: 193, d: -0.45 },
            { x: 286, y: 207, d: -0.8 }, { x: 232, y: 183, d: -1.05 },
            { x: 260, y: 168, d: -1.35 }, { x: 291, y: 181, d: -1.65 },
          ].map((bean, index) => (
            <ellipse key={index} className="process-bean lifted-bed-bean" cx={bean.x} cy={bean.y} rx="9" ry="5.5" style={{ animationDelay: `${bean.d}s` }} />
          ))}
        </g>

        <path className="return-flow return-flow-left" d="M226 190 C176 204 153 238 168 270" />
        <path className="return-flow return-flow-right" d="M294 190 C344 204 367 238 352 270" />
        <path className="bed-glow" d="M180 276 Q260 214 340 276" />
        <text x="260" y="338" textAnchor="middle">WHOLE BED FLUIDIZATION</text>
      </svg>
    );
  }

  if (type === "heat") {
    const backgroundBeans = Array.from({ length: 72 }, (_, index) => {
      const row = Math.floor(index / 12);
      const col = index % 12;
      const x = 164 + col * 18 + (row % 2) * 8;
      const y = 275 - row * 11 + ((index * 5) % 4);
      return { x, y, angle: ((index * 37) % 78) - 39 };
    });

    const paths = [
      "M248 270 C242 236 244 188 260 144 C278 169 292 199 300 226 C306 248 293 266 276 275",
      "M278 274 C302 250 332 231 350 202 C355 231 344 258 316 278 C301 288 286 286 278 274",
      "M242 274 C218 250 188 231 170 202 C165 231 176 258 204 278 C219 288 234 286 242 274",
      "M230 278 C205 274 188 268 176 252 C198 248 218 253 238 266 C248 273 244 280 230 278",
      "M290 278 C315 274 332 268 344 252 C322 248 302 253 282 266 C272 273 276 280 290 278",
      "M260 280 C258 251 258 221 260 190 C262 221 262 251 260 280",
    ];

    return (
      <svg viewBox="0 0 520 360" className="process-svg exchange-svg" role="img" aria-label="亮色追蹤豆展示由底層上升、向外翻轉、回落並重新進入豆床的循環">
        <defs>
          <filter id="trackerGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <g className="exchange-bed">
          {backgroundBeans.map((bean, index) => (
            <ellipse key={index} className="process-bean exchange-background-bean" cx={bean.x} cy={bean.y} rx="7.5" ry="4.8" transform={`rotate(${bean.angle} ${bean.x} ${bean.y})`} />
          ))}
        </g>

        <path className="exchange-guide central-guide" d="M260 286 C256 242 252 194 260 145" />
        <path className="exchange-guide right-guide" d="M260 145 C305 159 339 192 350 222 C356 248 333 273 293 284" />
        <path className="exchange-guide left-guide" d="M260 145 C215 159 181 192 170 222 C164 248 187 273 227 284" />
        <path className="exchange-guide sink-guide" d="M170 255 C190 281 224 290 260 288 C296 290 330 281 350 255" />

        {paths.map((path, index) => (
          <g key={index} className="tracked-bean" style={{ animationDelay: `${index * -0.6}s` }}>
            <ellipse rx="10" ry="6" />
            <path className="bean-seam" d="M-5 1 C-1 -2 2 -2 5 1" />
            <animateMotion dur={`${4.8 + (index % 3) * 0.45}s`} begin={`${index * -0.72}s`} repeatCount="indefinite" rotate="auto" path={path} />
          </g>
        ))}

        <g className="exchange-label label-up"><circle cx="260" cy="132" r="3"/><text x="276" y="136">中央上升</text></g>
        <g className="exchange-label label-return"><circle cx="356" cy="224" r="3"/><text x="370" y="228">外圈回落</text></g>
        <g className="exchange-label label-sink"><circle cx="260" cy="294" r="3"/><text x="276" y="316">表面補入・內部下沉</text></g>
        <text x="260" y="338" textAnchor="middle">TRACK THE GOLDEN BEANS</text>
      </svg>
    );
  }

  if (type === "clean") {
    return (
      <svg viewBox="0 0 520 360" className="process-svg" role="img" aria-label="乾淨杯感示意">
        <path className="cup-line" d="M155 164 H342 L324 278 Q260 312 196 278 Z" />
        <path className="cup-line" d="M343 184 H374 Q414 184 402 222 Q392 252 341 246" />
        <path className="clean-surface" d="M182 222 Q260 250 327 222" />
        {[220, 260, 300].map((x, index) => (
          <path key={x} className="aroma-line" d={`M${x} 190 C${x - 18} 160 ${x + 18} 136 ${x} 104`} style={{ animationDelay: `${index * -0.35}s` }} />
        ))}
        <text x="260" y="335" textAnchor="middle">CLEAN CUP PROFILE</text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 520 360" className="process-svg" role="img" aria-label="花香果香甜感示意">
      <circle className="flavor-orbit" cx="260" cy="180" r="108" />
      <circle className="flavor-core" cx="260" cy="180" r="56" />
      <path className="flavor-mark" d="M260 151 C239 130 213 151 223 174 C233 196 260 207 260 207 C260 207 287 196 297 174 C307 151 281 130 260 151Z" />
      <g className="flavor-word flower"><circle cx="260" cy="52" r="4"/><text x="260" y="36" textAnchor="middle">花香</text></g>
      <g className="flavor-word fruit"><circle cx="388" cy="180" r="4"/><text x="410" y="185">果香</text></g>
      <g className="flavor-word sweet"><circle cx="260" cy="308" r="4"/><text x="260" y="335" textAnchor="middle">甜感</text></g>
      <g className="flavor-word finish"><circle cx="132" cy="180" r="4"/><text x="86" y="185">回甘</text></g>
    </svg>
  );
}

export default function HotAirStory() {
  const [active, setActive] = useState(0);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const observers = itemRefs.current.map((node, index) => {
      if (!node) return null;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActive(index);
        },
        { rootMargin: "-34% 0px -44% 0px", threshold: 0.2 },
      );
      observer.observe(node);
      return observer;
    });

    return () => observers.forEach((observer) => observer?.disconnect());
  }, []);

  return (
    <section id="roasting" className="process-story">
      <div className="process-intro section-shell">
        <p className="section-kicker light">PRECISION HOT AIR ROASTING</p>
        <h2>每一次滾動，<br />只看懂一件事。</h2>
        <p>Hero 呈現真實烘焙；這裡則拆解原理。從熱風進入，到風味被留下，五個步驟看懂 KD Coffee 的流床式烘焙。</p>
      </div>

      <div className="process-layout section-shell">
        <aside className="process-sticky" aria-live="polite">
          <div className="process-visual-card">
            <div className="process-visual-head">
              <span>{steps[active].no}</span>
              <strong>{steps[active].label}</strong>
            </div>
            <StepVisual type={steps[active].visual} />
            <div className="process-progress" aria-hidden="true">
              {steps.map((step, index) => <i key={step.no} className={index === active ? "is-active" : ""} />)}
            </div>
          </div>
        </aside>

        <div className="process-steps">
          {steps.map((step, index) => (
            <article
              key={step.no}
              ref={(node) => { itemRefs.current[index] = node; }}
              className={`process-step ${active === index ? "is-active" : ""}`}
            >
              <div className="process-step-meta">
                <span>{step.no}</span>
                <small>{step.label}</small>
              </div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
