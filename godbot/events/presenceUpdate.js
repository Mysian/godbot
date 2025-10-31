// godbot/events/presenceUpdate.js
const { Events, ActivityType } = require("discord.js");

const ADMIN_LOG_CHANNEL_ID = "1433747936944062535";

const voiceChannelToTextChannel = {
  "1222085152600096778": "1222085152600096778",
  "1222085194706587730": "1222085194706587730",
  "1230536383941050368": "1230536383941050368",
  "1230536435526926356": "1230536435526926356",
  "1207990601002389564": "1207990601002389564",
  "1209157046432170015": "1209157046432170015",
  "1209157237977911336": "1209157237977911336",
  "1209157289555140658": "1209157289555140658",
  "1209157326469210172": "1209157326469210172",
  "1209157352771682304": "1209157352771682304",
  "1209157451895672883": "1209157451895672883",
  "1209157492207255572": "1209157492207255572",
  "1209157524243091466": "1209157524243091466",
  "1209157622662561813": "1209157622662561813",
};

const GAME_NAME_MAP = new Map([
  ["league of legends", "롤"],
  ["overwatch 2", "오버워치"],
  ["party animals", "파티 애니멀즈"],
  ["marvel rivals", "마블 라이벌즈"],
  ["panicore", "페니코어"],
  ["tabletop simulator", "테탑시"],
  ["minecraft", "마인크래프트"],
  ["roblox", "로블록스"],
  ["valorant", "발로란트"],
  ["apex legends", "에이펙스 레전드"],
  ["r.e.p.o.", "레포"],
  ["playerunknown's battlegrounds", "배그"],
  ["pubg", "배그"],
  ["battlegrounds", "배그"],
  ["terraria", "테라리아"],
  ["raft", "래프트"],
  ["project zomboid", "좀보이드"],
  ["goose goose duck", "구구덕"],
  ["core keeper", "코어키퍼"],
  ["서든어택", "서든어택"],
  ["sudden attack", "서든어택"],
  ["eternal return", "이터널 리턴"],
  ["이터널 리턴", "이터널 리턴"],
  ["valheim", "발헤임"],
  ["enshrouded", "인슈라오디드"],
  ["arc raiders", "아크 레이더스"],
  ["escape from duckov", "이스케이프 프롬 덕코프"],
  ["djmax respect v", "디맥"],
  ["Phasmophobia", "파스모포비아"],
  ["Lethal Company", "리썰컴퍼니"],
  ["MIMESIS", "미메시스"],
  ["Once Human", "원스휴먼"],
  ["MapleStory", "메이플스토리"],
  ["던전앤파이터", "던파"],
]);

const GAME_FAMILIES = [
  {
    id: "lol",
    alias: "롤",
    keys: [
      "league of legends",
      "lol",
      "riot client",
      "leagueclient",
      "league client",
      "leagueclientux",
    ],
  },
];

const STABLE_MS = 20_000;
const COOLDOWN_MS = 30 * 60_000;

function now() { return Date.now(); }

function normalize(s) {
  return (s || "")
    .toString()
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^0-9a-z\u3131-\u318e\uac00-\ud7a3\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function diceCoefficient(a, b) {
  const A = normalize(a);
  const B = normalize(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const bi = (s) => {
    const out = [];
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
    return out;
  };
  const a2 = bi(A);
  const b2 = new Map();
  for (const bg of bi(B)) b2.set(bg, (b2.get(bg) || 0) + 1);
  let hits = 0;
  for (const bg of a2) {
    const c = b2.get(bg);
    if (c > 0) {
      hits++;
      b2.set(bg, c - 1);
    }
  }
  return (2 * hits) / (a2.length + Math.max(0, B.length - 1));
}

function matchFamilyOrAlias(activityName) {
  const n = normalize(activityName);
  if (!n) return null;

  for (const fam of GAME_FAMILIES) {
    for (const key of fam.keys) {
      const k = normalize(key);
      if (n.includes(k) || k.includes(n) || diceCoefficient(n, k) >= 0.85) {
        return { family: fam.id, alias: fam.alias };
      }
    }
  }

  let best = null;
  let bestScore = 0;
  for (const [raw, alias] of GAME_NAME_MAP) {
    const key = normalize(raw);
    if (!key) continue;
    if (n.includes(key) || key.includes(n)) return { family: alias, alias };
    const score = diceCoefficient(n, key);
    if (score > bestScore) {
      bestScore = score;
      best = alias;
    }
  }
  return bestScore >= 0.72 ? { family: best, alias: best } : null;
}

function findAliasFamily(presence) {
  const acts = presence?.activities || [];
  for (const a of acts) {
    if (a?.type === ActivityType.Playing && a.name) {
      const res = matchFamilyOrAlias(a.name);
      if (res) return res;
    }
  }
  return null;
}

const firstSeenStable = new Map();
const lastSent = new Map();
const startedAt = new Map();

function famKey(gid, uid, fam) { return `${gid}:${uid}:${fam}`; }
function baseKey(gid, uid) { return `${gid}:${uid}:`; }

function clearOtherFamilies(base, keepFam = null) {
  for (const k of Array.from(firstSeenStable.keys())) {
    if (k.startsWith(base) && (!keepFam || !k.endsWith(`:${keepFam}`))) {
      firstSeenStable.delete(k);
    }
  }
}

function formatDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) parts.push(`${h}시간`);
  if (m) parts.push(`${m}분`);
  if (!h && !m) parts.push(`${sec}초`);
  return parts.join(" ");
}

async function logStart(member, alias, voice) {
  const ch = member.guild.channels.cache.get(ADMIN_LOG_CHANNEL_ID);
  if (!ch) return;
  const name = member.displayName || member.user.username;
  const vName = voice?.name ? ` | 음성: ${voice.name}` : "";
  await ch.send(`-# [🎮 활동 시작] **${name}** — '${alias}' 시작${vName}`);
}

async function logEnd(guild, userDisplayName, alias, startedTs) {
  const ch = guild.channels.cache.get(ADMIN_LOG_CHANNEL_ID);
  if (!ch) return;
  if (!startedTs) return;
  const dur = formatDuration(now() - startedTs);
  await ch.send(`-# [🛑 활동 종료] **${userDisplayName}** — '${alias}' 종료 | 총 플레이: ${dur}`);
}

module.exports = {
  name: Events.PresenceUpdate,
  async execute(oldPresence, newPresence) {
    const member = newPresence?.member || oldPresence?.member;
    if (!member || member.user?.bot) return;

    const gid = member.guild.id;
    const uid = member.id;
    const bKey = baseKey(gid, uid);
    const voice = member.voice?.channel;

    let textChannel = null;
    if (voice?.id) {
      const textId = voiceChannelToTextChannel[voice.id];
      if (textId) textChannel = member.guild.channels.cache.get(textId) || null;
    }

    const oldRes = findAliasFamily(oldPresence);
    const newRes = findAliasFamily(newPresence);

    if ((!newRes && oldRes) || (oldRes && newRes && oldRes.family !== newRes.family)) {
      const key = famKey(gid, uid, oldRes.family);
      const startedTs = startedAt.get(key);
      await logEnd(member.guild, member.displayName || member.user.username, oldRes.alias, startedTs);
      startedAt.delete(key);
      firstSeenStable.delete(key);
    }

    if (!newRes) return;

    clearOtherFamilies(bKey, newRes.family);

    const key = famKey(gid, uid, newRes.family);
    const t = now();

    if (!firstSeenStable.has(key)) {
      firstSeenStable.set(key, t);
      return;
    }

    if (t - firstSeenStable.get(key) < STABLE_MS) return;

    const last = lastSent.get(key) || 0;
    if (t - last < COOLDOWN_MS) return;

    lastSent.set(key, t);
    startedAt.set(key, t);

    const name = member.displayName || member.user.username;

    if (textChannel) {
      try {
        await textChannel.send(`-# [🎮 **${name}** 님이 '${newRes.alias}' 을(를) 시작했습니다.]`);
      } catch {}
    }

    try {
      await logStart(member, newRes.alias, voice);
    } catch {}
  },
};
