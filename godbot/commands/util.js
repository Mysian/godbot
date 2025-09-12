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

// 메모 페이징
const MEMO_PAGE_SIZE = 10;

// 계산기 세션 (메모리는 일시적이라 충분)
const calcSessions = new Map(); // userId -> { a, b, op, input, last, updatedAt }

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
  // KST = UTC+9, 로컬 환경 상관 없이 표시용은 그냥 now로 사용
  return now;
}

function renderConchIntroEmbed() {
  return new EmbedBuilder()
    .setTitle("🐚 마법의 소라고동")
    .setDescription("아무 말이나 **질문**을 해봐!\n> **봇이 ‘그래’ 또는 ‘아니’ 중 하나로만** 대답해줄게.\n\n**안내**: _봇이 **그래/아니**로 답변 가능한 질문을 해주세요._")
    .setColor(0xA66BFF);
}
function renderConchIntroButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CONCH_PREFIX + "ask")
        .setLabel("질문하기")
        .setStyle(ButtonStyle.Primary)
    ),
  ];
}

/** 문자열 seed -> 32bit 정수 */
function seedFromString(s) {
  const h = crypto.createHash("sha256").update(s).digest();
  // 앞 4바이트를 정수로
  return h.readUInt32LE(0);
}

/** 간단 PRNG (mulberry32) */
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

/** 주차(ISO 비슷하게) */
function weekKeyKST(d = nowKST()) {
  // 주 단위 고정 추천을 위해 "YYYY-WW" 키 생성
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const onejan = new Date(dt.getFullYear(), 0, 1);
  const dayms = 24 * 60 * 60 * 1000;
  const week = Math.ceil((((dt - onejan) / dayms) + onejan.getDay() + 1) / 7);
  return `${dt.getFullYear()}-${String(week).padStart(2, "0")}`;
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
    // 만료 제거
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
  const st = calcSessions.get(userId) || { a: null, b: null, op: null, input: "", last: null, updatedAt: Date.now() };
  const { a, op, input, last } = st;
  const display = input || (a !== null ? String(a) : "0");
  const expr = `${a !== null ? a : ""} ${op || ""} ${input ? input : ""}`.trim() || (last !== null ? `ans: ${last}` : "ready");
  return new EmbedBuilder()
    .setTitle("🧮 계산기")
    .setDescription("간단 계산 현황")
    .addFields(
      { name: "표시", value: "```\n" + display + "\n```", inline: false },
      { name: "식", value: expr || "-", inline: false },
    )
    .setColor(0x5865F2);
}
function renderCalcButtons(st) {
  // 4x4
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
  return [row1, row2, row3, row4];
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
  // muldiv 토글: op가 * 또는 / 로 순환
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
  // + 또는 -
  if (st.a === null && st.input) {
    st.a = Number(st.input);
    st.input = "";
  }
  st.op = op; // '+' or '-'
}
function calcEqual(st) {
  const a = st.a;
  const b = st.input ? Number(st.input) : null;
  if (a === null || st.op === null || b === null) return; // 불완전
  let res = 0;
  if (st.op === "+") res = a + b;
  else if (st.op === "-") res = a - b;
  else if (st.op === "*") res = a * b;
  else if (st.op === "/") res = b === 0 ? NaN : a / b;

  st.last = res;
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
    const idx = start + i + 1;               // 번호
    const title = clampLen(m.title || "(제목 없음)", 40);
    const d = formatKST(m.createdAt);        // ✅ 한국시간
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
    const idx = start + i + 1; // ✅ 제목 대신 “번호”만
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
  const exp = m.expiresAt ? formatKST(m.expiresAt) : "무기한";   // ✅ KST
  const body = (m.body && m.body.trim().length) ? m.body : "(내용 없음)";
  const bodyBox = "```\n" + body + "\n```";                      // ✅ 코드블록

  return new EmbedBuilder()
    .setTitle(`🗒 ${m.title || "(제목 없음)"}`)
    .setDescription(bodyBox)
    .addFields({ name: "보관 기한", value: exp, inline: false })
    .setFooter({ text: `작성: ${formatKST(m.createdAt)} ・ ID: ${m.id}` }) // ✅ KST
    .setColor(0x3498DB);
}

function renderMemoDetailButtons(page) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(MEMO_PREFIX + `back|${page}`).setLabel("목록으로").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(MEMO_PREFIX + `edit|${page}`).setLabel("수정").setStyle(ButtonStyle.Primary), // ✅ 가운데 [수정]
      new ButtonBuilder().setCustomId(MEMO_PREFIX + `del`).setEmoji("🗑").setLabel("삭제").setStyle(ButtonStyle.Danger),
    ),
  ];
}


/* =========================
 * 복권번호
 * ========================= */
function bestBuyDay(userId) {
  // userId + 주차로 고정 추천 (월~토 중 하나)
  const key = weekKeyKST(nowKST());
  const seed = seedFromString(`${userId}:${key}`);
  const rnd = mulberry32(seed)();
  const idx = Math.floor(rnd * 6); // 0~5
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
 * SlashCommand 정의
 * ========================= */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("유틸")
    .setDescription("유틸리티 도구 모음")
    .addSubcommand(sc => sc.setName("계산기").setDescription("버튼 계산기"))
    .addSubcommand(sc => sc.setName("메모장").setDescription("개인 메모/검색/수정/삭제"))
    .addSubcommand(sc => sc.setName("복권번호").setDescription("1~45 중 6개, 총 5줄"))
    .addSubcommand(sc => sc.setName("마법의소라고동").setDescription("봇이 그래/아니 답변")),

  
  // Slash 명령 처리
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === "계산기") {
      // 세션 초기화/유지
      if (!calcSessions.has(userId)) {
        calcSessions.set(userId, { a: null, b: null, op: null, input: "", last: null, updatedAt: Date.now() });
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
      const embed = renderConchIntroEmbed();
      const rows  = renderConchIntroButtons();
      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }
  },

  // 버튼/모달 라우팅 (index.js에서 위임 호출)
  async route(interaction) {
    const { customId, user } = interaction;

    /* ===== 계산기 ===== */
    if (customId.startsWith(CALC_PREFIX)) {
      const userId = user.id;
      const st = calcSessions.get(userId) || { a: null, b: null, op: null, input: "", last: null, updatedAt: Date.now() };

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

      calcSessions.set(userId, st);
      const embed = renderCalcEmbed(userId);
      const rows = renderCalcButtons(st);
      return interaction.update({ embeds: [embed], components: rows });
    }

    /* ===== 메모장: 버튼 & 모달 ===== */
    if (customId.startsWith(MEMO_PREFIX)) {
      const userId = user.id;

      // 페이지 이동
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

      // 검색 모달 열기
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

      // 새 메모 모달 열기
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

      // 상세 열기
      if (customId.startsWith(MEMO_PREFIX + "open|")) {
        const [, id, pageStr] = customId.split("|");
        const list = await readMemos(userId);
        const memo = list.find(m => String(m.id) === String(id));
        if (!memo) {
          return interaction.reply({ content: "해당 메모를 찾을 수 없어.", ephemeral: true });
        }
        const embed = renderMemoDetailEmbed(memo);
        const rows = renderMemoDetailButtons(Number(pageStr) || 0);
        // 삭제 대상 ID를 message state에 담기 위해 버튼 customId에 포함 X → message metadata 필요
        // 간단히: 버튼은 'del' 고정, 삭제 시 가장 최근 detail을 기준으로 처리
        // (유저 단독 에페메랄이므로 안전)
        // 삭제 대상 id를 푸터로 담아둠 → route에서 embed 푸터에서 꺼내서 사용
        return interaction.update({ embeds: [embed], components: rows });
      }

      // 상세에서 목록으로
      if (customId.startsWith(MEMO_PREFIX + "back|")) {
        const [, pageStr] = customId.split("|");
        const page = Number(pageStr) || 0;
        const list = await readMemos(userId);
        const embed = renderMemoListEmbed(userId, list, page, "");
        const rows = renderMemoListButtons(list, page, "");
        return interaction.update({ embeds: [embed], components: rows });
      }

      // 상세에서 삭제
      if (customId === MEMO_PREFIX + "del") {
        // 현재 메시지의 embed 푸터에서 ID 추출
        const embeds = interaction.message.embeds || [];
        if (!embeds.length || !embeds[0].footer?.text) {
          return interaction.reply({ content: "삭제 대상을 찾을 수 없어.", ephemeral: true });
        }
        const footer = embeds[0].footer.text; // "작성: ... ・ ID: <id>"
        const idMatch = footer.match(/ID:\s*(\S+)/);
        const delId = idMatch ? idMatch[1] : null;
        if (!delId) {
          return interaction.reply({ content: "삭제 대상을 찾을 수 없어.", ephemeral: true });
        }
        const list = await readMemos(userId);
        const next = list.filter(m => String(m.id) !== String(delId));
        await writeMemos(userId, next);
        // 삭제 후 목록 1페이지로
        const page = 0;
        const embed = renderMemoListEmbed(userId, next, page, "");
        const rows = renderMemoListButtons(next, page, "");
        return interaction.update({ content: "🗑 삭제 완료", embeds: [embed], components: rows });
      }
      // 상세에서 수정 (모달 열기)
if (customId.startsWith(MEMO_PREFIX + "edit|")) {
  const [, pageStr] = customId.split("|");
  const embeds = interaction.message.embeds || [];
  if (!embeds.length || !embeds[0].footer?.text) {
    return interaction.reply({ content: "수정 대상을 찾을 수 없어.", ephemeral: true });
  }
  const footer = embeds[0].footer.text; // "작성: ... ・ ID: <id>"
  const idMatch = footer.match(/ID:\s*(\S+)/);
  const editId = idMatch ? idMatch[1] : null;
  if (!editId) {
    return interaction.reply({ content: "수정 대상을 찾을 수 없어.", ephemeral: true });
  }

  const list = await readMemos(user.id);
  const memo = list.find(m => String(m.id) === String(editId));
  if (!memo) return interaction.reply({ content: "해당 메모를 찾을 수 없어.", ephemeral: true });

  // TTL 남은 일수(정수) 계산
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

      // 수정 제출
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

  // 업데이트
  list[idx].title = title;
  list[idx].body  = body;
  list[idx].expiresAt = expiresAt;

  await writeMemos(userId, list);

  // 수정된 상세 임베드 보여주기 (새 에페메랄 메시지)
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

        // ===== 소라고동: 질문하기 버튼 =====
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

          // ===== 소라고동: 모달 제출 =====
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

    /* ===== 메모: 모달 submit ===== */
    if (interaction.isModalSubmit()) {
      const { customId } = interaction;
      // 검색 제출
      if (customId.startsWith(MEMO_PREFIX + "search_submit|")) {
        const [, pageStr] = customId.split("|");
        const q = (interaction.fields.getTextInputValue("q") || "").trim();
        const listAll = await readMemos(interaction.user.id);
        const list = q
          ? listAll.filter(m =>
              (m.title || "").toLowerCase().includes(q.toLowerCase()) ||
              (m.body || "").toLowerCase().includes(q.toLowerCase()))
          : listAll;
        const page = 0; // 검색 시 1페이지부터
        const embed = renderMemoListEmbed(interaction.user.id, list, page, q);
        const rows = renderMemoListButtons(list, page, q);
        return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
      }

      // 추가 제출
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
    }
  },
};
