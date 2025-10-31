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
  ["league of legends client", "롤"],
  ["league of legends (tm) client", "롤"],
  ["league of legends tm client", "롤"],
  ["league of legends™ client", "롤"],
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
  ["enshrouded", "인슈라우디드"],
  ["arc raiders", "아크 레이더스"],
  ["escape from duckov", "이스케이프 프롬 덕코프"],
  ["djmax respect v", "디맥"],
  ["Phasmophobia", "파스모포비아"],
  ["Lethal Company", "리썰컴퍼니"],
  ["MIMESIS", "미메시스"],
  ["Once Human", "원스휴먼"],
  ["Once Human", "원스휴먼"],
  ["MapleStory", "버섯 왕국 지키기"],
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
      "league of legends client",
      "league of legends (tm) client",
      "league of legends tm client",
      "league of legends™ client",
    ],
  },
];

const STABLE_MS_DEFAULT = 7_000;
const FAMILY_STABLE_MS = { lol: 12_000 };
const END_GRACE_MS = 2 * 30_000;
const COOLDOWN_MS = 15 * 60_000;

function getStableMs(fam) {
  return FAMILY_STABLE_MS[fam] || STABLE_MS_DEFAULT;
}

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

  let best = null;

  for (const fam of GAME_FAMILIES) {
    for (const key of fam.keys) {
      const k = normalize(key);
      const hard =
        n.includes(k) || k.includes(n) || diceCoefficient(n, k) >= 0.9;
      const score = hard ? 1 : diceCoefficient(n, k);
      if (!best || score > best.score) {
        best = { family: fam.id, alias: fam.alias, score };
      }
    }
  }

  for (const [raw, alias] of GAME_NAME_MAP) {
    const key = normalize(raw);
    const hard = n.includes(key) || key.includes(n) || diceCoefficient(n, key) >= 0.9;
    const score = hard ? 0.95 : diceCoefficient(n, key);
    if (!best || score > best.score) {
      best = { family: alias, alias, score };
    }
  }

  return best && best.score >= 0.72 ? best : null;
}

function findBestAliasFamily(presence) {
  const acts = presence?.activities || [];
  let best = null;
  for (const a of acts) {
    if (a?.type !== ActivityType.Playing || !a.name) continue;
    const res = matchFamilyOrAlias(a.name);
    if (res && (!best || res.score > best.score)) best = res;
  }
  return best;
}

const firstSeenStable = new Map();
const lastSent = new Map();
const startedAt = new Map();
const lastSeen = new Map();
const currentFamily = new Map();
const lastAlias = new Map();

function famKey(gid, uid, fam) { return `${gid}:${uid}:${fam}`; }
function baseKey(gid, uid) { return `${gid}:${uid}:`; }

function clearOtherFamilies(base, keepFam = null) {
  for (const k of Array.from(firstSeenStable.keys())) {
    if (k.startsWith(base) && (!keepFam || !k.endsWith(`:${keepFam}`))) {
      firstSeenStable.delete(k);
    }
  }
  for (const k of Array.from(startedAt.keys())) {
    if (k.startsWith(base) && (!keepFam || !k.endsWith(`:${keepFam}`))) {
      startedAt.delete(k);
    }
  }
  for (const k of Array.from(lastSeen.keys())) {
    if (k.startsWith(base) && (!keepFam || !k.endsWith(`:${keepFam}`))) {
      lastSeen.delete(k);
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

    const t = now();
    const seen = findBestAliasFamily(newPresence);
    const currFam = currentFamily.get(bKey) || null;

    if (seen && (!currFam || currFam === seen.family)) {
      const key = famKey(gid, uid, seen.family);
      lastSeen.set(key, t);

      if (!startedAt.has(key)) {
        if (!firstSeenStable.has(key)) {
          firstSeenStable.set(key, t);
          return;
        }
        const stableMs = getStableMs(seen.family);
        if (t - firstSeenStable.get(key) < stableMs) return;

        const last = lastSent.get(key) || 0;
        if (t - last < COOLDOWN_MS) return;

        lastSent.set(key, t);
        startedAt.set(key, t);
        currentFamily.set(bKey, seen.family);
        lastAlias.set(key, seen.alias);
        clearOtherFamilies(bKey, seen.family);

        const name = member.displayName || member.user.username;
        if (textChannel) {
          try {
            await textChannel.send(`-# [🎮 **${name}** 님이 '${seen.alias}' 을(를) 시작했습니다.]`);
          } catch {}
        }
        try {
          await logStart(member, seen.alias, voice);
        } catch {}
      }
      return;
    }

    if (seen && currFam && currFam !== seen.family) {
      const oldKey = famKey(gid, uid, currFam);
      const alias = lastAlias.get(oldKey);
      const startedTs = startedAt.get(oldKey);
      try { await logEnd(member.guild, member.displayName || member.user.username, alias, startedTs); } catch {}
      startedAt.delete(oldKey);
      firstSeenStable.delete(oldKey);
      lastSeen.delete(oldKey);
      currentFamily.delete(bKey);

      const newKey = famKey(gid, uid, seen.family);
      firstSeenStable.set(newKey, t);
      lastSeen.set(newKey, t);
      return;
    }

    if (!seen && currFam) {
      const key = famKey(gid, uid, currFam);
      const lastT = lastSeen.get(key) || t;
      if (t - lastT < END_GRACE_MS) return;

      const alias = lastAlias.get(key);
      const startedTs = startedAt.get(key);
      try { await logEnd(member.guild, member.displayName || member.user.username, alias, startedTs); } catch {}
      startedAt.delete(key);
      firstSeenStable.delete(key);
      lastSeen.delete(key);
      currentFamily.delete(bKey);
      lastAlias.delete(key);
      return;
    }
  },
};
