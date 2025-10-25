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
  AttachmentBuilder
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

// 로또 고정 저장 파일
const LOTTO_DIR = path.join(DATA_DIR, "lotto");
if (!fs.existsSync(LOTTO_DIR)) fs.mkdirSync(LOTTO_DIR, { recursive: true });
const LOTTO_LOCK_FILE = path.join(LOTTO_DIR, "decisions.json");

// 로또 고정 데이터 IO
async function readLottoDecisions() {
  if (!fs.existsSync(LOTTO_LOCK_FILE)) fs.writeFileSync(LOTTO_LOCK_FILE, "[]", "utf8");
  const release = await lockfile.lock(LOTTO_LOCK_FILE, { retries: { retries: 5, factor: 1.5, minTimeout: 50 } });
  try {
    const raw = fs.readFileSync(LOTTO_LOCK_FILE, "utf8").trim();
    return raw ? JSON.parse(raw) : [];
  } finally { await release(); }
}
async function writeLottoDecisions(list) {
  if (!fs.existsSync(LOTTO_LOCK_FILE)) fs.writeFileSync(LOTTO_LOCK_FILE, "[]", "utf8");
  const release = await lockfile.lock(LOTTO_LOCK_FILE, { retries: { retries: 5, factor: 1.5, minTimeout: 50 } });
  try {
    fs.writeFileSync(LOTTO_LOCK_FILE, JSON.stringify(list, null, 2), "utf8");
  } finally { await release(); }
}

// ===== 동행복권 로또 결과 가져오기 =====
// 최신 발표 회차 파악: byWin 페이지에서 최신 회차 숫자 파싱
async function fetchLatestDrawNo() {
  const url = "https://www.dhlottery.co.kr/gameResult.do?method=byWin";
  const r = await fetchSafe(url, { headers: { "User-Agent": "Mozilla/5.0" } }).catch(() => null);
  if (!r || !r.ok) return null;
  const html = await r.text();
  // "XXXX회 당첨결과" 같은 패턴에서 숫자만 뽑기
  const m = html.match(/(\d+)\s*회\s*당첨결과/);
  return m ? Number(m[1]) : null;
}

// 특정 회차의 당첨번호(JSON)
async function fetchLottoNumbers(drwNo) {
  const api = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${drwNo}`;
  const r = await fetchSafe(api, { headers: { "User-Agent": "Mozilla/5.0" } }).catch(() => null);
  if (!r || !r.ok) return null;
  const j = await r.json().catch(() => null);
  if (!j || j.returnValue !== "success") return null;
  const nums = [j.drwtNo1, j.drwtNo2, j.drwtNo3, j.drwtNo4, j.drwtNo5, j.drwtNo6].map(Number).sort((a,b)=>a-b);
  return { drawNo: Number(j.drwNo), drawDate: j.drwNoDate, nums, bonus: Number(j.bnusNo), firstWin: Number(j.firstWinamnt||0) };
}

// 등수별 당첨금(1~5등) 테이블 스크랩
async function fetchPrizeTable(drwNo) {
  const url = `https://www.dhlottery.co.kr/gameResult.do?method=byWin&drwNo=${drwNo}`;
  const r = await fetchSafe(url, { headers: { "User-Agent": "Mozilla/5.0" } }).catch(() => null);
  if (!r || !r.ok) return null;
  const html = await r.text();
  // 행 단위: "1등, 총당첨금, 당첨자수, 1인당당첨금, 조건" 형태 테이블
  // 1인당 당첨금(원)을 모두 캡처 (쉼표/원 포함)
  const rowRe = /(\d)등[^<]*?([\d,]+)원[^<]*?\d+[^<]*?([\d,]+)원/g; // 그룹1: 등수, 그룹2: 총당첨금(쓰진 않음), 그룹3: 1인당당첨금
  const perRank = {};
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const rank = Number(m[1]);
    const eachWon = Number((m[3] || "0").replace(/[^\d]/g, ""));
    if (rank>=1 && rank<=5) perRank[rank] = eachWon;
  }
  // 최소 1등은 채워놓고 없으면 null
  return Object.keys(perRank).length ? perRank : null;
}

// 등수 판정(6개 일치=1등, 5개+보너스=2등, 5개=3등, 4개=4등, 3개=5등)
function judgeRank(line, winNums, bonus) {
  const s = new Set(winNums);
  let hit = 0;
  for (const n of line) if (s.has(n)) hit++;
  if (hit === 6) return 1;
  if (hit === 5 && line.includes(bonus)) return 2;
  if (hit === 5) return 3;
  if (hit === 4) return 4;
  if (hit === 3) return 5;
  return 0;
}

// 임베드에서 현재 5줄 번호를 파싱
function parseLottoLinesFromEmbed(embed) {
  const desc = embed?.description || "";
  // 라인: "**1**) 1, 2, 3, 4, 5, 6"
  const lines = [];
  for (const row of desc.split("\n")) {
    const m = row.match(/\*\*\d+\*\*\)\s*([0-9,\s]+)/);
    if (m) {
      const arr = m[1].split(",").map(s=>Number(s.trim())).filter(Boolean).sort((a,b)=>a-b);
      if (arr.length===6) lines.push(arr);
    }
  }
  return lines;
}


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

/* =========================
 * 번역기 (Google gtx → LibreTranslate → MyMemory 폴백)
 * ========================= */
const LANG_CHOICES = [
  { name: "한국어", value: "ko" },
  { name: "English", value: "en" },
  { name: "日本語", value: "ja" },
  { name: "中文", value: "zh-CN" },
  { name: "Русский", value: "ru" },
];

async function translateByGoogleGtx(text, target) {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "auto");
  url.searchParams.set("tl", target);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const r = await fetchSafe(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error("gtx fail");
  const j = await r.json();

  const parts = Array.isArray(j?.[0]) ? j[0].map(x => x?.[0] || "").join("") : "";
  const src = j?.[2] || "auto";
  if (!parts) throw new Error("gtx empty");
  return { text: parts, src };
}

async function translateByLibre(text, target) {
  const r = await fetchSafe("https://libretranslate.com/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: text, source: "auto", target }),
  });
  if (!r.ok) throw new Error("libre fail");
  const j = await r.json();
  const out = j?.translatedText || "";
  if (!out) throw new Error("libre empty");
  return { text: out, src: "auto" };
}

async function translateByMyMemory(text, target) {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", `auto|${target}`);
  const r = await fetchSafe(url);
  if (!r.ok) throw new Error("mymemory fail");
  const j = await r.json();
  const out = j?.responseData?.translatedText || "";
  if (!out) throw new Error("mymemory empty");
  return { text: out, src: j?.responseData?.detectedLanguage || "auto" };
}

async function translateTextAuto(text, target) {
  // 순차 폴백
  try { return await translateByGoogleGtx(text, target); } catch {}
  try { return await translateByLibre(text, target); } catch {}
  try { return await translateByMyMemory(text, target); } catch {}
  return { text: "", src: "auto" };
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
function renderLottoEmbed(userId, lines, targetDrawNo) {
  const day = bestBuyDay(userId);
  const desc = lines.map((arr, i) => `**${i + 1}**) ${arr.join(", ")}`).join("\n");
  return new EmbedBuilder()
    .setTitle(`🎟 복권 번호 추첨 — ${targetDrawNo}회 (예정)`)
    .setDescription(`이번 주 추천 요일: **${day}**\n\n${desc}`)
    .setColor(0xF1C40F);
}
function renderLottoButtons(targetDrawNo, locked=false) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(LOTTO_PREFIX + `regen|${targetDrawNo}`)
      .setLabel("다시 뽑기")
      .setStyle(ButtonStyle.Success)
      .setDisabled(locked),
    new ButtonBuilder()
      .setCustomId(LOTTO_PREFIX + `lock|${targetDrawNo}`)
      .setLabel(locked ? "결정됨" : "이 번호로 결정")
      .setStyle(locked ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(locked),
    new ButtonBuilder()
      .setCustomId(LOTTO_PREFIX + `check|${targetDrawNo}`)
      .setLabel("당첨 결과 확인")
      .setStyle(ButtonStyle.Secondary)
  );
  return [row];
}


/* =========================
 * 이미지 & QR 검색
 * ========================= */
function isValidHttpUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === "http:" || x.protocol === "https:";
  } catch {
    return false;
  }
}
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
  const urls = items.map(v => sanitizeImageUrl(v.contentUrl || v.contentUrlHttps || v.thumbnailUrl)).filter(Boolean);
  return urls;
}

async function searchGoogleImages(q) {
  if (!IMG_CFG.googleKey || !IMG_CFG.googleCseId) return [];
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", IMG_CFG.googleKey);
  url.searchParams.set("cx", IMG_CFG.googleCseId);
  url.searchParams.set("q", q);
  url.searchParams.set("searchType", "image");
  url.searchParams.set("num", "10");
  url.searchParams.set("gl", lang === "ko" ? "kr" : "us");
  url.searchParams.set("lr", lang === "ko" ? "lang_ko" : "lang_en");
  const res = await fetchSafe(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return [];
  const json = await res.json();
  const items = Array.isArray(json.items) ? json.items : [];
  const urls = items.map(it => sanitizeImageUrl(it.link)).filter(Boolean);
  return urls;
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
  if (out.length < 3) await addFrom(() => searchGoogleImages(q));
  if (out.length < 3) await addFrom(() => searchNaverImages(q));

  // 2) 무키 폴백
  if (out.length < 3) await addFrom(() => searchWikimediaImages(q));
  if (out.length < 3) await addFrom(() => searchDuckDuckGoImages(q));

  // 🔒 최후 폴백: 그래도 0이면 최소 1장 보장
  if (out.length === 0) out.push(unsplashDirectUrl(q));

  return out;
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
    )
      .addSubcommand(sc =>
      sc.setName("번역")
        .setDescription("입력한 내용을 지정한 언어로 번역합니다")
        .addStringOption(o =>
          o.setName("언어")
            .setDescription("번역할 대상 언어")
            .setRequired(true)
            .addChoices(...LANG_CHOICES)
        )
        .addStringOption(o =>
          o.setName("내용")
            .setDescription("번역할 내용")
            .setRequired(true)
        )
    )
      .addSubcommand(sc =>
    sc.setName("qr")
      .setDescription("입력한 링크로 접속되는 QR 코드를 생성합니다")
      .addStringOption(o =>
        o.setName("링크")
          .setDescription("http(s)로 시작하는 주소")
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
  // 최신 발표 회차 → 다음 회차를 '구매 예정 회차'로 가정
  const latest = await fetchLatestDrawNo();           // 발표된 최신
  const targetDrawNo = latest ? (latest + 1) : null;  // 다음 회차
  const lines = genLottoLines(5, `${userId}:${Date.now()}`);

  // 이미 같은 회차에 '결정' 기록이 있으면 버튼 잠그기
  const decisions = await readLottoDecisions();
  const locked = decisions.some(d => d.userId===userId && d.drawNo===targetDrawNo);

  const embed = renderLottoEmbed(userId, lines, targetDrawNo || "미정");
  const rows = renderLottoButtons(targetDrawNo || 0, locked);
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

    if (sub === "qr") {
      const link = (interaction.options.getString("링크", true) || "").trim();
      if (!isValidHttpUrl(link)) {
        return interaction.reply({ content: "http(s)로 시작하는 유효한 링크만 입력해줘.", ephemeral: true });
      }

      const api = new URL("https://api.qrserver.com/v1/create-qr-code/");
      api.searchParams.set("size", "512x512"); 
      api.searchParams.set("data", link);  
      api.searchParams.set("ecc", "M");  

      const r = await fetchSafe(api, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r || !r.ok) {
        return interaction.reply({ content: "QR 생성에 실패했어. 잠시 후 다시 시도해줘.", ephemeral: true });
      }

      const buf = Buffer.from(await r.arrayBuffer());
      const file = new AttachmentBuilder(buf, { name: "qrcode.png" });

      const eb = new EmbedBuilder()
        .setTitle("🔗 링크 QR 코드")
        .setDescription(link)
        .setImage("attachment://qrcode.png")
        .setColor(0x00BFA5);

      return interaction.reply({ embeds: [eb], files: [file], ephemeral: true });
    }

      // ✅ 신규: 번역
    if (sub === "번역") {
      const target = interaction.options.getString("언어", true);
      const raw = (interaction.options.getString("내용", true) || "").trim();

      if (!raw.length) {
        return interaction.reply({ content: "번역할 내용을 입력해줘.", ephemeral: true });
      }

      // 번역 수행
      let result;
      try {
        result = await translateTextAuto(raw, target);
      } catch (e) {
        result = { text: "", src: "auto" };
      }

      const translated = (result.text || "").trim();
      if (!translated) {
        return interaction.reply({ content: "죄송해, 지금은 번역에 실패했어. 잠시 후 다시 시도해줘.", ephemeral: true });
      }

      // 닉네임 가져오기
      const nick =
        interaction.member?.nickname ||
        interaction.user.globalName ||
        interaction.user.username;

      // 길이 보호 (디스코드 2000자 제한)
      const out = clampLen(translated, 1800);
      const orig = clampLen(raw, 400);

      // 모두가 볼 수 있게 공개로 전송
      return interaction.reply({
      content: `${nick}: ${out}\n-# (${orig})`
      });
    }

    // ✅ 신규: 이미지
    if (sub === "이미지") {
      pruneOldImageSessions();
      const qRaw = interaction.options.getString("대상", true).trim();
      const q = qRaw.replace(/\s+/g, " ");
      if (!q.length) return interaction.reply({ content: "대상을 입력해줘.", ephemeral: true });

      const lang = detectLang(q);

      // 검색
      let urls = await findImages(q, lang);

// 디버그 로그(콘솔에서 확인)
try { console.log("[IMG] query:", q, "=>", urls.slice(0, 5)); } catch {}

// (필터 완화 — 필요 없음지만 혹시 모를 null 제거)
urls = Array.isArray(urls) ? urls.filter(Boolean) : [];

// ✅ 최후 폴백(혹시 0이면 Unsplash 1장)
if (!urls.length) urls = [ unsplashDirectUrl(q) ];

if (!urls.length) {
  return interaction.reply({ content: "죄송합니다, 검색 결과를 찾을 수 없습니다.", ephemeral: true });
}

      const { item: url, idx } = pickRandom(urls, `${q}:${Date.now()}:${interaction.user.id}`);
      const sessionId = crypto.randomBytes(8).toString("hex");
      imageSessions.set(sessionId, { q, lang, list: urls, idx, shared: false, ownerId: userId, createdAt: Date.now() });

      const embed = renderImageEmbed(q, url, lang, false);
      const rows = renderImageButtons(sessionId, false);
      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
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
if (customId.startsWith(LOTTO_PREFIX)) {
  const parts = customId.slice(LOTTO_PREFIX.length).split("|");
  const action = parts[0];
  const drawNo = Number(parts[1] || "0") || 0;
  const userId = user.id;

  // 고정 여부 확인
  const decisions = await readLottoDecisions();
  const mine = decisions.find(d => d.userId===userId && d.drawNo===drawNo);

  if (action === "regen") {
    if (mine) {
      return interaction.reply({ content: "이미 이 회차는 번호가 '결정'되었어. 다시 뽑기는 불가해.", ephemeral: true });
    }
    const lines = genLottoLines(5, `${userId}:${Date.now()}:${Math.random()}`);
    const embed = renderLottoEmbed(userId, lines, drawNo || "미정");
    const rows = renderLottoButtons(drawNo || 0, false);
    return interaction.update({ embeds: [embed], components: rows });
  }

  if (action === "lock") {
    if (mine) {
      return interaction.reply({ content: "이미 이 회차는 결정되어 있어.", ephemeral: true });
    }
    // 현재 메시지 임베드에서 5줄 파싱
    const embedNow = interaction.message.embeds?.[0];
    const currentLines = parseLottoLinesFromEmbed(embedNow);
    if (!currentLines.length) {
      return interaction.reply({ content: "현재 화면에서 번호를 읽어오지 못했어. 다시 `/유틸 복권번호`로 시작해줘.", ephemeral: true });
    }
    decisions.unshift({ userId, drawNo, lines: currentLines, decidedAt: Date.now() });
    await writeLottoDecisions(decisions);

    const embed = renderLottoEmbed(userId, currentLines, drawNo || "미정");
    const rows = renderLottoButtons(drawNo || 0, true);
    return interaction.update({ content: "✅ 이번 회차 번호가 결정되었어!", embeds: [embed], components: rows });
  }

  if (action === "check") {
    // 1) 저장된 게 없으면 현재 화면의 5줄로 즉석 비교(비결정 상태)
    let baseLines = mine?.lines;
    if (!baseLines || !baseLines.length) {
      const embedNow = interaction.message.embeds?.[0];
      baseLines = parseLottoLinesFromEmbed(embedNow);
    }
    if (!baseLines || !baseLines.length) {
      return interaction.reply({ content: "비교할 번호가 없어. `/유틸 복권번호`로 번호부터 만들어줘.", ephemeral: true });
    }

    // 2) 해당 회차의 발표 여부/당첨번호 조회
    const info = await fetchLottoNumbers(drawNo);
    if (!info) {
      return interaction.reply({ content: `${drawNo}회는 아직 발표 전이야. 발표 후 다시 확인해줘!`, ephemeral: true });
    }

    // 3) 등수별 금액 테이블
    const prize = await fetchPrizeTable(drawNo);
    const perRank = (r)=> prize && prize[r] ? prize[r] : 0;

    // 4) 각 줄 등수/금액 계산
    const results = [];
    let totalWon = 0;
    for (let i=0;i<baseLines.length;i++) {
      const line = baseLines[i];
      const rank = judgeRank(line, info.nums, info.bonus);
      const amt  = rank>=1 && rank<=5 ? perRank(rank) : 0;
      if (amt) totalWon += amt;
      results.push({ idx: i+1, line, rank, amt });
    }

    // 5) 요약 문자열
    const rowsTxt = results.map(r => {
      const tag = r.rank===0 ? "낙첨" : `${r.rank}등`;
      const won = r.amt ? `${r.amt.toLocaleString()}원` : "-";
      return `**${r.idx}**) ${r.line.join(", ")} → ${tag}${r.amt?` (${won})`:""}`;
    }).join("\n");

    const eb = new EmbedBuilder()
      .setTitle(`🧾 ${drawNo}회 당첨 결과`)
      .setDescription(rowsTxt || "(결과 없음)")
      .addFields(
        { name: "당첨번호", value: `${info.nums.join(", ")} + 보너스 ${info.bonus}`, inline: false },
        { name: "총 당첨금", value: `${totalWon.toLocaleString()}원`, inline: true },
      )
      .setFooter({ text: `발표일: ${info.drawDate || "-"}` })
      .setColor(totalWon>0 ? 0x00C853 : 0x9E9E9E);

    // 6) 화면 업데이트
    const locked = !!mine;
    const rows2 = renderLottoButtons(drawNo||0, locked);
    await interaction.update({ embeds: [eb], components: rows2 }).catch(()=>{});

    // 7) DM 발송(가능 시)
    try {
      const dm = await interaction.user.send({ embeds: [eb] });
      void dm;
    } catch { /* DM 차단/거부면 무시 */ }

    return;
  }
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
        return interaction.update({ content: "세션이 만료되었어. 다시 `/유틸 이미지`로 검색해줘!", embeds: [], components: [] });
      }
      const lang = detectLang(q);
      const list = await findImages(q, lang);
      if (!Array.isArray(list) || !list.length) {
        return interaction.update({ content: "세션을 복구하지 못했어. 다시 `/유틸 이미지`로 검색해줘!", embeds: [], components: [] });
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
      return interaction.update({ content: "이 이미지는 다른 사용자의 검색 세션이야.", embeds: [], components: [] });
    }

    // === 공유 ===
    if (action === "share") {
      // 1) 먼저 버튼 상태를 '공유됨'으로 즉시 갱신
      {
        const url = sess.list[sess.idx];
        const eb  = renderImageEmbed(sess.q, url, sess.lang, true);
        const rows = renderImageButtons(sessionId, true);
        await interaction.update({ embeds: [eb], components: rows });
      }

      // 2) 채널 전송(권한 없으면 에페메럴로 안내)
      try {
        const url = sess.list[sess.idx];
        const embedPub = renderImageEmbed(sess.q, url, sess.lang, true);
        await interaction.channel.send({ embeds: [embedPub] });
        sess.shared = true;
        imageSessions.set(sessionId, sess);
      } catch (e) {
        await interaction.followUp({
          content: "채널 권한이 부족해서 공유에 실패했어. (메시지 전송/임베드 링크 권한 확인)",
          ephemeral: true
        }).catch(() => {});
      }
      return;
    }

    // === 다른 이미지 ===
    if (action === "more") {
      if (!Array.isArray(sess.list) || !sess.list.length) {
        return interaction.update({ content: "결과가 더 없어.", embeds: [], components: [] });
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

      const url = sess.list[sess.idx];
      const eb  = renderImageEmbed(sess.q, url, sess.lang, false);
      const rows = renderImageButtons(sessionId, false);
      return interaction.update({ embeds: [eb], components: rows });
    }

    // 알 수 없는 action 보호
    return interaction.update({ content: "알 수 없는 동작이야.", components: [] });

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
