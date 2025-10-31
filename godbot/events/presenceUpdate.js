// godbot/events/presenceUpdate.js
const { Events, ActivityType } = require("discord.js");

// 음성채널ID → 동일 텍스트채널ID (같은 숫자) 매핑
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

// 인식할 게임명 → 치환 이름
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
  ["ETERNAL RETURN", "이터널 리턴"],
  ["이터널 리턴", "이터널 리턴"],
  ["Valheim", "발헤임"],
  ["Enshrouded", "인슈라오디드"],
]);

// ‘게임 가족’(동일 계열 활동명)을 하나로 묶기
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

// 안정화 대기/쿨다운
const STABLE_MS = 20_000;   // 활동이 이 시간 이상 계속될 때만 알림
const COOLDOWN_MS = 15 * 60_000; // 같은 유저·같은 게임 재알림 제한

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

// 가족 우선 감지 → 없으면 기존 매칭
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

  // 가족이 없으면 기존 룰로 별칭 탐색
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

// 상태 메모리
const firstSeenStable = new Map(); // key=gid:uid:family → 첫 감지 시각
const lastSent = new Map();        // key=gid:uid:family → 마지막 전송 시각

function baseKey(gid, uid) { return `${gid}:${uid}:`; }
function famKey(gid, uid, fam) { return `${gid}:${uid}:${fam}`; }

// 동일 유저의 다른 가족 키들 정리
function clearOtherFamilies(base, keepFam = null) {
  for (const k of Array.from(firstSeenStable.keys())) {
    if (k.startsWith(base) && (!keepFam || !k.endsWith(`:${keepFam}`))) {
      firstSeenStable.delete(k);
    }
  }
}

module.exports = {
  name: Events.PresenceUpdate,
  async execute(oldPresence, newPresence) {
    const member = newPresence?.member || oldPresence?.member;
    if (!member || member.user?.bot) return;

    const voice = member.voice?.channel;
    const gid = member.guild.id;
    const bKey = baseKey(gid, member.id);

    // 음성에 없으면 모든 기록 초기화
    if (!voice) {
      for (const k of Array.from(firstSeenStable.keys())) {
        if (k.startsWith(bKey)) firstSeenStable.delete(k);
      }
      return;
    }

    const textChannelId = voiceChannelToTextChannel[voice.id];
    if (!textChannelId) return;
    const textChannel = member.guild.channels.cache.get(textChannelId);
    if (!textChannel) return;

    const oldRes = findAliasFamily(oldPresence);
    const newRes = findAliasFamily(newPresence);

    // 가족 전환/활동 종료 시 정리
    if ((!newRes && oldRes) || (oldRes && newRes && oldRes.family !== newRes.family)) {
      if (oldRes) firstSeenStable.delete(famKey(gid, member.id, oldRes.family));
    }

    if (!newRes) return;

    // 같은 유저의 다른 가족 대기시간 초기화
    clearOtherFamilies(bKey, newRes.family);

    const k = famKey(gid, member.id, newRes.family);
    const t = now();

    if (!firstSeenStable.has(k)) {
      firstSeenStable.set(k, t);
      return; // 첫 감지 → 안정화 대기 시작
    }

    // 안정화 대기
    if (t - firstSeenStable.get(k) < STABLE_MS) return;

    // 쿨다운
    const last = lastSent.get(k) || 0;
    if (t - last < COOLDOWN_MS) return;

    lastSent.set(k, t);

    const name = member.displayName || member.user.username;
    try {
      await textChannel.send(`-# [🎮 **${name}** 님이 '${newRes.alias}' 을(를) 시작했습니다.]`);
    } catch (_) {}
  },
};
