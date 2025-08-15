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
const SUPPORTER_ROLE_ID = "1397076919127900171";
const PENALTY_ROLE_ID = "1403748042666151936";
const TRIGGER = "갓봇!";
const LOG_CHANNEL_ID = "1404513982403842282";

const DATA_DIR = path.join(__dirname, "../data");
const LEARN_PATH = path.join(DATA_DIR, "godbot-learn.json");

const MOVE_VERBS = ["옮겨","이동","보내","데려","워프","전송","텔포","텔레포트","넣어","이사","무브","이주시켜","이사시켜","옮겨줘","옮겨라","이동시켜","이동해","이동해줘","보내줘","보내라","전이","이동시켜드려"];
const CHANGE_VERBS = ["바꿔","변경","수정","교체","rename","이름바꿔","이름변경","바꾸면","고쳐","개명","리네임"];
const GIVE_ROLE_VERBS = ["지급","넣어","부여","추가","달아","줘","부착","부여해줘","넣어줘","추가해","박아","꼽아","셋업","세팅","부여해"];
const REMOVE_ROLE_VERBS = ["빼","빼줘","제거","삭제","해제","회수","박탈","없애","떼","벗겨","빼앗아","해지","삭제해","삭제해줘"];
const BLOCK_VERBS = ["차단","서버 차단","제한","서버 제한","이용 제한","금지","밴","ban","block","블락","블랙리스트","블랙"];
const NICK_LABELS = ["닉네임","별명","이름","네임"];
const CHANNEL_LABELS = ["채널","음성채널","보이스채널","보이스","음성","vc","VC"];
const CATEGORY_LABELS = ["카테고리","분류","category","CATEGORY","폴더"];
const ROLE_LABELS = ["역할","롤","role","ROLE"];
const MUTE_ON_TOKENS = ["마이크를 꺼","마이크 꺼","음소거","뮤트","입 막아","입막아","입을 막아","입 닫아","입닫아","못말","말 못하게","입틀어막","입 틀어막","입 틀어 막","마이크 꺼줘","마이크 닫아","마이크 닫아줘"];
const MUTE_OFF_TOKENS = ["마이크를 켜","마이크 켜","음소거 해제","뮤트 해제","입 풀어","입을 풀어","입막 해제","입 열어","입열","말할","말하게","입트여","마이크 켜줘","마이크 열어","마이크 열어줘"];
const DEAF_ON_TOKENS = ["스피커를 꺼","헤드셋을 닫아","귀 막아","청각 차단","귀 닫아","귀닫","못듣","소리 못 듣게","청각차단","듣지 못하게","스피커 닫아","스피커 닫아줘","스피커 꺼줘"];
const DEAF_OFF_TOKENS = ["스피커를 켜","헤드셋을 열어","귀 열어","청각 해제","귀 열어","귀열","들을","듣게","청각해제","소리 들리게","스피커 열어","스피커 열어줘","스피커 켜줘"];
const ALL_TOKENS = ["전원","모두","전체","싹다","전부","all","싸그리","다","유저들","사람들","인원","인원들","인간들"];
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

const pendingTeach = new Map();

function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LEARN_PATH)) fs.writeFileSync(LEARN_PATH, JSON.stringify({ lastId: 0, entries: [] }, null, 2), "utf8");
}
function loadLearn() {
  ensureData();
  try { return JSON.parse(fs.readFileSync(LEARN_PATH, "utf8")); } catch { return { lastId: 0, entries: [] }; }
}
function saveLearn(store) {
  ensureData();
  fs.writeFileSync(LEARN_PATH, JSON.stringify(store, null, 2), "utf8");
}

function isAdminAllowed(member) {
  if (!member) return false;
  if (member.roles?.cache?.has(ADMIN_ROLE_ID)) return true;
  return member.permissions?.has(PermissionsBitField.Flags.Administrator) || false;
}
function isSupporter(member) {
  return !!member?.roles?.cache?.has(SUPPORTER_ROLE_ID);
}
function getPrivilege(member) {
  if (isAdminAllowed(member)) return "admin";
  if (isSupporter(member)) return "supporter";
  return "none";
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

function splitMultiAnswers(a) {
  return String(a || "")
    .split(/\s*(?:,|，|\/|\|| 또는 | 혹은 )\s*/g)
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
    if (data.file) fields.push({ name: "파일", value: String(data.file), inline: true });
    fields.push({ name: "원문", value: cut(message.content || "", 1024), inline: false });
    embed.addFields(fields);
    await ch.send({ embeds: [embed] });
  } catch {}
}

/* ---------------------- 도움말 ---------------------- */
function buildHelpEmbeds() {
  const e1 = new EmbedBuilder()
    .setTitle("갓봇! 도움말")
    .setColor(0x5865F2)
    .setDescription([
      "트리거: 메세지 안에 **갓봇!** 이 포함되면 동작.",
      "우선순위: **동작/관리 커맨드 > 학습/답변 응답** (동작이 우선).",
      "권한:",
      "• 관리자: 모든 기능 사용",
      "• 서버 후원자: **본인 보이스 이동** + **대화/학습**만 사용"
    ].join("\n"))
    .addFields(
      {
        name: "보이스 이동",
        value: [
          "예) `갓봇! 닉1,닉2 를 [레이드1] 로 옮겨줘`",
          "예) `갓봇! 전원 [보이스1]로 이동`",
          "카테고리 인식: `갓봇! [A카테고리]에서 [B보이스]로 옮겨`",
          "다수 채널 언급 시 **마지막이 타겟**"
        ].join("\n")
      },
      {
        name: "음소거/청각 제어",
        value: [
          "예) `갓봇! 여기 전원 마이크 꺼줘`",
          "예) `갓봇! 닉1,닉2 스피커 켜줘`"
        ].join("\n")
      },
      {
        name: "닉네임/채널명 변경",
        value: [
          "예) `갓봇! 닉1 닉네임을 \"새닉\"으로 바꿔`",
          "예) `갓봇! [채널A] 이름을 \"공지사항\"으로 변경`"
        ].join("\n")
      }
    );

  const e2 = new EmbedBuilder()
    .setColor(0x2ecc71)
    .addFields(
      {
        name: "역할 지급/제거",
        value: [
          "예) `갓봇! 닉1,닉2에게 [i],[게이머] 역할 지급`",
          "예) `갓봇! 닉1에서 [i] 역할 빼줘`"
        ].join("\n")
      },
      {
        name: "채팅 삭제",
        value: [
          "예) `갓봇! 채팅 30개 지워`",
          "예) `갓봇! #잡담 15개 삭제`"
        ].join("\n")
      },
      {
        name: "제재(페널티) 역할 지급",
        value: [
          "예) `갓봇! 닉1 차단`",
          "내부적으로 페널티 역할 부여"
        ].join("\n")
      },
      {
        name: "학습/대화 (복수 답변 지원)",
        value: [
          "등록) `갓봇! 질문: 오늘 뭐해 답변: 쉬어,일해,겜하자`",
          "`갓봇! 오늘 뭐해 -> 쉬어, 일해 / 겜하자`",
          "조회/수정/삭제/내보내기: `갓봇! 학습 목록`, `갓봇! 학습 보기 12`, `갓봇! 학습 수정 12 질문:새Q`, `갓봇! 학습 삭제 12`, `갓봇! 학습 내보내기`",
          "답변 제거(관리자): `갓봇! 답변제거 (문자열)` 또는 `갓봇! 답변 삭제 #12`"
        ].join("\n")
      }
    );

  return [e1, e2];
}

/* ---------------------- 학습/응답 엔진 (랜덤 응답 지원 + 복수 답변 등록 + 답변 제거) ---------------------- */

function bestLearnedAnswers(query) {
  const store = loadLearn();
  const qn = norm(query);
  const scored = [];
  for (const e of store.entries) {
    const en = norm(e.q || "");
    if (!en) continue;
    const dice = diceCoef(qn, en);
    const lcsR = en.length ? (lcsLen(qn, en) / en.length) : 0;
    let score = dice * 0.6 + lcsR * 0.4;
    if (qn.includes(en)) score += 0.2;
    if (en.includes(qn)) score += 0.1;
    scored.push({ e, en, score });
  }
  if (!scored.length) return [];
  scored.sort((a,b)=>b.score-a.score);
  const top = scored[0];
  if (top.score < 0.55) return [];
  const group = scored.filter(x =>
    x.score >= Math.max(0.6, top.score - 0.07) &&
    diceCoef(x.en, top.en) >= 0.88
  );
  if (group.length) return group.map(x => x.e);
  return [top.e];
}

function existsQA(store, q, a) {
  const Q = norm(q), A = norm(a);
  return store.entries.some(e => norm(e.q) === Q && norm(e.a) === A);
}

async function handleChatAndLearning(message, content) {
  const guild = message.guild;
  const author = message.author;
  const body = normalizeKorean(stripTrigger(content));
  const lc = body.toLowerCase();

  if (/^답변\s*(제거|삭제)\b/.test(lc)) {
    if (!isAdminAllowed(message.member)) {
      await message.reply("관리자만 답변 제거가 가능해.");
      await sendLog(message, "답변 제거", "FAIL", { details: "권한 없음" });
      return true;
    }
    const raw = body.replace(/^답변\s*(제거|삭제)\s*:?\s*/i, "");
    if (!raw) {
      await message.reply("제거할 답변 내용을 적어줘. 예) 갓봇! 답변제거 그건 비밀이야");
      await sendLog(message, "답변 제거", "FAIL", { details: "대상 미지정" });
      return true;
    }
    const store = loadLearn();
    const idm = raw.match(/#?\s*(\d+)/);
    let removed = 0;
    if (idm) {
      const id = parseInt(idm[1] || "0", 10);
      const idx = store.entries.findIndex(e => e.id === id);
      if (idx >= 0) {
        store.entries.splice(idx, 1);
        removed = 1;
      }
    } else {
      const key = norm(raw);
      const before = store.entries.length;
      store.entries = store.entries.filter(e => !norm(e.a || "").includes(key));
      removed = before - store.entries.length;
    }
    if (removed > 0) {
      saveLearn(store);
      await message.reply(`답변 ${removed}개 제거 완료.`);
      await sendLog(message, "답변 제거", "OK", { count: removed, details: `raw=${cut(raw,120)}` });
    } else {
      await message.reply("일치하는 답변을 찾지 못했어.");
      await sendLog(message, "답변 제거", "FAIL", { details: `raw=${cut(raw,120)}` });
    }
    return true;
  }

  if (/^학습\s*목록\b|^학습\s*리스트\b|^학습\s*검색\b|^학습\s*보기\b|^학습\s*수정\b|^학습\s*삭제\b|^학습\s*내보내기\b/.test(lc)) {
    if (!isAdminAllowed(message.member)) {
      await message.reply("관리자만 학습 관리가 가능해.");
      await sendLog(message, "학습 관리", "FAIL", { details: "권한 없음" });
      return true;
    }
    const store = loadLearn();

    if (/^학습\s*목록\b|^학습\s*리스트\b/.test(lc)) {
      const page = Math.max(1, parseInt((body.match(/페이지\s*[:=]?\s*(\d+)/i)?.[1] || "1"), 10));
      const per = 10;
      const total = store.entries.length;
      const pages = Math.max(1, Math.ceil(total / per));
      const slice = store.entries.slice((page - 1) * per, (page - 1) * per + per);
      const desc = slice.map(e => `#${e.id} • Q: ${cut(e.q, 60)} • A: ${cut(e.a, 60)}`).join("\n") || "없음";
      const embed = new EmbedBuilder().setTitle(`학습 목록 ${page}/${pages} (${total})`).setColor(0x5865F2).setDescription(desc);
      await message.reply({ embeds: [embed] });
      await sendLog(message, "학습 목록", "OK", { details: `page=${page}` });
      return true;
    }

    if (/^학습\s*검색\b/.test(lc)) {
      const kw = body.split(/\s+/).slice(1).join(" ").trim();
      if (!kw) {
        await message.reply("검색어를 넣어줘.");
        await sendLog(message, "학습 검색", "FAIL", { details: "검색어 없음" });
        return true;
      }
      const list = store.entries.filter(e => (e.q||"").includes(kw) || (e.a||"").includes(kw)).slice(0, 20);
      const desc = list.map(e => `#${e.id} • Q: ${cut(e.q, 60)} • A: ${cut(e.a, 60)}`).join("\n") || "없음";
      const embed = new EmbedBuilder().setTitle(`학습 검색: ${kw}`).setColor(0x2ecc71).setDescription(desc);
      await message.reply({ embeds: [embed] });
      await sendLog(message, "학습 검색", "OK", { details: `kw=${kw}`, count: list.length });
      return true;
    }

    if (/^학습\s*보기\b/.test(lc)) {
      const id = parseInt(body.match(/#?\s*(\d+)/)?.[1] || "0", 10);
      const e = store.entries.find(x => x.id === id);
      if (!e) {
        await message.reply("해당 ID를 찾지 못했어.");
        await sendLog(message, "학습 보기", "FAIL", { details: `id=${id}` });
        return true;
      }
      const embed = new EmbedBuilder().setTitle(`학습 #${e.id}`).setColor(0x3498db).addFields(
        { name: "질문", value: cut(e.q, 1024) || "-" },
        { name: "답변", value: cut(e.a, 1024) || "-" },
        { name: "작성자", value: `${e.addedBy || "-"}`, inline: true },
        { name: "시각", value: new Date(e.ts || Date.now()).toLocaleString("ko-KR"), inline: true }
      );
      await message.reply({ embeds: [embed] });
      await sendLog(message, "학습 보기", "OK", { details: `id=${id}` });
      return true;
    }

    if (/^학습\s*수정\b/.test(lc)) {
      const id = parseInt(body.match(/#?\s*(\d+)/)?.[1] || "0", 10);
      const e = store.entries.find(x => x.id === id);
      if (!e) {
        await message.reply("해당 ID를 찾지 못했어.");
        await sendLog(message, "학습 수정", "FAIL", { details: `id=${id}` });
        return true;
      }
      const newQ = body.match(/질문\s*[:=]\s*([\s\S]+)/i)?.[1]?.trim();
      const newA = body.match(/답변\s*[:=]\s*([\s\S]+)/i)?.[1]?.trim();
      if (!newQ && !newA) {
        await message.reply("질문 또는 답변 중 최소 하나는 수정해야 해. 예) 갓봇! 학습 수정 12 질문:새질문");
        await sendLog(message, "학습 수정", "FAIL", { details: "변경값 없음" });
        return true;
      }
      if (newQ) e.q = newQ;
      if (newA) e.a = newA;
      saveLearn(store);
      await message.reply(`#${e.id} 수정 완료.`);
      await sendLog(message, "학습 수정", "OK", { details: `id=${id}` });
      return true;
    }

    if (/^학습\s*삭제\b/.test(lc)) {
      const id = parseInt(body.match(/#?\s*(\d+)/)?.[1] || "0", 10);
      const idx = store.entries.findIndex(x => x.id === id);
      if (idx < 0) {
        await message.reply("해당 ID를 찾지 못했어.");
        await sendLog(message, "학습 삭제", "FAIL", { details: `id=${id}` });
        return true;
      }
      store.entries.splice(idx, 1);
      saveLearn(store);
      await message.reply(`#${id} 삭제 완료.`);
      await sendLog(message, "학습 삭제", "OK", { details: `id=${id}` });
      return true;
    }

    if (/^학습\s*내보내기\b/.test(lc)) {
      const buf = Buffer.from(JSON.stringify(loadLearn(), null, 2), "utf8");
      const file = new AttachmentBuilder(buf, { name: "godbot-learn-export.json" });
      await message.reply({ files: [file] });
      await sendLog(message, "학습 내보내기", "OK", { file: "godbot-learn-export.json" });
      return true;
    }

    return true;
  }

  if (/^(답변\s*학습\s*시키기|학습\s*시키기|학습)\s*:\s*/.test(lc) || /^질문\s*:/.test(lc) || /->|=>/.test(body)) {
    let q = null, a = null;

    const qa1 = body.match(/질문\s*[:=]\s*([\s\S]+?)\s*답변\s*[:=]\s*([\s\S]+)/i);
    if (qa1) { q = qa1[1].trim(); a = qa1[2].trim(); }
    const qa2 = !a && body.match(/([\s\S]+?)\s*(?:->|=>)\s*([\s\S]+)/);
    if (!a && qa2) { q = qa2[1].trim(); a = qa2[2].trim(); }
    const qa3 = body.match(/^(?:답변\s*학습\s*시키기|학습\s*시키기|학습)\s*:\s*([\s\S]+)/i);
    if (!a && qa3) { a = qa3[1].trim(); q = pendingTeach.get(author.id) || null; }

    if (!q) q = pendingTeach.get(author.id) || null;
    if (!q || !a) {
      await message.reply("형식: `갓봇! 질문: ... 답변: ...` 또는 `갓봇! (질문) -> (답변1,답변2,...)` 또는 방금 물음에 대해 `갓봇! 답변 학습시키기: (답변1,답변2,...)`");
      await sendLog(message, "학습 등록", "FAIL", { details: "형식 오류" });
      return true;
    }

    const store = loadLearn();
    let idCursor = store.lastId || 0;
    const answers = splitMultiAnswers(a);
    const toAdd = [];
    for (const ans of answers) {
      if (!existsQA(store, q, ans)) toAdd.push(ans);
    }
    for (const ans of toAdd) {
      idCursor += 1;
      store.entries.push({ id: idCursor, q, a: ans, ts: Date.now(), addedBy: `${author.tag} (${author.id})` });
    }
    store.lastId = idCursor;
    if (toAdd.length > 0) {
      saveLearn(store);
      pendingTeach.delete(author.id);
      await message.reply(`학습 완료! 총 ${toAdd.length}개 등록.`);
      await sendLog(message, "학습 등록", "OK", { details: `등록 ${toAdd.length}개`, count: toAdd.length });
    } else {
      await message.reply("이미 동일한 질문/답변이 등록되어 있어.");
      await sendLog(message, "학습 등록", "FAIL", { details: "중복으로 추가되지 않음" });
    }
    return true;
  }

  const entries = bestLearnedAnswers(body);
  if (entries.length) {
    const pick = entries[Math.floor(Math.random() * entries.length)];
    await message.reply(String(pick.a || ""));
    await sendLog(message, "학습 응답", "OK", { details: `match:${entries.length>1 ? "random " : ""}#${pick.id}`, count: entries.length });
    return true;
  }

  pendingTeach.set(author.id, body);
  await message.reply(`죄송해요! 이해하지 못했어. '${cut(body, 120)}' 물음에 내가 어떻게 답변하기를 원해?\n→ \`갓봇! 답변 학습시키기: (원하는 답변1,답변2,...)\``);
  await sendLog(message, "학습 요청", "FAIL", { details: "미학습 문장" });
  return true;
}

/* ---------------------- 기본 내장 액션 ---------------------- */



async function handleBuiltin(message, content) {
  const guild = message.guild;
  const author = message.author;
  const body = normalizeKorean(stripTrigger(content));
  const lc = body.toLowerCase();

  if (/^(?:도움말|help|명령어|사용법|\?)(?:\s|$|좀|요|주세요|정리|목록)?/i.test(lc)) {
    const embeds = buildHelpEmbeds();
    await message.reply({ embeds });
    await sendLog(message, "도움말", "OK", { details: "도움말 전송" });
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

/* ---------------------- 후원자 전용: 본인 이동 ---------------------- */

async function handleSupporterSelfMove(message, content) {
  const guild = message.guild;
  const member = message.member;
  const body = normalizeKorean(stripTrigger(content));
  const lc = body.toLowerCase();
  if (!(textIncludesAny(lc, MOVE_VERBS) && /(으로|로)/.test(lc))) return false;
  if (!/(나|저|내|본인|자신)/.test(lc)) return false;

  if (!hasBotPerm(guild, PermissionsBitField.Flags.MoveMembers)) {
    await sendLog(message, "후원자 본인이동", "FAIL", { details: "봇에 멤버 이동 권한 없음" });
    return true;
  }

  const targetCh = fuzzyFindVoiceChannelInText(guild, body);
  if (!targetCh) {
    await message.reply("이동할 음성채널을 못 찾았어.");
    await sendLog(message, "후원자 본인이동", "FAIL", { details: "목표 채널 없음" });
    return true;
  }

  const meVoice = member?.voice?.channel;
  if (!meVoice) {
    await message.reply("현재 음성 채널에 접속 중이어야 이동할 수 있어.");
    await sendLog(message, "후원자 본인이동", "FAIL", { details: "요청자 음성 미참여" });
    return true;
  }

  try {
    await member.voice.setChannel(targetCh.id, "후원자 본인 이동");
    await message.reply(`이동 완료! → #${targetCh.name}`);
    await sendLog(message, "후원자 본인이동", "OK", { members: [member], targetChannel: targetCh, count: 1 });
  } catch (e) {
    await message.reply("이동에 실패했어.");
    await sendLog(message, "후원자 본인이동", "FAIL", { error: e?.message || e, targetChannel: targetCh });
  }
  return true;
}

/* ---------------------- 메시지 엔트리 ---------------------- */

async function onMessage(client, message) {
  if (!message.guild) return;
  if (message.author.bot) return;
  const content = message.content || "";
  if (!stripTriggerGuard(content)) return;

  const member = message.member;
  const priv = getPrivilege(member);

  if (priv === "none") {
    await message.reply("당신은 '갓봇 마스터' 또는 '서버 후원자'가 아니라서 사용할 수 없어.");
    await sendLog(message, "인가 실패", "FAIL", { details: "요청자가 권한 없음" });
    return;
  }

  if (priv === "admin") {
    const handled = await handleBuiltin(message, content);
    if (handled) return;

    const learned = await handleChatAndLearning(message, content);
    if (learned) return;

    await sendLog(message, "미해석", "FAIL", { details: "패턴 불일치" });
    return;
  }

  if (priv === "supporter") {
    
  const lc = normalizeKorean(stripTrigger(content)).toLowerCase();

  if (/^(도움말|help|명령어|사용법|\?)\b/i.test(lc)) {
    const embeds = buildHelpEmbeds();
    await message.reply({ embeds });
    await sendLog(message, "도움말", "OK", { details: "도움말 전송(후원자)" });
    return;
  }

  const moved = await handleSupporterSelfMove(message, content);
  if (moved) return;

  const learned = await handleChatAndLearning(message, content);
  if (learned) return;

  await message.reply("후원자는 '나를 ~로 옮겨줘'와 대화/학습 기능만 사용 가능해.");
  await sendLog(message, "후원자 제한", "FAIL", { details: "허용되지 않은 기능" });
  return;
 }
}

function initGodbotCore(client) {
  ensureData();
  client.on("messageCreate", (m) => onMessage(client, m));
}

module.exports = { initGodbotCore };
