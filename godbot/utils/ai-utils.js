// utils/ai-utils.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');

// ======== 기본 설정 ========
const PREFIX = '갓봇!'; // 자연어 AI 트리거
const DEFAULT_DAYS = 7;

const DEFAULT_OPTIONS = {
  rootDir: path.resolve(process.cwd()),
  adminRoleIds: [], // 위험 명령(킥/뮤트/이동 등) 허용 역할 ID 목록
  logChannelId: null, // 작업 로그 남길 채널
  guildId: process.env.GUILD_ID || null,
  voiceAliases: {
    // 필요시 덮어쓰기: { '101호': '1222085152600096778', ... }
    // 예시(있으면 사용, 없으면 이름으로 검색):
    '101호': '1222085152600096778',
    '102호': '1222085194706587730',
    '201호': '1230536383941050368',
    '202호': '1230536435526926356',
    '301호': '1207990601002389564',
    '302호': '1209157046432170015',
    '401호': '1209157237977911336',
    '402호': '1209157289555140658',
    '501호': '1209157326469210172',
    '502호': '1209157352771682304',
    '601호': '1209157451895672883',
    '602호': '1209157492207255572',
  },
};

// ======== 선택적 모듈 로딩(있으면 사용) ========
function tryLoadActivityModule() {
  const candidates = [
    '../utils/activity-tracker',
    '../utils/activity',
    '../commands/activity-tracker',
    '../commands/activity',
  ];
  for (const rel of candidates) {
    try {
      const m = require(rel);
      if (m && typeof m === 'object') return m;
    } catch (_) {}
  }
  return null;
}
const activity = tryLoadActivityModule();

// ======== 간단 코드 인덱서(봇이 스스로 코드 검색) ========
let codeIndexCache = null;
let codeIndexHash = null;
let codeIndexOptionsKey = null;

function listFilesRecursive(dir, exts = ['.js', '.ts', '.json']) {
  const out = [];
  const stack = [dir];
  const ignore = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out']);
  while (stack.length) {
    const d = stack.pop();
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (ignore.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (exts.includes(path.extname(e.name))) out.push(p);
    }
  }
  return out;
}

function tokenize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function buildCodeIndex(rootDir) {
  const files = listFilesRecursive(rootDir);
  const index = [];
  for (const file of files) {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const tokens = tokenize(text + ' ' + file);
    // 간단한 export 함수 이름 추출
    const funcs = [];
    const funcRegexes = [
      /export\s+function\s+([a-zA-Z0-9_]+)/g,
      /module\.exports\s*=\s*{([^}]+)}/g,
      /exports\.([a-zA-Z0-9_]+)\s*=\s*/g,
      /const\s+([a-zA-Z0-9_]+)\s*=\s*async?\s*function/g,
      /async?\s*function\s+([a-zA-Z0-9_]+)/g,
    ];
    for (const re of funcRegexes) {
      let m;
      while ((m = re.exec(text))) {
        const raw = m[1] || m[0];
        const ks = String(raw)
          .split(',')
          .map(s => s.trim().split(':')[0].trim())
          .filter(Boolean);
        for (const k of ks) funcs.push(k);
      }
    }
    index.push({
      file,
      size: text.length,
      tokens,
      exports: Array.from(new Set(funcs)),
    });
  }
  return index;
}

function ensureCodeIndex(options) {
  const key = JSON.stringify({
    rootDir: options.rootDir,
  });
  if (!codeIndexCache || codeIndexOptionsKey !== key) {
    codeIndexCache = buildCodeIndex(options.rootDir);
    codeIndexOptionsKey = key;
    const hash = crypto.createHash('md5');
    for (const it of codeIndexCache) {
      hash.update(it.file);
      hash.update(String(it.size));
    }
    codeIndexHash = hash.digest('hex');
  }
  return codeIndexCache;
}

function searchCodeIndex(query, options, limit = 5) {
  const idx = ensureCodeIndex(options);
  const qTokens = tokenize(query);
  const scores = [];
  for (const it of idx) {
    let score = 0;
    for (const qt of qTokens) {
      // 파일경로/토큰/익스포트 이름에서 가중치
      const inFile = it.file.toLowerCase().includes(qt) ? 3 : 0;
      const inTokens = it.tokens.includes(qt) ? 1 : 0;
      const inExports = it.exports.some(n => n.toLowerCase().includes(qt)) ? 5 : 0;
      score += inFile + inTokens + inExports;
    }
    if (score > 0) scores.push({ item: it, score });
  }
  scores.sort((a, b) => b.score - a.score || a.item.file.localeCompare(b.item.file));
  return scores.slice(0, limit).map(s => s.item);
}

// ======== 유틸: 길드/멤버/채널 검색 ========
function normalize(s) {
  return String(s || '')
    .replace(/[<@#!>]/g, '')
    .trim();
}

async function findMemberByText(guild, text) {
  const t = normalize(text).toLowerCase();
  if (!t) return null;
  // ID 직접
  if (/^\d{16,23}$/.test(t)) {
    try { return await guild.members.fetch(t); } catch { /* pass */ }
  }
  // 전체 페치 후 퍼지
  let members;
  try { members = await guild.members.fetch(); } catch { return null; }
  const exact = members.find(m =>
    (m.user.tag && m.user.tag.toLowerCase() === t) ||
    (m.displayName && m.displayName.toLowerCase() === t) ||
    (m.user.username && m.user.username.toLowerCase() === t)
  );
  if (exact) return exact;
  // 포함 일치
  const partial = members.find(m =>
    (m.displayName && m.displayName.toLowerCase().includes(t)) ||
    (m.user.username && m.user.username.toLowerCase().includes(t)) ||
    (m.user.tag && m.user.tag.toLowerCase().includes(t))
  );
  return partial || null;
}

function mapAliasToChannelId(nameOrId, guild, options) {
  const t = normalize(nameOrId);
  if (!t) return null;
  if (/^\d{16,23}$/.test(t)) return t;
  const aliasId = (options.voiceAliases && options.voiceAliases[t]) || null;
  if (aliasId) return aliasId;
  // 이름으로 찾기
  const ch = guild.channels.cache.find(c =>
    (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) &&
    (c.name === t || c.name.includes(t))
  );
  return ch ? ch.id : null;
}

// ======== 권한 체크 & 로깅 ========
function hasAdminPower(member, options) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const adminRoles = new Set(options.adminRoleIds || []);
  return member.roles.cache.some(r => adminRoles.has(r.id));
}

async function logAction(client, options, embed) {
  if (!options.logChannelId) return;
  try {
    const ch = await client.channels.fetch(options.logChannelId);
    if (ch && ch.isTextBased()) await ch.send({ embeds: [embed] });
  } catch { /* ignore */ }
}

// ======== 자연어 → 의도 해석 ========
function parseQuery(q) {
  const text = q.trim();
  // 7일간 음성채팅 이력
  const mHist = text.match(/(.+?)\s*유저의?\s*(\d+|일주일|7일|칠일|7일간|7일동안)?\s*(?:음성|보이스)\s*(?:채팅)?\s*(?:이력|기록)/);
  if (mHist) {
    const userText = mHist[1].trim();
    let days = DEFAULT_DAYS;
    if (mHist[2]) {
      const d = mHist[2];
      if (/^\d+$/.test(d)) days = parseInt(d, 10);
      else days = 7;
    }
    return { type: 'voice_history', userText, days };
  }

  // 지금 가장 인기 많은 채널
  if (/(지금|현재).*(가장|제일).*(인기|활발|활동).*(채널)/.test(text)) {
    return { type: 'top_channel_now' };
  }

  // 유저 마이크 꺼줘
  const mMute = text.match(/(.+?)\s*유저\s*(?:의)?\s*(?:마이크|마익|음성)\s*(?:을|를)?\s*(?:꺼|음소거|뮤트)\s*줘?/);
  if (mMute) {
    const userText = mMute[1].trim();
    return { type: 'mute_user', userText };
  }

  // 유저 추방
  const mKick = text.match(/(.+?)\s*유저\s*(?:를)?\s*(?:추방|킥|kick)\s*시켜?줘?/i);
  if (mKick) {
    const userText = mKick[1].trim();
    return { type: 'kick_user', userText };
  }

  // 나를 502호로 이동
  const mMove = text.match(/(나|본인|자기|내)\s*(?:를)?\s*(.+?)\s*(?:호|방|채널)?\s*(?:로)?\s*(?:이동|옮겨)\s*줘?/);
  if (mMove) {
    const channelText = mMove[2].trim();
    return { type: 'move_me', channelText };
  }

  // 범용: "X 로/으로 이동시켜줘"
  const mMoveAny = text.match(/(.+?)\s*(?:로|으로)\s*(?:이동|옮겨)\s*줘?/);
  if (mMoveAny) {
    const channelText = mMoveAny[1].trim();
    return { type: 'move_me', channelText };
  }

  return { type: 'unknown', raw: text };
}

// ======== 핸들러 구현 ========
async function handleVoiceHistory({ guild, targetMember, days }) {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(now.getTime() - (days - 1) * 86400000);
  const from = fromDate.toISOString().slice(0, 10);

  let summary = null;

  if (activity && typeof activity.getDailyHourlyStats === 'function') {
    // 기대 구조: { 'YYYY-MM-DD': { '00': {message, voice}, ... } }
    const dailyHourly = activity.getDailyHourlyStats({ from, to, userId: targetMember.id }) || {};
    const perDay = [];
    for (const day of Object.keys(dailyHourly).sort()) {
      const byHour = dailyHourly[day] || {};
      let voiceSum = 0;
      for (let h = 0; h < 24; h++) {
        const hh = String(h).padStart(2, '0');
        const st = byHour[hh] || { voice: 0 };
        voiceSum += Number(st.voice || 0);
      }
      perDay.push({ day, voice: voiceSum });
    }
    summary = perDay;
  }

  // 다른 API 시도
  if (!summary && activity && typeof activity.getVoiceSummary === 'function') {
    try {
      summary = await activity.getVoiceSummary({ from, to, userId: targetMember.id });
    } catch {}
  }

  // 데이터 파일 폴백(있을 때만)
  if (!summary) {
    try {
      const guess = path.join(process.cwd(), 'data', 'voice-activity.json');
      if (fs.existsSync(guess)) {
        const raw = JSON.parse(fs.readFileSync(guess, 'utf8'));
        const rec = raw[targetMember.id] || {};
        const perDay = [];
        for (let d = 0; d < days; d++) {
          const dt = new Date(fromDate.getTime() + d * 86400000).toISOString().slice(0, 10);
          perDay.push({ day: dt, voice: Number((rec[dt] && rec[dt].minutes) || 0) });
        }
        summary = perDay;
      }
    } catch {}
  }

  return summary || [];
}

function formatMinutes(mins) {
  const m = Math.round(mins || 0);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h > 0) return `${h}시간 ${r}분`;
  return `${m}분`;
}

async function handleTopChannelNow(guild) {
  // "지금" 기준: 현재 접속자 수가 가장 많은 보이스/스테이지 채널
  const targets = guild.channels.cache.filter(c =>
    (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice)
  );
  const arr = Array.from(targets.values()).map(c => ({
    id: c.id,
    name: c.name,
    members: c.members?.size || 0,
  }));
  arr.sort((a, b) => b.members - a.members || a.name.localeCompare(b.name));
  return arr;
}

async function handleMuteUser(invoker, guild, targetMember) {
  if (!targetMember?.voice?.channel) {
    return { ok: false, reason: '해당 유저는 현재 보이스 채널에 없음' };
  }
  try {
    await targetMember.voice.setMute(true, `AI 요청자: ${invoker.user.tag}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: '뮤트 권한 또는 설정 실패' };
  }
}

async function handleKickUser(guild, targetMember, invoker) {
  try {
    await targetMember.kick(`AI 요청자: ${invoker.user.tag}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: '추방 권한 또는 실행 실패' };
  }
}

async function handleMoveMe(member, guild, channelText, options) {
  if (!member?.voice?.channel) {
    return { ok: false, reason: '먼저 보이스 채널에 접속해 있어야 이동 가능' };
  }
  const chId = mapAliasToChannelId(channelText, guild, options);
  if (!chId) return { ok: false, reason: '대상 채널을 찾지 못함' };
  try {
    await member.voice.setChannel(chId);
    return { ok: true, channelId: chId };
  } catch (e) {
    return { ok: false, reason: '이동 권한 또는 실행 실패' };
  }
}

// ======== 메인 진입 ========
async function handleAIMessage(client, options, message) {
  if (!message.guild || message.author.bot) return;
  const content = message.content?.trim() || '';
  if (!content.startsWith(PREFIX)) return;

  const q = content.slice(PREFIX.length).trim();
  if (!q) return;

  const guild = message.guild;
  const invoker = message.member;

  const intent = parseQuery(q);
  const resEmbed = new EmbedBuilder().setColor(0x9155ff).setTimestamp();

  // 위험 명령 보호
  const needAdmin = (type) => ['mute_user', 'kick_user', 'move_me'].includes(type);

  if (needAdmin(intent.type) && !hasAdminPower(invoker, options)) {
    await message.reply({
      embeds: [resEmbed
        .setTitle('권한 부족')
        .setDescription('해당 요청은 관리자 권한이 필요합니다. 관리자 역할이 없으면 실행할 수 없습니다.')]
    });
    return;
  }

  // 의도별 처리
  if (intent.type === 'voice_history') {
    const targetMember = await findMemberByText(guild, intent.userText);
    if (!targetMember) {
      await message.reply({ embeds: [resEmbed.setTitle('유저를 찾지 못했습니다').setDescription(`요청: ${q}`)] });
      return;
    }
    const data = await handleVoiceHistory({ guild, targetMember, days: intent.days || DEFAULT_DAYS });
    if (!data.length) {
      await message.reply({
        embeds: [resEmbed
          .setTitle(`음성채팅 이력 (최근 ${intent.days || DEFAULT_DAYS}일)`)
          .setDescription(`${targetMember.displayName}의 집계 데이터를 찾지 못했습니다.`)],
      });
      return;
    }
    const totalMin = data.reduce((a, b) => a + Number(b.voice || 0), 0);
    const lines = data.map(d => `• ${d.day}: ${formatMinutes(d.voice)}`);
    await message.reply({
      embeds: [resEmbed
        .setTitle(`음성채팅 이력 (최근 ${intent.days || DEFAULT_DAYS}일) — ${targetMember.displayName}`)
        .setDescription(lines.join('\n'))
        .addFields({ name: '합계', value: formatMinutes(totalMin), inline: true })],
    });
    await logAction(client, options, new EmbedBuilder()
      .setColor(0x4caf50)
      .setTitle('AI: 음성 이력 조회')
      .setDescription(`${invoker.user.tag} → ${targetMember.user.tag} (${intent.days || DEFAULT_DAYS}일)`));
    return;
  }

  if (intent.type === 'top_channel_now') {
    const arr = await handleTopChannelNow(guild);
    if (!arr.length) {
      await message.reply({ embeds: [resEmbed.setTitle('보이스 채널이 없습니다').setDescription('또는 현재 인원이 없습니다.')] });
      return;
    }
    const top = arr[0];
    const lines = arr.slice(0, 5).map((c, i) => `**${i + 1}위** ${c.name} — ${c.members}명`);
    await message.reply({
      embeds: [resEmbed
        .setTitle('지금 가장 인기 많은 보이스 채널')
        .setDescription(lines.join('\n'))
        .setFooter({ text: `TOP: ${top.name} (${top.members}명)` })],
    });
    await logAction(client, options, new EmbedBuilder()
      .setColor(0x4caf50).setTitle('AI: 인기 채널 조회').setDescription(`${invoker.user.tag}`));
    return;
  }

  if (intent.type === 'mute_user') {
    const targetMember = await findMemberByText(guild, intent.userText);
    if (!targetMember) {
      await message.reply({ embeds: [resEmbed.setTitle('유저를 찾지 못했습니다').setDescription(`요청: ${q}`)] });
      return;
    }
    const r = await handleMuteUser(invoker, guild, targetMember);
    if (r.ok) {
      await message.reply({ embeds: [resEmbed.setTitle('음소거 완료').setDescription(`${targetMember.displayName} 뮤트 완료`)] });
      await logAction(client, options, new EmbedBuilder().setColor(0xee7733).setTitle('AI: 뮤트').setDescription(`${invoker.user.tag} → ${targetMember.user.tag}`));
    } else {
      await message.reply({ embeds: [resEmbed.setTitle('실패').setDescription(r.reason || '실패')] });
    }
    return;
  }

  if (intent.type === 'kick_user') {
    const targetMember = await findMemberByText(guild, intent.userText);
    if (!targetMember) {
      await message.reply({ embeds: [resEmbed.setTitle('유저를 찾지 못했어').setDescription(`요청: ${q}`)] });
      return;
    }
    // 자신/관리자 보호
    if (targetMember.id === invoker.id) {
      await message.reply({ embeds: [resEmbed.setTitle('실패').setDescription('스스로는 추방할 수 없습니다.')] });
      return;
    }
    if (targetMember.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.reply({ embeds: [resEmbed.setTitle('실패').setDescription('관리자는 추방할 수 없습니다.')] });
      return;
    }
    const r = await handleKickUser(guild, targetMember, invoker);
    if (r.ok) {
      await message.reply({ embeds: [resEmbed.setTitle('추방 완료').setDescription(`${targetMember.user.tag} 추방 완료`)] });
      await logAction(client, options, new EmbedBuilder().setColor(0xdd3366).setTitle('AI: 추방').setDescription(`${invoker.user.tag} → ${targetMember.user.tag}`));
    } else {
      await message.reply({ embeds: [resEmbed.setTitle('실패').setDescription(r.reason || '실패')] });
    }
    return;
  }

  if (intent.type === 'move_me') {
    const r = await handleMoveMe(invoker, guild, intent.channelText, options);
    if (r.ok) {
      const ch = guild.channels.cache.get(r.channelId);
      await message.reply({ embeds: [resEmbed.setTitle('이동 완료').setDescription(`${ch ? ch.name : r.channelId} 로 이동 완료`)] });
      await logAction(client, options, new EmbedBuilder().setColor(0x3388dd).setTitle('AI: 이동').setDescription(`${invoker.user.tag} → ${ch ? ch.name : r.channelId}`));
    } else {
      await message.reply({ embeds: [resEmbed.setTitle('실패').setDescription(r.reason || '실패')] });
    }
    return;
  }

  // 미해석: 코드 검색 결과 반환(봇이 스스로 코드 분석)
  const suggestions = searchCodeIndex(q, options, 6);
  if (suggestions.length) {
    const desc = suggestions
      .map((s, i) => `**${i + 1}.** \`${path.relative(options.rootDir, s.file)}\` — exports: ${s.exports.slice(0, 6).join(', ')}`)
      .join('\n');
    await message.reply({
      embeds: [resEmbed
        .setTitle('요청을 정확히 해석하지 못했지만, 유사한 값을 처리했습니다')
        .setDescription(desc)
        .setFooter({ text: `index: ${codeIndexHash || 'n/a'}` })],
    });
    return;
  }

  await message.reply({
    embeds: [resEmbed
      .setTitle('요청을 이해하지 못했습니다')
      .setDescription('좀 더 구체적으로 이야기하거나 다른 단어를 사용해주세요')],
  });
}

// ======== 퍼블릭 API ========
function initAI(client, userOptions = {}) {
  const options = {
    ...DEFAULT_OPTIONS,
    ...userOptions,
    voiceAliases: { ...DEFAULT_OPTIONS.voiceAliases, ...(userOptions.voiceAliases || {}) },
  };
  client.on('messageCreate', (msg) => handleAIMessage(client, options, msg));
  return {
    searchCodeIndex: (q, limit = 5) => searchCodeIndex(q, options, limit),
  };
}

module.exports = {
  initAI,
  // 아래 함수들은 필요 시 외부에서 직접 호출/테스트 가능하게 export
  _parseQuery: parseQuery,
  _searchCodeIndex: (q, options = DEFAULT_OPTIONS, limit = 5) => searchCodeIndex(q, options, limit),
};
