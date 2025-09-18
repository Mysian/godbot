"use strict";
const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const lockfile = require("proper-lockfile");

// ====== 경로/파일 설정 ======
const DATA_DIR = path.join(__dirname, "../data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const STATE_PATH = path.join(DATA_DIR, "pulseok-state.json");

// ====== KST 날짜 유틸 ======
function getKSTDateStr() {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ====== 안전 로드/세이브 ======
function safeLoad() {
  try {
    if (!fs.existsSync(STATE_PATH)) {
      const fresh = { lastDate: null, users: {} };
      fs.writeFileSync(STATE_PATH, JSON.stringify(fresh, null, 2), "utf8");
      return fresh;
    }
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    if (!raw || !raw.trim()) return { lastDate: null, users: {} };
    const obj = JSON.parse(raw);
    if (typeof obj !== "object" || obj === null) return { lastDate: null, users: {} };
    if (typeof obj.users !== "object" || obj.users === null) obj.users = {};
    return obj;
  } catch {
    try { fs.renameSync(STATE_PATH, STATE_PATH + `.corrupt.${Date.now()}`); } catch {}
    return { lastDate: null, users: {} };
  }
}

function safeSave(obj) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(obj, null, 2), "utf8");
}

function ensureStateFile() {
  try {
    if (!fs.existsSync(STATE_PATH)) {
      const fresh = { lastDate: null, users: {} };
      fs.writeFileSync(STATE_PATH, JSON.stringify(fresh, null, 2), "utf8");
    } else {
      const raw = fs.readFileSync(STATE_PATH, "utf8");
      if (!raw || !raw.trim()) {
        const fresh = { lastDate: null, users: {} };
        fs.writeFileSync(STATE_PATH, JSON.stringify(fresh, null, 2), "utf8");
      }
    }
  } catch {
    try { fs.renameSync(STATE_PATH, STATE_PATH + `.corrupt.${Date.now()}`); } catch {}
    const fresh = { lastDate: null, users: {} };
    fs.writeFileSync(STATE_PATH, JSON.stringify(fresh, null, 2), "utf8");
  }
}

// ====== 멘트 템플릿 ======
const LINES = [
  "{nick}님이 풀썩 쓰러져버렸습니다!",
  "일어설 힘이 나지 않는 {nick}님... 그대로 고꾸라집니다..!",
  "아아 이게 뭐죠? {nick}님이 '출석'을 '풀석'으로 잘못 쳤네요 바보",
  "{nick}님은 바보가 분명합니다. 출석을 또 풀석이라고 쳤네요",
  "... 이 정도면 {nick}님은 출석이라는 단어를 풀석으로 알고 있나보네요",
  "풀석 그만 쓰러지세요! 띨띨이 {nick}님아",
  "너무 풀석풀석 쓰러져서 {nick}님은 그만 엉덩이가 사라지고 말았답니다",
  "아 이제 풀석 반응 안해줄거에요 내일 다시 찾아오세요",
];

function resolveNick(interaction) {
  const m = interaction.member;
  const u = interaction.user;
  return (m && (m.nickname || m.displayName)) || u.globalName || u.username;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("풀석")
    .setDescription("풀석 쓰러지기(유저별 일일 순차 멘트)"),
  async execute(interaction) {
    const nick = resolveNick(interaction);
    const userId = interaction.user.id;
    const today = getKSTDateStr();

    // 🔧 먼저 상태 파일을 보증
    ensureStateFile();

    // 파일 잠금
    let release;
    try {
      release = await lockfile.lock(STATE_PATH, {
        retries: { retries: 5, factor: 1.5, minTimeout: 60, maxTimeout: 300 },
      });

      const state = safeLoad();

      // 날짜 바뀌었으면 전체 초기화
      if (state.lastDate !== today) {
        state.lastDate = today;
        state.users = {};
      }

      const current = Number.isInteger(state.users[userId]) ? state.users[userId] : 0;

      if (current < LINES.length) {
        const text = LINES[current].replace("{nick}", nick);
        state.users[userId] = Math.min(current + 1, LINES.length);
        safeSave(state);
        await interaction.reply({ content: text, ephemeral: false });
      } else {
        await interaction.reply({
          content: "갓봇이 당신의 풀석을 지겨워합니다. 자정 이후에 다시 찾아오세요",
          ephemeral: true,
        });
      }
    } catch (err) {
      try {
        await interaction.reply({
          content: "잠깐! 처리 중 문제가 생겼어. 다시 한 번만 시도해줘.",
          ephemeral: true,
        });
      } catch {}
      console.error("[/풀석] error:", err);
    } finally {
      if (typeof release === "function") {
        try { await release(); } catch {}
      }
    }
  },
};
