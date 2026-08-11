"use client";
import { useEffect, useMemo, useState } from "react";

type Store = {
  id:string; city:string; district:string; road:string; name:string; address:string;
  phone?:string; verified?:boolean; verifiedAt?:string; source?:string;
};
type StoreFile = { metadata?: { lastUpdated?: string; officialLookupUrl?: string; isComplete?: boolean; coverageNote?:string }; stores?: Store[] };

function normalizeDistrict(city:string, value:string){
  const raw=String(value||"").replace(/\s+/g,"").trim();
  if(!raw) return "";
  if(city.endsWith("市")) return raw.match(/^(.+?區)/u)?.[1] || raw;
  return raw.match(/^(.+?(?:鄉|鎮|市))/u)?.[1] || raw;
}

export default function StoreSelector({ required = true, initialStore }: { required?: boolean; initialStore?: { id:string; name:string; address:string; city?:string; district?:string } }) {
  const [stores,setStores]=useState<Store[]>([]);
  const [city,setCity]=useState("");
  const [district,setDistrict]=useState("");
  const [road,setRoad]=useState("");
  const [selected,setSelected]=useState<Store|null>(null);
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [meta,setMeta]=useState<StoreFile["metadata"]>({});
  const [manual,setManual]=useState(false);
  const [manualStore,setManualStore]=useState({id:"",name:"",address:""});

  async function loadStores() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/data/711-stores.json", { cache: "no-store" });
      if (!response.ok) throw new Error("無法讀取網站內建門市資料");
      const data: StoreFile = await response.json();
      const list = Array.isArray(data.stores) ? data.stores.filter(s=>s.id&&s.name&&s.city&&s.district&&s.address).map(s=>({...s,district:normalizeDistrict(s.city,s.district)})) : [];
      setStores(list); setMeta(data.metadata || {});
      const saved=localStorage.getItem("kdcoffee-favorite-store");
      if(saved) {
        try {
          const old=JSON.parse(saved) as Store;
          const current=list.find(s=>s.id===old.id);
          if(current){ setSelected(current); setCity(current.city); setDistrict(current.district); setRoad(current.road || ""); }
        } catch {}
      }
    } catch (e) {
      setStores([]); setError(e instanceof Error ? e.message : "目前無法讀取門市資料");
    } finally { setLoading(false); }
  }

  useEffect(()=>{ loadStores(); },[]);
  useEffect(()=>{
    if (!initialStore?.id || !stores.length || selected) return;
    const current=stores.find(s=>s.id===initialStore.id);
    if(current){ setSelected(current); setCity(current.city); setDistrict(current.district); setRoad(current.road || ""); }
  },[initialStore,stores,selected]);
  const cities=useMemo(()=>[...new Set(stores.map(s=>s.city))].sort((a,b)=>a.localeCompare(b,"zh-Hant")),[stores]);
  const districts=useMemo(()=>[...new Set(stores.filter(s=>s.city===city).map(s=>s.district))].sort((a,b)=>a.localeCompare(b,"zh-Hant")),[stores,city]);
  const districtStores=useMemo(()=>stores.filter(s=>s.city===city&&s.district===district),[stores,city,district]);
  const roads=useMemo(()=>[...new Set(districtStores.map(s=>s.road).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-Hant")),[districtStores]);
  const choices=useMemo(()=>districtStores.filter(s=>
    (!road||s.road===road) && (!query||`${s.name}${s.address}${s.id}${s.road}`.toLowerCase().includes(query.trim().toLowerCase()))
  ),[districtStores,road,query]);
  function choose(s:Store){setSelected(s);setManual(false);localStorage.setItem("kdcoffee-favorite-store",JSON.stringify(s));}
  function switchManual(){setManual(v=>!v);setSelected(null);}
  const officialUrl=meta?.officialLookupUrl || "https://emap.pcsc.com.tw/emap.aspx";
  const finalStore = manual ? manualStore : (selected || {id:"",name:"",address:""});
  const manualComplete = !manual || (!!manualStore.id && !!manualStore.name && !!manualStore.address);

  return <div className="store-selector">
    <div className="store-external-check">
      <div><b>找不到門市也能完成訂單</b><span>先用網站資料選店；若資料尚未收錄，開啟官方查詢後，回來手動填入店號、店名與地址。</span></div>
      <a href={officialUrl} target="_blank" rel="noopener noreferrer">開啟官方門市查詢 ↗</a>
    </div>
    {loading && <div className="store-loading"><b>正在讀取網站門市資料…</b></div>}
    {error && <div className="store-data-error"><b>目前無法讀取門市資料</b><span>{error}</span><button type="button" onClick={loadStores}>重新載入</button></div>}
    {!loading&&!error&&<>
      <div className="store-data-status">
        <span>網站資料更新：{meta?.lastUpdated || "未標示"}</span>
        <span>已收錄 {stores.length} 間{meta?.isComplete === false ? "・持續建置中" : ""}</span>
      </div>
      {meta?.coverageNote&&<p className="store-coverage-note">{meta.coverageNote}</p>}
      {!manual&&<>
        <div className="store-selector-grid">
          <label>縣市<select value={city} onChange={e=>{setCity(e.target.value);setDistrict("");setRoad("");setSelected(null);setQuery("")}}><option value="">請選擇縣市</option>{cities.map(x=><option key={x}>{x}</option>)}</select></label>
          <label>行政區<select value={district} onChange={e=>{setDistrict(e.target.value);setRoad("");setSelected(null);setQuery("")}} disabled={!city}><option value="">請選擇行政區</option>{districts.map(x=><option key={x}>{x}</option>)}</select></label>
        </div>
        {city&&district&&<>
          <label>路名 <small>選填，用來縮小範圍</small><select value={road} onChange={e=>{setRoad(e.target.value);setSelected(null)}}><option value="">顯示此區全部門市</option>{roads.map(x=><option key={x}>{x}</option>)}</select></label>
          <label>快速搜尋 <small>選填</small><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="輸入路名、門市名稱、地址或店號" /></label>
          <div className="store-result-heading"><b>{district}全部門市</b><span>已收錄 {districtStores.length} 間・符合 {choices.length} 間</span></div>
          <div className="store-results">{choices.map(s=><button type="button" className={selected?.id===s.id?"selected":""} key={s.id} onClick={()=>choose(s)}><strong>{s.name}{s.verified&&<em>已核對</em>}</strong><span>{s.address}</span><small>店號 {s.id}{s.road ? `・${s.road}` : ""}{s.phone ? `・${s.phone}` : ""}</small></button>)}{!choices.length&&<p>網站尚未收錄符合條件的門市。請使用官方查詢，再切換成下方「手動填入門市」。</p>}</div>
        </>}
        {selected&&<div className="selected-store"><b>已選擇：{selected.name}</b><span>{selected.address}</span><small>店號 {selected.id}{selected.verifiedAt ? `・核對日期 ${selected.verifiedAt}` : ""}</small></div>}
      </>}
      <button className="manual-store-toggle" type="button" onClick={switchManual}>{manual ? "返回網站門市清單" : "找不到門市？手動填入官方查詢結果"}</button>
      {manual&&<div className="manual-store-fields">
        <p>請先在官方門市查詢找到門市，再完整填入以下三項。KD Coffee 建立寄件單前會再次核對。</p>
        <label>門市店號<input value={manualStore.id} onChange={e=>setManualStore({...manualStore,id:e.target.value.replace(/\D/g,"").slice(0,10)})} inputMode="numeric" placeholder="例如 231152" required={required}/></label>
        <label>門市名稱<input value={manualStore.name} onChange={e=>setManualStore({...manualStore,name:e.target.value.slice(0,30)})} placeholder="例如 福賜門市" required={required}/></label>
        <label>門市地址<input value={manualStore.address} onChange={e=>setManualStore({...manualStore,address:e.target.value.slice(0,100)})} placeholder="請貼上完整地址" required={required}/></label>
      </div>}
    </>}
    <input type="hidden" name="storeId" value={finalStore.id}/><input type="hidden" name="storeName" value={finalStore.name}/><input type="hidden" name="storeAddress" value={finalStore.address}/>
    {required && <input className="store-required-proxy" aria-hidden="true" tabIndex={-1} required value={manualComplete && finalStore.id ? "ok" : ""} onChange={()=>{}} />}
  </div>;
}
