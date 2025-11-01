// utils/presenceUpdate.js
const { ActivityType } = require('discord.js');

const ADMIN_LOG_CHANNEL_ID = '1433747936944062535';

// 필요시: 음성채널→텍스트채널 매핑 (관리자 로그에는 표시하되, 음성채널 채팅 메시지에는 표시하지 않음)
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
  "1209157622662561813": "1209157622662561813"
};

// 영문/기타 → 한글 별칭 매핑
const GAME_NAME_MAP = new Map([
  ['league of legends', '롤'],
  ['overwatch 2', '오버워치'],
  ['party animals', '파티 애니멀즈'],
  ['marvel rivals', '마블 라이벌즈'],
  ['panicore', '페니코어'],
  ['tabletop simulator', '테탑시'],
  ['minecraft', '마인크래프트'],
  ['curseforge', '마인크래프트'],
  ['roblox', '로블록스'],
  ['valorant', '발로란트'],
  ['apex legends', '에이펙스 레전드'],
  ["r.e.p.o.", "레포"],
  ["playerunknown's battlegrounds", "배그"],
  ['pubg', '배그'],
  ['battlegrounds', '배그'],
  ['terraria', '테라리아'],
  ['raft', '래프트'],
  ['project zomboid', '좀보이드'],
  ['goose goose duck', '구구덕'],
  ['core keeper', '코어키퍼'],
  ['서든어택', '서든어택'],
  ['sudden attack', '서든어택'],
  ['eternal return', '이터널 리턴'],
  ['이터널 리턴', '이터널 리턴'],
  ['valheim', '발헤임'],
  ['enshrouded', '인슈라오디드'],
  ['arc raiders', '아크 레이더스'],
  ['Escape from Duckov', '이스케이프 프롬 덕코프'],
  ['djmax respect v', '디맥'],
  ['phasmophobia', '파스모포비아'],
  ['lethal company', '리썰컴퍼니'],
  ['mimesis', '미메시스'],
  ['once human', '원스휴먼'],
  ['maplestory', '메이플스토리'],
  ['던전앤파이터', '던파'],
  ['Delta Force Game', '델타포스'],
  ['Melvor Idle', '멜버 아이들'],
  ['Cyphers', '사이퍼즈'],
  ['Rainbow Six Siege', '레식'],
  ['Rainbow Six Siege X', '레식'],
  ['Need for Speed™ Heat', '니드포스피드'],
  ['Grand Theft Auto V Enhanced', 'GTA5'],
  ['Viscera Cleanup Detail', '비세라 클린업'],
  ['Dead by Daylight', '데바데'],
]);

// 클라이언트 전환이 잦은 게임 군(예: 롤)
const GAME_FAMILIES = [
  {
    id: 'lol',
    alias: '롤',
    keys: ['league of legends','lol','riot client','leagueclient','league client','leagueclientux','league of legends (tm) client']
  }
];

// 감지 지연 (안정화 대기)
const STABLE_MS = 5_000;
// 동일 활동 재시작 쿨다운
const COOLDOWN_MS = 30 * 60_000;
// 디버그
const DEBUG = false;

const lastSent = new Map();   // key -> ts
const startedAt = new Map();  // key -> ts
const pendingTimers = new Map(); // key -> timeoutId

const now = () => Date.now();
const n = (s) => (s || '').toString().normalize('NFKD').toLowerCase()
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/[^0-9a-z\u3131-\u318e\uac00-\ud7a3\s]/gi,'')
  .replace(/\s+/g,' ')
  .trim();

function dice(a, b) {
  const A = n(a), B = n(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const bi = s => { const o=[]; for (let i=0;i<s.length-1;i++) o.push(s.slice(i,i+2)); return o; };
  const a2 = bi(A), b2 = new Map();
  for (const bg of bi(B)) b2.set(bg,(b2.get(bg)||0)+1);
  let hit=0;
  for (const bg of a2){ const c=b2.get(bg); if(c>0){hit++; b2.set(bg,c-1);} }
  return (2*hit)/(a2.length+Math.max(0,B.length-1));
}

function matchFamilyOrAlias(name) {
  const x = n(name);
  if (!x) return null;
  for (const fam of GAME_FAMILIES) {
    for (const key of fam.keys) {
      const k = n(key);
      if (x.includes(k) || k.includes(x) || dice(x,k) >= 0.85) {
        return { family: fam.id, alias: fam.alias, raw: name };
      }
    }
  }
  let best=null, bestScore=0, bestAlias=null;
  for (const [raw, alias] of GAME_NAME_MAP) {
    const k = n(raw);
    if (!k) continue;
    if (x.includes(k) || k.includes(x)) return { family: alias, alias, raw: name };
    const sc = dice(x,k);
    if (sc > bestScore) { bestScore = sc; bestAlias = alias; best = { family: alias, alias, raw: name }; }
  }
  return bestScore >= 0.72 ? best : null;
}

function famKey(gid, uid, fam, raw='') {
  return `${gid}:${uid}:${fam}:${n(raw)}`;
}
function baseKey(gid, uid) { return `${gid}:${uid}:`; }

function cancelPendingByBaseExcept(base, keepFam) {
  for (const k of Array.from(pendingTimers.keys())) {
    if (k.startsWith(base) && !k.includes(`:${keepFam}:`)) {
      clearTimeout(pendingTimers.get(k));
      pendingTimers.delete(k);
    }
  }
}

function cancelPending(key) {
  const t = pendingTimers.get(key);
  if (t) {
    clearTimeout(t);
    pendingTimers.delete(key);
  }
}

function fmtDur(ms) {
  const s = Math.max(0, Math.floor(ms/1000));
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  const sec = s%60;
  const parts = [];
  if (h) parts.push(`${h}시간`);
  if (m) parts.push(`${m}분`);
  if (!h && !m) parts.push(`${sec}초`);
  return parts.join(' ');
}

function fmtHM(ts = Date.now()) {
  const d = new Date(ts);
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(d);
  const hh = parts.find(p => p.type === 'hour')?.value?.padStart(2, '0') ?? '00';
  const mm = parts.find(p => p.type === 'minute')?.value?.padStart(2, '0') ?? '00';
  return `${hh}:${mm}`;
}

async function sendAdminLog(guild, content) {
  try {
    const ch = guild.channels.cache.get(ADMIN_LOG_CHANNEL_ID);
    if (!ch) return;
    await ch.send(content);
  } catch (e) { if (DEBUG) console.warn('[presenceUpdate][adminLog]', e); }
}

function getPlayingActivity(presence) {
  const acts = presence?.activities || [];
  return acts.find(a => a?.type === ActivityType.Playing && a.name) || null;
}

module.exports = {
  name: 'presenceUpdate',
  async execute(oldPresence, newPresence) {
    try {
      const member = newPresence?.member || oldPresence?.member;
      if (!member || member.user?.bot) return;

      const gid = member.guild.id;
      const uid = member.id;
      const base = baseKey(gid, uid);

const curPlaying = getPlayingActivity(newPresence);
const aliasRes = curPlaying ? matchFamilyOrAlias(curPlaying.name) : null;

const alias = aliasRes?.alias || (curPlaying?.name ?? null);
const family = aliasRes?.family || n(curPlaying?.name || '');

      // 종료 감지 (활동이 사라졌거나 family가 바뀐 경우)
      const oldPlaying = getPlayingActivity(oldPresence);
      const oldAliasRes = oldPlaying ? matchFamilyOrAlias(oldPlaying.name) : null;
      const oldAlias = oldAliasRes?.alias || (oldPlaying?.name ?? null);
      const oldFamily = oldAliasRes?.family || n(oldPlaying?.name || '');

      if ((!alias && oldAlias) || (alias && oldAlias && family !== oldFamily)) {
        const endKey = famKey(gid, uid, oldFamily, oldAlias);
        cancelPending(endKey);

        const startedTs = startedAt.get(endKey);
        const timeStr = fmtHM();
        if (startedTs) {
          await sendAdminLog(
            member.guild,
            `-# [🛑 활동 종료] ${member.displayName || member.user.username} — '${oldAlias}' 종료 | 총 플레이: ${fmtDur(now()-startedTs)} [${timeStr}]`
          );
        } else {
          await sendAdminLog(
            member.guild,
            `-# [🛑 활동 종료] ${member.displayName || member.user.username} — '${oldAlias}' 종료 [${timeStr}]`
          );
        }
        startedAt.delete(endKey);
      }

      // 현재 활동 없음 → 종료 처리만 하고 종료
      if (!alias) return;

      // 다른 패밀리의 보류 타이머는 정리
      cancelPendingByBaseExcept(base, family);

      const key = famKey(gid, uid, family, alias);
      const t = now();

      // 쿨다운 체크
      const last = lastSent.get(key) || 0;
      if (t - last < COOLDOWN_MS) return;

      // 이미 시작 처리된 상태면 무시
      if (startedAt.has(key)) return;

      // 이미 보류 타이머가 있으면 갱신/중복 방지
      if (pendingTimers.has(key)) return;

      // 안정화 타이머: STABLE_MS 뒤에도 같은 활동이면 "활동 시작" 발사
      const timeoutId = setTimeout(async () => {
        try {
          // 현재 활동 재확인
          const curPlaying = getPlayingActivity(member.presence);
          const curAliasRes = curPlaying ? matchFamilyOrAlias(curPlaying.name) : null;
          const curAlias = curAliasRes?.alias || (curPlaying?.name ?? null);
          const curFamily = curAliasRes?.family || n(curPlaying?.name || '');

          // 활동이 바뀌었거나 사라졌으면 취소
          if (!curAlias || curFamily !== family || curAlias !== alias) {
            pendingTimers.delete(key);
            return;
          }

          // 쿨다운 최종 확인
          const nowTs = now();
          const last2 = lastSent.get(key) || 0;
          if (nowTs - last2 < COOLDOWN_MS) {
            pendingTimers.delete(key);
            return;
          }

          lastSent.set(key, nowTs);
          startedAt.set(key, nowTs);

          const voice = member.voice?.channel || null;
          const name = member.displayName || member.user.username;

          // 음성채널 텍스트 방 안내 (시간/채널명 X)
          if (voice?.id) {
            const textId = voiceChannelToTextChannel[voice.id];
            if (textId) {
              const textChannel = member.guild.channels.cache.get(textId);
              if (textChannel) {
                await textChannel.send(`-# [🎮 ${name} 님이 '${alias}' 을(를) 시작했습니다.]`);
              }
            }
          }

          // 관리자 로그 (시간 포함, 음성채널명 가능 시 표시)
          const voiceStr = member.voice?.channel?.name ? ` | 음성: ${member.voice.channel.name}` : '';
          const timeStr = fmtHM();
          await sendAdminLog(member.guild, `-# [🎮 활동 시작] ${name} — '${alias}' 시작${voiceStr} [${timeStr}]`);
        } catch (e) {
          if (DEBUG) console.error('[presenceUpdate][timer]', e);
        } finally {
          pendingTimers.delete(key);
        }
      }, STABLE_MS);

      pendingTimers.set(key, timeoutId);
    } catch (e) {
      if (DEBUG) console.error('[presenceUpdate][fatal]', e);
    }
  }
};
