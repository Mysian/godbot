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
  ["wuthering waves", "명조"],
  ["ETERNAL RETURN", "이터널 리턴"],
  ["이터널 리턴", "이터널 리턴"],
]);

// ===== 유사도 매칭 유틸 =====
function normalize(s) {
  return (s || "")
    .toString()
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "") // 발음기호 제거
    .replace(/[^0-9a-z\u3131-\u318E\uAC00-\uD7A3\s]/gi, "") // 한글/영문/숫자/공백만
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
function matchGame(activityName) {
  const n = normalize(activityName);
  if (!n) return null;
  let best = null;
  let bestScore = 0;
  for (const [raw, alias] of GAME_NAME_MAP) {
    const key = normalize(raw);
    if (!key) continue;
    if (n.includes(key) || key.includes(n)) return alias; // 부분일치 우선
    const score = diceCoefficient(n, key);
    if (score > bestScore) {
      bestScore = score;
      best = alias;
    }
  }
  // 너무 느슨하지 않게 임계치 설정 (0.72)
  return bestScore >= 0.72 ? best : null;
}
function findRecognizedAlias(presence) {
  const acts = presence?.activities || [];
  for (const a of acts) {
    if (a?.type === ActivityType.Playing && a.name) {
      const alias = matchGame(a.name);
      if (alias) return alias;
    }
  }
  return null;
}

// 동일 활동 1회 알림 제어용 (봇 구동 중 메모리)
const notified = new Set();

module.exports = {
  name: Events.PresenceUpdate,
  async execute(oldPresence, newPresence) {
    const member = newPresence?.member || oldPresence?.member;
    if (!member || member.user?.bot) return;

    // 현재 음성채널에 있어야만 알림
    const voice = member.voice?.channel;
    if (!voice) {
      // 음성에 없으면 이 유저의 기록을 지워 재시작 시 다시 알림 가능
      const gid = member.guild.id;
      for (const key of Array.from(notified)) {
        if (key.startsWith(`${gid}:${member.id}:`)) notified.delete(key);
      }
      return;
    }

    // 같은 ID를 가진 텍스트채널로 안내 전송
    const textChannelId = voiceChannelToTextChannel[voice.id];
    if (!textChannelId) return;
    const textChannel = member.guild.channels.cache.get(textChannelId);
    if (!textChannel) return;

    const oldAlias = findRecognizedAlias(oldPresence);
    const newAlias = findRecognizedAlias(newPresence);

    const gid = member.guild.id;
    const baseKey = `${gid}:${member.id}:`;

    // 활동 전환 시 이전 기록 해제
    if (oldAlias && oldAlias !== newAlias) notified.delete(baseKey + oldAlias);

    // 활동 종료 시 기록 해제
    if (!newAlias && oldAlias) {
      notified.delete(baseKey + oldAlias);
      return;
    }

    if (!newAlias) return;

    const key = baseKey + newAlias;
    if (notified.has(key)) return; // 같은 활동은 1회만

    notified.add(key);
    const name = member.displayName || member.user.username;
    try {
      await textChannel.send(`-# [🎮 **${name}** 님이 '${newAlias}' 을(를) 시작했습니다.]`);
    } catch (e) {
      // 무시
    }
  },
};
