export const viewerStyle = String.raw`
:root{color-scheme:light;--paper:#fffdf8;--base:#f4f1e8;--ink:#29271f;--muted:#595a4c;--line:#d8d3c6;--olive:#49593d;--soft:#e8eddf;--coffee:#553a2a}
*{box-sizing:border-box} [hidden]{display:none!important}
body{margin:0;background:var(--base);color:var(--ink);font:16px/1.55 system-ui,"Microsoft JhengHei",sans-serif}
header{background:var(--paper);border-bottom:1px solid var(--line)}
.wrap{width:min(100% - 40px,1280px);margin:auto}.mast{padding:28px 0 22px}
.eyebrow{font-size:.8rem;font-weight:750;letter-spacing:.16em;color:var(--olive);margin:0 0 5px}
h1,h2,h3,p{margin:0}h1{font-size:clamp(1.6rem,3.8vw,2.6rem);line-height:1.2;letter-spacing:-.025em}
h2{font-size:1.35rem;margin-bottom:12px}h3{font-size:1.02rem}.lede{color:var(--muted);margin-top:9px}
nav{display:flex;gap:4px 12px;flex-wrap:wrap;margin-top:17px}nav a{padding:6px 9px;font-weight:650;text-decoration:none;border-radius:6px}
a{color:var(--olive);text-underline-offset:3px}nav a:hover,nav a[aria-current=page]{background:var(--soft)}
main.wrap{padding:25px 0 36px}section{margin-bottom:22px;scroll-margin-top:12px}
.panel,.metric,.node,dialog{background:var(--paper);border:1px solid var(--line);border-radius:12px}
.panel{padding:20px}.section-intro,.note{color:var(--muted);margin:0 0 12px}
.notice{border-left:4px solid #7e7955;background:#eeebdd;padding:10px 13px;margin:0 0 18px}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:10px;margin-bottom:19px}
.metric{padding:13px 16px}.metric strong{display:block;color:var(--olive);font-size:1.55rem;overflow-wrap:anywhere}.metric strong.long{font-size:.9rem}
dl{display:grid;grid-template-columns:minmax(100px,max-content) minmax(0,1fr);gap:6px 15px;margin:0}
dt,.muted{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}code{overflow-wrap:anywhere}
button,input,select{font:inherit;color:inherit}button,select{border:1px solid #aba894;border-radius:7px;background:var(--paper);min-height:38px;padding:5px 10px}
button{cursor:pointer}button:hover:not(:disabled){background:var(--soft)}button:disabled{opacity:.55;cursor:default}.primary{background:var(--olive);color:white;border-color:var(--olive);font-weight:650}
.primary:hover:not(:disabled){background:#35442b}:focus-visible{outline:3px solid #886142;outline-offset:2px}
input[type=search]{border:1px solid #aba894;background:var(--paper);border-radius:7px;min-height:42px;padding:8px 11px;width:100%}
.searchbar,.tools,.pager{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.searchbar label{flex:1;min-width:min(100%,240px)}.searchbar select{max-width:100%}
.searchbar{margin-bottom:8px}.pager{margin-top:10px}.pager output{min-width:6ch;text-align:center}.tools{margin-bottom:10px}.tools output{min-width:55px;text-align:center}
.searchbar label:has(select){flex:0 1 auto;min-width:0}
.tools label{max-width:100%}.tools select{max-width:100%}.tools button[aria-pressed=true]{background:var(--soft);border-color:var(--olive);font-weight:700}
.graph-view{border:1px solid var(--line);border-radius:10px;background:#eeecdf;min-height:250px;height:clamp(370px,58vh,670px);overflow:auto;cursor:grab;overscroll-behavior:contain}
.graph-view.drag{cursor:grabbing;user-select:none}.canvas{position:relative;min-width:100%}
.edges{position:absolute;inset:0;pointer-events:none;color:#888d73}.edges path{fill:none;stroke:currentColor;stroke-width:2}
.node{position:absolute;width:264px;height:168px;display:flex;flex-direction:column;justify-content:space-between;padding:10px 12px;box-shadow:0 3px 10px #36332010;cursor:auto}
.node.root{border-top:4px solid var(--olive)}.node.hit{outline:3px solid #9d714a;outline-offset:3px}.node-head{display:flex;justify-content:space-between;gap:6px;align-items:start}
.name-button{font-size:1.02rem;font-weight:750;min-height:0;padding:0;border:0;background:transparent;text-align:left;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--coffee)}
.badge{color:#3d4e31;background:var(--soft);border-radius:5px;padding:1px 6px;flex-shrink:0;font-size:.77rem;max-width:7rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta,.numbers{font-size:.9rem;overflow-wrap:anywhere}.numbers{font-weight:650}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.node-actions{display:flex;gap:5px;flex-wrap:wrap}.node-actions button{padding:2px 7px;min-height:29px;font-size:.8rem}
.results{display:grid;gap:7px}.row{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)}
.row>div{min-width:0}.row strong{overflow-wrap:anywhere}.row button{flex-shrink:0}
dialog{max-width:min(94vw,640px);width:100%;max-height:86vh;padding:22px;color:var(--ink)}dialog::backdrop{background:#27251d70}
dialog .tools{justify-content:space-between}dialog dl{margin:10px 0 18px}.relations{list-style:none;padding:0;margin:0}.relations li{margin:4px 0;overflow-wrap:anywhere}
dialog section{margin-bottom:0}dialog .detail-tabs{justify-content:flex-start;padding-bottom:12px;border-bottom:1px solid var(--line)}
.order-controls{align-items:end}.order-controls label{min-width:0}.order-row-actions{display:grid;justify-items:end;gap:4px;text-align:right}.order-row-actions strong{overflow-wrap:anywhere}.order-row{font-size:.93rem}
.order-stats{padding:12px;background:var(--base);border-radius:8px}.order-stats dd{font-weight:650}
#order-detail-title,#member-reward-list{overflow-wrap:anywhere}
details{border-top:1px solid var(--line);padding:10px 0}summary{cursor:pointer;font-weight:700;color:var(--coffee)}
.files{padding-left:19px;overflow-wrap:anywhere}.files li{padding:2px 0}.compact{margin:9px 0}.foot{color:var(--muted);margin-top:14px}
.mobile-only{display:none}
@media(max-width:650px){
 .wrap{width:calc(100% - 24px)}.mast{padding:20px 0 14px}.panel{padding:14px}main.wrap{padding-top:15px}
 nav{gap:4px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric{padding:9px}
 .desktop-only,.edges{display:none!important}.mobile-only{display:block}
 .graph-view{height:auto;max-height:67vh;min-height:125px;cursor:auto}.canvas{width:auto!important;height:auto!important;zoom:1!important;padding:10px}
 .node{position:relative;left:auto!important;top:auto!important;width:auto;height:auto;min-height:136px;gap:4px;margin:0 0 9px;margin-inline-start:calc(var(--indent) * 10px);border-inline-start:3px solid #888d73}
 .node.root{border-inline-start-color:var(--olive)}.node-actions button,.row button,button,select{min-height:40px}
 dl{grid-template-columns:minmax(0,1fr);gap:1px}dd{margin-bottom:7px}.searchbar label{flex-basis:100%}
 .order-stats,#order-detail-fields{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 8px}.order-stats dd,#order-detail-fields dd{margin:0}
 .order-controls select{width:100%}.order-row{align-items:start}.order-row-actions{max-width:40%}.order-row button{white-space:normal}
}
`;
