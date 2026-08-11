import fs from "node:fs/promises";
import path from "node:path";

const OFFICIAL = path.resolve("public/data/711-stores.json");
const PENDING = path.resolve("public/data/711-stores.pending.json");
const RAW_XML = path.resolve("data/711-raw.xml");
const BACKUP_DIR = path.resolve("data/store-backups");
const REPORT = path.resolve("data/711-update-report.json");
const ENDPOINT = "https://emap.pcsc.com.tw/EMapSDK.aspx";
const OFFICIAL_LOOKUP = "https://emap.pcsc.com.tw/emap.aspx";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const selfTest = args.includes("--self-test");
const inputArg = args.find((value) => value.startsWith("--input="));
const inputFile = inputArg ? path.resolve(inputArg.slice("--input=".length)) : "";
const useCache = args.includes("--use-cache");
const force = args.includes("--force");
const MAX_ATTEMPTS = 3;
const BUSY_COOLDOWN_MS = 15 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const today = () => new Date().toISOString().slice(0, 10);
const stamp = () => new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");

function decodeXml(value = "") {
  return value
    .replaceAll("<![CDATA[", "")
    .replaceAll("]]>", "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .trim();
}

function values(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))]
    .map((match) => decodeXml(match[1]));
}

async function readDatabase(file = OFFICIAL) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    return {
      metadata: parsed?.metadata || {},
      stores: Array.isArray(parsed?.stores) ? parsed.stores : [],
    };
  } catch {
    return { metadata: {}, stores: [] };
  }
}

function normalizeCity(value) {
  return value.replace(/^臺北市$/, "台北市").replace(/^臺中市$/, "台中市").replace(/^臺南市$/, "台南市").replace(/^臺東縣$/, "台東縣");
}

function normalizeDistrict(city, value) {
  const raw = String(value || "").replace(/\s+/g, "").trim();
  if (!raw) return "";

  // 直轄市與省轄市的下一層行政區一律以「區」結尾。
  // 這可正確處理「前鎮區鎮興路」「平鎮區中豐路」「新市區中正路」，
  // 不會把名稱中的「鎮／市」誤認成行政區結尾。
  if (city.endsWith("市")) {
    const match = raw.match(/^(.+?區)/u);
    return match?.[1] || "";
  }

  // 縣的下一層行政區為鄉、鎮或縣轄市。
  const match = raw.match(/^(.+?(?:鄉|鎮|市))/u);
  return match?.[1] || "";
}

function parseAddress(address) {
  const compact = String(address || "")
    .replace(/^\d{3,6}/, "")
    .replace(/^台灣/, "")
    .replace(/\s+/g, "")
    .trim();

  const cityMatch = compact.match(/^(臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)/);
  const cityRaw = cityMatch?.[1] || "";
  const city = normalizeCity(cityRaw);
  const afterCity = cityRaw ? compact.slice(cityRaw.length) : compact;
  const district = normalizeDistrict(city, afterCity);
  const afterDistrict = district ? afterCity.slice(district.length) : afterCity;
  const roadMatch = afterDistrict.match(/^(.+?(?:大道|路|街|段|巷))/u);

  return {
    city,
    district,
    road: roadMatch?.[1] || "",
    address: compact,
  };
}

function runParserSelfTest() {
  const cases = [
    ["高雄市前鎮區鎮興路8號", "高雄市", "前鎮區"],
    ["桃園市平鎮區中豐路100號", "桃園市", "平鎮區"],
    ["台南市新市區中正路1號", "台南市", "新市區"],
    ["台南市左鎮區榮和里1號", "台南市", "左鎮區"],
    ["苗栗縣竹南鎮中正路1號", "苗栗縣", "竹南鎮"],
    ["屏東縣三地門鄉三地村1號", "屏東縣", "三地門鄉"],
    ["新竹縣竹北市光明六路1號", "新竹縣", "竹北市"],
  ];
  const failed = [];
  for (const [address, expectedCity, expectedDistrict] of cases) {
    const parsed = parseAddress(address);
    if (parsed.city !== expectedCity || parsed.district !== expectedDistrict) {
      failed.push(`${address} -> ${parsed.city}/${parsed.district}（預期 ${expectedCity}/${expectedDistrict}）`);
    }
  }
  if (failed.length) {
    console.error("❌ 行政區解析自我測試失敗：");
    failed.forEach((line) => console.error(`  - ${line}`));
    process.exit(2);
  }
  console.log(`✅ 行政區解析自我測試通過：${cases.length} 組`);
}

function validateResponse(xml) {
  const lowered = xml.toLowerCase();
  const knownError = ["e0001", "系統忙碌", "error", "exception", "access denied", "captcha"]
    .find((token) => lowered.includes(token.toLowerCase()));
  if (knownError) throw new Error(`資料來源回傳異常內容：${knownError}`);
  if (!xml.includes("<GeoPosition") && !xml.includes("<POIID")) {
    throw new Error("回傳內容不含門市資料節點");
  }
}

async function warmUpSession() {
  try {
    const response = await fetch(OFFICIAL_LOOKUP, {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-TW,zh;q=0.9,en;q=0.7",
        "cache-control": "no-cache",
        pragma: "no-cache",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36",
      },
      redirect: "follow",
    });
    const setCookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
    return setCookies.map((value) => value.split(";", 1)[0]).join("; ");
  } catch {
    return "";
  }
}

function requestHeaders(cookie = "") {
  const headers = {
    accept: "application/xml,text/xml,*/*",
    "accept-language": "zh-TW,zh;q=0.9,en;q=0.7",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36",
    referer: OFFICIAL_LOOKUP,
    origin: "https://emap.pcsc.com.tw",
  };
  if (cookie) headers.cookie = cookie;
  return headers;
}

async function fetchStoreXml(strategy, cookie, signal) {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (strategy === "POST") {
    const body = new URLSearchParams({
      commandid: "SearchStore",
      StoreName: "%",
      _: nonce,
    });
    return fetch(ENDPOINT, {
      method: "POST",
      headers: {
        ...requestHeaders(cookie),
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
      },
      body,
      redirect: "follow",
      signal,
    });
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("commandid", "SearchStore");
  url.searchParams.set("StoreName", "%");
  url.searchParams.set("_", nonce);
  return fetch(url, {
    method: "GET",
    headers: requestHeaders(cookie),
    redirect: "follow",
    signal,
  });
}

async function readValidCachedXml() {
  try {
    const stat = await fs.stat(RAW_XML);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > 14 * 24 * 60 * 60 * 1000) return null;
    const xml = await fs.readFile(RAW_XML, "utf8");
    validateResponse(xml);
    return { xml, ageHours: Math.round(ageMs / 3600000) };
  } catch {
    return null;
  }
}

async function writeFailureReport(error) {
  await writeJson(REPORT, {
    generatedAt: new Date().toISOString(),
    updaterVersion: "3.2",
    applied: false,
    reason: error.message,
    officialDatabasePreserved: true,
    advice: "官方 EMap 回傳系統忙碌時請先停止重試；可稍後再試、換網路，或用 --input 匯入瀏覽器下載的 XML。",
  });
}

async function downloadAllStoresXml() {
  let lastError;
  let consecutiveBusy = 0;
  const cookie = await warmUpSession();
  const strategies = ["POST", "GET"];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    const strategy = strategies[(attempt - 1) % strategies.length];
    try {
      console.log(`下載全台門市資料：第 ${attempt}/${MAX_ATTEMPTS} 次（${strategy}）`);
      const response = await fetchStoreXml(strategy, cookie, controller.signal);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const xml = await response.text();
      validateResponse(xml);
      await fs.mkdir(path.dirname(RAW_XML), { recursive: true });
      await fs.writeFile(RAW_XML, xml, "utf8");
      return xml;
    } catch (error) {
      lastError = error;
      const busy = /系統忙碌|e0001/i.test(error.message);
      consecutiveBusy = busy ? consecutiveBusy + 1 : 0;
      console.warn(`  失敗：${error.message}`);

      if (consecutiveBusy >= 2 && !force) {
        console.warn("  官方已連續回傳系統忙碌，v3.2 已停止密集重試，避免暫時限制持續延長。");
        break;
      }
      if (attempt < MAX_ATTEMPTS) {
        const waitMs = busy ? 30000 + Math.floor(Math.random() * 15000) : attempt * 5000;
        console.log(`  等待 ${Math.ceil(waitMs / 1000)} 秒後再試…`);
        await sleep(waitMs);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  if (useCache) {
    const cached = await readValidCachedXml();
    if (cached) {
      console.warn(`⚠ 官方暫時無法使用，改用 ${cached.ageHours} 小時前的有效原始 XML。`);
      return cached.xml;
    }
  }

  const error = lastError || new Error("全台門市資料下載失敗");
  await writeFailureReport(error);
  throw error;
}

function parseStores(xml) {
  validateResponse(xml);
  const ids = values(xml, "POIID");
  const names = values(xml, "POIName");
  const addresses = values(xml, "Address");
  const phones = values(xml, "Telno");
  const xs = values(xml, "X");
  const ys = values(xml, "Y");

  if (!ids.length) throw new Error("解析後門市數為 0，拒絕更新");
  if (names.length !== ids.length || addresses.length !== ids.length) {
    throw new Error(`XML 欄位數量不一致：店號 ${ids.length}、店名 ${names.length}、地址 ${addresses.length}`);
  }

  return ids.map((rawId, index) => {
    const parsedAddress = parseAddress(addresses[index]);
    return {
      id: String(rawId).replace(/\s/g, ""),
      name: names[index] || "",
      city: parsedAddress.city,
      district: parsedAddress.district,
      road: parsedAddress.road,
      address: parsedAddress.address,
      phone: (phones[index] || "").replace(/\s/g, ""),
      longitude: xs[index] && Number.isFinite(Number(xs[index])) ? Number(xs[index]) / 1_000_000 : undefined,
      latitude: ys[index] && Number.isFinite(Number(ys[index])) ? Number(ys[index]) / 1_000_000 : undefined,
      verified: true,
      verifiedAt: today(),
      source: "PCSC EMapSDK SearchStore StoreName=%",
    };
  }).filter((store) => store.id && store.name && store.address && store.city && store.district);
}

function dedupe(stores) {
  return [...new Map(stores.map((store) => [store.id, store])).values()]
    .sort((a, b) => `${a.city}${a.district}${a.name}`.localeCompare(`${b.city}${b.district}${b.name}`, "zh-Hant"));
}

function validate(stores) {
  const unique = dedupe(stores);
  const cityCounts = {};
  const districtCounts = {};
  for (const store of unique) {
    cityCounts[store.city] = (cityCounts[store.city] || 0) + 1;
    const key = `${store.city}${store.district}`;
    districtCounts[key] = (districtCounts[key] || 0) + 1;
  }

  const reasons = [];
  const coveredCities = Object.keys(cityCounts).length;
  const zeroImpossible = ["台北市大安區", "台北市信義區", "新北市板橋區", "高雄市鼓山區"]
    .filter((key) => !districtCounts[key]);
  const malformedDistricts = [...new Set(unique
    .filter((store) => store.city.endsWith("市") ? !store.district.endsWith("區") : !/[鄉鎮市]$/u.test(store.district))
    .map((store) => `${store.city}${store.district}`))];

  if (unique.length < 5000) reasons.push(`門市總數只有 ${unique.length} 間，低於安全門檻 5,000 間`);
  if (coveredCities < 20) reasons.push(`只有 ${coveredCities} 個縣市有資料，低於安全門檻 20 個`);
  if ((cityCounts["高雄市"] || 0) < 200) reasons.push(`高雄市只有 ${cityCounts["高雄市"] || 0} 間，資料明顯不完整`);
  if ((cityCounts["台北市"] || 0) < 300) reasons.push(`台北市只有 ${cityCounts["台北市"] || 0} 間，資料明顯不完整`);
  if ((cityCounts["新北市"] || 0) < 400) reasons.push(`新北市只有 ${cityCounts["新北市"] || 0} 間，資料明顯不完整`);
  if (zeroImpossible.length) reasons.push(`重要行政區缺資料：${zeroImpossible.join("、")}`);
  if (malformedDistricts.length) reasons.push(`行政區名稱格式異常：${malformedDistricts.slice(0, 20).join("、")}`);

  return { valid: reasons.length === 0, reasons, stores: unique, total: unique.length, coveredCities, cityCounts, districtCounts };
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

async function backupOfficial() {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    await fs.copyFile(OFFICIAL, path.join(BACKUP_DIR, `711-stores-${stamp()}.json`));
  } catch {
    // 首次建立時可能尚無正式檔案。
  }
}

if (selfTest) {
  runParserSelfTest();
  process.exit(0);
}

console.log("KD Coffee｜7-ELEVEN 全台門市匯入器 v3.2");
console.log("新增官方工作階段預熱、POST/GET 雙路徑、忙碌保護與安全快取；任何失敗都不會覆蓋正式資料。\n");

const oldDb = await readDatabase();
let xml;
try {
  if (inputFile) {
    console.log(`讀取本機 XML：${inputFile}`);
    xml = await fs.readFile(inputFile, "utf8");
  } else {
    xml = await downloadAllStoresXml();
  }
} catch (error) {
  console.error(`\n❌ 無法取得原始門市資料：${error.message}`);
  console.error("正式 711-stores.json 沒有被修改。");
  console.error("可在瀏覽器下載 XML 後執行：npm run update:711 -- --input=檔案路徑");
  process.exit(2);
}

let status;
try {
  status = validate(parseStores(xml));
} catch (error) {
  console.error(`\n❌ 解析失敗：${error.message}`);
  console.error("正式 711-stores.json 沒有被修改。");
  process.exit(2);
}

const payload = {
  metadata: {
    title: "KD Coffee 7-ELEVEN 門市資料庫",
    version: "3.2-resilient-import",
    lastUpdated: today(),
    generatedAt: new Date().toISOString(),
    sourceNote: "以 PCSC EMapSDK SearchStore / StoreName=% 取得全台門市；v3.2 使用工作階段預熱、POST/GET 雙路徑與忙碌保護，通過完整性檢查後才覆蓋正式資料。",
    officialLookupUrl: OFFICIAL_LOOKUP,
    isComplete: status.valid,
    storeCount: status.total,
    coveredCities: status.coveredCities,
    validationErrors: status.reasons,
    cityCounts: status.cityCounts,
  },
  stores: status.stores,
};

await writeJson(PENDING, payload);
await writeJson(REPORT, {
  generatedAt: new Date().toISOString(),
  dryRun,
  oldStoreCount: oldDb.stores.length,
  candidateStoreCount: status.total,
  coveredCities: status.coveredCities,
  valid: status.valid,
  reasons: status.reasons,
  cityCounts: status.cityCounts,
  pendingFile: PENDING,
  rawXmlFile: inputFile || RAW_XML,
});

console.log("\n========================================");
console.log(`舊正式資料：${oldDb.stores.length} 間`);
console.log(`候選資料：${status.total} 間／${status.coveredCities} 個縣市`);
for (const [city, count] of Object.entries(status.cityCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${city}：${count} 間`);
}

if (!status.valid) {
  console.error("\n❌ 完整性檢查未通過，正式資料完全沒有被覆蓋。");
  status.reasons.forEach((reason) => console.error(`  - ${reason}`));
  console.error(`候選檔：${PENDING}`);
  process.exit(2);
}

if (dryRun) {
  console.log("\n✅ 候選資料通過檢查；本次為 --dry-run，尚未覆蓋正式檔案。");
  process.exit(0);
}

await backupOfficial();
await fs.copyFile(PENDING, OFFICIAL);
console.log("\n✅ 完整性檢查通過，已安全更新正式門市資料。");
console.log(`正式資料：${OFFICIAL}`);
console.log(`原始 XML：${inputFile || RAW_XML}`);
