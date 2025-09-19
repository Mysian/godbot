"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const lockfile = require("proper-lockfile");
const crypto = require("crypto");
const _nodeFetch = async (...args) => {
  const { default: f } = await import('node-fetch');
  return f(...args);
};
const fetchSafe = (...args) => (global.fetch ? global.fetch(...args) : _nodeFetch(...args));

/* =========================
 * 공통 설정
 * ========================= */
const DATA_DIR = path.join(__dirname, "../data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const MEMO_DIR = path.join(DATA_DIR, "memos");
if (!fs.existsSync(MEMO_DIR)) fs.mkdirSync(MEMO_DIR, { recursive: true });

const CUSTOM_PREFIX = "util:";     // 공통 prefix
const CALC_PREFIX   = "calc:";     // 계산기
const MEMO_PREFIX   = "memo:";     // 메모장
const LOTTO_PREFIX  = "lotto:";    // 복권
const CONCH_PREFIX  = "conch:";    // 소라고동
const IMG_PREFIX    = "img:";      // 이미지 검색

// 메모 페이징
const MEMO_PAGE_SIZE = 10;

// 계산기 세션 (메모리는 일시적이라 충분)
const calcSessions = new Map(); // userId -> { a, b, op, input, last, updatedAt, hist, showHist }

/* =========================
 * 이미지 검색 세션
 * ========================= */
const imageSessions = new Map(); // sessionId -> { q, lang, list, idx, shared, ownerId, createdAt }
const IMG_SESSION_TTL_MS = 60 * 60 * 1000; // 60분

// 이미지 제공자 키 (있으면 사용, 없으면 건너뜀)
const IMG_CFG = {
  bingKey: process.env.BING_KEY || process.env.BING_IMAGE_KEY,
  bingEndpoint: process.env.BING_IMAGE_ENDPOINT || "https://api.bing.microsoft.com/v7.0/images/search",
  googleKey: process.env.GOOGLE_API_KEY,
  googleCseId: process.env.GOOGLE_CSE_ID,
  naverId: process.env.NAVER_CLIENT_ID,
  naverSecret: process.env.NAVER_CLIENT_SECRET,
};

const BLOCKED_HOSTS = [
  "pinterest.", "pinimg.com",
  "gettyimages.", "istockphoto.", "shutterstock.", "alamy.", "adobestock.", "depositphotos.",
  "artstation.", "behance.", "pixiv."
];
const getHost = (u) => { try { return new URL(u).hostname; } catch { return ""; } };

/* =========================
 * 유틸 함수
 * ========================= */
function formatKST(ts) {
  if (ts == null) return "";
  const d = new Date(ts);
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}
function clampLen(str, max) {
  if (!str) return "";
  return str.length <= max ? str : (str.slice(0, max - 1) + "…");
}
function nowKST() {
  const now = new Date();
  return now;
}
function seedFromString(s) {
  const h = crypto.createHash("sha256").update(s).digest();
  return h.readUInt32LE(0);
}
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function weekKeyKST(d = nowKST()) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const onejan = new Date(dt.getFullYear(), 0, 1);
  const dayms = 24 * 60 * 60 * 1000;
  const week = Math.ceil((((dt - onejan) / dayms) + onejan.getDay() + 1) / 7);
  return `${dt.getFullYear()}-${String(week).padStart(2, "0")}`;
}
function pickRandom(arr, seedStr = String(Date.now())) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const r = mulberry32(seedFromString(seedStr))();
  const idx = Math.floor(r * arr.length);
  return { item: arr[idx], idx };
}
function hasHangul(s) {
  return /[가-힣]/.test(s || "");
}
function detectLang(q) {
  return hasHangul(q) ? "ko-KR" : "en-US";
}
function pruneOldImageSessions() {
  const now = Date.now();
  for (const [k, v] of imageSessions.entries()) {
    if ((now - (v.createdAt || 0)) > IMG_SESSION_TTL_MS) imageSessions.delete(k);
  }
}
function proxyUrl(u) {
  try {
    const dest = new URL(u);
    const target = (dest.hostname + dest.pathname + (dest.search || ""));
    return `https://images.weserv.nl/?url=${encodeURIComponent(target)}&n=-1`;
  } catch { return null; }
}

async function probeImage(u, timeoutMs = 6000) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetchSafe(u, {
      method: "GET",
      signal: ctrl.signal,
      headers: {
        "Range": "bytes=0-1023",
        "User-Agent": "Discordbot/2.0",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "ko,en;q=0.9",
        "Referer": "https://discord.com",
      }
    }).catch(() => null);
    clearTimeout(timer);
    if (!r || !r.ok) return false;
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    return ct.startsWith("image/");
  } catch { return false; }
}

const { AttachmentBuilder } = require("discord.js");

function extFromCT(ct) {
  if (!ct) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  return "jpg";
}

async function prepareForDiscord(u) {
  // 1) 직통 테스트
  if (await probeImage(u)) return { url: u, file: null };

  // 2) 프록시 재시도
  const pu = proxyUrl(u);
  if (pu && await probeImage(pu)) return { url: pu, file: null };

  // 3) 파일 첨부 폴백 (용량 7MB 제한)
  const tryUrl = pu || u;
  try {
    const r = await fetchSafe(tryUrl, {
      headers: {
        "User-Agent": "Discordbot/2.0",
        "Referer": "https://discord.com",
        "Accept": "image/*;q=0.9,*/*;q=0.1"
      }
    });
    if (!r || !r.ok) return { url: u, file: null };
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    const ab = await r.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length > 7 * 1024 * 1024) {
      // 너무 크면 프록시에 리사이즈 파라미터 추가 시도
      const shrink = (pu ? pu : proxyUrl(u)) + "&w=1600&output=jpg";
      return { url: shrink, file: null };
    }
    const name = `img.${extFromCT(ct)}`;
    const file = new AttachmentBuilder(buf, { name });
    return { url: `attachment://${name}`, file };
  } catch {
    return { url: u, file: null };
  }
}


// 과하게 느려지지 않도록 순차-빠른중지 방식
async function ensureUsable(urls, maxKeep = 12) {
  const out = [];
  for (const raw of urls) {
    if (out.length >= maxKeep) break;
    const u = sanitizeImageUrl(raw);
    if (!u) continue;
    if (await probeImage(u)) { out.push(u); continue; }
    // 프록시 재시도
    const pu = proxyUrl(u);
    if (pu && await probeImage(pu)) out.push(pu);
  }
  return out;
}

async function withTimeout(promise, ms, onTimeout = null) {
  let timer;
  try {
    const race = Promise.race([
      promise,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => resolve(Symbol.for("TIMEOUT")), ms);
      })
    ]);
    const res = await race;
    if (res === Symbol.for("TIMEOUT")) {
      return typeof onTimeout === "function" ? onTimeout() : null;
    }
    return res;
  } finally {
    if (timer) clearTimeout(timer);
  }
}



/* =========================
 * 메모 파일 IO (proper-lockfile)
 * ========================= */
function memoFile(userId) {
  return path.join(MEMO_DIR, `${userId}.json`);
}
function ensureMemoFile(userId) {
  const f = memoFile(userId);
  if (!fs.existsSync(f)) fs.writeFileSync(f, "[]", "utf8");
  return f;
}
async function readMemos(userId) {
  const f = ensureMemoFile(userId);
  const release = await lockfile.lock(f, { retries: { retries: 5, factor: 1.5, minTimeout: 50 } });
  try {
    const raw = fs.readFileSync(f, "utf8").trim();
    let arr = [];
    if (raw) arr = JSON.parse(raw);
    const now = Date.now();
    let changed = false;
    arr = arr.filter(m => {
      if (!m.expiresAt) return true;
      const keep = now <= m.expiresAt;
      if (!keep) changed = true;
      return keep;
    });
    if (changed) fs.writeFileSync(f, JSON.stringify(arr, null, 2), "utf8");
    return arr;
  } finally {
    await release();
  }
}
async function writeMemos(userId, list) {
  const f = ensureMemoFile(userId);
  const release = await lockfile.lock(f, { retries: { retries: 5, factor: 1.5, minTimeout: 50 } });
  try {
    fs.writeFileSync(f, JSON.stringify(list, null, 2), "utf8");
  } finally {
    await release();
  }
}

/* =========================
 * 계산기
 * ========================= */
function renderCalcEmbed(userId) {
  const st = calcSessions.get(userId) || { a: null, b: null, op: null, input: "", last: null, updatedAt: Date.now(), hist: [], showHist: false };
  const { a, op, input, last } = st;
  const display = input || (a !== null ? String(a) : "0");
  const expr = `${a !== null ? a : ""} ${op || ""} ${input ? input : ""}`.trim() || (last !== null ? `ans: ${last}` : "ready");
  const eb = new EmbedBuilder()
    .setTitle("🧮 계산기")
    .setDescription("간단 계산 현황")
    .addFields(
      { name: "표시", value: "```\n" + display + "\n```", inline: false },
      { name: "식", value: expr || "-", inline: false },
    )
    .setColor(0x5865F2);

  if (st.showHist && Array.isArray(st.hist) && st.hist.length) {
    const lines = st.hist.slice(0, 8).join("\n");
    eb.addFields({ name: "최근 계산 (최대 10개)", value: "```\n" + lines + "\n```", inline: false });
  }
  return eb;
}
function renderCalcButtons(st) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CALC_PREFIX + "key|7").setLabel("7").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CALC_PREFIX + "key|8").setLabel("8").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CALC_PREFIX + "key|9").setLabel("9").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CALC_PREFIX + "op|muldiv").setLabel("x/÷").setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CALC_PREFIX + "key|4").setLabel("4").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CALC_PREFIX + "key|5").setLabel("5").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CALC_PREFIX + "key|6").setLabel("6").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CALC_PREFIX + "op|-").setLabel("-").setStyle(ButtonStyle.Primary),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CALC_PREFIX + "key|1").setLabel("1").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CALC_PREFIX + "key|2").setLabel("2").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CALC_PREFIX + "key|3").setLabel("3").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CALC_PREFIX + "op|+").setLabel("+").setStyle(ButtonStyle.Primary),
  );
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CALC_PREFIX + "neg").setLabel("+/-").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CALC_PREFIX + "key|0").setLabel("0").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CALC_PREFIX + "dot").setLabel(".").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CALC_PREFIX + "eq").setLabel("=").setStyle(ButtonStyle.Success),
  );
  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CALC_PREFIX + "clear").setLabel("CLEAR").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(CALC_PREFIX + "history").setLabel("HISTORY").setStyle(ButtonStyle.Secondary),
  );
  return [row1, row2, row3, row4, row5];
}
function pushDigit(st, d) {
  if (!st.input) st.input = d;
  else st.input += d;
}
function pushDot(st) {
  if (!st.input) st.input = "0.";
  else if (!st.input.includes(".")) st.input += ".";
}
function toggleSign(st) {
  if (!st.input) st.input = "0";
  if (st.input.startsWith("-")) st.input = st.input.slice(1);
  else st.input = "-" + st.input;
}
function applyOp(st, op) {
  if (op === "muldiv") {
    if (st.op === "*" ) st.op = "/";
    else if (st.op === "/") st.op = "*";
    else st.op = "*";
    if (st.a === null && st.input) {
      st.a = Number(st.input);
      st.input = "";
    }
    return;
  }
  if (st.a === null && st.input) {
    st.a = Number(st.input);
    st.input = "";
  }
  st.op = op;
}
function pushHistory(st, a, op, b, res) {
  try {
    const line = `${a} ${op} ${b} = ${Number.isFinite(res) ? res : String(res)}`;
    st.hist = Array.isArray(st.hist) ? st.hist : [];
    st.hist.unshift(line);
    if (st.hist.length > 10) st.hist.length = 10;
  } catch { /* noop */ }
}
function calcEqual(st) {
  const a = st.a;
  const b = st.input ? Number(st.input) : null;
  if (a === null || st.op === null || b === null) return;
  let res = 0;
  if (st.op === "+") res = a + b;
  else if (st.op === "-") res = a - b;
  else if (st.op === "*") res = a * b;
  else if (st.op === "/") res = b === 0 ? NaN : a / b;

  st.last = res;
  pushHistory(st, a, st.op, b, res);
  st.a = res;
  st.input = "";
  st.op = null;
  st.updatedAt = Date.now();
}

/* =========================
 * 메모장
 * ========================= */
function renderMemoListEmbed(userId, list, page, query) {
  const total = list.length;
  const maxPage = Math.max(0, Math.ceil(total / MEMO_PAGE_SIZE) - 1);
  const p = Math.min(Math.max(0, page), maxPage);
  const start = p * MEMO_PAGE_SIZE;
  const slice = list.slice(start, start + MEMO_PAGE_SIZE);

  const lines = slice.map((m, i) => {
    const idx = start + i + 1;
    const title = clampLen(m.title || "(제목 없음)", 40);
    const d = formatKST(m.createdAt);
    return `**${idx}.** ${title} ・ ${d}`;
  });
  const desc = (query ? `🔎 검색어: **${query}**\n` : "") + (lines.length ? lines.join("\n") : "메모가 없습니다.");

  return new EmbedBuilder()
    .setTitle("📒 메모장")
    .setDescription(desc)
    .setFooter({ text: `총 ${total}개 ・ ${p + 1}/${maxPage + 1}` })
    .setColor(0x2ECC71);
}
function renderMemoListButtons(list, page, query) {
  const total = list.length;
  const maxPage = Math.max(0, Math.ceil(total / MEMO_PAGE_SIZE) - 1);
  const p = Math.min(Math.max(0, page), maxPage);
  const start = p * MEMO_PAGE_SIZE;
  const slice = list.slice(start, start + MEMO_PAGE_SIZE);

  const rowA = new ActionRowBuilder();
  const rowB = new ActionRowBuilder();

  slice.forEach((m, i) => {
    const idx = start + i + 1;
    const btn = new ButtonBuilder()
      .setCustomId(MEMO_PREFIX + `open|${m.id}|${p}`)
      .setLabel(String(idx))
      .setStyle(ButtonStyle.Secondary);
    if (i < 5) rowA.addComponents(btn); else rowB.addComponents(btn);
  });

  const rowNav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(MEMO_PREFIX + `prev|${p}`).setLabel("◀ 이전").setStyle(ButtonStyle.Primary).setDisabled(p <= 0),
    new ButtonBuilder().setCustomId(MEMO_PREFIX + "page").setLabel(`${p + 1}/${maxPage + 1}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(MEMO_PREFIX + `next|${p}`).setLabel("다음 ▶").setStyle(ButtonStyle.Primary).setDisabled(p >= maxPage),
    new ButtonBuilder().setCustomId(MEMO_PREFIX + `search|${query ? encodeURIComponent(query) : ""}|${p}`).setEmoji("🔎").setLabel("검색").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(MEMO_PREFIX + `add|${p}`).setEmoji("➕").setLabel("새 메모").setStyle(ButtonStyle.Success),
  );

  const rows = [];
  if (rowA.components.length) rows.push(rowA);
  if (rowB.components.length) rows.push(rowB);
  rows.push(rowNav);
  return rows;
}
function renderMemoDetailEmbed(m) {
  const exp = m.expiresAt ? formatKST(m.expiresAt) : "무기한";
  const body = (m.body && m.body.trim().length) ? m.body : "(내용 없음)";
  const bodyBox = "```\n" + body + "\n```";

  return new EmbedBuilder()
    .setTitle(`🗒 ${m.title || "(제목 없음)"}`)
    .setDescription(bodyBox)
    .addFields({ name: "보관 기한", value: exp, inline: false })
    .setFooter({ text: `작성: ${formatKST(m.createdAt)} ・ ID: ${m.id}` })
    .setColor(0x3498DB);
}
function renderMemoDetailButtons(page) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(MEMO_PREFIX + `back|${page}`).setLabel("목록으로").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(MEMO_PREFIX + `edit|${page}`).setLabel("수정").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(MEMO_PREFIX + `del`).setEmoji("🗑").setLabel("삭제").setStyle(ButtonStyle.Danger),
    ),
  ];
}

/* =========================
 * 복권번호
 * ========================= */
function bestBuyDay(userId) {
  const key = weekKeyKST(nowKST());
  const seed = seedFromString(`${userId}:${key}`);
  const rnd = mulberry32(seed)();
  const idx = Math.floor(rnd * 6);
  const days = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  return days[idx];
}
function genLottoLines(n = 5, seedStr = String(Date.now())) {
  const rng = mulberry32(seedFromString(seedStr));
  const lines = [];
  for (let i = 0; i < n; i++) {
    const set = new Set();
    while (set.size < 6) {
      const v = 1 + Math.floor(rng() * 45);
      set.add(v);
    }
    const arr = [...set].sort((a, b) => a - b);
    lines.push(arr);
  }
  return lines;
}
function renderLottoEmbed(userId, lines) {
  const day = bestBuyDay(userId);
  const desc = lines.map((arr, i) => `**${i + 1}**) ${arr.join(", ")}`).join("\n");
  return new EmbedBuilder()
    .setTitle("🎟 복권 번호 추첨")
    .setDescription(`이번 주 추천 요일: **${day}**\n\n${desc}`)
    .setColor(0xF1C40F);
}
function renderLottoButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(LOTTO_PREFIX + "regen").setLabel("다시 뽑기").setStyle(ButtonStyle.Success),
    ),
  ];
}

/* =========================
 * 이미지 검색
 * ========================= */
function sanitizeImageUrl(u) {
  if (!u) return null;
  // 디스코드에서 잘 보이는 확장자 위주 필터(엄격 X)
  if (!/^https?:\/\//i.test(u)) return null;
  return u.replace(/^http:\/\//i, "https://");
}
async function searchBingImages(q, lang) {
  if (!IMG_CFG.bingKey) return [];
  const url = new URL(IMG_CFG.bingEndpoint);
  url.searchParams.set("q", q);
  url.searchParams.set("count", "50");
  url.searchParams.set("safeSearch", "Moderate");
  url.searchParams.set("mkt", lang || "ko-KR");
  url.searchParams.set("imageType", "Photo");
  const res = await fetchSafe(url, {
    headers: {
      "Ocp-Apim-Subscription-Key": IMG_CFG.bingKey,
      "Accept-Language": lang || "ko-KR",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!res.ok) return [];
  const json = await res.json();
  const items = Array.isArray(json.value) ? json.value : [];
  function pickBingUrl(v) {
  const cu = v.contentUrl || v.contentUrlHttps || "";
  const tu = v.thumbnailUrl || "";
  const h = getHost(cu);
  if (h && BLOCKED_HOSTS.some(b => h.includes(b))) return sanitizeImageUrl(tu || cu);
  return sanitizeImageUrl(cu || tu);
}
const urls = items.map(pickBingUrl).filter(Boolean);

  return urls;
}

async function searchGoogleImages(q, lang = "ko-KR") {
  if (!IMG_CFG.googleKey || !IMG_CFG.googleCseId) return [];
  const isKo = String(lang).toLowerCase().startsWith("ko");
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", IMG_CFG.googleKey);
  url.searchParams.set("cx", IMG_CFG.googleCseId);
  url.searchParams.set("q", q);
  url.searchParams.set("searchType", "image");
  url.searchParams.set("num", "10");
  url.searchParams.set("gl", isKo ? "kr" : "us");
  url.searchParams.set("lr", isKo ? "lang_ko" : "lang_en");
  const res = await fetchSafe(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return [];
  const j = await res.json();
  return (Array.isArray(j.items) ? j.items : []).map(it => sanitizeImageUrl(it.link)).filter(Boolean);
}

async function searchNaverImages(q) {
  if (!IMG_CFG.naverId || !IMG_CFG.naverSecret) return [];
  const url = new URL("https://openapi.naver.com/v1/search/image.json");
  url.searchParams.set("query", q);
  url.searchParams.set("display", "30");
  url.searchParams.set("sort", "sim");
  const res = await fetchSafe(url, {
    headers: {
      "X-Naver-Client-Id": IMG_CFG.naverId,
      "X-Naver-Client-Secret": IMG_CFG.naverSecret,
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!res.ok) return [];
  const json = await res.json();
  const items = Array.isArray(json.items) ? json.items : [];
  const urls = items.map(it => sanitizeImageUrl(it.link)).filter(Boolean);
  return urls;
}
// ✅ DuckDuckGo 이미지(무키). 서버에서 가끔 rate limit 있으나 성공률 높음
async function searchDuckDuckGoImages(q) {
  try {
    const url = new URL("https://duckduckgo.com/i.js");
    url.searchParams.set("q", q);
    url.searchParams.set("o", "json");
    url.searchParams.set("iax", "images");
    url.searchParams.set("ia", "images");
    const res = await fetchSafe(url);
    if (!res.ok) return [];
    const json = await res.json();
    const items = Array.isArray(json.results) ? json.results : [];
    const urls = items.map(it => sanitizeImageUrl(it.image || it.thumbnail)).filter(Boolean);
    return urls;
  } catch (e) {
    // console.warn("[DDG]", e);
    return [];
  }
}

// ✅ Unsplash(무키) — 리다이렉트지만 디스코드가 따라감, 주제 관련 랜덤 1장
function unsplashDirectUrl(q) {
  const qp = encodeURIComponent(q);
  return `https://source.unsplash.com/featured/1280x720/?${qp}`;
}
async function searchUnsplashNoKey(q) {
  return [unsplashDirectUrl(q)];
}

// ✅ LoremFlickr(무키) — 캐시 락으로 매번 다른 랜덤 1장
function loremFlickrDirectUrl(q) {
  const tag = encodeURIComponent(q.replace(/\s+/g, ','));
  const lock = Math.floor(Math.random() * 1e9);
  return `https://loremflickr.com/1280/720/${tag}?lock=${lock}`;
}
async function searchLoremFlickrDirect(q) {
  return [loremFlickrDirectUrl(q)];
}


// ✅ Wikimedia Commons(무키) — "파일" 네임스페이스(6)만 검색해서 이미지 보장
async function searchWikimediaImages(q) {
  try {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrsearch", q);
    url.searchParams.set("gsrlimit", "30");
    url.searchParams.set("gsrnamespace", "6"); // 파일 네임스페이스만
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url");
    url.searchParams.set("iiurlwidth", "1600");
    url.searchParams.set("format", "json");

    const res = await fetchSafe(url);
    if (!res.ok) return [];
    const json = await res.json();
    const pages = json?.query?.pages || {};
    const urls = [];
    for (const k in pages) {
      const info = pages[k]?.imageinfo?.[0];
      const u = (info?.thumburl || info?.url) || null;
      const su = sanitizeImageUrl(u);
      if (su) urls.push(su);
    }
    return urls;
  } catch {
    return [];
  }
}


// ===== 이미지 URL 검사(핫링크/403 차단 필터) =====
async function testImageUrl(u, timeoutMs = 6000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    // 일부 서버는 HEAD 차단 → 소량 GET으로 판별
    const r = await fetchSafe(u, {
      method: "GET",
      signal: ctrl.signal,
      headers: {
        "Range": "bytes=0-1023",
        "User-Agent": "Mozilla/5.0 (DiscordBot-ImageProbe)",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "ko,en;q=0.9",
      }
    }).catch(() => null);
    clearTimeout(t);
    if (!r || !r.ok) return false;
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/")) return false;
    return true;
  } catch {
    return false;
  }
}

// ===== 엔진 요청 유틸 =====
async function fetchBingImages(q, lang, CFG) {
  if (!CFG.bingKey) return [];
  const url = new URL(CFG.bingImageEndpoint || "https://api.bing.microsoft.com/v7.0/images/search");
  url.searchParams.set("q", q);
  url.searchParams.set("mkt", lang === "ko" ? "ko-KR" : "en-US");
  url.searchParams.set("safeSearch", "Off");     // 막히면 Moderate로 변경
  url.searchParams.set("count", "50");
  url.searchParams.set("imageType", "Photo");
  const r = await fetchSafe(url, {
    headers: { "Ocp-Apim-Subscription-Key": CFG.bingKey }
  }).catch(() => null);
  if (!r || !r.ok) return [];
  const j = await r.json().catch(() => ({}));
  const items = Array.isArray(j.value) ? j.value : [];
  // contentUrl 우선, 안되면 thumbnailUrl
  function pickBingUrl(v) {
  const cu = v.contentUrl || "";
  const tu = v.thumbnailUrl || "";
  const h = getHost(cu);
  // 🔒 핫링크 차단 도메인은 썸네일(Bing CDN) 우선
  if (h && BLOCKED_HOSTS.some(b => h.includes(b))) return tu || cu;
  return cu || tu;
}
return items.map(pickBingUrl).filter(Boolean);
}

async function fetchGoogleImages(q, lang, CFG) {
  if (!CFG.googleKey || !CFG.googleCseId) return [];
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", CFG.googleKey);
  url.searchParams.set("cx", CFG.googleCseId);
  url.searchParams.set("q", q);
  url.searchParams.set("searchType", "image");
  url.searchParams.set("num", "10");
  url.searchParams.set("gl", lang === "ko" ? "kr" : "us");
  url.searchParams.set("lr", lang === "ko" ? "lang_ko" : "lang_en");
  const r = await fetchSafe(url).catch(() => null);
  if (!r || !r.ok) return [];
  const j = await r.json().catch(() => ({}));
  const items = Array.isArray(j.items) ? j.items : [];
  return items.map(v => v.link).filter(Boolean);
}

async function fetchNaverImages(q, lang, CFG) {
  if (!CFG.naverId || !CFG.naverSecret) return [];
  const url = new URL("https://openapi.naver.com/v1/search/image");
  url.searchParams.set("query", q);
  url.searchParams.set("display", "30");
  url.searchParams.set("filter", "all");
  const r = await fetchSafe(url, {
    headers: {
      "X-Naver-Client-Id": CFG.naverId,
      "X-Naver-Client-Secret": CFG.naverSecret,
    }
  }).catch(() => null);
  if (!r || !r.ok) return [];
  const j = await r.json().catch(() => ({}));
  const items = Array.isArray(j.items) ? j.items : [];
  return items.map(v => v.thumbnail || v.link).filter(Boolean);
}

async function fetchWikimedia(q) {
  // 유명 작품/인물 폴백: 위키미디어(저작권-친화/핫링크 잘 됨)
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", q);
  url.searchParams.set("gsrlimit", "10");
  url.searchParams.set("iiprop", "url");
  const r = await fetchSafe(url).catch(() => null);
  if (!r || !r.ok) return [];
  const j = await r.json().catch(() => ({}));
  const pages = j?.query?.pages || {};
  const out = [];
  for (const k of Object.keys(pages)) {
    const ii = pages[k]?.imageinfo?.[0]?.url;
    if (ii) out.push(ii);
  }
  return out;
}

function dedupUrls(arr) {
  const s = new Set();
  const out = [];
  for (const u of arr) {
    const key = String(u).trim().replace(/[#?].*$/, ""); // 쿼리 제거 후 중복 축소
    if (!s.has(key)) { s.add(key); out.push(u); }
  }
  return out;
}

async function findImages(q, lang) {
  const seen = new Set();
  const out = [];
  async function addFrom(fn) {
    try {
      const arr = await fn();
      for (const u of arr) {
        const su = sanitizeImageUrl(u);
        if (su && !seen.has(su)) { seen.add(su); out.push(su); }
      }
    } catch { /* ignore */ }
  }

  // 0) 무키 ‘즉시 성공’ 라인 — 여기서 최소 1장은 보장
  await addFrom(() => searchUnsplashNoKey(q));
  if (out.length < 1) await addFrom(() => searchLoremFlickrDirect(q));

  // 1) 키 기반 (있으면 다양성 ↑)
  if (out.length < 3) await addFrom(() => searchBingImages(q, lang));
  if (out.length < 3) await addFrom(() => searchGoogleImages(q, lang));
  if (out.length < 3) await addFrom(() => searchNaverImages(q));

  // 2) 무키 폴백
  if (out.length < 3) await addFrom(() => searchWikimediaImages(q));
  if (out.length < 3) await addFrom(() => searchDuckDuckGoImages(q));

  // 🔒 최후 폴백: 그래도 0이면 최소 1장 보장
  if (out.length === 0) out.push(unsplashDirectUrl(q));

  const deduped = dedupUrls(out);
  const usable = await ensureUsable(deduped);
  return usable.length ? usable : [unsplashDirectUrl(q)];
}



function renderImageEmbed(q, url, lang, shared = false) {
  const eb = new EmbedBuilder()
    .setTitle(`🖼️ 이미지: ${q}`)
    .setImage(url)
    .setColor(shared ? 0x00C853 : 0x00B7FF)
    .setFooter({ text: `랜덤 이미지 • 안전검색: Moderate • 언어: ${lang}` });
  return eb;
}
function renderImageButtons(sessionId, shared) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(IMG_PREFIX + `share|${sessionId}`)
        .setLabel(shared ? "공유됨" : "이미지 공유")
        .setStyle(shared ? ButtonStyle.Success : ButtonStyle.Primary)
        .setDisabled(shared),
      new ButtonBuilder()
        .setCustomId(IMG_PREFIX + `more|${sessionId}`)
        .setLabel("다른 이미지")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

/* =========================
 * SlashCommand 정의
 * ========================= */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("유틸")
    .setDescription("유틸리티 도구 모음")
    .addSubcommand(sc => sc.setName("계산기").setDescription("버튼 계산기"))
    .addSubcommand(sc => sc.setName("메모장").setDescription("개인 메모/검색/수정/삭제"))
    .addSubcommand(sc => sc.setName("복권번호").setDescription("1~45 중 6개, 총 5줄"))
    .addSubcommand(sc => sc.setName("마법의소라고동").setDescription("봇이 그래/아니 답변"))
    // ✅ 신규: 이미지
    .addSubcommand(sc =>
      sc.setName("이미지")
        .setDescription("입력한 대상의 랜덤 이미지를 보여줍니다")
        .addStringOption(o =>
          o.setName("대상")
            .setDescription("한글/영어 키워드")
            .setRequired(true)
        )
    ),

  // Slash 명령 처리
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === "계산기") {
      if (!calcSessions.has(userId)) {
        calcSessions.set(userId, { a: null, b: null, op: null, input: "", last: null, updatedAt: Date.now(), hist: [], showHist: false });
      }
      const st = calcSessions.get(userId);
      const embed = renderCalcEmbed(userId);
      const rows = renderCalcButtons(st);
      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }

    if (sub === "메모장") {
      const list = await readMemos(userId);
      const page = 0;
      const embed = renderMemoListEmbed(userId, list, page, "");
      const rows = renderMemoListButtons(list, page, "");
      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }

    if (sub === "복권번호") {
      const lines = genLottoLines(5, `${userId}:${Date.now()}`);
      const embed = renderLottoEmbed(userId, lines);
      const rows = renderLottoButtons();
      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }

    if (sub === "마법의소라고동") {
      const embed = new EmbedBuilder()
        .setTitle("🐚 마법의 소라고동")
        .setDescription("아무 말이나 **질문**을 해봐!\n> **봇이 ‘그래’ 또는 ‘아니’ 중 하나로만** 대답해줄게.\n\n**안내**: _봇이 **그래/아니**로 답변 가능한 질문을 해주세요._")
        .setColor(0xA66BFF);
      const rows  = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(CONCH_PREFIX + "ask")
            .setLabel("질문하기")
            .setStyle(ButtonStyle.Primary)
        ),
      ];
      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }

    // ✅ 신규: 이미지
    if (sub === "이미지") {
  pruneOldImageSessions();
  const qRaw = interaction.options.getString("대상", true).trim();
  const q = qRaw.replace(/\s+/g, " ");
  if (!q.length) return interaction.reply({ content: "대상을 입력해줘.", ephemeral: true });

  const lang = detectLang(q);

  // 🔹 응답 시간 확보
  await interaction.deferReply({ ephemeral: true });

  // (선택) 타임아웃 래퍼 적용 — 4.5초 넘으면 Unsplash 1장으로 즉시 반환
  let urls = await withTimeout(findImages(q, lang), 4500, () => [unsplashDirectUrl(q)]);

  // 디버그
  try { console.log("[IMG] query:", q, "=>", urls.slice(0, 5)); } catch {}

  urls = Array.isArray(urls) ? urls.filter(Boolean) : [];
  if (!urls.length) urls = [ unsplashDirectUrl(q) ];
  if (!urls.length) {
    return interaction.editReply({ content: "죄송합니다, 검색 결과를 찾을 수 없습니다." });
  }

  const { item: url, idx } = pickRandom(urls, `${q}:${Date.now()}:${interaction.user.id}`);
  const sessionId = crypto.randomBytes(8).toString("hex");
  imageSessions.set(sessionId, { q, lang, list: urls, idx, shared: false, ownerId: interaction.user.id, createdAt: Date.now() });

  const ready = await prepareForDiscord(url);
  const embed = renderImageEmbed(q, ready.url, lang, false);
  const rows = renderImageButtons(sessionId, false);
  return interaction.editReply({
    embeds: [embed],
    components: rows,
    files: ready.file ? [ready.file] : []
  });
}

  },

  // 버튼/모달 라우팅 (index.js에서 위임 호출)
  async route(interaction) {
    const { customId, user } = interaction;

    /* ===== 계산기 ===== */
    if (customId.startsWith(CALC_PREFIX)) {
      const userId = user.id;
      const st = calcSessions.get(userId) || { a: null, b: null, op: null, input: "", last: null, updatedAt: Date.now(), hist: [], showHist: false };

      if (customId === CALC_PREFIX + "neg") toggleSign(st);
      else if (customId === CALC_PREFIX + "dot") pushDot(st);
      else if (customId === CALC_PREFIX + "eq") calcEqual(st);
      else if (customId.startsWith(CALC_PREFIX + "key|")) {
        const d = customId.split("|")[1];
        if (/^\d$/.test(d)) pushDigit(st, d);
      } else if (customId.startsWith(CALC_PREFIX + "op|")) {
        const op = customId.split("|")[1];
        if (op === "+" || op === "-") applyOp(st, op);
        else if (op === "muldiv") applyOp(st, "muldiv");
      }
      else if (customId === CALC_PREFIX + "clear") {
        st.a = null;
        st.b = null;
        st.op = null;
        st.input = "";
        st.last = null;
        st.updatedAt = Date.now();
      }
      else if (customId === CALC_PREFIX + "history") {
        st.showHist = !st.showHist;
        st.updatedAt = Date.now();
      }

      calcSessions.set(userId, st);
      const embed = renderCalcEmbed(userId);
      const rows = renderCalcButtons(st);
      return interaction.update({ embeds: [embed], components: rows });
    }

    /* ===== 메모장: 버튼 & 모달 ===== */
    if (customId.startsWith(MEMO_PREFIX)) {
      const userId = user.id;

      if (customId.startsWith(MEMO_PREFIX + "prev|")) {
        const currPage = Number(customId.split("|")[1]) || 0;
        const list = await readMemos(userId);
        const page = Math.max(0, currPage - 1);
        const embed = renderMemoListEmbed(userId, list, page, "");
        const rows = renderMemoListButtons(list, page, "");
        return interaction.update({ embeds: [embed], components: rows });
      }
      if (customId.startsWith(MEMO_PREFIX + "next|")) {
        const currPage = Number(customId.split("|")[1]) || 0;
        const list = await readMemos(userId);
        const max = Math.max(0, Math.ceil(list.length / MEMO_PAGE_SIZE) - 1);
        const page = Math.min(max, currPage + 1);
        const embed = renderMemoListEmbed(userId, list, page, "");
        const rows = renderMemoListButtons(list, page, "");
        return interaction.update({ embeds: [embed], components: rows });
      }

      if (customId.startsWith(MEMO_PREFIX + "search|")) {
        const [, encQuery, pageStr] = customId.split("|");
        const modal = new ModalBuilder()
          .setCustomId(MEMO_PREFIX + `search_submit|${pageStr || "0"}`)
          .setTitle("메모 검색");
        const ti = new TextInputBuilder()
          .setCustomId("q")
          .setLabel("제목/내용 검색어")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("예) 회의, 패스워드, TODO")
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(ti));
        return interaction.showModal(modal);
      }

      if (customId.startsWith(MEMO_PREFIX + "add|")) {
        const [, pageStr] = customId.split("|");
        const modal = new ModalBuilder()
          .setCustomId(MEMO_PREFIX + `add_submit|${pageStr || "0"}`)
          .setTitle("새 메모 추가");
        const tiTitle = new TextInputBuilder()
          .setCustomId("title")
          .setLabel("제목")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("메모 제목")
          .setRequired(false);
        const tiBody = new TextInputBuilder()
          .setCustomId("body")
          .setLabel("내용")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("자유 입력")
          .setRequired(false);
        const tiTTL = new TextInputBuilder()
          .setCustomId("ttl")
          .setLabel("보관 기한(일) — 0/공백=무기한")
          .setStyle(TextInputStyle.Short)
          .setRequired(false);
        modal.addComponents(
          new ActionRowBuilder().addComponents(tiTitle),
          new ActionRowBuilder().addComponents(tiBody),
          new ActionRowBuilder().addComponents(tiTTL),
        );
        return interaction.showModal(modal);
      }

      if (customId.startsWith(MEMO_PREFIX + "open|")) {
        const [, id, pageStr] = customId.split("|");
        const list = await readMemos(userId);
        const memo = list.find(m => String(m.id) === String(id));
        if (!memo) {
          return interaction.reply({ content: "해당 메모를 찾을 수 없어.", ephemeral: true });
        }
        const embed = renderMemoDetailEmbed(memo);
        const rows = renderMemoDetailButtons(Number(pageStr) || 0);
        return interaction.update({ embeds: [embed], components: rows });
      }

      if (customId.startsWith(MEMO_PREFIX + "back|")) {
        const [, pageStr] = customId.split("|");
        const page = Number(pageStr) || 0;
        const list = await readMemos(userId);
        const embed = renderMemoListEmbed(userId, list, page, "");
        const rows = renderMemoListButtons(list, page, "");
        return interaction.update({ embeds: [embed], components: rows });
      }

      if (customId === MEMO_PREFIX + "del") {
        const embeds = interaction.message.embeds || [];
        if (!embeds.length || !embeds[0].footer?.text) {
          return interaction.reply({ content: "삭제 대상을 찾을 수 없어.", ephemeral: true });
        }
        const footer = embeds[0].footer.text;
        const idMatch = footer.match(/ID:\s*(\S+)/);
        const delId = idMatch ? idMatch[1] : null;
        if (!delId) {
          return interaction.reply({ content: "삭제 대상을 찾을 수 없어.", ephemeral: true });
        }
        const list = await readMemos(userId);
        const next = list.filter(m => String(m.id) !== String(delId));
        await writeMemos(userId, next);
        const page = 0;
        const embed = renderMemoListEmbed(userId, next, page, "");
        const rows = renderMemoListButtons(next, page, "");
        return interaction.update({ content: "🗑 삭제 완료", embeds: [embed], components: rows });
      }

      if (customId.startsWith(MEMO_PREFIX + "edit|")) {
        const [, pageStr] = customId.split("|");
        const embeds = interaction.message.embeds || [];
        if (!embeds.length || !embeds[0].footer?.text) {
          return interaction.reply({ content: "수정 대상을 찾을 수 없어.", ephemeral: true });
        }
        const footer = embeds[0].footer.text;
        const idMatch = footer.match(/ID:\s*(\S+)/);
        const editId = idMatch ? idMatch[1] : null;
        if (!editId) {
          return interaction.reply({ content: "수정 대상을 찾을 수 없어.", ephemeral: true });
        }

        const list = await readMemos(user.id);
        const memo = list.find(m => String(m.id) === String(editId));
        if (!memo) return interaction.reply({ content: "해당 메모를 찾을 수 없어.", ephemeral: true });

        let ttlDays = "";
        if (memo.expiresAt) {
          const leftMs = memo.expiresAt - Date.now();
          if (leftMs > 0) ttlDays = String(Math.ceil(leftMs / (24 * 60 * 60 * 1000)));
        }

        const modal = new ModalBuilder()
          .setCustomId(MEMO_PREFIX + `edit_submit|${memo.id}|${pageStr || "0"}`)
          .setTitle("메모 수정");

        const tiTitle = new TextInputBuilder()
          .setCustomId("title")
          .setLabel("제목")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(memo.title || "");

        const tiBody = new TextInputBuilder()
          .setCustomId("body")
          .setLabel("내용")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setValue(memo.body || "");

        const tiTTL = new TextInputBuilder()
          .setCustomId("ttl")
          .setLabel("보관 기한(일) — 0/공백=무기한")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(ttlDays);

        modal.addComponents(
          new ActionRowBuilder().addComponents(tiTitle),
          new ActionRowBuilder().addComponents(tiBody),
          new ActionRowBuilder().addComponents(tiTTL),
        );
        return interaction.showModal(modal);
      }
    }

    // 수정 제출 (모달)
    if (interaction.isModalSubmit()) {
      const { customId } = interaction;

      if (customId.startsWith(MEMO_PREFIX + "search_submit|")) {
        const [, pageStr] = customId.split("|");
        const q = (interaction.fields.getTextInputValue("q") || "").trim();
        const listAll = await readMemos(interaction.user.id);
        const list = q
          ? listAll.filter(m =>
              (m.title || "").toLowerCase().includes(q.toLowerCase()) ||
              (m.body || "").toLowerCase().includes(q.toLowerCase()))
          : listAll;
        const page = 0;
        const embed = renderMemoListEmbed(interaction.user.id, list, page, q);
        const rows = renderMemoListButtons(list, page, q);
        return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
      }

      if (customId.startsWith(MEMO_PREFIX + "add_submit|")) {
        const [, pageStr] = customId.split("|");
        const userId = interaction.user.id;
        const title = (interaction.fields.getTextInputValue("title") || "").trim();
        const body = (interaction.fields.getTextInputValue("body") || "").trim();
        const ttlStr = (interaction.fields.getTextInputValue("ttl") || "").trim();
        let expiresAt = null;
        if (ttlStr) {
          const days = Number(ttlStr);
          if (!isNaN(days) && days > 0) {
            expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
          }
        }
        const list = await readMemos(userId);
        const id = crypto.randomBytes(6).toString("hex");
        const memo = { id, title, body, createdAt: Date.now(), expiresAt };
        list.unshift(memo);
        await writeMemos(userId, list);

        const page = 0;
        const embed = renderMemoListEmbed(userId, list, page, "");
        const rows = renderMemoListButtons(list, page, "");
        return interaction.reply({ content: "✅ 메모 추가됨", embeds: [embed], components: rows, ephemeral: true });
      }

      if (customId.startsWith(MEMO_PREFIX + "edit_submit|")) {
        const [, id, pageStr] = customId.split("|");
        const userId = interaction.user.id;

        const title = (interaction.fields.getTextInputValue("title") || "").trim();
        const body  = (interaction.fields.getTextInputValue("body")  || "").trim();
        const ttlStr = (interaction.fields.getTextInputValue("ttl")  || "").trim();

        let expiresAt = null;
        if (ttlStr) {
          const days = Number(ttlStr);
          if (!isNaN(days) && days > 0) {
            expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
          }
        }

        const list = await readMemos(userId);
        const idx = list.findIndex(m => String(m.id) === String(id));
        if (idx === -1) return interaction.reply({ content: "해당 메모를 찾을 수 없어.", ephemeral: true });

        list[idx].title = title;
        list[idx].body  = body;
        list[idx].expiresAt = expiresAt;

        await writeMemos(userId, list);

        const updated = list[idx];
        const embed = renderMemoDetailEmbed(updated);
        const rows  = renderMemoDetailButtons(Number(pageStr) || 0);
        return interaction.reply({ content: "✅ 수정 완료", embeds: [embed], components: rows, ephemeral: true });
      }
    }

    /* ===== 복권: 버튼 ===== */
    if (customId === LOTTO_PREFIX + "regen") {
      const userId = user.id;
      const lines = genLottoLines(5, `${userId}:${Date.now()}:${Math.random()}`);
      const embed = renderLottoEmbed(userId, lines);
      const rows = renderLottoButtons();
      return interaction.update({ embeds: [embed], components: rows });
    }

    /* ===== 소라고동 ===== */
    if (customId === CONCH_PREFIX + "ask") {
      const modal = new ModalBuilder()
        .setCustomId(CONCH_PREFIX + "ask_submit")
        .setTitle("마법의 소라고동에게 물어보기");
      const ti = new TextInputBuilder()
        .setCustomId("q")
        .setLabel("질문을 입력하세요 (예: 오늘 나갈까?)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(ti));
      return interaction.showModal(modal);
    }
    if (customId === CONCH_PREFIX + "ask_submit") {
      const q = (interaction.fields.getTextInputValue("q") || "").trim();
      const answer = Math.random() < 0.5 ? "그래" : "아니";
      const embed = new EmbedBuilder()
        .setTitle("🐚 마법의 소라고동")
        .addFields(
          { name: "질문", value: q.length ? q : "(질문 없음)" },
          { name: "대답", value: `**${answer}**` },
        )
        .setFooter({ text: "봇이 그래/아니로만 답하는 모드야!" })
        .setColor(0xA66BFF);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    /* ===== 이미지: 버튼 ===== */
if (customId.startsWith(IMG_PREFIX)) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }

    pruneOldImageSessions();

    let [action, sessionId] = customId.slice(IMG_PREFIX.length).split("|");
    let sess = imageSessions.get(sessionId);

    // 🔁 세션 복구 시도 (버튼 메시지에서 질의/이미지 재구성)
    if (!sess) {
      const embedNow = interaction.message.embeds?.[0];
      const title = embedNow?.title || "";
      const m = title.match(/이미지:\s*(.+)$/) || title.match(/이미지\s*[:：]\s*(.+)$/);
      const q = (m && m[1]) ? m[1].trim() : null;
      if (!q) {
        // 메시지 자체가 깨졌으면 안내 후 종료
        return interaction.editReply({ content: "세션이 만료되었어. 다시 `/유틸 이미지`로 검색해줘!", embeds: [], components: [] });
      }
      const lang = detectLang(q);
      const list = await findImages(q, lang);
      if (!Array.isArray(list) || !list.length) {
        return interaction.editReply({ content: "세션을 복구하지 못했어. 다시 `/유틸 이미지`로 검색해줘!", embeds: [], components: [] });
      }
      let idx = 0;
      const currUrl = embedNow?.image?.url || null;
      if (currUrl) {
        const found = list.findIndex(u => u === currUrl);
        if (found >= 0) idx = found;
      }
      const newId = crypto.randomBytes(8).toString("hex");
      sess = { q, lang, list, idx, shared: false, ownerId: interaction.user.id, createdAt: Date.now() };
      imageSessions.set(newId, sess);
      sessionId = newId;
    }

    // 소유자만 조작 허용
    if (sess.ownerId !== interaction.user.id) {
      return interaction.editReply({ content: "이 이미지는 다른 사용자의 검색 세션이야.", embeds: [], components: [] });
    }

    // === 공유 ===
    if (action === "share") {
      // 1) 먼저 버튼 상태를 '공유됨'으로 즉시 갱신
      {
        const raw = sess.list[sess.idx];
        const ready = await prepareForDiscord(sess.list[sess.idx]);
const eb  = renderImageEmbed(sess.q, ready.url, sess.lang, true);
const rows = renderImageButtons(sessionId, true);

// ✅ deferUpdate() 이후에는 editReply() 사용
await interaction.editReply({
  embeds: [eb],
  components: rows,
  files: ready.file ? [ready.file] : []
});

try {
  // ✅ 공개 전송도 반드시 준비된 URL/첨부 사용
  const pubReady = await prepareForDiscord(sess.list[sess.idx]);
  const embedPub = renderImageEmbed(sess.q, pubReady.url, sess.lang, true);
  await interaction.channel.send({
    embeds: [embedPub],
    files: pubReady.file ? [pubReady.file] : []
  });
  sess.shared = true;
  imageSessions.set(sessionId, sess);
} catch (e) {
  await interaction.followUp({
    content: "채널 권한이 부족해서 공유에 실패했어. (메시지 전송/임베드 링크/파일 첨부 권한 확인)",
    ephemeral: true
  }).catch(() => {});
}

      return;
    }

    // === 다른 이미지 ===
    if (action === "more") {
      if (!Array.isArray(sess.list) || !sess.list.length) {
        return interaction.editReply({ content: "결과가 더 없어.", embeds: [], components: [] });
      }
      let nextIdx = sess.idx;
      if (sess.list.length > 1) {
        // 현재와 다른 항목으로 5번까지 시도
        for (let i = 0; i < 5; i++) {
          const cand = Math.floor(Math.random() * sess.list.length);
          if (cand !== sess.idx) { nextIdx = cand; break; }
        }
      }
      sess.idx = nextIdx;
      sess.shared = false;
      imageSessions.set(sessionId, sess);

      const ready = await prepareForDiscord(sess.list[sess.idx]);
const eb  = renderImageEmbed(sess.q, ready.url, sess.lang, false);
const rows = renderImageButtons(sessionId, false);
return interaction.editReply({
  embeds: [eb],
  components: rows,
  files: ready.file ? [ready.file] : []
});

    // 알 수 없는 action 보호
    return interaction.editReply({ content: "알 수 없는 동작이야.", components: [] });

  } catch (err) {
    console.error("[IMG BTN 오류]", err);
    // 이미 update를 못했을 수 있으니 followUp로 보장
    if (!interaction.replied && !interaction.deferred) {
      try { await interaction.reply({ content: "이미지 버튼 처리 중 오류가 발생했어.", ephemeral: true }); } catch {}
    } else {
      try { await interaction.followUp({ content: "이미지 버튼 처리 중 오류가 발생했어.", ephemeral: true }); } catch {}
    }
  }
 }
  },
};
