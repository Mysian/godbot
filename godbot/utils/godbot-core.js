const fs = require("fs");
const path = require("path");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Collection,
  PermissionsBitField,
  AttachmentBuilder
} = require("discord.js");

const ADMIN_ROLE_ID = "1404486995564167218";
const PENALTY_ROLE_ID = "1403748042666151936";
const TRIGGER = "갓봇!";
const LOG_CHANNEL_ID = "1382168527015776287";

const MOVE_VERBS = ["옮겨","이동","보내","데려","워프","전송","텔포","텔레포트","넣어","이사","무브","이주시켜","이사시켜","옮겨줘","옮겨라","이동시켜","이동해","이동해줘","보내줘","보내라","전이"];
const CHANGE_VERBS = ["바꿔","변경","수정","교체","rename","이름바꿔","이름변경","바꾸면","고쳐","개명","리네임"];
const GIVE_ROLE_VERBS = ["지급","넣어","부여","추가","달아","줘","부착","부여해줘","넣어줘","추가해","박아","꼽아","셋업","세팅","부여해"];
const REMOVE_ROLE_VERBS = ["빼","빼줘","제거","삭제","해제","회수","박탈","없애","떼","벗겨","빼앗아","해지","삭제해","삭제해줘"];
const BLOCK_VERBS = ["차단","서버 차단","제한","서버 제한","이용 제한","금지","밴","ban","block","블락","블랙리스트","블랙"];
const NICK_LABELS = ["닉네임","별명","이름","네임"];
const CHANNEL_LABELS = ["채널","음성채널","보이스채널","보이스","음성","vc","VC"];
const CATEGORY_LABELS = ["카테고리","분류","category","CATEGORY","폴더"];
const ROLE_LABELS = ["역할","롤","role","ROLE"];
const MUTE_ON_TOKENS = ["마이크를 꺼","마이크 꺼","음소거","뮤트","입 막아","입막아","입을 막아","입 닫아","입닫아","못말","말 못하게","입틀어막", "입 틀어막", "입 틀어 막"];
const MUTE_OFF_TOKENS = ["마이크를 켜","마이크 켜","음소거 해제","뮤트 해제","입 풀어","입을 풀어","입막 해제","입 열어","입열","말할","말하게","입트여"];
const DEAF_ON_TOKENS = ["스피커를 꺼","헤드셋을 닫아","귀 막아","청각 차단","귀 닫아","귀닫","못듣","소리 못 듣게","청각차단","듣지 못하게"];
const DEAF_OFF_TOKENS = ["스피커를 켜","헤드셋을 열어","귀 열어","청각 해제","귀 열어","귀열","들을","듣게","청각해제","소리 들리게"];
const ALL_TOKENS = ["전원","모두","전체","싹다","전부","all","싸그리","다","유저들","사람들","인원","인원들","인간들"];

const GREET_TOKENS = ["안녕","안뇽","안녕하세요","하이","hi","hello","헬로","ㅎㅇ","반가워"];
const GREETINGS = [
  "안녕! 뭐 도와줄까?",
  "왔네! 오늘 뭐 할까?",
  "어 왔어? 난 준비됐어!",
  "ㅎㅇ 고마워 불러줘서.",
  "반가워! 명령 내려줘.",
  "어 그래 어서오고~"
];
const ACTION_HINTS = [].concat(
  MOVE_VERBS,
  CHANGE_VERBS,
  GIVE_ROLE_VERBS,
  REMOVE_ROLE_VERBS,
  BLOCK_VERBS,
  NICK_LABELS,
  CHANNEL_LABELS,
  CATEGORY_LABELS,
  ROLE_LABELS,
  MUTE_ON_TOKENS,
  MUTE_OFF_TOKENS,
  DEAF_ON_TOKENS,
  DEAF_OFF_TOKENS
);

function isAdminAllowed(member) {
  if (!member) return false;
  if (member.roles?.cache?.has(ADMIN_ROLE_ID)) return true;
  return member.permissions?.has(PermissionsBitField.Flags.Administrator) || false;
}

function normalizeKorean(str) {
  return (str || "")
    .normalize("NFKC")
    .replace(/[\u00A0\u200B\u200C\u200D]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function normalizeKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}
function norm(s){return normalizeKey(s||"");}

function makeNGrams(s, n = 2) {
  const arr = [];
  for (let i = 0; i <= s.length - n; i++) arr.push(s.slice(i, i + n));
  return arr;
}
function diceCoef(a, b) {
  if (!a || !b) return 0;
  const A = new Map(), B = new Map();
  for (const g of makeNGrams(a)) A.set(g, (A.get(g) || 0) + 1);
  for (const g of makeNGrams(b)) B.set(g, (B.get(g) || 0) + 1);
  let inter = 0, sizeA = 0, sizeB = 0;
  for (const [, v] of A) sizeA += v;
  for (const [, v] of B) sizeB += v;
  for (const [g, v] of A) if (B.has(g)) inter += Math.min(v, B.get(g));
  return (sizeA + sizeB) ? (2 * inter) / (sizeA + sizeB) : 0;
}
function lcsLen(a, b) {
  const m = a.length, n = b.length;
  const dp = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = (a[i - 1] === b[j - 1]) ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}
function roleSimilarity(queryText, roleName) {
  const a = norm(queryText);
  const b = norm(roleName);
  if (!a || !b) return 0;
  if (a === b) return 2.0;
  if (a.includes(b)) return 1.5;
  if (b.includes(a)) return 1.2;
  const lcs = lcsLen(b, a);
  const lcsRatio = lcs / b.length;
  const dice = diceCoef(b, a);
  let score = lcsRatio * 0.7 + dice * 0.3;
  if (b.startsWith(a)) score += 0.05;
  return score;
}

function textIncludesAny(text, arr) {
  const n = norm(text);
  return arr.some(t => n.includes(norm(t)));
}

function splitByListDelims(text) {
  return String(text || "")
    .replace(/\s*(와|과|및|그리고|랑)\s*/g, ",")
    .split(/[,，、·]+/g)
    .map(s => s.trim())
    .filter(Boolean);
}

function findMemberByToken(guild, token) {
  if (!guild || !token) return null;
  const t = normalizeKey(token);
  if (!t) return null;
  let found = guild.members.cache.find(m => normalizeKey(m.displayName) === t);
  if (found) return found;
  found = guild.members.cache.find(m => normalizeKey(m.user.username) === t);
  if (found) return found;
  found = guild.members.cache.find(m => normalizeKey(m.displayName).includes(t));
  if (found) return found;
  found = guild.members.cache.find(m => normalizeKey(m.user.username).includes(t));
  if (found) return found;
  found = guild.members.cache.find(m => t.includes(normalizeKey(m.displayName)));
  if (found) return found;
  found = guild.members.cache.find(m => t.includes(normalizeKey(m.user.username)));
  if (found) return found;
  return null;
}
function fuzzyFindMemberInText(guild, content, author) {
  const m = content.match(/<@!?(\d+)>/);
  if (m) {
    const member = guild.members.cache.get(m[1]);
    if (member) return member;
  }
  if (/(나|저|내|본인|자신)/.test(content) && author) {
    const self = guild.members.cache.get(author.id);
    if (self) return self;
  }
  let best = null;
  const ntext = norm(content);
  for (const [, member] of guild.members.cache) {
    const dn = norm(member.displayName);
    const un = norm(member.user.username);
    const hit = dn && ntext.includes(dn) ? dn.length : un && ntext.includes(un) ? un.length : 0;
    if (hit > 0 && (!best || hit > best.hit)) best = { member, hit };
  }
  return best ? best.member : null;
}
function findAllMembersInText(guild, content, author) {
  const out = new Map();
  const mrx = /<@!?(\d+)>/g;
  let m;
  while ((m = mrx.exec(content))) {
    const mem = guild.members.cache.get(m[1]);
    if (mem) out.set(mem.id, mem);
  }
  if (/(나|저|내|본인|자신)/.test(content) && author) {
    const self = guild.members.cache.get(author.id);
    if (self) out.set(self.id, self);
  }
  for (const chunk of splitByListDelims(content)) {
    const mem = findMemberByToken(guild, chunk) || fuzzyFindMemberInText(guild, chunk, author);
    if (mem) out.set(mem.id, mem);
  }
  if (!out.size) {
    const one = fuzzyFindMemberInText(guild, content, author);
    if (one) out.set(one.id, one);
  }
  return Array.from(out.values());
}

function fuzzyFindAnyChannelInText(guild, content) {
  const cm = content.match(/<#(\d+)>/);
  if (cm) {
    const ch = guild.channels.cache.get(cm[1]);
    if (ch) return ch;
  }
  const texts = [String(content || "")].concat(splitByListDelims(content));
  let best = null;
  for (const [, ch] of guild.channels.cache) {
    const cn = norm(ch.name);
    if (!cn || cn.length < 2) continue;
    let score = 0;
    for (const t of texts) {
      const s = roleSimilarity(t, ch.name);
      if (s > score) score = s;
    }
    if (score > 0 && (!best || score > best.score || (score === best.score && cn.length < norm(best.ch.name).length))) {
      best = { ch, score };
    }
  }
  return (best && best.score >= 0.45) ? best.ch : null;
}
function findAllAnyChannelsInText(guild, content) {
  const out = new Map();
  const cm = /<#(\d+)>/g;
  let m;
  while ((m = cm.exec(content))) {
    const ch = guild.channels.cache.get(m[1]);
    if (ch) out.set(ch.id, ch);
  }
  const ntext = norm(content);
  for (const [, ch] of guild.channels.cache) {
    const cn = norm(ch.name);
    if (!cn || cn.length < 2) continue;
    if (ntext.includes(cn)) out.set(ch.id, ch);
  }
  for (const tok of splitByListDelims(content)) {
    const t = norm(tok);
    if (!t) continue;
    for (const [, ch] of guild.channels.cache) {
      const cn = norm(ch.name);
      if (!cn) continue;
      if (cn.includes(t) || t.includes(cn)) out.set(ch.id, ch);
    }
  }
  return Array.from(out.values());
}
function fuzzyFindVoiceChannelInText(guild, content) {
  const cm = content.match(/<#(\d+)>/);
  if (cm) {
    const ch = guild.channels.cache.get(cm[1]);
    if (ch && ch.type === ChannelType.GuildVoice) return ch;
  }
  let best = null;
  const ntext = norm(content);
  for (const [, ch] of guild.channels.cache) {
    if (ch.type !== ChannelType.GuildVoice) continue;
    const cn = norm(ch.name);
    if (!cn) continue;
    const hit = ntext.includes(cn) ? cn.length : 0;
    if (hit > 0 && (!best || hit > best.hit)) best = { ch, hit };
  }
  return best ? best.ch : null;
}
function findAllVoiceChannelsInText(guild, content) {
  const out = new Map();
  const cm = /<#(\d+)>/g;
  let m;
  while ((m = cm.exec(content))) {
    const ch = guild.channels.cache.get(m[1]);
    if (ch && ch.type === ChannelType.GuildVoice) out.set(ch.id, ch);
  }
  const ntext = norm(content);
  for (const [, ch] of guild.channels.cache) {
    if (ch.type !== ChannelType.GuildVoice) continue;
    const cn = norm(ch.name);
    if (!cn || cn.length < 2) continue;
    if (ntext.includes(cn)) out.set(ch.id, ch);
  }
  for (const tok of splitByListDelims(content)) {
    const t = norm(tok);
    if (!t) continue;
    for (const [, ch] of guild.channels.cache) {
      if (ch.type !== ChannelType.GuildVoice) continue;
      const cn = norm(ch.name);
      if (!cn) continue;
      if (cn.includes(t) || t.includes(cn)) out.set(ch.id, ch);
    }
  }
  return Array.from(out.values());
}

function fuzzyFindCategoryInText(guild, content) {
  let best = null;
  const texts = [String(content || "")].concat(splitByListDelims(content));
  for (const [, ch] of guild.channels.cache) {
    if (ch.type !== ChannelType.GuildCategory) continue;
    const cn = norm(ch.name);
    if (!cn || cn.length < 1) continue;
    let score = 0;
    for (const t of texts) {
      const s = roleSimilarity(t, ch.name);
      if (s > score) score = s;
    }
    if (!best || score > best.score || (score === best.score && cn.length < norm(best.ch.name).length)) {
      best = { ch, score };
    }
  }
  return (best && best.score >= 0.45) ? best.ch : null;
}
function findAllCategoriesInText(guild, content) {
  const out = new Map();
  const ntext = norm(content);
  for (const [, ch] of guild.channels.cache) {
    if (ch.type !== ChannelType.GuildCategory) continue;
    const cn = norm(ch.name);
    if (!cn) continue;
    if (ntext.includes(cn)) out.set(ch.id, ch);
  }
  for (const tok of splitByListDelims(content)) {
    const t = norm(tok);
    if (!t) continue;
    for (const [, ch] of guild.channels.cache) {
      if (ch.type !== ChannelType.GuildCategory) continue;
      const cn = norm(ch.name);
      if (!cn) continue;
      if (cn.includes(t) || t.includes(cn)) out.set(ch.id, ch);
    }
  }
  if (!out.size) {
    const one = fuzzyFindCategoryInText(guild, content);
    if (one) out.set(one.id, one);
  }
  return Array.from(out.values());
}
function collectMembersFromVoiceChannels(chs) {
  const map = new Map();
  for (const ch of chs) for (const [, mem] of ch.members) map.set(mem.id, mem);
  return Array.from(map.values());
}
function collectVoiceChannelsFromCategories(guild, cats) {
  const out = [];
  for (const cat of cats) {
    for (const [, ch] of guild.channels.cache) {
      if (ch.parentId === cat.id && ch.type === ChannelType.GuildVoice) out.push(ch);
    }
  }
  return out;
}

function extractRenameTarget(content) {
  const q = content.match(/["“]([^"”]+)["”]/);
  if (q && q[1]) return q[1].trim();
  const m1 = content.match(/이름(?:을|를)?\s+(.+?)\s*(?:으로|로)\s*(?:[^ ]+)?\s*(?:바꿔|변경|수정|교체|rename)/i);
  if (m1 && m1[1]) return m1[1].trim();
  const m2 = content.match(/(닉네임|별명|이름)(?:을|를)?\s+(.+?)\s*(?:으로|로)\s*(?:바꿔|변경|수정|교체|rename)/i);
  if (m2 && m2[2]) return m2[2].trim();
  const m3 = content.match(/(?:을|를)\s+(.+?)\s*(?:으로|로)\s*(?:바꿔|변경|수정|교체|rename)/i);
  if (m3 && m3[1]) return m3[1].trim();
  return null;
}

function hasBotPerm(guild, flag) {
  const me = guild.members.me;
  return !!(me && me.permissions && me.permissions.has(flag));
}

function stripTrigger(text) {
  if (!text) return "";
  return text.split(TRIGGER).join(" ").replace(/\s+/g, " ").trim();
}

function statusColor(s) {
  if (s === "OK") return 0x2ecc71;
  if (s === "FAIL") return 0xe74c3c;
  return 0x3498db;
}
function cut(s, n) {
  const t = String(s || "");
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}
function listMembers(members) {
  return cut((members || []).map(m => `${m.displayName}(${m.id})`).join(", "), 1024);
}
function listChannels(chs) {
  return cut((chs || []).map(c => `#${c.name}(${c.id})`).join(", "), 1024);
}
function listRoles(roles) {
  return cut((roles || []).map(r => `${r.name}(${r.id})`).join(", "), 1024);
}
async function sendLog(message, intent, status, data = {}) {
  try {
    const client = message.client;
    let ch = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!ch) ch = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!ch || !ch.isTextBased?.()) return;
    const embed = new EmbedBuilder()
      .setTitle(`[${status}] ${intent}`)
      .setColor(statusColor(status))
      .setDescription(`서버: ${message.guild?.name || "-"} (${message.guild?.id || "-"})\n요청자: ${message.author?.tag || "-"} (${message.author?.id || "-"})\n입력 채널: #${message.channel?.name || "-"} (${message.channel?.id || "-"})`)
      .setTimestamp(new Date());
    const fields = [];
    if (data.details) fields.push({ name: "세부", value: cut(data.details, 1024), inline: false });
    if (data.members && data.members.length) fields.push({ name: `대상 유저 (${data.members.length})`, value: listMembers(data.members), inline: false });
    if (data.channels && data.channels.length) fields.push({ name: `대상 채널 (${data.channels.length})`, value: listChannels(data.channels), inline: false });
    if (data.targetChannel) fields.push({ name: "목표 채널", value: listChannels([data.targetChannel]), inline: false });
    if (data.roles && data.roles.length) fields.push({ name: `대상 역할 (${data.roles.length})`, value: listRoles(data.roles), inline: false });
    if (typeof data.count === "number") fields.push({ name: "처리 개수", value: String(data.count), inline: true });
    if (data.newName) fields.push({ name: "변경 이름", value: cut(data.newName, 256), inline: true });
    if (data.error) fields.push({ name: "오류", value: cut(String(data.error), 1024), inline: false });
    fields.push({ name: "원문", value: cut(message.content || "", 1024), inline: false });
    embed.addFields(fields);
    await ch.send({ embeds: [embed] });
  } catch {}
}

async function handleBuiltin(message, content) {
  const guild = message.guild;
  const author = message.author;
  const body = normalizeKorean(stripTrigger(content));
  const lc = body.toLowerCase();

  if (GREET_TOKENS.some(t => lc.includes(t)) && !ACTION_HINTS.some(t => lc.includes(t))) {
  const msg = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  await message.reply(msg); 
  await sendLog(message, "인사 응답", "OK", { details: `인사말 전송: ${msg}` });
  return true;
}


  if (
    (/\d+\s*개\s*(?:씩)?\s*(?:지워|삭제|제거|없애|날려|비워|청소|클리어|clear|purge)/.test(lc)) ||
    (lc.includes("채팅") && /(지워|삭제|제거|없애|청소|클리어|clear|purge)/.test(lc))
  ) {
    let n = (() => { const m = body.match(/-?\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(",",".")) : NaN; })();
    n = Number.isFinite(n) ? Math.trunc(n) : 5;
    n = Math.max(1, Math.min(100, n));
    let targetCh = fuzzyFindAnyChannelInText(guild, body) || message.channel;
    const me = guild.members.me;
    if (!me || !targetCh.permissionsFor(me)?.has(PermissionsBitField.Flags.ManageMessages)) {
      await sendLog(message, "채팅 삭제", "FAIL", { details: "봇에 메시지 관리 권한 없음", targetChannel: targetCh, count: n });
      return true;
    }
    if (!targetCh.isTextBased?.() || typeof targetCh.bulkDelete !== "function") {
      await sendLog(message, "채팅 삭제", "FAIL", { details: "채널 유형이 일괄 삭제 미지원", targetChannel: targetCh, count: n });
      return true;
    }
    try {
      const fetched = await targetCh.messages.fetch({ limit: Math.min(100, n + 1) });
      const filtered = fetched.filter(m => m.id !== message.id);
      const toDelete = filtered.first(n);
      await targetCh.bulkDelete(new Collection(toDelete.map(m => [m.id, m])), true);
      await sendLog(message, "채팅 삭제", "OK", { targetChannel: targetCh, count: toDelete.length });
    } catch (e) {
      await sendLog(message, "채팅 삭제", "FAIL", { details: "14일 경과 메시지 또는 스레드/채널 상태 이슈", targetChannel: targetCh, count: n, error: e?.message || e });
    }
    return true;
  }

  if (BLOCK_VERBS.some(v=>lc.includes(v))) {
    if (!hasBotPerm(guild, PermissionsBitField.Flags.ManageRoles)) {
      await sendLog(message, "제재 역할 지급", "FAIL", { details: "봇에 역할 관리 권한 없음" });
      return true;
    }
    const members = findAllMembersInText(guild, body, author);
    if (!members.length) {
      await sendLog(message, "제재 역할 지급", "FAIL", { details: "대상 유저를 찾지 못함" });
      return true;
    }
    const role = guild.roles.cache.get(PENALTY_ROLE_ID);
    if (!role) {
      await sendLog(message, "제재 역할 지급", "FAIL", { details: "제재 역할을 찾지 못함" });
      return true;
    }
    let ok = 0;
    for (const mem of members) {
      try { await mem.roles.add(role, "갓봇 제재 역할 지급"); ok++; } catch {}
    }
    const status = ok ? "OK" : "FAIL";
    await sendLog(message, "제재 역할 지급", status, { members, roles: [role], count: ok, details: ok ? "일부 또는 전체 성공" : "모두 실패" });
    return true;
  }

  if (MUTE_ON_TOKENS.some(t=>lc.includes(t)) || MUTE_OFF_TOKENS.some(t=>lc.includes(t)) || DEAF_ON_TOKENS.some(t=>lc.includes(t)) || DEAF_OFF_TOKENS.some(t=>lc.includes(t)) || /마이크|스피커|헤드셋|귀|음소거|뮤트|청각|입\s*(열|닫)|켜|꺼/.test(lc)) {
    if (!hasBotPerm(guild, PermissionsBitField.Flags.MuteMembers) && !hasBotPerm(guild, PermissionsBitField.Flags.DeafenMembers)) {
      await sendLog(message, "음소거/청각 제어", "FAIL", { details: "봇에 음소거/청각 차단 권한 없음" });
      return true;
    }
    let targets = findAllMembersInText(guild, body, author);
    const wantAll = ALL_TOKENS.some(t => lc.includes(t));
    const chsInText = findAllVoiceChannelsInText(guild, body);
    const catsInText = findAllCategoriesInText(guild, body);
    if (!targets.length && (chsInText.length || catsInText.length || wantAll)) {
      const fromChannels = [...chsInText, ...collectVoiceChannelsFromCategories(guild, catsInText)];
      if (fromChannels.length) targets = collectMembersFromVoiceChannels(fromChannels);
    }
    if (!targets.length && /(여기|이 방|현재 방|이 채널|현재 채널)/.test(lc)) {
      const me = guild.members.cache.get(author.id);
      const ch = me?.voice?.channel;
      if (ch) targets = Array.from(ch.members.values());
    }
    if (!targets.length) {
      await sendLog(message, "음소거/청각 제어", "FAIL", { details: "대상 유저를 찾지 못함" });
      return true;
    }
    const wantMuteOn = MUTE_ON_TOKENS.some(t=>lc.includes(t)) || (/마이크/.test(lc) && /꺼|off/.test(lc)) || /입\s*닫|입\s*막/.test(lc) || /\b꺼/.test(lc);
    const wantMuteOff = MUTE_OFF_TOKENS.some(t=>lc.includes(t)) || (/마이크/.test(lc) && (/켜|on|해제/.test(lc))) || /입\s*열/.test(lc) || /\b켜/.test(lc);
    const wantDeafOn = DEAF_ON_TOKENS.some(t=>lc.includes(t)) || ((/스피커|헤드셋|귀|청각/.test(lc)) && /꺼|닫|막|차단/.test(lc)) || /\b꺼/.test(lc);
    const wantDeafOff = DEAF_OFF_TOKENS.some(t=>lc.includes(t)) || ((/스피커|헤드셋|귀|청각/.test(lc)) && (/켜|열|풀|해제/.test(lc))) || /\b켜/.test(lc);
    let ok = 0;
    try {
      for (const mem of targets) {
        const v = mem.voice;
        if (!v) continue;
        if (wantMuteOn || wantMuteOff) await v.setMute(!!wantMuteOn, "갓봇 명령");
        if (wantDeafOn || wantDeafOff) await v.setDeaf(!!wantDeafOn, "갓봇 명령");
        ok++;
      }
      await sendLog(message, "음소거/청각 제어", ok ? "OK" : "FAIL", { members: targets, count: ok, details: `mute:${wantMuteOn ? "on" : (wantMuteOff ? "off" : "-")} deaf:${wantDeafOn ? "on" : (wantDeafOff ? "off" : "-")}` });
    } catch (e) {
      await sendLog(message, "음소거/청각 제어", "FAIL", { members: targets, error: e?.message || e });
    }
    return true;
  }

  if (textIncludesAny(lc, MOVE_VERBS) && /(으로|로)/.test(lc)) {
    if (!hasBotPerm(guild, PermissionsBitField.Flags.MoveMembers)) {
      await sendLog(message, "보이스 이동", "FAIL", { details: "봇에 멤버 이동 권한 없음" });
      return true;
    }
    const wantAll = ALL_TOKENS.some(t => lc.includes(t)) || /(유저들|사람들|인원|인원들)/.test(lc);
    let members = findAllMembersInText(guild, body, author);
    const voiceChs = findAllVoiceChannelsInText(guild, body);
    const catsInText = findAllCategoriesInText(guild, body);
    let targetCh = null;

    if ((voiceChs.length + catsInText.length) >= 2) {
      const resolved = [...voiceChs];
      if (catsInText.length) {
        const vcFromCats = collectVoiceChannelsFromCategories(guild, catsInText);
        for (const c of vcFromCats) resolved.push(c);
      }
      targetCh = resolved[resolved.length - 1];
      const srcs = resolved.slice(0, -1).filter(c => c && c.type === ChannelType.GuildVoice);
      if (wantAll || !members.length) {
        members = collectMembersFromVoiceChannels(srcs);
      }
    }

    if (!targetCh) {
      if (voiceChs.length >= 1) {
        targetCh = voiceChs[voiceChs.length - 1];
      } else if (catsInText.length >= 1) {
        const vs = collectVoiceChannelsFromCategories(guild, [catsInText[catsInText.length - 1]]);
        targetCh = vs[0] || null;
      }
    }

    if (!members.length && (voiceChs.length || catsInText.length)) {
      const srcs = [...voiceChs, ...collectVoiceChannelsFromCategories(guild, catsInText)];
      members = collectMembersFromVoiceChannels(srcs);
    }

    if (!members.length && /(여기|이 방|현재 방|이 채널|현재 채널|모두|다|전부)/.test(lc)) {
      const me = guild.members.cache.get(author.id);
      const ch = me?.voice?.channel;
      if (ch) members = Array.from(ch.members.values());
    }

    if (!targetCh) {
      await sendLog(message, "보이스 이동", "FAIL", { details: "이동할 음성채널을 찾지 못함", members });
      return true;
    }
    if (!members.length) {
      await sendLog(message, "보이스 이동", "FAIL", { details: "이동할 유저를 찾지 못함", targetChannel: targetCh });
      return true;
    }
    let ok = 0;
    for (const m of members) {
      try { await m.voice.setChannel(targetCh.id, "갓봇 이동"); ok++; } catch {}
    }
    const status = ok ? "OK" : "FAIL";
    await sendLog(message, "보이스 이동", status, { members, targetChannel: targetCh, count: ok, details: ok ? "일부 또는 전체 성공" : "모두 실패" });
    return true;
  }

  if (textIncludesAny(lc, CHANGE_VERBS) && NICK_LABELS.some(k=>lc.includes(k))) {
    if (!hasBotPerm(guild, PermissionsBitField.Flags.ManageNicknames)) {
      await sendLog(message, "닉네임 변경", "FAIL", { details: "봇에 닉네임 변경 권한 없음" });
      return true;
    }
    const targets = findAllMembersInText(guild, body, author);
    if (!targets.length) {
      await sendLog(message, "닉네임 변경", "FAIL", { details: "대상 유저를 찾지 못함" });
      return true;
    }
    const newNick = extractRenameTarget(body);
    if (!newNick) {
      await sendLog(message, "닉네임 변경", "FAIL", { details: "변경할 닉네임 미지정", members: targets });
      return true;
    }
    let ok = 0;
    for (const mem of targets) {
      try { await mem.setNickname(newNick.slice(0, 32), "갓봇 닉네임 변경"); ok++; } catch {}
    }
    await sendLog(message, "닉네임 변경", ok ? "OK" : "FAIL", { members: targets, newName: newNick, count: ok });
    return true;
  }

  if (textIncludesAny(lc, CHANGE_VERBS) && CHANNEL_LABELS.some(k=>lc.includes(k)) && lc.includes("이름")) {
    let targets = findAllAnyChannelsInText(guild, body);
    if (!targets.length) {
      const single = fuzzyFindAnyChannelInText(guild, body);
      if (single) targets = [single];
    }
    if (!targets.length) {
      await sendLog(message, "채널 이름 변경", "FAIL", { details: "대상 채널을 찾지 못함" });
      return true;
    }
    const newName = extractRenameTarget(body);
    if (!newName) {
      await sendLog(message, "채널 이름 변경", "FAIL", { details: "변경할 채널 이름 미지정", channels: targets });
      return true;
    }
    let ok = 0;
    for (const ch of targets) {
      try { await ch.setName(newName.slice(0, 100), "갓봇 채널 이름 변경"); ok++; } catch {}
    }
    await sendLog(message, "채널 이름 변경", ok ? "OK" : "FAIL", { channels: targets, newName, count: ok });
    return true;
  }

  if (ROLE_LABELS.some(k=>lc.includes(k)) && REMOVE_ROLE_VERBS.some(v=>lc.includes(v))) {
    if (!hasBotPerm(guild, PermissionsBitField.Flags.ManageRoles)) {
      await sendLog(message, "역할 제거", "FAIL", { details: "봇에 역할 관리 권한 없음" });
      return true;
    }
    const members = findAllMembersInText(guild, body, author);
    const roles = findAllRolesInText(guild, body);
    if (!members.length) {
      await sendLog(message, "역할 제거", "FAIL", { details: "대상 유저를 찾지 못함" });
      return true;
    }
    if (!roles.length) {
      await sendLog(message, "역할 제거", "FAIL", { details: "제거할 역할을 찾지 못함", members });
      return true;
    }
    let ok = 0;
    for (const mem of members) {
      for (const role of roles) {
        try { await mem.roles.remove(role, "갓봇 역할 제거"); ok++; } catch {}
      }
    }
    await sendLog(message, "역할 제거", ok ? "OK" : "FAIL", { members, roles, count: ok });
    return true;
  }

  if ((ROLE_LABELS.some(k=>lc.includes(k)) || /역활/.test(lc)) && GIVE_ROLE_VERBS.some(v=>lc.includes(v))) {
    if (!hasBotPerm(guild, PermissionsBitField.Flags.ManageRoles)) {
      await sendLog(message, "역할 지급", "FAIL", { details: "봇에 역할 관리 권한 없음" });
      return true;
    }
    const members = findAllMembersInText(guild, body, author);
    const roles = findAllRolesInText(guild, body);
    if (!members.length) {
      await sendLog(message, "역할 지급", "FAIL", { details: "대상 유저를 찾지 못함" });
      return true;
    }
    if (!roles.length) {
      await sendLog(message, "역할 지급", "FAIL", { details: "지급할 역할을 찾지 못함", members });
      return true;
    }
    let ok = 0;
    for (const mem of members) {
      for (const role of roles) {
        try { await mem.roles.add(role, "갓봇 역할 지급"); ok++; } catch {}
      }
    }
    await sendLog(message, "역할 지급", ok ? "OK" : "FAIL", { members, roles, count: ok });
    return true;
  }

  return false;
}

function findAllRolesInText(guild, content) {
  const out = new Map();
  const rrx = /<@&(\d+)>/g;
  let m;
  while ((m = rrx.exec(content))) {
    const role = guild.roles.cache.get(m[1]);
    if (role) out.set(role.id, role);
  }
  const raw = String(content || "");
  const bracketTokens = [];
  const re = /\[\s*([^\[\]]{1,64})\s*\]/g;
  let mm;
  while ((mm = re.exec(raw))) {
    const t = mm[1].trim();
    if (t) bracketTokens.push(t);
  }
  const quoteRe = /["“]([^"”]{1,64})["”]/g;
  let mq;
  while ((mq = quoteRe.exec(raw))) {
    const t = mq[1].trim();
    if (t) bracketTokens.push(t);
  }
  const exactByBracket = [];
  for (const tok of bracketTokens) {
    const r = guild.roles.cache.find(x => norm(x.name) === norm(tok));
    if (r) exactByBracket.push(r);
  }
  if (exactByBracket.length) {
    for (const r of exactByBracket) out.set(r.id, r);
    return Array.from(out.values());
  }
  const listTokens = splitByListDelims(raw);
  if (listTokens.length >= 2) {
    for (const tok of listTokens) {
      const best = fuzzyFindRoleInText(guild, tok);
      if (best) out.set(best.id, best);
    }
    if (out.size) return Array.from(out.values());
  }
  const best = fuzzyFindRoleInText(guild, raw);
  return best ? [best] : [];
}
function fuzzyFindRoleInText(guild, content) {
  const rm = content.match(/<@&(\d+)>/);
  if (rm) {
    const role = guild.roles.cache.get(rm[1]);
    if (role) return role;
  }
  let best = null;
  for (const [, role] of guild.roles.cache) {
    const score = roleSimilarity(content, role.name);
    if (!best || score > best.score || (score === best.score && role.name.length < best.role.name.length)) {
      best = { role, score };
    }
  }
  return (best && best.score >= 0.45) ? best.role : null;
}

function stripTriggerGuard(content) {
  return content.includes(TRIGGER);
}

async function onMessage(client, message) {
  if (!message.guild) return;
  if (message.author.bot) return;
  const content = message.content || "";
  if (!stripTriggerGuard(content)) return;
  const member = message.member;
  if (!isAdminAllowed(member)) {
    await sendLog(message, "인가 실패", "FAIL", { details: "요청자가 권한 없음" });
    return;
  }
  const handled = await handleBuiltin(message, content);
  if (!handled) {
    await sendLog(message, "미해석", "FAIL", { details: "패턴 불일치로 처리하지 않음" });
  }
}

function initGodbotCore(client) {
  client.on("messageCreate", (m) => onMessage(client, m));
}

module.exports = { initGodbotCore };
