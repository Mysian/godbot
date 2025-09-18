const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder 
} = require("discord.js");
const fs = require("fs");
const path = require("path");

// ====== 기간 옵션 ======
const PERIODS = [
  { label: '1일', value: '1', description: '최근 1일', },
  { label: '7일', value: '7', description: '최근 7일', },
  { label: '30일', value: '30', description: '최근 30일', },
  { label: '60일', value: '60', description: '최근 60일', },
  { label: '90일', value: '90', description: '최근 90일', },
];

// ====== 제외 대상 ======
const EXCLUDED_USER_IDS = ["285645561582059520", "638742607861645372"];
const EXCLUDED_ROLE_IDS = ["1205052922296016906"];

// ====== 활동 이름 정규화/제외 ======
const EXCLUDED_APPS = new Set(["Valorant Tracker App"]);

const GAME_CANON = [
  { group: "pubg",      ko: "배틀그라운드",       names: ["PUBG: BATTLEGROUNDS", "PLAYERUNKNOWN'S BATTLEGROUNDS"] },
  { group: "lol",       ko: "리그 오브 레전드",   names: ["League of Legends"] },
  { group: "er",        ko: "이터널 리턴",       names: ["Eternal Return"] },
  { group: "valorant",  ko: "발로란트",           names: ["VALORANT", "Valorant"] },
  { group: "r6",        ko: "레인보우 식스 시즈", names: ["Rainbow Six Siege"] },
  { group: "minecraft", ko: "마인크래프트",       names: ["Minecraft"] },
  { group: "ow2",       ko: "오버워치2",          names: ["Overwatch 2"] },
];

const NAME_TO_GROUP = new Map();
const GROUP_TO_LABEL = new Map();
for (const row of GAME_CANON) {
  GROUP_TO_LABEL.set(row.group, row.ko);
  for (const n of row.names) NAME_TO_GROUP.set(n.toLowerCase(), row.group);
}

function canonGame(raw) {
  if (!raw) return null;
  if (EXCLUDED_APPS.has(raw)) return null;
  const key = raw.toLowerCase();
  const group = NAME_TO_GROUP.get(key) || key; // 미등록명은 자체 그룹으로
  const label = GROUP_TO_LABEL.get(group) || raw;
  return { group, label };
}

function actDateStr(act) {
  // 우선순위: act.date(YYYY-MM-DD) → epoch/ISO(ts/start/timestamp)
  if (typeof act?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(act.date)) return act.date;
  const t = typeof act?.ts === "number" ? act.ts
    : typeof act?.start === "number" ? act.start
    : typeof act?.timestamp === "number" ? act.timestamp
    : typeof act?.ts === "string" ? Date.parse(act.ts)
    : typeof act?.start === "string" ? Date.parse(act.start)
    : typeof act?.timestamp === "string" ? Date.parse(act.timestamp)
    : null;
  if (t && !Number.isNaN(t)) {
    const d = new Date(t + 9 * 60 * 60 * 1000); // KST 보정
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }
  return null; // 날짜 없으면 이후 로직에서 무시/포함 선택 가능
}

// ====== 음성채널 화이트리스트 ======
const VOICE_CHANNELS = [
  ["101호","1222085152600096778"],
  ["102호","1222085194706587730"],
  ["201호","1230536383941050368"],
  ["202호","1230536435526926356"],
  ["301호","1207990601002389564"],
  ["302호","1209157046432170015"],
  ["401호","1209157237977911336"],
  ["402호","1209157289555140658"],
  ["501호","1209157326469210172"],
  ["502호","1209157352771682304"],
  ["601호","1209157451895672883"],
  ["602호","1209157492207255572"],
  ["701호","1209157524243091466"],
  ["702호","1209157622662561813"],
];
const VOICE_WHITELIST_SET = new Set(VOICE_CHANNELS.map(([,id]) => id));

// ====== 공용 유틸 ======
function getDateRange(period) {
  if (period === 'all') return { from: null, to: null };
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const to = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  now.setDate(now.getUTCDate() - (parseInt(period, 10) - 1));
  const from = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  return { from, to };
}
function getFilterLabel(type) {
  if (type === "message") return "💬 채팅";
  if (type === "voice") return "🔊 음성";
  if (type === "activity") return "🎮 활동";
  return "🏅 종합";
}
function formatHourMinute(sec) {
  const totalMinutes = Math.round(sec / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  let str = '';
  if (hours > 0) str += `${hours}시간`;
  if (minutes > 0 || hours === 0) str += `${minutes}분`;
  return str;
}
function pad2(n){ return String(n).padStart(2,"0"); }

// ====== 컴포넌트 라인 ======
function getFilterRow(selected) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("filter_all").setStyle(selected === "all" ? ButtonStyle.Primary : ButtonStyle.Secondary).setEmoji("🏅").setLabel("종합"),
    new ButtonBuilder().setCustomId("filter_message").setStyle(selected === "message" ? ButtonStyle.Primary : ButtonStyle.Secondary).setEmoji("💬").setLabel("채팅"),
    new ButtonBuilder().setCustomId("filter_voice").setStyle(selected === "voice" ? ButtonStyle.Primary : ButtonStyle.Secondary).setEmoji("🔊").setLabel("음성"),
    new ButtonBuilder().setCustomId("filter_activity").setStyle(selected === "activity" ? ButtonStyle.Primary : ButtonStyle.Secondary).setEmoji("🎮").setLabel("활동")
  );
}
// 🔥 새로 추가: 1~2행 사이 라인
function getExtraRow(viewMode) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("view_hourly")
      .setStyle(viewMode === "hourly" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji("🕒")
      .setLabel("시간대별 이용현황"),
    new ButtonBuilder()
      .setCustomId("view_voicechannels")
      .setStyle(viewMode === "channels" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji("🎧")
      .setLabel("음성채널별 이용현황")
  );
}
function getPeriodRow(selected) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("select_period")
      .setPlaceholder("기간 선택")
      .addOptions(PERIODS.map(p => ({
        label: p.label,
        value: p.value,
        description: p.description,
        default: p.value === selected,
      })))
  );
}
function getPageRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("prev").setLabel("이전").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("next").setLabel("다음").setStyle(ButtonStyle.Secondary)
  );
}

// ====== 파일 경로 (activity-tracker.js와 동일 파일 사용) ======
const DATA_PATH = path.join(__dirname, "../activity-data.json");

// ====== 로컬 집계(역할/유저 제외 반영) ======
function loadRaw() {
  if (!fs.existsSync(DATA_PATH)) return {};
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
}
function filterMemberUsable(guild, userId) {
  const m = guild.members.cache.get(userId);
  if (!m) return false;
  if (m.user.bot) return false;
  if (EXCLUDED_USER_IDS.includes(userId)) return false;
  if (m.roles.cache.some(r => EXCLUDED_ROLE_IDS.includes(r.id))) return false;
  return true;
}

// ====== 기존: 활동 임베드(전체) ======
function buildActivityEmbed({ guild, period = "7", page = 0, logs }) {
  const pageSize = 10;
  const { from, to } = getDateRange(period);

  // 1) 원본 이름 기준 카운트
  const countsByRaw = new Map();
  const data = logs || {};
  for (const uid in data) {
    if (!filterMemberUsable(guild, uid)) continue;
    const list = data[uid] || [];
    for (const act of list) {
      if (act.activityType !== "game") continue;
      const name = act?.details?.name || act?.name;
      if (!name || EXCLUDED_APPS.has(name)) continue;

      const dstr = actDateStr(act);
      // 날짜 정보가 있으면 기간 필터 적용, 없으면 포함(원하면 이 줄을 continue로 바꿔 제외 가능)
      if (dstr) {
        if (from && dstr < from) continue;
        if (to && dstr > to) continue;
      }

      countsByRaw.set(name, (countsByRaw.get(name) || 0) + 1);
    }
  }

  // 2) 그룹(정규화) 단위로 묶되, "합산"이 아니라 "최댓값만" 채택(요청사항: 더 많은 쪽만 노출)
  const groupCount = new Map(); // group -> count(max)
  const groupLabel = new Map(); // group -> ko label(or 원문)
  for (const [rawName, cnt] of countsByRaw) {
    const canon = canonGame(rawName);
    if (!canon) continue;
    const prev = groupCount.get(canon.group) || 0;
    if (cnt > prev) {
      groupCount.set(canon.group, cnt);
      groupLabel.set(canon.group, canon.label);
    }
  }

  // 3) 정렬(내림차순), 페이지 슬라이스
  const sorted = [...groupCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([group]) => groupLabel.get(group));

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const slice = sorted.slice(page * pageSize, (page + 1) * pageSize);

  // 4) 출력(순위만, "~회" 미출력)
  const desc = slice.length
    ? slice.map((label, idx) => `**${page * pageSize + idx + 1}위** ${label}`).join("\n")
    : "활동 기록 없음";

  const periodLabel = PERIODS.find(p => p.value === period)?.label || "전체";
  return {
    embed: new EmbedBuilder()
      .setTitle(`🎮 전체 활동 TOP`)
      .setDescription(desc)
      .setFooter({ text: `기간: ${periodLabel} | ${page + 1}/${totalPages}페이지` }),
    totalPages
  };
}


// ====== 기존: 유저별 랭킹 임베드 ======
function buildStatsEmbed({ guild, page = 0, filterType = "all", period = "1" }) {
  const pageSize = 15;
  const { from, to } = getDateRange(period);
  const activity = require("../utils/activity-tracker");
  let stats = activity.getStats({ from, to, filterType, userId: null });

  stats = stats.filter(s => filterMemberUsable(guild, s.userId));

  if (filterType === "message") stats.sort((a, b) => b.message - a.message);
  else if (filterType === "voice") stats.sort((a, b) => b.voice - a.voice);
  else stats.sort((a, b) => (b.message + b.voice) - (a.message + a.voice));

  const totalPages = Math.ceil(Math.min(100, stats.length) / pageSize) || 1;
  let list = "";
  for (let i = page * pageSize; i < Math.min(stats.length, (page + 1) * pageSize); i++) {
    const s = stats[i];
    if (filterType === "message") {
      const msgStr = s.message.toLocaleString();
      list += `**${i + 1}위** <@${s.userId}> — 💬 ${msgStr}회\n`;
    } else if (filterType === "voice") {
      const voiceStr = formatHourMinute(s.voice);
      list += `**${i + 1}위** <@${s.userId}> — 🔊 ${voiceStr}\n`;
    } else {
      const msgStr = s.message.toLocaleString();
      const voiceStr = formatHourMinute(s.voice);
      list += `**${i + 1}위** <@${s.userId}> — 🔊 ${voiceStr}, 💬 ${msgStr}회\n`;
    }
  }
  const periodLabel = PERIODS.find(p => p.value === period)?.label || "전체";
  return {
    embed: new EmbedBuilder()
      .setTitle(`📊 활동 랭킹 [${getFilterLabel(filterType)}]`)
      .setDescription(list.length ? list : "해당 조건에 데이터 없음")
      .setFooter({ text: `기간: ${periodLabel} | ${page + 1}/${totalPages}페이지` }),
    totalPages
  };
}

// ====== 새로 추가: 시간대별 이용현황(세로 스파크라인) ======
function buildHourlyEmbed({ guild, period = "7" }) {
  const { from, to } = getDateRange(period);
  const raw = loadRaw();
  // 24시간 집계 (메시지 건수 + 음성 ‘분’ 가중)
  const hours = Array.from({ length: 24 }, () => 0);
  const msgHours = Array.from({ length: 24 }, () => 0);
  const voiceHoursSec = Array.from({ length: 24 }, () => 0);

  for (const uid of Object.keys(raw)) {
    if (!filterMemberUsable(guild, uid)) continue;
    const days = raw[uid];
    for (const date of Object.keys(days)) {
      if (from && date < from) continue;
      if (to && date > to) continue;
      const hmap = (days[date].hours || {});
      for (let h = 0; h < 24; h++) {
        const hh = pad2(h);
        const bucket = hmap[hh] || { message: 0, voice: 0 };
        msgHours[h] += bucket.message || 0;
        voiceHoursSec[h] += bucket.voice || 0;
      }
    }
  }
  // 결합 점수: message + voiceSec/60 (= 분)
  for (let h = 0; h < 24; h++) {
    hours[h] = msgHours[h] + Math.round(voiceHoursSec[h] / 60);
  }

  const max = Math.max(1, ...hours);
  const levels = "▁▂▃▄▅▆▇█";
  const bars = hours.map(v => {
    const ratio = v / max;
    const idx = Math.min(levels.length - 1, Math.max(0, Math.round(ratio * (levels.length - 1))));
    return levels[idx];
  }).join("");

  // 상위 시간대 5개
  const top = hours
    .map((v, h) => ({ h, v }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 5)
    .map((o, i) => `**${i + 1}위** ${String(o.h).padStart(2,"0")}시 — 점수 ${o.v.toLocaleString()} (💬${msgHours[o.h].toLocaleString()} + 🔊${Math.round(voiceHoursSec[o.h]/60).toLocaleString()}분)`)
    .join("\n");

  const periodLabel = PERIODS.find(p => p.value === period)?.label || "전체";
  const desc = [
    "```",
    "00시                                                           23시",
    bars,
    "```",
    top || "데이터 없음"
  ].join("\n");

  return {
    embed: new EmbedBuilder()
      .setTitle(`🕒 시간대별 이용현황 (세로 막대)`)
      .setDescription(desc)
      .setFooter({ text: `기간: ${periodLabel}` }),
    totalPages: 1
  };
}

// ====== 새로 추가: 음성채널별 이용현황(화이트리스트) ======
function buildVoiceChannelEmbed({ guild, period = "7", page = 0 }) {
  const pageSize = 10;
  const { from, to } = getDateRange(period);
  const raw = loadRaw();

  // 채널별 초 합산
  const agg = {}; // cid -> seconds
  for (const uid of Object.keys(raw)) {
    if (!filterMemberUsable(guild, uid)) continue;
    const days = raw[uid];
    for (const date of Object.keys(days)) {
      if (from && date < from) continue;
      if (to && date > to) continue;
      const vbc = days[date].voiceByChannel || {};
      for (const cid of Object.keys(vbc)) {
        if (!VOICE_WHITELIST_SET.has(cid)) continue;
        agg[cid] = (agg[cid] || 0) + (vbc[cid] || 0);
      }
    }
  }

  const list = Object.entries(agg)
    .map(([cid, sec]) => {
      const name = (VOICE_CHANNELS.find(([,id]) => id === cid)?.[0]) || `채널(${cid})`;
      return { name, cid, sec };
    })
    .sort((a, b) => b.sec - a.sec);

  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const slice = list.slice(page * pageSize, (page + 1) * pageSize);

  const lines = slice.length
    ? slice.map((row, idx) => `**${page * pageSize + idx + 1}위** ${row.name} — 🔊 ${formatHourMinute(row.sec)}`).join("\n")
    : "데이터 없음";

  const periodLabel = PERIODS.find(p => p.value === period)?.label || "전체";
  return {
    embed: new EmbedBuilder()
      .setTitle(`🎧 음성채널별 이용현황`)
      .setDescription(lines)
      .setFooter({ text: `기간: ${periodLabel} | ${page + 1}/${totalPages}페이지` }),
    totalPages
  };
}

// ====== 진입점 ======
module.exports = {
  data: new SlashCommandBuilder()
    .setName("이용현황")
    .setDescription("기간별 전체 활동/채팅/음성 랭킹 + 시간대/채널 현황"),
  async execute(interaction) {
    const activityCache = fs.existsSync("activity-logs.json")
  ? JSON.parse(fs.readFileSync("activity-logs.json", "utf-8"))
  : {};
    let period = '1';
    let filterType = "all";   // all, message, voice, activity
    let mainPage = 0;
    let viewMode = "list";    // list, hourly, channels

    

    async function getEmbed() {
      if (viewMode === "hourly") {
        return buildHourlyEmbed({ guild: interaction.guild, period });
      }
      if (viewMode === "channels") {
        return buildVoiceChannelEmbed({ guild: interaction.guild, period, page: mainPage });
      }
      if (filterType === "activity") {
  return buildActivityEmbed({
    guild: interaction.guild,
    period,
    page: mainPage,
    logs: activityCache
  });
}
        const totalPages = Math.ceil(Object.keys(counts).length / pageSize) || 1;
        return { embed, totalPages };
        else {
        return buildStatsEmbed({ guild: interaction.guild, page: mainPage, filterType, period });
      }
    }

    const { embed, totalPages } = await getEmbed();

    await interaction.reply({
      embeds: [embed],
      components: [
        getFilterRow(filterType),   // 1행
        getExtraRow(viewMode),      // 🔥 새로 추가된 1~2행 사이 라인
        getPeriodRow(period),       // 2행
        getPageRow(),               // 3행
      ],
      ephemeral: true,
    });

    let currentTotalPages = totalPages;

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id && (i.isButton() || i.isStringSelectMenu()),
      time: 2 * 60 * 1000,
    });

    collector.on("collect", async i => {
      try {
        let needUpdate = false;

        if (i.isButton()) {
          if (i.customId === "prev") {
            if (mainPage > 0) { mainPage--; needUpdate = true; }
          } else if (i.customId === "next") {
            if (mainPage < currentTotalPages - 1) { mainPage++; needUpdate = true; }
          } else if (i.customId.startsWith("filter_")) {
            // 리스트 모드에서만 의미 있음
            const type = i.customId.replace("filter_", "");
            filterType = type;
            viewMode = "list";
            mainPage = 0;
            needUpdate = true;
          } else if (i.customId === "view_hourly") {
            viewMode = "hourly";
            mainPage = 0;
            needUpdate = true;
          } else if (i.customId === "view_voicechannels") {
            viewMode = "channels";
            mainPage = 0;
            needUpdate = true;
          }
        } else if (i.isStringSelectMenu() && i.customId === "select_period") {
          period = i.values[0];
          mainPage = 0;
          needUpdate = true;
        }

        if (needUpdate) {
          const res = await getEmbed();
          currentTotalPages = res.totalPages || 1;
          await i.update({
            embeds: [res.embed],
            components: [
              getFilterRow(filterType),
              getExtraRow(viewMode),
              getPeriodRow(period),
              getPageRow(),
            ],
            ephemeral: true,
          });
        } else {
          if (!i.replied && !i.deferred) await i.deferUpdate();
        }
      } catch (err) {
        if (!String(err).includes("already been sent or deferred")) {
          console.error(err);
        }
      }
    });
  }
};


