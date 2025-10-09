const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHANNEL_ID = '1425772175691878471';
const DATA_DIR = path.join(__dirname, '../data');
const STATE_PATH = path.join(DATA_DIR, 'admin-digest.json');

const WARN_HISTORY_PATH = path.join(DATA_DIR, 'warn-history.json');
const WARNINGS_PATH = path.join(DATA_DIR, 'warnings.json');
const SEHAM_PATH = path.join(DATA_DIR, 'seham.json');
const APPROVAL_SETTINGS_PATH = path.join(DATA_DIR, 'approval-settings.json');
const VOICE_NOTIFY_PATH = path.join(DATA_DIR, 'voice-notify.json');

const ACTIVITY_DATA_PATH = path.join(__dirname, '../activity-data.json');

const EXEMPT_ROLE_IDS = ['1371476512024559756','1208987442234007582','1207437971037356142','1397076919127900171'];
const NEWBIE_ROLE_ID = '1295701019430227988';
const BOOSTER_ROLE_ID = '1207437971037356142';
const DONOR_ROLE_ID = '1397076919127900171';
const SERVER_LOCK_ROLE_ID = '1403748042666151936';
const XP_LOCK_ROLE_ID = '1286237811959140363';

const DIGEST_INTERVAL_MS = 6 * 60 * 60 * 1000;

function readJsonSafe(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return fallback; }
}
function writeJsonSafe(p, obj) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj, null, 2));
  } catch {}
}

function getMostRecentDateKeyed(obj) {
  if (!obj) return null;
  let latest = null;
  Object.keys(obj).forEach(k => {
    const d = new Date(k);
    if (!Number.isNaN(d)) latest = latest && latest > d ? latest : d;
  });
  return latest;
}
function daysBetween(a, b) { return Math.floor((a.getTime() - b.getTime())/86400000); }

function coerceWarnTsList(entry) {
  if (!entry) return [];
  if (Array.isArray(entry)) return entry.filter(x => typeof x === 'number');
  if (typeof entry.ts === 'number') return [entry.ts];
  if (Array.isArray(entry.ts)) return entry.ts.filter(x => typeof x === 'number');
  if (Array.isArray(entry.events)) return entry.events.filter(x => typeof x === 'number');
  return [];
}

function recencyFactor(days) {
  if (!Number.isFinite(days)) return 0.0;
  if (days <= 3) return 1.0;
  if (days <= 7) return 0.85;
  if (days <= 14) return 0.7;
  if (days <= 30) return 0.45;
  if (days <= 45) return 0.3;
  return 0.2;
}
function relFromEvidence(msg, vhr, ev, days) {
  const a = Math.log1p(msg) / Math.log(1 + 300);
  const b = Math.log1p(vhr) / Math.log(1 + 50);
  const c = Math.log1p(ev) / Math.log(1 + 200);
  const d = recencyFactor(days);
  const mix = (0.25 * a) + (0.35 * b) + (0.2 * c) + (0.2 * d);
  return Math.max(0.15, Math.min(1, mix));
}
function capProb(p, cap, floor) { return Math.max(floor, Math.min(cap, Math.round(p))); }
function scoreToProb(raw, evidence, cap = 93, floor = 2) {
  const shrink = 0.4 + evidence * 0.4;
  const p = raw * shrink;
  return capProb(p, cap, floor);
}
function posCapByRecency(p, days) {
  if (days > 45) return Math.min(p, 25);
  if (days > 30) return Math.min(p, 35);
  if (days > 14) return Math.min(p, 45);
  return p;
}

function loadState() {
  return readJsonSafe(STATE_PATH, { lastMessageId: null, lastRun: 0 });
}
function saveState(s) {
  writeJsonSafe(STATE_PATH, s);
}

async function computeDigest(client, guild) {
  const now = new Date();
  const activityData = readJsonSafe(ACTIVITY_DATA_PATH, {});
  const warnHistory = readJsonSafe(WARN_HISTORY_PATH, {});
  const warningsDb = readJsonSafe(WARNINGS_PATH, {});
  const sehamDb = readJsonSafe(SEHAM_PATH, {});
  const approvalToggle = readJsonSafe(APPROVAL_SETTINGS_PATH, { enabled: true });
  const voiceNotify = readJsonSafe(VOICE_NOTIFY_PATH, {});

  const activityTracker = require('../utils/activity-tracker.js');
  const activityLogger = require('../utils/activity-logger.js');
  const relationship = require('../utils/relationship.js');

  const members = await guild.members.fetch();
  const users = [...members.values()].filter(m => !m.user.bot);

  const dayMs = 86400000;
  const tsNow = Date.now();

  const stats = require('../utils/activity-tracker.js').getStats({});

  const calc = (m) => {
    const userId = m.id;
    const stat = stats.find(x => x.userId === userId) || { message: 0, voice: 0 };
    const msgCount = stat.message || 0;
    const voiceSec = stat.voice || 0;
    const voiceHours = voiceSec / 3600;

    let lastActiveDate = null;
    try { lastActiveDate = activityTracker.getLastActiveDate(userId); } catch {}
    const lastActiveDays = lastActiveDate ? Math.floor((tsNow - lastActiveDate.getTime())/dayMs) : 9999;

    const joinedAt = m.joinedAt;
    const joinDays = joinedAt ? Math.floor((tsNow - joinedAt.getTime())/dayMs) : 0;

    const roleCount = m.roles.cache.filter(r => r.id !== guild.id).size;

    const acts = (activityLogger.getUserActivities(userId) || []).sort((a,b)=>b.time-a.time);
    const activitiesCount = acts.length;
    const gameNames = acts.filter(a => a.activityType === 'game' && a.details && a.details.name).map(a => a.details.name);
    const uniqueGames = new Set(gameNames).size;
    const musicCount = acts.filter(a => a.activityType === 'music').length;

    const hasServerLock = m.roles.cache.has(SERVER_LOCK_ROLE_ID);
    const hasXpLock = m.roles.cache.has(XP_LOCK_ROLE_ID);
    const timeoutActive = !!(m.communicationDisabledUntil && m.communicationDisabledUntilTimestamp > tsNow);

    const topFriends = relationship.getTopRelations(userId, 3);
    const relAll = relationship.loadData();
    const relData = relAll[userId] || {};
    const relEntries = Object.entries(relData);
    const friendsByStage = relEntries.filter(([_, v]) => (v.stage || 0) > 0).sort((a,b)=>(b[1].stage||0)-(a[1].stage||0));
    const totalStage = friendsByStage.reduce((s,[,v])=>s+(v.stage||0),0);
    const top2Stage = friendsByStage.slice(0,2).reduce((s,[,v])=>s+(v.stage||0),0);
    const top3Stage = friendsByStage.slice(0,3).reduce((s,[,v])=>s+(v.stage||0),0);
    const dominance2 = totalStage>0 ? top2Stage/totalStage : 0;
    const dominance3 = totalStage>0 ? top3Stage/totalStage : 0;
    const strongTies = friendsByStage.filter(([_,v]) => (v.stage||0) >= 8);
    const strongCount = strongTies.length;

    const listFromWarnings = Array.isArray(warningsDb[userId]) ? warningsDb[userId].map(e => {
      const t = Date.parse(e?.date); return Number.isFinite(t)?t:null;
    }).filter(Boolean) : [];
    const listFromHistory = coerceWarnTsList(warnHistory[String(userId)]);
    const warnTsList = [...listFromWarnings, ...listFromHistory].sort((a,b)=>b-a);
    const countInDays = (d) => warnTsList.filter(ts => tsNow - ts <= d*dayMs).length;
    const warn7 = countInDays(7);
    const warn30 = countInDays(30);
    const warn90 = countInDays(90);
    const lastWarnTs = warnTsList[0] || null;
    const lastWarnDays = lastWarnTs ? Math.floor((tsNow - lastWarnTs)/dayMs) : 9999;

    const sehamRec = (() => {
      const rec = sehamDb[userId] || { count: 0, logs: [] };
      if (!Array.isArray(rec.logs)) rec.logs = [];
      rec.count = rec.logs.length;
      return rec;
    })();
    const sehamCount = sehamRec.logs.length;
    const lastSehamTs = sehamCount ? sehamRec.logs[sehamCount - 1].ts : null;
    const lastSehamDays = lastSehamTs ? Math.floor((tsNow - lastSehamTs)/dayMs) : 9999;

    const evidence = relFromEvidence(msgCount, voiceHours, activitiesCount, lastActiveDays);

    const socialPlus = Math.min(32, (topFriends.length||0)*10);
    const msgPlus = Math.min(30, (msgCount/600)*30);
    const vcPlus = Math.min(30, (voiceHours/50)*30);

    const offsiteBase =
      (activitiesCount >= 50 ? 45 : activitiesCount >= 25 ? 30 : 10) +
      (voiceHours < 0.1 ? 40 : voiceHours < 0.5 ? 25 : 0) +
      (msgCount >= 150 ? 10 : 0) +
      (uniqueGames >= 3 ? 5 : 0) -
      (voiceHours >= 1 ? 15 : 0);
    const offsiteRaw = Math.max(0, Math.min(95, offsiteBase));

    const voiceBias = voiceHours > 0 ? voiceHours/(voiceHours + (msgCount/30) + 1e-9) : 0;
    let vcCliqueRaw = 0;
    if (voiceHours >= 3 && strongCount > 0 && strongCount <= 3) {
      vcCliqueRaw = Math.max(0, Math.min(95,
        (voiceHours >= 10 ? 40 : voiceHours >= 5 ? 28 : 18) +
        (strongCount <= 2 ? 30 : 18) +
        Math.round(voiceBias * 25)
      ));
    }
    let samePeersRaw = 0;
    if ((msgCount + voiceHours*60) >= 80 && totalStage > 0) {
      const domScore = Math.max(dominance2, dominance3);
      samePeersRaw = Math.max(0, Math.min(95,
        (domScore - 0.6) * 140 +
        (strongCount <= 3 ? 10 : 0) +
        (voiceHours >= 5 ? 8 : 0)
      ));
    }

    const rulePenaltyBase = (m.roles.cache.has(SERVER_LOCK_ROLE_ID) ? 30 : 0) + (m.roles.cache.has(XP_LOCK_ROLE_ID) ? 20 : 0) + (timeoutActive ? 45 : 0);
    const rulePenaltyWarn = Math.min(35, warn30 * 15) + (lastWarnDays <= 3 ? 10 : lastWarnDays <= 7 ? 6 : 0);
    const rulePenalty = rulePenaltyBase + rulePenaltyWarn;

    const warnTrailRaw = Math.min(95,
      warn7 * 35 + warn30 * 20 + warn90 * 10 +
      (lastWarnDays <= 3 ? 20 : lastWarnDays <= 7 ? 12 : lastWarnDays <= 14 ? 8 : 0)
    );
    const sehamRecentBoost =
      Math.min(40, sehamCount * 8) +
      (lastSehamDays <= 3 ? 15 : lastSehamDays <= 7 ? 10 : lastSehamDays <= 30 ? 6 : 0);
    const sehamRiskRaw = Math.min(95, 20 + sehamRecentBoost + (sehamCount >= 5 ? 10 : 0));

    let friendlyRaw = Math.max(0,
      10 + msgPlus + vcPlus + socialPlus - rulePenalty
      - Math.min(25, offsiteRaw * 0.4)
      - Math.min(20, samePeersRaw * 0.2)
      - Math.min(15, vcCliqueRaw * 0.15)
      - Math.min(20, warnTrailRaw * 0.25)
      - Math.min(22, sehamRecentBoost * 0.6)
    );
    const toxicSignals =
      (m.roles.cache.has(SERVER_LOCK_ROLE_ID) ? 25 : 0) +
      (m.roles.cache.has(XP_LOCK_ROLE_ID) ? 12 : 0) +
      (timeoutActive ? 35 : 0) +
      Math.min(30, warn90 * 10) +
      (lastWarnDays <= 14 ? 10 : 0) +
      Math.min(28, sehamRecentBoost * 0.8);
    const toxicRaw = Math.min(95, 20 + toxicSignals - socialPlus/2);

    const churnRaw = Math.max(0,
      (lastActiveDays > 30 ? 65 : lastActiveDays > 14 ? 40 : 0) +
      (msgCount < 10 ? 20 : msgCount < 40 ? 10 : 0) +
      (voiceHours < 1 ? 15 : 0)
    );
    const ruleOkRaw = Math.max(0, 85 - rulePenalty - Math.min(20, sehamRecentBoost * 0.5));
    const riskMgmtRaw = Math.min(95, rulePenalty + (toxicSignals/2) + Math.min(25, sehamRecentBoost * 0.9));
    const influenceRaw = Math.min(40, roleCount * 4) + Math.min(40, (msgCount / 800) * 40) + Math.min(20, (topFriends.length || 0) * 6);
    const steadyRaw = (joinDays > 60 ? 25 : 0) + (lastActiveDays <= 7 ? 35 : 0) + (msgCount >= 60 ? 25 : 0) + (voiceHours >= 5 ? 15 : 0);

    const evidence2 = evidence;
    const P = {};
    P.offsite = scoreToProb(offsiteRaw, evidence2, 88, 3);
    P.vc_clique = scoreToProb(vcCliqueRaw, evidence2, 86, 2);
    P.same_peers = scoreToProb(samePeersRaw, evidence2, 86, 2);
    P.warn_trail = scoreToProb(warnTrailRaw, evidence2, 92, 2);
    P.seham_risk = scoreToProb(sehamRiskRaw, evidence2, 92, 2);
    P.friendly = posCapByRecency(scoreToProb(friendlyRaw, evidence2, 90, 2), lastActiveDays);
    P.toxic = scoreToProb(toxicRaw, evidence2, 90, 2);
    P.churn = scoreToProb(churnRaw, evidence2, 90, 2);
    P.rule_ok = posCapByRecency(scoreToProb(ruleOkRaw, evidence2, 88, 3), lastActiveDays);
    P.risk_mgmt = scoreToProb(riskMgmtRaw, evidence2, 92, 2);
    P.influence = posCapByRecency(scoreToProb(influenceRaw, evidence2, 86, 2), lastActiveDays);
    P.steady = posCapByRecency(scoreToProb(steadyRaw, evidence2, 86, 3), lastActiveDays);

    let lastActiveStr = '-';
    if (lastActiveDate) lastActiveStr = `<t:${Math.floor(lastActiveDate.getTime()/1000)}:R>`;

    return {
      id: userId,
      tag: m.user.tag,
      joinedAt,
      lastActiveDays,
      lastActiveStr,
      newbie: m.roles.cache.has(NEWBIE_ROLE_ID),
      booster: m.roles.cache.has(BOOSTER_ROLE_ID),
      donor: m.roles.cache.has(DONOR_ROLE_ID),
      exempt: EXEMPT_ROLE_IDS.some(r=>m.roles.cache.has(r)),
      P,
      msgCount,
      voiceSec,
      musicCount
    };
  };

  const prof = await Promise.all(users.map(calc));

  const active7 = prof.filter(p => p.lastActiveDays <= 7).length;
  const active30 = prof.filter(p => p.lastActiveDays <= 30).length;
  const total = prof.length;
  const new7 = prof.filter(p => p.joinedAt && daysBetween(now, p.joinedAt) <= 7).length;

  const longInactiveTargets = prof.filter(p => !p.exempt && !p.booster && !p.donor && p.lastActiveDays >= 90);
  const longInactiveBooster = prof.filter(p => p.booster && p.lastActiveDays >= 60);
  const longInactiveDonor = prof.filter(p => p.donor && p.lastActiveDays >= 90);
  const newbieInactive = prof.filter(p => p.newbie && p.joinedAt && daysBetween(now, p.joinedAt) >= 7 && p.lastActiveDays >= 7);

  const warnsAllTs = [];
  Object.values(warnHistory).forEach(v => warnsAllTs.push(...coerceWarnTsList(v)));
  Object.values(warningsDb).forEach(arr => {
    if (Array.isArray(arr)) arr.forEach(e => {
      const t = Date.parse(e?.date); if (Number.isFinite(t)) warnsAllTs.push(t);
    });
  });
  const countInDaysAll = (d) => warnsAllTs.filter(ts => tsNow - ts <= d*dayMs).length;
  const warn7All = countInDaysAll(7);
  const warn30All = countInDaysAll(30);
  const warn90All = countInDaysAll(90);

  const sehamAll = Object.values(sehamDb).map(x => Array.isArray(x?.logs) ? x.logs : []).flat();
  const sehamCount7 = sehamAll.filter(l => tsNow - (l?.ts||0) <= 7*dayMs).length;
  const sehamCount30 = sehamAll.filter(l => tsNow - (l?.ts||0) <= 30*dayMs).length;

  const rank = (key, top=5, desc=true) => {
    const arr = prof
      .map(p => ({ id: p.id, tag: p.tag, v: p.P[key]||0 }))
      .sort((a,b)=> desc ? (b.v - a.v) : (a.v - b.v))
      .slice(0, top);
    return arr;
  };

  const topToxic = rank('toxic', 5, true);
  const topOffsite = rank('offsite', 5, true);
  const topChurn = rank('churn', 5, true);
  const topFriendly = rank('friendly', 5, true);
  const topInfluence = rank('influence', 5, true);
  const topSteady = rank('steady', 5, true);

  const mem = process.memoryUsage();
  const rssMB = (mem.rss/1024/1024).toFixed(1);
  const heapMB = (mem.heapUsed/1024/1024).toFixed(1);
  const load1 = os.loadavg()[0]?.toFixed(2) || '0.00';
  const cpuCount = os.cpus().length;

  const approvalOn = !!approvalToggle.enabled;
  const voiceNotifyOn = !!voiceNotify[guild.id];

  const embed1 = new EmbedBuilder()
    .setTitle('📊 관리 대시보드')
    .setDescription(`갱신: <t:${Math.floor(now.getTime()/1000)}:R>`)
    .setColor(0x5865F2)
    .addFields(
      { name: '서버 현황', value: [
        `총원: ${total}명`,
        `활성 7일: ${active7}명`,
        `활성 30일: ${active30}명`,
        `7일 신규: ${new7}명`
      ].join('\n'), inline: true },
      { name: '시스템', value: [
        `입장절차: ${approvalOn ? 'ON' : 'OFF'}`,
        `음성 알림: ${voiceNotifyOn ? 'ON' : 'OFF'}`,
        `메모리 RSS: ${rssMB}MB`,
        `HeapUsed: ${heapMB}MB`,
        `Load1m: ${load1} / ${cpuCount}코어`
      ].join('\n'), inline: true },
      { name: '경고/쎄함 최근', value: [
        `경고 7/30/90일: ${warn7All}/${warn30All}/${warn90All}`,
        `쎄함 7/30일: ${sehamCount7}/${sehamCount30}`
      ].join('\n'), inline: true }
    );

  const embed2 = new EmbedBuilder()
    .setTitle('🧹 관리 큐')
    .setColor(0xFFAB00)
    .addFields(
      { name: '장기 미접속(>=90일)', value: `${longInactiveTargets.length}명`, inline: true },
      { name: '부스터 60일↑', value: `${longInactiveBooster.length}명`, inline: true },
      { name: '도너 90일↑', value: `${longInactiveDonor.length}명`, inline: true },
      { name: '신규 비활동(가입 7일↑, 활동 7일↑)', value: `${newbieInactive.length}명`, inline: true }
    );

  const fmtTop = (list) => list.length ? list.map((x,i)=>`${String(i+1).padStart(2,'0')}. <@${x.id}> — **${x.v}%**`).join('\n') : '데이터 부족';
  const embed3 = new EmbedBuilder()
    .setTitle('⚠️ 위험/관리 지표 TOP5')
    .setColor(0xE67E22)
    .addFields(
      { name: '분쟁/배척 성향', value: fmtTop(topToxic), inline: false },
      { name: '‘뒷서버’ 의심 정황', value: fmtTop(topOffsite), inline: false },
      { name: '이탈 위험', value: fmtTop(topChurn), inline: false }
    );

  const embed4 = new EmbedBuilder()
    .setTitle('💙 우호/영향 TOP5')
    .setColor(0x43B581)
    .addFields(
      { name: '서버에 우호적', value: fmtTop(topFriendly), inline: false },
      { name: '영향력 있는 핵심 인물', value: fmtTop(topInfluence), inline: false },
      { name: '꾸준한 스테디셀러', value: fmtTop(topSteady), inline: false }
    );

  return [embed1, embed2, embed3, embed4];
}

async function runOnce(client) {
  const guild = client.guilds.cache.first();
  if (!guild) return;
  const channel = guild.channels.cache.get(CHANNEL_ID) || await client.channels.fetch(CHANNEL_ID).catch(()=>null);
  if (!channel) return;

  const embeds = await computeDigest(client, guild);

  const state = loadState();
  if (state.lastMessageId) {
    const msg = await channel.messages.fetch(state.lastMessageId).catch(()=>null);
    if (msg) {
      const edited = await msg.edit({ embeds }).catch(()=>null);
      if (edited) {
        state.lastRun = Date.now();
        saveState(state);
        return;
      }
    }
  }
  const sent = await channel.send({ embeds }).catch(()=>null);
  if (sent) {
    state.lastMessageId = sent.id;
    state.lastRun = Date.now();
    saveState(state);
  }
}

function start(client) {
  setTimeout(() => { runOnce(client); }, 5000);
  setInterval(() => { runOnce(client); }, DIGEST_INTERVAL_MS);
}

module.exports = { start, runOnce };
