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
const TRIGGER = "갓봇!";
const DATA_DIR = path.join(__dirname, "../data");
const STORE_PATH = path.join(DATA_DIR, "godbot-learning.json");
const DATA_INDEX_PATH = path.join(DATA_DIR, "godbot-data-index.json");
const SESSION_TTL_MS = 5 * 60 * 1000;
const SESSION_SWEEP_MS = 60 * 1000;
const PAGE_SIZE = 10;
const FAIL_PAGE_SIZE = 6;
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const DATA_INDEX_TTL_MS = 5 * 60 * 1000;

const AppOptType = {
  SUB_COMMAND: 1,
  SUB_COMMAND_GROUP: 2,
  STRING: 3,
  INTEGER: 4,
  BOOLEAN: 5,
  USER: 6,
  CHANNEL: 7,
  ROLE: 8,
  MENTIONABLE: 9,
  NUMBER: 10,
  ATTACHMENT: 11,
};

const DefaultOptionSynonyms = {
  USER: ["에게", "한테", "님에게", "유저", "사용자", "님", "게이머", "플레이어", "사람", "상대", "상대방", "상대유저", "아이디", "ID", "유저ID","을", "를", "이", "가"],
  NUMBER: ["원", "정수", "금액", "포인트", "수량", "숫자", "코인", "갓비트", "만큼", "씩", "수치", "개수", "갯수", "퍼센트", "%", "점수", "레벨", "가격", "비용", "횟수"],
  INTEGER: ["원", "정수", "금액", "포인트", "수량", "숫자", "코인", "갓비트", "만큼", "씩", "수치", "개수", "갯수", "점수", "레벨", "횟수"],
  STRING: ["내용", "사유", "메모", "메시지", "설명", "텍스트", "문구", "제목", "타이틀", "이유", "코멘트", "댓글", "채팅", "채팅내용", "설명문"],
  BOOLEAN: ["여부", "할까", "할까요", "진행", "포함", "활성화", "비활성화", "허용", "허가", "금지", "참", "거짓", "켜", "끄기", "켜기", "끄자"],
  ROLE: ["역할", "롤", "역할명", "태그", "직책", "등급", "클랜", "길드역할"],
  CHANNEL: ["채널", "으로", "로", "채널명", "방", "룸", "보이스", "보이스채널", "음성채널", "음성방", "텍스트채널", "텍스트방", "채팅채널"],
  MENTIONABLE: ["대상", "멘션", "대상자", "멘션가능", "멘션대상", "유저/역할"],
  ATTACHMENT: ["파일", "첨부", "이미지", "스크린샷", "사진", "문서", "증빙", "첨부파일", "스샷", "캡처", "캡쳐"]
};

const DATA_QUERY_TOKENS = ["알려줘","조회","보여줘","검색","찾아","리포트","정보","데이터","json","값","수치","통계","리스트","목록","현황","상세","세부"];
const KNOWN_KEY_SYNONYMS = {
  warn: ["경고","경고수","경고횟수","warning","warn","warnings","제재","경고로그","주의"],
  balance: ["잔액","소지금","코인","갓비트","보유","balance","amount","money","cash","자산","재화","통장"],
  level: ["레벨","level","lv","랭크","등급","숙련도"],
  exp: ["경험치","exp","xp","경험","경험포인트"],
  history: ["기록","히스토리","내역","history","log","logs","이력","트래킹"],
  id: ["id","아이디","유저id","userId","user_id","memberId","discordId","uid"]
};

const CANCEL_WORDS = ["취소", "취소해", "중단", "중단해", "멈춰", "그만해", "그만", "스탑", "거기까지", "멈춰줘", "종료", "종료해"];

const MOVE_VERBS = ["옮겨", "이동", "보내", "데려", "워프", "전송", "텔포", "텔레포트", "넣어", "이사"];
const CHAT_LABELS = ["채팅","메시지","메세지","이야기","얘기","말","문자","내용","데이터","대화","로그","기록"];
const DELETE_VERBS = ["지워","지워줘","삭제","삭제해","제거","제거해","없애","없애줘","날려","날려줘","비워","비워줘","청소","청소해","클리어","clear","purge"];
const CHANGE_VERBS = ["바꿔", "변경", "수정", "교체", "rename", "이름바꿔", "이름변경", "바꾸면"];
const GIVE_ROLE_VERBS = ["지급", "넣어", "부여", "추가", "달아", "줘", "부착", "부여해줘", "넣어줘", "추가해"];
const REMOVE_ROLE_VERBS = ["빼", "빼줘", "제거", "삭제", "해제", "회수", "박탈", "없애", "떼", "벗겨", "빼앗아"];
const NICK_LABELS = ["닉네임", "별명", "이름", "네임"];
const CHANNEL_LABELS = ["채널", "음성채널", "보이스채널", "보이스", "음성", "vc", "VC"];
const ROLE_LABELS = ["역할", "롤", "role", "ROLE"];
const MUTE_ON_TOKENS = ["마이크를 꺼", "마이크 꺼", "음소거", "뮤트", "입 막아", "입막아", "입을 막아", "입 닫아", "입닫아", "못말"];
const MUTE_OFF_TOKENS = ["마이크를 켜", "마이크 켜", "음소거 해제", "뮤트 해제", "입 풀어", "입을 풀어", "입막 해제", "입 열어", "입열", "말할", "말하게"];
const DEAF_ON_TOKENS = ["스피커를 꺼", "헤드셋을 닫아", "귀 막아", "청각 차단", "귀 닫아", "귀닫", "못듣"];
const DEAF_OFF_TOKENS = ["스피커를 켜", "헤드셋을 열어", "귀 열어", "청각 해제", "귀 열어", "귀열", "들을", "듣게"];
const ALL_TOKENS = ["전원","모두","전체","싹다","전부","all","싸그리","다"];
const SERVER_QUERY_HINTS = ["서버", "길드", "서버현황", "서버상태", "서버통계", "서버정보", "전체", "전서버"];

function hasUserTargetInText(text) {
  return /<@!?(\d+)>/.test(text) || /(나|저|내|본인|자신)/.test(text);
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) fs.writeFileSync(STORE_PATH, JSON.stringify({ commands: {}, stats: {} }, null, 2));
}
function loadStore() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return { commands: {}, stats: {} };
  }
}
function saveStore(data) {
  ensureStore();
  if (!data.stats) data.stats = {};
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

const sessions = new Map();
function newSession(userId) {
  const now = Date.now();
  const s = {
    step: 0,
    createdAt: now,
    lastActive: now,
    data: {},
    mode: null,
    commandName: null,
    expectedOptions: [],
    requiredOptions: [],
    optionalOptions: [],
    optionalDecided: false,
    currIndex: 0,
    channelId: null,
    messageId: null,
    pendingConfirm: null,
    origText: ""
  };
  sessions.set(userId, s);
  return s;
}
function getSession(userId) {
  const s = sessions.get(userId);
  if (!s) return null;
  const t = s.lastActive || s.createdAt || 0;
  if (Date.now() - t > SESSION_TTL_MS) {
    sessions.delete(userId);
    return null;
  }
  s.lastActive = Date.now();
  return s;
}
function endSession(userId) {
  sessions.delete(userId);
}
function sweepSessions() {
  const now = Date.now();
  for (const [k, s] of sessions) {
    const t = s.lastActive || s.createdAt || 0;
    if (now - t > SESSION_TTL_MS) sessions.delete(k);
  }
}

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
const K_PART = "을를이가은는에와과도만으로부터까지에서처럼조차마저께께서의";
const escR = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function joinsToPattern(joins = []) {
  const parts = [];
  for (const s of (joins || [])) {
    if (s === SPACE_TOK) {
      parts.push("(?:(?<=\\p{L}|\\p{N})\\s(?!\\s))");
    } else {
      parts.push(escR(s));
    }
  }
  return parts.join("|");
}

function buildGrabber(joins = [], extraStops = "") {
  const rxJoins = joinsToPattern(joins);
  const stop = extraStops ? `|(?=[${extraStops}])` : "";
  const sep = rxJoins ? `(?:\\s*(?:${rxJoins}))` : `\\s+`;
  return new RegExp(`(.+?)(?:${sep}${stop}|\\s|$)`, "u");
}

const rgxNUM = /(-?\d+(?:[.,]\d+)?)(?=\s|[%원개점천만억kKmMbB]|$)/u;

const SPACE_TOK = "__SPACE__";
function parseSynonymsInput(txt) {
  return String(txt || "")
    .split(",")
    .map(v => v.replace(/\u00A0/g, " "))
    .map(v => {
      const raw = v;
      if (/^\s+$/.test(raw)) return SPACE_TOK;
      const t = raw.trim();
      if (/^(공백|\(공백\)|\[space\]|space|␣)$/i.test(t)) return SPACE_TOK;
      return t;
    })
    .filter(x => x && x !== "");
}
const prettySyn = s => s === SPACE_TOK ? "(공백)" : s;

function parseFloatAny(str) {
  if (!str) return null;
  const m = String(str).match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  return parseFloat(m[0].replace(",", "."));
}
function classifyExecError(e) {
  const msg = String(e?.message || e || "");
  if (e?.code === "REQUIRED_OPTION" || /REQUIRED_OPTION:/i.test(msg) || /Required option/i.test(msg)) {
  return "MISSING_OPTIONS";
}
  if (/SUBCOMMAND_REQUIRED/i.test(msg)) return "SUBCOMMAND_REQUIRED";
  if (/SUBCOMMAND_GROUP_REQUIRED/i.test(msg)) return "SUBCOMMAND_GROUP_REQUIRED";
  if (/Missing Permissions|50013/i.test(msg)) return "MISSING_PERMISSIONS";
  if (/Missing Access|50001/i.test(msg)) return "MISSING_ACCESS";
  if (/Unknown Channel|10003/i.test(msg)) return "UNKNOWN_CHANNEL";
  if (/Unknown Member|10007/i.test(msg)) return "UNKNOWN_MEMBER";
  if (/Unknown Role|10011/i.test(msg)) return "UNKNOWN_ROLE";
  if (/Invalid Form Body/i.test(msg)) return "BAD_PAYLOAD";
  if (/request entity too large/i.test(msg)) return "PAYLOAD_TOO_LARGE";
  if (/Cannot read (properties|property) of/i.test(msg)) return "NULL_REFERENCE";
  return "HANDLER_EXCEPTION";
}
function stripTrigger(text) {
  if (!text) return "";
  return text.split(TRIGGER).join(" ").replace(/\s+/g, " ").trim();
}
function normalizeKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
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

function getTypeLabel(t) {
  switch (t) {
    case AppOptType.STRING: return "STRING";
    case AppOptType.INTEGER: return "NUMBER";
    case AppOptType.NUMBER: return "NUMBER";
    case AppOptType.USER: return "USER";
    case AppOptType.BOOLEAN: return "BOOLEAN";
    case AppOptType.ROLE: return "ROLE";
    case AppOptType.CHANNEL: return "CHANNEL";
    case AppOptType.MENTIONABLE: return "MENTIONABLE";
    case AppOptType.ATTACHMENT: return "ATTACHMENT";
    default: return "STRING";
  }
}

function flattenOptions(options = []) {
  const out = [];
  for (const opt of options) {
    if (opt.type === AppOptType.SUB_COMMAND_GROUP && Array.isArray(opt.options)) {
      for (const sub of opt.options) {
        if (sub.type === AppOptType.SUB_COMMAND) {
          out.push({ name: `${opt.name}.${sub.name}`, type: "SUB", required: true, description: sub.description || "" });
          if (Array.isArray(sub.options)) {
            for (const o of sub.options) {
              out.push({ name: `${opt.name}.${sub.name}.${o.name}`, type: getTypeLabel(o.type), required: !!o.required, description: o.description || "" });
            }
          }
        }
      }
    } else if (opt.type === AppOptType.SUB_COMMAND) {
      out.push({ name: `${opt.name}`, type: "SUB", required: true, description: opt.description || "" });
      if (Array.isArray(opt.options)) {
        for (const o of opt.options) {
          out.push({ name: `${opt.name}.${o.name}`, type: getTypeLabel(o.type), required: !!o.required, description: o.description || "" });
        }
      }
    } else {
      out.push({ name: opt.name, type: getTypeLabel(opt.type), required: !!opt.required, description: opt.description || "" });
    }
  }
  return out;
}

async function fetchSlashSchema(client, guild, name) {
  let cmd = null;
  try {
    await client.application.commands.fetch();
    cmd = client.application.commands.cache.find(c => c.name === name) || null;
  } catch {}
  if (!cmd && guild) {
    try {
      await guild.commands.fetch();
      cmd = guild.commands.cache.find(c => c.name === name) || null;
    } catch {}
  }
  if (!cmd) return null;
  
  const flat = flattenOptions(cmd.options || []);
  const options = flat.filter(o => o.type !== "SUB");
  const subcommands = flat.filter(o => o.type === "SUB").map(o => o.name);

  return {
    id: cmd.id,
    name: cmd.name,
    description: cmd.description || "",
    options: options.map(o => ({
      name: o.name,
      type: o.type,
      required: !!o.required,
      description: o.description,
      synonyms: (DefaultOptionSynonyms[o.type] || []).slice(0),
    })),
    subcommands,
  };
}

function buildListEmbed(data, page) {
  const entries = Object.values(data.commands || {}).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const total = entries.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * PAGE_SIZE;
  const slice = entries.slice(start, start + PAGE_SIZE);
  const eb = new EmbedBuilder()
    .setTitle("갓봇! 학습 목록")
    .setDescription(total === 0 ? "학습된 명령어가 없어요." : slice.map((c, i) => {
      const idx = start + i + 1;
      const optText = (c.options || []).map(o => `${o.required ? "필수" : "선택"}:${o.type} ${o.name}`).join(" · ");
      const syn = (c.synonyms || []).slice(0, 6).map(prettySyn).join(", ");
      return `**${idx}. /**${c.name}  | 키워드: ${syn || "-"}\n옵션: ${optText || "-"}`;
    }).join("\n\n"))
    .setFooter({ text: `페이지 ${p}/${pages} • 총 ${total}개` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`godbot_list_prev_${p}`).setLabel("이전").setStyle(ButtonStyle.Secondary).setDisabled(p <= 1),
    new ButtonBuilder().setCustomId(`godbot_list_next_${p}`).setLabel("다음").setStyle(ButtonStyle.Secondary).setDisabled(p >= pages),
  );
  return { eb, row, page: p, pages };
}

function fmtTS(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function collectFailLogs(store, cmdFilter, userIdFilter) {
  const out = [];
  for (const [cmd, st] of Object.entries(store.stats || {})) {
    const arr = (st && st.failLog) || [];
    for (const it of arr) {
      if (cmdFilter && cmd !== cmdFilter) continue;
      if (userIdFilter && it.userId !== userIdFilter) continue;
      out.push({ cmd, ...it });
    }
  }
  out.sort((a, b) => b.at - a.at);
  return out;
}
function buildFailLogEmbed(store, page, cmdFilter, userIdFilter) {
  const all = collectFailLogs(store, cmdFilter, userIdFilter);
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / FAIL_PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * FAIL_PAGE_SIZE;
  const slice = all.slice(start, start + FAIL_PAGE_SIZE);
  const desc = slice.map((it, i) => {
    const idx = start + i + 1;
    const miss = (it.missing && it.missing.length) ? ` • 누락:${it.missing.join(",")}` : "";
    const preview = String(it.text || "").replace(/\s+/g, " ").slice(0, 120);
    return `**${idx}.** /${it.cmd} • <@${it.userId}> • ${fmtTS(it.at)} • ${it.reason}${miss}\n${preview}`;
  }).join("\n\n") || "기록이 없어.";
  const titleParts = ["갓봇! 실패 로그"];
  if (cmdFilter) titleParts.push(`/${cmdFilter}`);
  if (userIdFilter) titleParts.push(`<@${userIdFilter}>`);
  const eb = new EmbedBuilder().setTitle(titleParts.join(" ")).setDescription(desc).setFooter({ text: `페이지 ${p}/${pages} • 총 ${total}건` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`godbot_fail_prev_${p}_${cmdFilter || "-"}_${userIdFilter || "-"}`).setLabel("이전").setStyle(ButtonStyle.Secondary).setDisabled(p <= 1),
    new ButtonBuilder().setCustomId(`godbot_fail_next_${p}_${cmdFilter || "-"}_${userIdFilter || "-"}`).setLabel("다음").setStyle(ButtonStyle.Secondary).setDisabled(p >= pages),
  );
  return { eb, row, page: p, pages };
}
async function handleFailLogCommand(message) {
  const store = loadStore();
  const body = stripTrigger(message.content).replace(/^실패로그/i, "").trim();
  let cmd = null, uid = null;
  const mC = body.match(/\/([a-z0-9._-]+)/i);
  if (mC) cmd = mC[1];
  const mU = body.match(/<@!?(\d+)>/);
  if (mU) uid = mU[1];
  const built = buildFailLogEmbed(store, 1, cmd, uid);
  const msg = await message.channel.send({ embeds: [built.eb], components: [built.row], reply: { messageReference: message.id } });
  setTimeout(() => { if (msg.editable) msg.edit({ components: [] }).catch(() => {}); }, 120000);
}


function summarizePlan(guild, learned, collected) {
  const lines = [];
  lines.push(`/${learned.name}`);
  const opts = learned.options || [];
  for (const o of opts) {
    const key = o.name;
    let val = collected[key];
    if (o.type === "USER" && val && typeof val === "object" && val.id) val = `<@${val.id}>`;
    if (o.type === "ROLE" && val && typeof val === "object" && val.id) val = `<@&${val.id}>`;
    if (o.type === "CHANNEL" && val && typeof val === "object" && val.id) val = `<#${val.id}>`;
    if (o.type === "MENTIONABLE" && val && typeof val === "object" && val.id) val = val.tag ? `<@${val.id}>` : `<@&${val.id}>`;
    if (o.type === "BOOLEAN" && typeof val === "boolean") val = val ? "예" : "아니오";
    if (o.type === "ATTACHMENT" && val && val.name) val = val.name;
    if (val === undefined || val === null || val === "") continue;
    lines.push(`${key}: ${val}`);
  }
  return lines.join("  ");
}

function parseStringSegment(content, keys=[]) {
  const mQ = content.match(/["“]([^"”]+)["”]/);
  if (mQ) return { value: mQ[1].slice(0,2000), from: "quoted" };
  if (keys.length) {
    const rx = new RegExp(`(?:${keys.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")})\\s*[:：]?\\s*(.+)$`,"i");
    const mK = content.match(rx);
    if (mK) return { value: mK[1].slice(0,2000), from: "keyword" };
  }
  return { value: null, from: null };
}

function extractFromText(guild, text, learned, author) {
  const base = stripTrigger(text);
  const content = normalizeKorean(base);
  const res = {};

  const userOpt = (learned.options || []).find(o => o.type === "USER");
  if (userOpt) {
    const m = content.match(/<@!?(\d+)>/);
    if (m) {
      const member = guild.members.cache.get(m[1]);
      if (member) res[userOpt.name] = member.user;
    }
    if (!res[userOpt.name]) {
      const selfHit = /(나|저|내|본인|자신)(?:에게|한테|게)?/.test(content);
      if (selfHit && author) {
        res[userOpt.name] = author;
      } else {
        const joins = (userOpt.synonyms || DefaultOptionSynonyms.USER);
        const mm = content.match(buildGrabber(joins, K_PART));
        if (mm) {
          const token = mm[1].trim().replace(/^['"“”‘’`]+|['"“”‘’`]+$/g, "");
          const member = findMemberByToken(guild, token);
          if (member) res[userOpt.name] = member.user;
        } else {
          const selfAny = /(나|저|내|본인|자신)/.test(content);
          if (selfAny && author) res[userOpt.name] = author;
        }
      }
    }
  }

  const mentionableOpt = (learned.options || []).find(o => o.type === "MENTIONABLE");
  if (mentionableOpt) {
    let v = null;
    const mU = content.match(/<@!?(\d+)>/);
    if (mU) {
      const member = guild.members.cache.get(mU[1]);
      if (member) v = member.user;
    }
    if (!v) {
      const mR = content.match(/<@&(\d+)>/);
      if (mR) {
        const role = guild.roles.cache.get(mR[1]);
        if (role) v = { id: role.id, name: role.name };
      }
    }
    if (v) res[mentionableOpt.name] = v;
  }

  const numberOpt = (learned.options || []).find(o => o.type === "NUMBER");
  if (numberOpt) {
    let num = null;
    const joins = (numberOpt.synonyms || DefaultOptionSynonyms.NUMBER);
    const near = new RegExp(`(-?\\d+(?:[.,]\\d+)?)\\s*(?:${joins.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "u");
    const m1 = content.match(near);
    if (m1) num = parseFloat(m1[1].replace(",", "."));
    if (num == null) {
      const m2 = content.match(rgxNUM);
      if (m2) num = parseFloat(m2[1].replace(",", "."));
    }
    if (num != null) res[numberOpt.name] = num;
  }

  for (const o of (learned.options || [])) {
    if (res[o.name] != null) continue;
    if (o.type === "STRING") {
      const keys = (o.synonyms || DefaultOptionSynonyms.STRING);
      const r = parseStringSegment(content, keys);
      if (r.value) {
        res[o.name] = r.value;
        res[`__src_${o.name}`] = r.from;
      }
    }
  }

  return res;
}

function toMessageOptions(p) {
  if (typeof p === "string") return { content: p };
  if (!p || typeof p !== "object") return {};
  const out = {};
  if (p.content) out.content = p.content;
  if (p.embeds) out.embeds = p.embeds;
  if (p.components) out.components = p.components;
  if (p.files) out.files = p.files;
  if (p.allowedMentions) out.allowedMentions = p.allowedMentions;
  return out;
}

function requiredGuard(name, val, required) {
  if (required && (val === null || val === undefined)) {
    const err = new Error(`REQUIRED_OPTION:${name}`);
    err.code = "REQUIRED_OPTION";
    throw err;
  }
  return val;
}

function buildFakeInteraction(baseMessage, learned, collected) {
  const now = Date.now();
  let _deferred = false;
  let _replied = false;
  let _lastMsg = null;   
  let _ephemeral = false; 

  const get = name => collected[name];
  const options = {
  getString: (n, required = false) => requiredGuard(n, (typeof get(n) === "string" ? get(n) : null), required),
  getInteger: (n, required = false) => {
    const x = get(n);
    const v = (typeof x === "number") ? Math.trunc(x) : (() => {
      const f = parseFloatAny(x);
      return Number.isFinite(f) ? Math.trunc(f) : null;
    })();
    return requiredGuard(n, v, required);
  },
  getNumber: (n, required = false) => {
    const x = get(n);
    const v = (typeof x === "number") ? x : (() => {
      const f = parseFloatAny(x);
      return Number.isFinite(f) ? f : null;
    })();
    return requiredGuard(n, v, required);
  },
  getUser: (n, required = false) => requiredGuard(n, (get(n) && get(n).id ? get(n) : null), required),
  getMember: (n, required = false) => {
    const v = get(n);
    const mem = v && v.id && baseMessage.guild ? baseMessage.guild.members.cache.get(v.id) || null : null;
    return requiredGuard(n, mem, required);
  },
  getRole: (n, required = false) => requiredGuard(n, (get(n) && get(n).id ? get(n) : null), required),
  getChannel: (n, required = false) => requiredGuard(n, (get(n) && get(n).id ? get(n) : null), required),
  getBoolean: (n, required = false) => {
    const x = get(n);
    const v = typeof x === "boolean"
      ? x
      : (typeof x === "string" ? ["예","네","true","True","TRUE","y","yes"].includes(x) : null);
    return requiredGuard(n, v, required);
  },
  getMentionable: (n, required = false) => requiredGuard(n, (get(n) && get(n).id ? get(n) : null), required),
  getAttachment: (n, required = false) => requiredGuard(n, (get(n) && get(n).name ? get(n) : null), required),
  getSubcommand(required = false) {
    const list = Array.isArray(learned.subcommands) ? learned.subcommands : [];
    const raw = String(baseMessage.content || "").toLowerCase();
    let found = null;
    for (const full of list) {
      const leaf = String(full).split(".").pop().toLowerCase();
      if (raw.includes(leaf)) { found = leaf; break; }
    }
    if (found) return found;
    if (required) throw new Error("SUBCOMMAND_REQUIRED");
    return null;
  },
  getSubcommandGroup(required = false) {
    const list = Array.isArray(learned.subcommands) ? learned.subcommands : [];
    const any = list.find(n => n.includes("."));
    const group = any ? String(any).split(".")[0] : null;
    if (group) return group;
    if (required) throw new Error("SUBCOMMAND_GROUP_REQUIRED");
    return null;
  },
  get: n => get(n),
};

  const interaction = {
    id: `${now}`,
    applicationId: baseMessage.client?.application?.id || null,
    commandId: learned.id || null,
    commandName: learned.name,
    createdTimestamp: now,

    client: baseMessage.client,
    user: baseMessage.author,
    member: baseMessage.member,
    guild: baseMessage.guild,
    guildId: baseMessage.guild?.id || null,
    channel: baseMessage.channel,
    channelId: baseMessage.channel?.id || null,
    appPermissions: baseMessage.guild?.members?.me?.permissions || null,

    options,

    isChatInputCommand: () => true,
    inGuild: () => !!baseMessage.guild,
    inCachedGuild: () => !!baseMessage.guild,
    inRawGuild: () => !!baseMessage.guild,
    isRepliable: () => true,

    get deferred() { return _deferred; },
    get replied() { return _replied; },

    reply: async (p = {}) => {
      if (p?.ephemeral != null) _ephemeral = !!p.ephemeral;
      const msg = await baseMessage.channel.send(toMessageOptions(p));
      _lastMsg = msg;
      _replied = true;
      return msg;
    },
    deferReply: async (p = {}) => { if (p?.ephemeral != null) _ephemeral = !!p.ephemeral; _deferred = true; },
    editReply: async (p = {}) => {
      const opts = toMessageOptions(p);
      const tag = _deferred && !_replied ? "[deferred] " : "";
      const msg = await baseMessage.channel.send({ ...opts, content: tag + (opts.content || "") });
      _lastMsg = msg;
      _replied = true;
      return msg;
    },
    followUp: async (p = {}) => {
      const msg = await baseMessage.channel.send(toMessageOptions(p));
      _lastMsg = msg;
      _replied = true;
      return msg;
    },

    fetchReply: async () => _lastMsg,
    deleteReply: async () => {},
  };

  return interaction;
}


function ensureStatsScaffold(store, cmdName) {
  if (!store.stats) store.stats = {};
  if (!store.stats[cmdName]) store.stats[cmdName] = {};
  return store.stats[cmdName];
}
function recordOptionLastUsed(store, cmdName, userId, optionName, value) {
  const st = ensureStatsScaffold(store, cmdName);
  if (!st.optionDefaultsByUser) st.optionDefaultsByUser = {};
  if (!st.optionDefaultsByUser[userId]) st.optionDefaultsByUser[userId] = {};
  st.optionDefaultsByUser[userId][optionName] = value;
}
function getOptionLastUsed(store, cmdName, userId, optionName) {
  const st = store.stats && store.stats[cmdName];
  const v = st && st.optionDefaultsByUser && st.optionDefaultsByUser[userId] && st.optionDefaultsByUser[userId][optionName];
  return v === undefined ? null : v;
}
function mineUnitTokensAroundNumbers(text) {
  const out = new Set();
  const re = /(-?\d+(?:[.,]\d+)?)[\s]*([가-힣A-Za-z%₩]*?)(?=\s|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const unit = (m[2] || "").trim();
    if (!unit) continue;
    if (/^\d+$/.test(unit)) continue;
    if (unit.length > 8) continue;
    out.add(unit);
  }
  return Array.from(out);
}

async function tryExecuteLearned(client, baseMessage, learned, collected, originalBody) {
  const missing = getMissingRequiredOptions(learned, collected);
  if (missing.length) {
    return { ok: false, reason: "MISSING_OPTIONS", missing };
  }
  const col = client.commands || client.slashCommands || new Collection();
  let cmd = col.get(learned.name);
  if (!cmd && col instanceof Map) cmd = col.get(learned.name);
  if (!cmd && typeof col.find === "function") cmd = col.find(c => c?.data?.name === learned.name || c?.name === learned.name);
  if (!cmd) return { ok: false, reason: "HANDLER_NOT_FOUND" };

  const interaction = buildFakeInteraction(baseMessage, learned, collected);

  try {
  if (typeof cmd.execute === "function") {
    await cmd.execute(interaction);
  } else if (typeof cmd.run === "function") {
    await cmd.run(interaction);
  } else if (typeof cmd.chatInputRun === "function") {
    await cmd.chatInputRun(interaction);
  } else {
    return { ok: false, reason: "NO_EXECUTOR" };
  }
  autoLearnAfterSuccess(baseMessage, learned, collected, originalBody);
  return { ok: true };
} catch (e) {
  console.error("godbot-nlp execute error:", e);
  const reason = classifyExecError(e);
  return { ok: false, reason, error: e, errorMsg: String(e?.message || e) };
 }
}


function autoLearnAfterSuccess(baseMessage, learned, collected, originalBody) {
  try {
    const store = loadStore();
    const cmd = store.commands[learned.name];
    if (!cmd) return;
    const body = normalizeKorean(originalBody || "");
    for (const o of (cmd.options || [])) {
      const val = collected[o.name];
      if (val !== undefined && val !== null && val !== "") {
        recordOptionLastUsed(store, learned.name, baseMessage.author.id, o.name, val);
      }
      if (o.type === "NUMBER") {
        const mined = mineUnitTokensAroundNumbers(body);
        const baseSyn = new Set([...(o.synonyms || []), ...(DefaultOptionSynonyms.NUMBER || [])]);
        const add = mined.filter(t => !baseSyn.has(t));
        if (add.length) {
          o.synonyms = Array.from(new Set([...(o.synonyms || []), ...add]));
        }
      }
      if (o.type === "STRING") {
        const hinted = ["사유","메모","내용","설명","코멘트","메시지","타이틀","제목"].filter(t => body.includes(t));
        if (hinted.length) o.synonyms = Array.from(new Set([...(o.synonyms || []), ...hinted]));
      }
    }
    const verbs = [...MOVE_VERBS, ...CHANGE_VERBS, ...GIVE_ROLE_VERBS, ...REMOVE_ROLE_VERBS, ...DELETE_VERBS];
    const hitVerbs = verbs.filter(v => body.includes(v));
    if (hitVerbs.length) cmd.synonyms = Array.from(new Set([...(cmd.synonyms || []), ...hitVerbs]));
    promotePendingNumberSynonyms(store, learned);
    saveStore(store);
  } catch {}
}

function getMissingRequiredOptions(learned, collected) {
  const req = (learned.options || []).filter(o => o.required);
  return req.filter(o => collected[o.name] === undefined || collected[o.name] === null || collected[o.name] === "").map(o => o.name);
}
function incrementCount(map, key, by = 1) {
  if (!map[key]) map[key] = 0;
  map[key] += by;
}
function promotePendingNumberSynonyms(store, learned) {
  const cmd = store.commands[learned.name];
  if (!cmd) return;
  const st = ensureStatsScaffold(store, learned.name);
  const pending = st.failUnitCounts || {};
  const toPromote = Object.entries(pending).filter(([, c]) => c >= 3).map(([t]) => t);
  if (!toPromote.length) return;
  const numOpts = (cmd.options || []).filter(o => o.type === "NUMBER");
  for (const o of numOpts) {
    o.synonyms = Array.from(new Set([...(o.synonyms || []), ...toPromote]));
  }
}
function autoLearnAfterFailure(baseMessage, learned, collected, originalBody, reason, note) {
  try {
    const store = loadStore();
    ensureStatsScaffold(store, learned.name);
    const st = store.stats[learned.name];
    if (!st.lastMissingByUser) st.lastMissingByUser = {};
    if (!st.failLog) st.failLog = [];
    if (!st.failUnitCounts) st.failUnitCounts = {};

    const userId = baseMessage.author.id;
    if (!st.lastMissingByUser[userId]) st.lastMissingByUser[userId] = {};

    const missing = getMissingRequiredOptions(learned, collected);
    const now = Date.now();
    for (const optName of missing) st.lastMissingByUser[userId][optName] = now;

    const minedUnits = mineUnitTokensAroundNumbers(String(originalBody || ""));
    for (const u of minedUnits) incrementCount(st.failUnitCounts, u, 1);

    st.failLog.push({
  at: now,
  userId,
  reason: String(reason || "UNKNOWN"),
  missing,
  text: String(originalBody || "").slice(0, 400),
  note: note ? String(note).slice(0, 200) : undefined
});
    if (st.failLog.length > 50) st.failLog.splice(0, st.failLog.length - 50);
    promotePendingNumberSynonyms(store, learned);
    saveStore(store);
  } catch {}
}


async function finishAndRun(baseMessage, session, learned) {
  const execRes = await tryExecuteLearned(baseMessage.client, baseMessage, learned, session.data, session.origText || "");
  if (!execRes.ok) {
    autoLearnAfterFailure(baseMessage, learned, session.data, session.origText || "", execRes.reason, execRes.errorMsg);
    const summary = summarizePlan(baseMessage.guild, learned, session.data);
    await baseMessage.channel.send(`실행 실패: /${learned.name} (${execRes.reason})\n${summary}`);
  }
  endSession(baseMessage.author.id);
}


function getInlineHintByType(t) {
  switch (t) {
    case "STRING": return `→ "내용" 또는 사유: 내용`;
    case "NUMBER": return `→ 숫자 먼저, 단위 뒤 (예: 2.5 갓비트)`;
    case "USER": return `→ 멘션/닉네임/‘나’ 가능`;
    case "ROLE": return `→ 역할 멘션/이름`;
    case "CHANNEL": return `→ 채널 멘션/이름`;
    case "BOOLEAN": return `→ 예/아니오`;
    case "MENTIONABLE": return `→ 유저/역할 멘션`;
    case "ATTACHMENT": return `→ 파일 첨부`;
    default: return ``;
  }
}

async function askNextOption(message, session, learned) {
  await fillMissingOptions(message, session, learned);
  while (session.currIndex < session.expectedOptions.length) {
    const opt = session.expectedOptions[session.currIndex];
    if (!opt) break;
    const name = opt.name;
    if (session.data[name] == null || session.data[name] === "") {
      session.awaiting = { type: opt.type, name };
const reqText = opt.required ? "[필수]" : "[선택]";
const hint = getInlineHintByType(opt.type);

let prevHint = "";
try {
  const store = loadStore();
  const st = store.stats && store.stats[learned.name];
  const last = st && st.lastMissingByUser && st.lastMissingByUser[message.author.id] && st.lastMissingByUser[message.author.id][name];
  if (last) prevHint = " (지난번에 빠졌던 옵션)";
} catch {}

await message.channel.send(`값을 알려줘 ${reqText} ${name} (${opt.type})${prevHint} ${hint}`);
return;
    } else {
      session.currIndex++;
    }
  }
  await finishAndRun(message, session, learned);
}

function getTypeHintLine(opt) {
  const nm = opt.name;
  const syn = (opt.synonyms || []).slice(0, 6).map(prettySyn).join("/");
  const req = opt.required ? "필수" : "선택";
  switch (opt.type) {
    case "STRING":
      return `• ${req} ${nm} [STRING] → "내용" 또는 (${syn || DefaultOptionSynonyms.STRING.join("/")}) : 내용  예) 사유: 출석 보상  /  "출석 보상"`;
    case "NUMBER":
      return `• ${req} ${nm} [NUMBER] → 소수점/음수 가능. [숫자] [단위] 형태 추천  예) 2.5 갓비트,  -10 원`;
    case "USER":
      return `• ${req} ${nm} [USER] → 멘션/닉네임/‘나’ 인식  예) 민수에게, <@1234567890>에게`;
    case "ROLE":
      return `• ${req} ${nm} [ROLE] → 역할 멘션/이름 인식  예) <@&987654321> 역할`;
    case "CHANNEL":
      return `• ${req} ${nm} [CHANNEL] → 채널 멘션/이름 인식  예) <#12345>  /  302호`;
    case "BOOLEAN":
      return `• ${req} ${nm} [BOOLEAN] → 예/네/yes/true  또는  아니오/no/false`;
    case "MENTIONABLE":
      return `• ${req} ${nm} [MENTIONABLE] → 유저/역할 멘션 인식`;
    case "ATTACHMENT":
      return `• ${req} ${nm} [ATTACHMENT] → 파일 첨부`;
    default:
      return `• ${req} ${nm} [${opt.type}]`;
  }
}

function buildUsageExamples(schema) {
  const opts = schema.options || [];
  const partsNatural = [];
  const partsKeyword = [];

  for (const o of opts) {
    const nm = o.name;
    switch (o.type) {
      case "USER":
        partsNatural.push("민수에게");
        partsKeyword.push(`${nm}: @민수`);
        break;
      case "NUMBER":
        partsNatural.push("2.5 갓비트");
        partsKeyword.push(`${nm}: 2.5`);
        break;
      case "STRING":
        partsNatural.push(`사유 "출석 보상"`);
        partsKeyword.push(`${nm}: 출석 보상`);
        break;
      case "ROLE":
        partsNatural.push("관리자 역할");
        partsKeyword.push(`${nm}: @관리자`);
        break;
      case "CHANNEL":
        partsNatural.push("302호로");
        partsKeyword.push(`${nm}: 302호`);
        break;
      case "BOOLEAN":
        partsNatural.push("포함 예");
        partsKeyword.push(`${nm}: 예`);
        break;
      case "MENTIONABLE":
        partsNatural.push("대상 @VIP");
        partsKeyword.push(`${nm}: @VIP`);
        break;
      case "ATTACHMENT":
        partsNatural.push("파일 첨부");
        partsKeyword.push(`${nm}: (파일첨부)`);
        break;
    }
  }

  const nat = partsNatural.join(" ");
  const key = partsKeyword.join("  ");

  return [
    `예시(자연어형): 갓봇! ${nat}`.trim(),
    `예시(키워드형): 갓봇! ${schema.name}  ${key}`.trim(),
  ].filter(Boolean);
}

function buildLearnGuide(schema) {
  const lines = [];
  lines.push(`명령어: /${schema.name}`);
  lines.push(`— 입력 규칙 요약 —`);
  lines.push(`· 문자열: "내용" 또는 (${DefaultOptionSynonyms.STRING.join("/")}) : 내용`);
  lines.push(`· 숫자: 소수점/음수 가능, [숫자][단위] 근접 우선 (${DefaultOptionSynonyms.NUMBER.join("/")})`);
  lines.push(`· 유저: 멘션/닉네임/‘나’ 인식`);
  lines.push(`· 취소: ${CANCEL_WORDS.join(", ")}`);
  lines.push(``);
  if ((schema.options || []).length) {
    lines.push(`— 옵션별 안내 —`);
    for (const o of schema.options) lines.push(getTypeHintLine(o));
    lines.push(``);
  }
  const ex = buildUsageExamples(schema);
  if (ex.length) {
    lines.push(`— 사용 예시 —`);
    for (const e of ex) lines.push(e);
  }
  return lines.join("\n");
}

function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function extractBracketTokens(text) {
  const out = [];
  const re = /\[\s*([^\[\]]{1,64})\s*\]/g;
  let m;
  while ((m = re.exec(String(text || "")))) {
    const t = m[1].trim();
    if (t) out.push(t);
  }
  return out;
}

async function startLearnFlow(client, message, slashName) {
  const name = (slashName || "").replace(/^\/+/, "").trim();
  if (!name) {
    await message.reply("학습할 슬래시 명령어를 '/명령어' 형태로 적어줘.");
    return;
  }
  const schema = await fetchSlashSchema(client, message.guild, name);
  if (!schema) {
    await message.reply(`/${name} 명령어를 찾을 수 없어.`);
    return;
  }
  const store = loadStore();
  if (!store.commands[name]) {
    store.commands[name] = { name: schema.name, id: schema.id, description: schema.description, options: schema.options, subcommands: schema.subcommands || [], synonyms: [] };
    saveStore(store);
  }

  const guide = buildLearnGuide(schema);
  await message.channel.send(guide);

  const s = newSession(message.author.id);
  s.mode = "learn";
  s.commandName = name;
  s.channelId = message.channelId;
  s.expectedOptions = [];
  s.currIndex = 0;
  await message.channel.send(`/${name} 키워드를 ,로 적어줘. 예: 정수,지급,송금,보내`);
  s.awaiting = { type: "LEARN_SYNONYMS" };
}

async function handleLearnInput(message) {
  const s = getSession(message.author.id);
  if (!s || s.mode !== "learn") return false;
  const store = loadStore();
  const learned = store.commands[s.commandName];
  if (!learned) {
    endSession(message.author.id);
    await message.reply("세션이 만료되었어. 다시 학습을 시작해줘.");
    return true;
  }
  const txt = normalizeKorean(stripTrigger(message.content));
  if (CANCEL_WORDS.includes(txt)) {
    endSession(message.author.id);
    await message.reply("학습을 취소했어.");
    return true;
  }
  if (s.awaiting?.type === "LEARN_SYNONYMS") {
    const syns = parseSynonymsInput(txt);
    learned.synonyms = Array.from(new Set([...(learned.synonyms || []), ...syns]));
    saveStore(store);
    s.awaiting = { type: "LEARN_OPT_SYNONYMS", idx: 0 };
    const next = learned.options?.[0];
    if (!next) {
      endSession(message.author.id);
      await message.reply("옵션이 없는 명령어라 학습 완료!");
      return true;
    }
    await message.reply(`${next.name} (${next.type}) 인식 키워드를 ,로 적어줘. 건너뛰려면 '건너뛰기'`);
    return true;
  }
  if (s.awaiting?.type === "LEARN_OPT_SYNONYMS") {
    const idx = s.awaiting.idx || 0;
    const opt = learned.options?.[idx];
    if (!opt) {
      endSession(message.author.id);
      await message.reply("학습 완료!");
      return true;
    }
    if (txt !== "건너뛰기") {
      const syns = parseSynonymsInput(txt);
      opt.synonyms = Array.from(new Set([...(opt.synonyms || []), ...syns]));
      saveStore(store);
    }
    const nextIdx = idx + 1;
    const next = learned.options?.[nextIdx];
    if (!next) {
      endSession(message.author.id);
      await message.reply("학습 완료!");
      return true;
    }
    await message.reply(`${next.name} (${next.type}) 인식 키워드를 ,로 적어줘. 건너뛰려면 '건너뛰기'`);
    s.awaiting = { type: "LEARN_OPT_SYNONYMS", idx: nextIdx };
    return true;
  }
  return false;
}

function optionCoverage(learned, prefill) {
  const req = (learned.options || []).filter(o => o.required);
  const filled = req.filter(o => prefill[o.name] !== undefined && prefill[o.name] !== null && prefill[o.name] !== "").length;
  return { reqCount: req.length, filled };
}

function scoreCommandByText(guild, body, learned, author) {
  const lc = body.toLowerCase();
  let score = 0;
  if (lc.includes(learned.name)) score += 5;
  const synHits = (learned.synonyms || []).reduce((a, s) => a + (s && lc.includes(String(s).toLowerCase()) ? 1 : 0), 0);
  score += synHits * 2;
  const prefill = extractFromText(guild, body, learned, author);
  const { reqCount, filled } = optionCoverage(learned, prefill);
  score += filled * 6;
  score -= (reqCount - filled) * 4;
  const types = new Set((learned.options || []).map(o => o.type));
  if (types.has("NUMBER") && /-?\d+(?:[.,]\d+)?/.test(body)) score += 2;
  if (types.has("USER") && /(나|저|내|본인|자신)|<@!?\d+>/.test(body)) score += 2;
  if (types.has("CHANNEL") && /<#\d+>/.test(body)) score += 2;
  return { score, prefill };
}

function pickBestCommand(guild, body, entries, author) {
  let best = null;
  for (const c of entries) {
    const { score, prefill } = scoreCommandByText(guild, body, c, author);
    if (!best || score > best.score || (score === best.score && (prefill && Object.keys(prefill).length) > (best.prefill && Object.keys(best.prefill).length))) {
      best = { cmd: c, score, prefill };
    }
  }
  return best;
}

function norm(s) {
  return normalizeKey(s || "");
}

const LIST_JOIN_WORDS = /\s*(와|과|및|그리고|랑)\s*/g;
function splitByListDelims(text) {
  return String(text || "")
    .replace(LIST_JOIN_WORDS, ",")
    .split(/[,，、·]+/g)
    .map(s => s.trim())
    .filter(Boolean);
}

function findRoleByToken(guild, token) {
  const t = norm(token);
  if (!t) return null;
  let best = null;
  for (const [, role] of guild.roles.cache) {
    const rn = norm(role.name);
    const hit = rn.includes(t) ? rn.length : 0;
    if (hit > 0 && (!best || hit > best.hit)) best = { role, hit };
  }
  return best ? best.role : null;
}

function textIncludesAny(text, arr) {
  const n = norm(text);
  return arr.some(t => n.includes(norm(t)));
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
    if (score > 0 && (!best || score > best.score ||
        (score === best.score && cn.length < norm(best.ch.name).length))) {
      best = { ch, score };
    }
  }
  return (best && best.score >= 0.45) ? best.ch : null;
}

function fuzzyFindRoleInText(guild, content) {
  const rm = content.match(/<@&(\d+)>/);
  if (rm) {
    const role = guild.roles.cache.get(rm[1]);
    if (role) return role;
  }
  const bracketTokens = extractBracketTokens(content);
  for (const tok of bracketTokens) {
    const rExact = guild.roles.cache.find(x => norm(x.name) === norm(tok));
    if (rExact) return rExact;
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
    const mem =
      findMemberByToken(guild, chunk) ||
      fuzzyFindMemberInText(guild, chunk, author);
    if (mem) out.set(mem.id, mem);
  }
  if (!out.size) {
    const one = fuzzyFindMemberInText(guild, content, author);
    if (one) out.set(one.id, one);
  }
  return Array.from(out.values());
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
  const bracketTokens = extractBracketTokens(raw);
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

function extractRenameTarget(content) {
  const q = content.match(/["“]([^"”]+)["”]/);
  if (q && q[1]) return q[1].trim();
  const m1 = content.match(/이름(?:을|를)?\s+(.+?)\s*(?:으로|로)\s*(?:[^ ]+)?\s*(?:바꿔|변경|수정|교체|rename)/i);
  if (m1 && m1[1]) return m1[1].trim();
  const m2 = content.match(new RegExp(`(?:${NICK_LABELS.concat(["이름"]).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")})(?:을|를)?\\s+(.+?)\\s*(?:으로|로)\\s*(?:${CHANGE_VERBS.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")})`,"i"));
  if (m2 && m2[1]) return m2[1].trim();
  const m3 = content.match(/(?:을|를)\s+(.+?)\s*(?:으로|로)\s*(?:바꿔|변경|수정|교체|rename)/i);
  if (m3 && m3[1]) return m3[1].trim();
  return null;
}

function hasBotPerm(guild, flag) {
  const me = guild.members.me;
  return !!(me && me.permissions && me.permissions.has(flag));
}

let DATA_CACHE = { builtAt: 0, sig: "", items: [], tokenIndex: {}, userIndex: {} };

function isDiscordIdLike(v) {
  return typeof v === "string" && /^\d{15,22}$/.test(v);
}
function fileSig(file) {
  try {
    const st = fs.statSync(file);
    return `${path.basename(file)}:${st.size}:${st.mtimeMs}`;
  } catch { return `${path.basename(file)}:0:0`; }
}
function buildDirSignature(dir) {
  const files = [];
  (function walk(p) {
    const ent = fs.readdirSync(p, { withFileTypes: true });
    for (const e of ent) {
      const fp = path.join(p, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.isFile() && /\.json$/i.test(e.name) && fp !== STORE_PATH && fp !== DATA_INDEX_PATH) files.push(fp);
    }
  })(dir);
  const parts = [];
  for (const f of files) parts.push(fileSig(f));
  return parts.sort().join("|");
}
function tokensFromPath(p) {
  const segs = String(p).split(/[\.\[\]\/#]+/g).filter(Boolean);
  const toks = new Set();
  for (const s of segs) {
    const n = normalizeKey(s);
    if (n) toks.add(n);
    for (const [base, syns] of Object.entries(KNOWN_KEY_SYNONYMS)) {
      if (n === base || syns.some(x => normalizeKey(x) === n)) {
        toks.add(base);
        for (const sx of syns) toks.add(normalizeKey(sx));
      }
    }
  }
  return Array.from(toks);
}
function flattenJson(obj, basePath = "", acc = [], foundUserIds = new Set()) {
  if (obj === null || obj === undefined) return;
  const t = typeof obj;
  if (t !== "object") {
    acc.push({ path: basePath || "$", value: obj, type: t });
    return;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      flattenJson(obj[i], basePath ? `${basePath}[${i}]` : `[${i}]`, acc, foundUserIds);
    }
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    const p = basePath ? `${basePath}.${k}` : k;
    if (isDiscordIdLike(k)) foundUserIds.add(k);
    if (typeof v === "string" && isDiscordIdLike(v)) foundUserIds.add(v);
    if (typeof v === "object" && v && typeof v.id === "string" && isDiscordIdLike(v.id)) foundUserIds.add(v.id);
    if (typeof v === "object" && v && ("userId" in v) && isDiscordIdLike(`${v.userId}`)) foundUserIds.add(`${v.userId}`);
    flattenJson(v, p, acc, foundUserIds);
  }
}
function ensureDataIndex(force = false) {
  ensureStore();
  const now = Date.now();
  if (!force && now - DATA_CACHE.builtAt < DATA_INDEX_TTL_MS) return DATA_CACHE;
  const sig = buildDirSignature(DATA_DIR);
  if (!force && DATA_CACHE.sig && DATA_CACHE.sig === sig) {
    DATA_CACHE.builtAt = now;
    return DATA_CACHE;
  }
  const items = [];
  const tokenIndex = {};
  const userIndex = {};
  const files = [];
  (function walk(p) {
    const ent = fs.readdirSync(p, { withFileTypes: true });
    for (const e of ent) {
      const fp = path.join(p, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.isFile() && /\.json$/i.test(e.name) && fp !== STORE_PATH && fp !== DATA_INDEX_PATH) files.push(fp);
    }
  })(DATA_DIR);
  for (const f of files) {
    try {
      const st = fs.statSync(f);
      if (st.size > MAX_JSON_BYTES) continue;
      const raw = fs.readFileSync(f, "utf8");
      const data = JSON.parse(raw);
      const rows = [];
      const users = new Set();
      flattenJson(data, "", rows, users);
      for (const r of rows) {
        const toks = tokensFromPath(r.path);
        const rec = { file: f, path: r.path, tokens: toks, userIds: Array.from(users), type: r.type, value: r.value };
        items.push(rec);
        for (const t of toks) {
          if (!tokenIndex[t]) tokenIndex[t] = [];
          tokenIndex[t].push(rec);
        }
      }
      for (const uid of users) {
        if (!userIndex[uid]) userIndex[uid] = [];
        userIndex[uid].push(f);
      }
    } catch {}
  }
  DATA_CACHE = { builtAt: now, sig, items, tokenIndex, userIndex };
  try {
    fs.writeFileSync(DATA_INDEX_PATH, JSON.stringify({ builtAt: now, sig, count: items.length }, null, 2));
  } catch {}
  return DATA_CACHE;
}
function isDataQueryIntent(text) {
  const lc = text.toLowerCase();
  return DATA_QUERY_TOKENS.some(t => lc.includes(t)) || /\bjson\b/i.test(text) || /데이터|정보|값|수치|현황/.test(text);
}
function extractKeyTokensFromQuery(content) {
  const br = extractBracketTokens(content).map(normalizeKey);
  const q = [];
  const words = String(content || "").split(/\s+/g).map(w => normalizeKey(w)).filter(Boolean);
  for (const w of words) {
    if (w.length < 2) continue;
    if (/^\d+$/.test(w)) continue;
    if (["알려줘","조회","보여줘","검색","찾아","정보","데이터","json","현황","목록","리스트","수치","값","좀","해줘","해주세요","해주세요"].includes(w)) continue;
    q.push(w);
  }
  const uniq = Array.from(new Set([...br, ...q]));
  if (!uniq.length) return [];
  const expanded = new Set(uniq);
  for (const [base, syns] of Object.entries(KNOWN_KEY_SYNONYMS)) {
    if (uniq.some(x => x === base || syns.map(normalizeKey).includes(x))) {
      expanded.add(base);
      for (const s of syns) expanded.add(normalizeKey(s));
    }
  }
  return Array.from(expanded).filter(Boolean);
}
function bestDataMatchesForUser(index, userId, keyTokens, content) {
  const scored = [];
  const seen = new Set();
  for (const rec of index.items) {
    if (!rec.userIds || !rec.userIds.includes(userId)) continue;
    let matchCount = 0;
    for (const kt of keyTokens) if (rec.tokens.includes(kt)) matchCount++;
    if (matchCount === 0) continue;
    const sim = roleSimilarity(content, `${rec.path}`);
    const score = matchCount * 1.0 + sim;
    const key = `${rec.file}|${rec.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      scored.push({ rec, score, matchCount, sim });
    }
  }
  scored.sort((a,b)=> b.score - a.score);
  return scored.slice(0, 8);
}
function bestDataMatchesGlobal(index, keyTokens, content) {
  const scored = [];
  const seen = new Set();
  for (const rec of index.items) {
    let matchCount = 0;
    for (const kt of keyTokens) if (rec.tokens.includes(kt)) matchCount++;
    if (matchCount === 0) continue;
    const sim = roleSimilarity(content, `${rec.path}`);
    const score = matchCount * 1.0 + sim;
    const key = `${rec.file}|${rec.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      scored.push({ rec, score, matchCount, sim });
    }
  }
  scored.sort((a,b)=> b.score - a.score);
  return scored.slice(0, 8);
}
async function handleDataQuery(message, content, opts = {}) {
  const serverMode = !!opts.serverMode; // NEW
  const index = ensureDataIndex(false);

  const members = findAllMembersInText(message.guild, content, message.author);
  let targets = members.map(m => m.id);
  if (!targets.length && /(나|저|내|본인|자신)/.test(content)) targets = [message.author.id];
  const keyTokens = extractKeyTokensFromQuery(content);

  if (!keyTokens.length) {
    await message.reply('조회 키워드를 "따옴표"나 [대괄호]로 적어줘.');
    return true;
  }
  if (!targets.length && !serverMode) {
    if (SERVER_QUERY_HINTS.some(t => content.includes(t))) {
      return false; 
    }
    await message.reply("대상 유저를 못 찾았어.");
    return true;
  }
  if (serverMode) {
    const best = bestDataMatchesGlobal(index, keyTokens, content).filter(x => x.score >= 1.0);
    if (!best.length) return false; 
    const lines = [];
    lines.push(`서버 데이터`);
    for (const b of best.slice(0, 5)) {
      const v = b.rec.value;
      let sv;
      if (typeof v === "object") {
        try { sv = JSON.stringify(v).slice(0, 400); } catch { sv = String(v); }
      } else {
        sv = String(v);
      }
      lines.push(`• ${path.basename(b.rec.file)} :: ${b.rec.path} = ${sv}`);
    }
    await message.reply(lines.join("\n"));
    return true;
  }
  const lines = [];
  for (const uid of targets.slice(0,3)) {
    const best = bestDataMatchesForUser(index, uid, keyTokens, content).filter(x => x.score >= 1.0);
    if (!best.length) continue;
    lines.push(`유저 <@${uid}>`);
    for (const b of best.slice(0,3)) {
      const v = b.rec.value;
      let sv;
      if (typeof v === "object") {
        try { sv = JSON.stringify(v).slice(0, 400); } catch { sv = String(v); }
      } else {
        sv = String(v);
      }
      lines.push(`• ${path.basename(b.rec.file)} :: ${b.rec.path} = ${sv}`);
    }
    lines.push("");
  }
  if (!lines.length) {
    await message.reply("일치하는 데이터가 없어.");
  } else {
    await message.reply(lines.join("\n").trim());
  }
  return true;
}


async function handleBuiltinIntent(message, content) {
  const guild = message.guild;
  const author = message.author;
  const body = normalizeKorean(stripTrigger(content));
  const lc = body.toLowerCase();

  if (isDataQueryIntent(lc)) {
  if (hasUserTargetInText(body)) {
    const ok = await handleDataQuery(message, body);
    if (ok) return true;
  } else if ( SERVER_QUERY_HINTS.some(t => body.includes(t)) ) {
    const ok = await handleDataQuery(message, body, { serverMode: true });
    if (ok) return true;
  }
}

  if (
    (CHAT_LABELS.some(k => lc.includes(k)) && DELETE_VERBS.some(v => lc.includes(v))) ||
    /\d+\s*개\s*(?:씩)?\s*(?:지워|삭제|제거|없애|날려|비워|청소|클리어|clear|purge)/.test(lc)
  ) {
    let n = parseFloatAny(body);
    n = Number.isFinite(n) ? Math.trunc(n) : 5;
    n = Math.max(1, Math.min(100, n));
    let targetCh = fuzzyFindAnyChannelInText(guild, body) || message.channel;
    const me = guild.members.me;
    if (!me || !targetCh.permissionsFor(me)?.has(PermissionsBitField.Flags.ManageMessages)) {
      await message.reply("실패: 봇에 해당 채널의 **메시지 관리** 권한이 없어.");
      return true;
    }
    if (!targetCh.isTextBased?.() || typeof targetCh.bulkDelete !== "function") {
      await message.reply("실패: 이 채널 유형은 일괄 삭제를 지원하지 않아.");
      return true;
    }
    try {
      const fetched = await targetCh.messages.fetch({ limit: Math.min(100, n + 1) });
      const filtered = fetched.filter(m => m.id !== message.id);
      const toDelete = filtered.first(n);
      const col = await targetCh.bulkDelete(new Collection(toDelete.map(m => [m.id, m])), true);
      const ok = col?.size || 0;
      const where = (targetCh.id === message.channel.id) ? "" : `#${targetCh.name}에서 `;
      await message.reply(`${where}${ok}개 삭제 완료 (요청: ${n}개)`);
    } catch (e) {
      try {
        await message.channel.send("삭제 실패: 14일 지난 메시지는 삭제할 수 없거나, 스레드/채널 상태를 확인해줘.");
      } catch {}
    }
    return true;
  }

  if (MUTE_ON_TOKENS.some(t=>lc.includes(t)) || MUTE_OFF_TOKENS.some(t=>lc.includes(t)) || DEAF_ON_TOKENS.some(t=>lc.includes(t)) || DEAF_OFF_TOKENS.some(t=>lc.includes(t)) || /마이크|스피커|헤드셋|귀|음소거|뮤트|청각/.test(lc)) {
    if (!hasBotPerm(guild, PermissionsBitField.Flags.MuteMembers) && !hasBotPerm(guild, PermissionsBitField.Flags.DeafenMembers)) {
      await message.reply("실패: 봇에 음소거/청각 차단 권한이 없어.");
      return true;
    }
    let targets = findAllMembersInText(guild, body, author);
    const wantAll = ALL_TOKENS.some(t => lc.includes(t));
    if (!targets.length && wantAll) {
      const chs = findAllVoiceChannelsInText(guild, body);
      if (chs.length) {
        const map = new Map();
        for (const ch of chs) {
          for (const [, mem] of ch.members) map.set(mem.id, mem);
        }
        targets = Array.from(map.values());
      }
    }
    if (!targets.length && /(여기|이 방|현재 방|이 채널|현재 채널)/.test(lc)) {
      const me = guild.members.cache.get(author.id);
      const ch = me?.voice?.channel;
      if (ch) targets = Array.from(ch.members.values());
    }
    if (!targets.length) {
      await message.reply("대상 유저를 못 찾았어.");
      return true;
    }
    const wantMuteOn = MUTE_ON_TOKENS.some(t=>lc.includes(t)) || (/마이크/.test(lc) && /꺼|off/.test(lc)) || /입\s*막/.test(lc);
    const wantMuteOff = MUTE_OFF_TOKENS.some(t=>lc.includes(t)) || (/마이크/.test(lc) && (/켜|on|해제/.test(lc)));
    const wantDeafOn = DEAF_ON_TOKENS.some(t=>lc.includes(t)) || ((/스피커|헤드셋|귀|청각/.test(lc)) && /꺼|닫|막|차단/.test(lc));
    const wantDeafOff = DEAF_OFF_TOKENS.some(t=>lc.includes(t)) || ((/스피커|헤드셋|귀|청각/.test(lc)) && (/켜|열|풀|해제/.test(lc)));
    try {
      let ok = 0;
      for (const mem of targets) {
        const v = mem.voice;
        if (!v) continue;
        if (wantMuteOn || wantMuteOff) await v.setMute(!!wantMuteOn, "갓봇 명령");
        if (wantDeafOn || wantDeafOff) await v.setDeaf(!!wantDeafOn, "갓봇 명령");
        ok++;
      }
      await message.reply(`${ok}명 처리 완료`);
    } catch {
      await message.reply("실패했어. 권한 또는 보이스 상태를 확인해줘.");
    }
    return true;
  }

  if (textIncludesAny(lc, MOVE_VERBS) && /(으로|로)/.test(lc)) {
    if (!hasBotPerm(guild, PermissionsBitField.Flags.MoveMembers)) {
      await message.reply("실패: 봇에 멤버 이동 권한이 없어.");
      return true;
    }
    const wantAll = ALL_TOKENS.some(t => lc.includes(t));
    let members = findAllMembersInText(guild, body, author);
    const voiceChs = findAllVoiceChannelsInText(guild, body);
    let targetCh = null;
    if (wantAll && voiceChs.length >= 2) {
      targetCh = voiceChs[voiceChs.length - 1];
      const srcs = voiceChs.slice(0, -1);
      const map = new Map();
      for (const ch of srcs) for (const [, m] of ch.members) map.set(m.id, m);
      members = Array.from(map.values());
    }
    if (wantAll && !members.length && voiceChs.length === 1 && /(여기|이 방|현재 방|이 채널|현재 채널)/.test(lc)) {
      const me = guild.members.cache.get(author.id);
      const here = me?.voice?.channel;
      if (here) members = Array.from(here.members.values());
      targetCh = voiceChs[0];
    }
    if (!members.length && /(여기|이 방|현재 방|이 채널|현재 채널|모두|다)/.test(lc)) {
      const me = guild.members.cache.get(author.id);
      const ch = me?.voice?.channel;
      if (ch) members = Array.from(ch.members.values());
    }
    if (!targetCh) {
      if (!voiceChs.length) {
        await message.reply("이동할 음성채널을 못 찾았어.");
        return true;
      }
      targetCh = voiceChs[voiceChs.length - 1] || voiceChs[0];
    }
    if (!members.length) {
      await message.reply("이동할 유저를 못 찾았어.");
      return true;
    }
    let moved = 0;
    for (const m of members) {
      try {
        await m.voice.setChannel(targetCh.id, "갓봇 이동");
        moved++;
      } catch {}
    }
    await message.reply(`${moved}명 → ${targetCh.name} 이동 완료`);
    return true;
  }

  if (textIncludesAny(lc, CHANGE_VERBS) && NICK_LABELS.some(k=>lc.includes(k)) ) {
    if (!hasBotPerm(guild, PermissionsBitField.Flags.ManageNicknames)) {
      await message.reply("실패: 봇에 닉네임 변경 권한이 없어.");
      return true;
    }
    const targets = findAllMembersInText(guild, body, author);
    if (!targets.length) {
      await message.reply("닉네임을 바꿀 유저를 못 찾았어.");
      return true;
    }
    const newNick = extractRenameTarget(body);
    if (!newNick) {
      await message.reply("바꿀 닉네임을 알려줘.");
      return true;
    }
    let ok = 0;
    for (const mem of targets) {
      try {
        await mem.setNickname(newNick.slice(0, 32), "갓봇 닉네임 변경");
        ok++;
      } catch {}
    }
    await message.reply(`${ok}명 닉네임을 '${newNick}'(으)로 변경했어`);
    return true;
  }

  if (textIncludesAny(lc, CHANGE_VERBS) && CHANNEL_LABELS.some(k=>lc.includes(k)) && lc.includes("이름")) {
    let targets = findAllAnyChannelsInText(guild, body);
    if (!targets.length) {
      const single = fuzzyFindAnyChannelInText(guild, body);
      if (single) targets = [single];
    }
    if (!targets.length) {
      await message.reply("이름을 바꿀 채널을 못 찾았어.");
      return true;
    }
    const newName = extractRenameTarget(body);
    if (!newName) {
      await message.reply("바꿀 채널 이름을 알려줘.");
      return true;
    }
    let ok = 0;
    for (const ch of targets) {
      try {
        await ch.setName(newName.slice(0, 100), "갓봇 채널 이름 변경");
        ok++;
      } catch {}
    }
    await message.reply(`${ok}개 채널 이름을 '${newName}'(으)로 변경했어`);
    return true;
  }

  if (ROLE_LABELS.some(k=>lc.includes(k)) && REMOVE_ROLE_VERBS.some(v=>lc.includes(v))) {
    if (!hasBotPerm(guild, PermissionsBitField.Flags.ManageRoles)) {
      await message.reply("실패: 봇에 역할 관리 권한이 없어.");
      return true;
    }
    const members = findAllMembersInText(guild, body, author);
    const roles = findAllRolesInText(guild, body);
    if (!members.length) {
      await message.reply("역할을 뺄 유저를 못 찾았어.");
      return true;
    }
    if (!roles.length) {
      await message.reply("제거할 역할을 못 찾았어.");
      return true;
    }
    let ok = 0;
    for (const mem of members) {
      for (const role of roles) {
        try { await mem.roles.remove(role, "갓봇 역할 제거"); ok++; } catch {}
      }
    }
    await message.reply(`${members.length}명에게 ${roles.length}개 역할 제거 완료 (${ok}회 적용)`);
    return true;
  }

  if (ROLE_LABELS.some(k=>lc.includes(k)) && GIVE_ROLE_VERBS.some(v=>lc.includes(v))) {
    if (!hasBotPerm(guild, PermissionsBitField.Flags.ManageRoles)) {
      await message.reply("실패: 봇에 역할 관리 권한이 없어.");
      return true;
    }
    const members = findAllMembersInText(guild, body, author);
    const roles = findAllRolesInText(guild, body);
    if (!members.length) {
      await message.reply("역할을 줄 유저를 못 찾았어.");
      return true;
    }
    if (!roles.length) {
      await message.reply("지급할 역할을 못 찾았어.");
      return true;
    }
    let ok = 0;
    for (const mem of members) {
      for (const role of roles) {
        try { await mem.roles.add(role, "갓봇 역할 지급"); ok++; } catch {}
      }
    }
    await message.reply(`${members.length}명에게 ${roles.length}개 역할 지급 완료 (${ok}회 적용)`);
    return true;
  }

  return false;
}

async function fillMissingOptions(message, session, learned) {
  const store = loadStore();
  for (let i = 0; i < session.expectedOptions.length; i++) {
    const o = session.expectedOptions[i];
    const has = session.data[o.name] !== undefined && session.data[o.name] !== null && session.data[o.name] !== "";
    if (has) continue;
    const last = getOptionLastUsed(store, learned.name, message.author.id, o.name);
    if (last != null) {
      session.data[o.name] = last;
    }
  }
  for (let i = 0; i < session.expectedOptions.length; i++) {
    const o = session.expectedOptions[i];
    const has = session.data[o.name] !== undefined && session.data[o.name] !== null && session.data[o.name] !== "";
    if (!has) { session.currIndex = i; return; }
  }
  session.currIndex = session.expectedOptions.length;
}

async function startNlpFlow(client, message, content) {
  const handled = await handleBuiltinIntent(message, content);
  if (handled) return;
  const store = loadStore();
  const entries = Object.values(store.commands || {});
  if (!entries.length) {
    await message.reply("아직 학습된 명령어가 없어. '갓봇! 학습 /명령어'로 먼저 학습시켜줘.");
    return;
  }
  const body = stripTrigger(content);
  const lc = body.toLowerCase();

  const candidates = entries.filter(c => {
    const hitName = lc.includes(c.name);
    const hitSyn = (c.synonyms || []).some(s => s && lc.includes(String(s).toLowerCase()));
    return hitName || hitSyn;
  });
  if (!candidates.length) {
    await message.reply("크으억! 무슨 명령인지 이해하지 못했습니다, 마스터!!");
    return;
  }
  const picked = pickBestCommand(message.guild, body, candidates, message.author);
  const match = picked.cmd;

  const s = newSession(message.author.id);
  s.mode = "exec";
  s.commandName = match.name;
  s.channelId = message.channelId;

  const allOpts = (match.options || []).slice(0);
  s.requiredOptions = allOpts.filter(o => o.required);
  s.optionalOptions = allOpts.filter(o => !o.required);
  s.expectedOptions = s.requiredOptions.slice(0);
  s.currIndex = 0;
  s.origText = body;

  const prefill = picked.prefill || extractFromText(message.guild, body, match, message.author);
  s.data = { ...prefill };
  for (let i = 0; i < s.expectedOptions.length; i++) {
    const o = s.expectedOptions[i];
    if (o.required && (s.data[o.name] == null || s.data[o.name] === "")) { s.currIndex = i; break; }
    if (!o.required && (s.data[o.name] == null)) { s.currIndex = i; break; }
    s.currIndex = i + 1;
  }
  await askNextOption(message, s, match);
}

async function handleExecInput(message) {
  const s = getSession(message.author.id);
  if (!s || s.mode !== "exec") return false;
  const store = loadStore();
  const learned = store.commands[s.commandName];
  if (!learned) {
    endSession(message.author.id);
    await message.reply("세션이 만료되었어. 다시 시도해줘.");
    return true;
  }
  const txt = normalizeKorean(stripTrigger(message.content));
  if (CANCEL_WORDS.includes(txt)) {
    endSession(message.author.id);
    await message.reply("취소했어.");
    return true;
  }
  const awaiting = s.awaiting;
  if (!awaiting) return false;

  if (awaiting.type === "BOOLEAN") {
    const t = txt.toLowerCase();
    if (["예", "네", "ㅇ", "y", "yes", "true"].includes(t)) s.data[awaiting.name] = true;
    else if (["아니오", "아니요", "ㄴ", "n", "no", "false"].includes(t)) s.data[awaiting.name] = false;
    else if (t === "건너뛰기") {}
    else {
      await message.reply("예/아니오 또는 '건너뛰기'로 답해줘.");
      return true;
    }
    s.currIndex++;
    s.awaiting = null;
    await askNextOption(message, s, learned);
    return true;
  }

  if (awaiting.type === "USER") {
    let v = null;
    const m = txt.match(/<@!?(\d+)>/);
    if (m) {
      const member = message.guild.members.cache.get(m[1]);
      if (member) v = member.user;
    } else {
      const selfHit = /(나|저|내|본인|자신)/.test(txt);
      if (selfHit) v = message.author;
      if (!v) {
        const mem = findMemberByToken(message.guild, txt);
        if (mem) v = mem.user;
      }
    }
    if (!v) {
      await message.reply("유저를 못 찾았어. 닉네임만 적어도 돼.");
      return true;
    }
    s.data[awaiting.name] = v;
    s.currIndex++;
    s.awaiting = null;
    await askNextOption(message, s, learned);
    return true;
  }

  if (awaiting.type === "NUMBER") {
    const num = parseFloatAny(txt);
    if (!Number.isFinite(num)) {
      await message.reply("숫자를 적어줘.");
      return true;
    }
    s.data[awaiting.name] = num;
    s.currIndex++;
    s.awaiting = null;
    await askNextOption(message, s, learned);
    return true;
  }

  if (awaiting.type === "ROLE") {
    let role = null;
    const m = txt.match(/<@&(\d+)>/);
    if (m) role = message.guild.roles.cache.get(m[1]);
    if (!role) {
      const bracketTokens = extractBracketTokens(txt);
      for (const tok of bracketTokens) {
        const r = message.guild.roles.cache.find(x => norm(x.name) === norm(tok));
        if (r) { role = r; break; }
      }
    }
    if (!role) role = message.guild.roles.cache.find(r => norm(r.name) === norm(txt)) || null;
    if (!role) role = fuzzyFindRoleInText(message.guild, txt);
    if (!role) {
      await message.reply("역할을 못 찾었어. 역할명만 적어도 돼.");
      return true;
    }
    s.data[awaiting.name] = { id: role.id, name: role.name };
    s.currIndex++;
    s.awaiting = null;
    await askNextOption(message, s, learned);
    return true;
  }

  if (awaiting.type === "CHANNEL") {
    let ch = null;
    const m = txt.match(/<#(\d+)>/);
    if (m) ch = message.guild.channels.cache.get(m[1]);
    if (!ch) ch = message.guild.channels.cache.find(c => norm(c.name) === norm(txt)) || null;
    if (!ch) ch = fuzzyFindAnyChannelInText(message.guild, txt);
    if (!ch) {
      await message.reply("채널을 못 찾았어. 채널명만 적어줘.");
      return true;
    }
    s.data[awaiting.name] = { id: ch.id, name: ch.name };
    s.currIndex++;
    s.awaiting = null;
    await askNextOption(message, s, learned);
    return true;
  }

  if (awaiting.type === "MENTIONABLE") {
    let v = null;
    const mu = txt.match(/<@!?(\d+)>/);
    if (mu) {
      const member = message.guild.members.cache.get(mu[1]);
      if (member) v = member.user;
    } else {
      const mr = txt.match(/<@&(\d+)>/);
      if (mr) {
        const role = message.guild.roles.cache.get(mr[1]);
        if (role) v = { id: role.id, name: role.name };
      }
    }
    if (!v) {
      await message.reply("멘션 가능한 대상(유저/역할)을 멘션하거나 이름을 적어줘.");
      return true;
    }
    s.data[awaiting.name] = v;
    s.currIndex++;
    s.awaiting = null;
    await askNextOption(message, s, learned);
    return true;
  }

  if (awaiting.type === "ATTACHMENT") {
    const att = message.attachments.first();
    if (!att) {
      await message.reply("파일을 첨부해줘.");
      return true;
    }
    s.data[awaiting.name] = { name: att.name, size: att.size, url: att.url, contentType: att.contentType || null };
    s.currIndex++;
    s.awaiting = null;
    await askNextOption(message, s, learned);
    return true;
  }

  if (awaiting.type === "STRING") {
    s.data[awaiting.name] = txt;
    s.currIndex++;
    s.awaiting = null;
    await askNextOption(message, s, learned);
    return true;
  }

  return false;
}

async function handleListCommand(message) {
  const store = loadStore();
  const { eb, row } = buildListEmbed(store, 1);
  const msg = await message.channel.send({ embeds: [eb], components: [row], reply: { messageReference: message.id } });
  setTimeout(() => {
    if (msg.editable) msg.edit({ components: [] }).catch(() => {});
  }, 120000);
}

async function handleCancelLearn(message, slashName) {
  const name = (slashName || "").replace(/^\/+/, "").trim();
  if (!name) {
    await message.reply("취소할 슬래시 명령어를 '/명령어' 형태로 적어줘.");
    return;
  }
  const store = loadStore();
  if (!store.commands[name]) {
    await message.reply(`/${name} 은(는) 학습 목록에 없어.`);
    return;
  }
  delete store.commands[name];
  saveStore(store);
  await message.reply(`/${name} 학습을 취소(삭제)했어.`);
}

async function handleExportLearn(message) {
  const store = loadStore();
  const buf = Buffer.from(JSON.stringify(store, null, 2), "utf8");
  const file = new AttachmentBuilder(buf, { name: "godbot-learning.json" });
  await message.reply({ content: "학습 데이터 백업 파일이야.", files: [file] });
}

function isCancelIntentAfterTrigger(content) {
  const rest = content.split(TRIGGER).slice(1).join(TRIGGER).trim();
  const kw = rest.replace(/^[!:]+/, "").trim();
  return CANCEL_WORDS.some(w => kw.startsWith(w));
}

async function onMessage(client, message) {
  if (!message.guild) return;
  if (message.author.bot) return;
  const content = message.content || "";
  if (!content.includes(TRIGGER)) return;
  const member = message.member;
  if (!isAdminAllowed(member)) return;

  const lowered = content.toLowerCase();
  if (isCancelIntentAfterTrigger(content)) {
    const s = getSession(message.author.id);
    if (s) endSession(message.author.id);
    await message.reply("취소했어.");
    return;
  }

  if (lowered.startsWith(`${TRIGGER} 파싱`)) {
    const body = stripTrigger(content).replace(/^파싱/i,"").trim();
    const store = loadStore();
    const entries = Object.values(store.commands || {});
    if (!entries.length) return message.reply("후보가 없어.");
    const picked = pickBestCommand(message.guild, body, entries, message.author);
    if (!picked) return message.reply("후보가 없어.");
    const pre = extractFromText(message.guild, body, picked.cmd, message.author);
    const lines = (picked.cmd.options||[]).map(o=>{
      const v = pre[o.name];
      const src = pre[`__src_${o.name}`];
      return `${o.name}(${o.type}) = ${v==null?'-':(o.type==='USER'&&v.id?`<@${v.id}>`:o.type==='ROLE'&&v.id?`<@&${v.id}>`:typeof v==='object'&&v.name?v.name:v)}${src?` [${src}]`:''}`;
    });
    await message.reply(`명령어: /${picked.cmd.name}\n`+lines.join("\n"));
    return;
  }

  if (lowered.startsWith(`${TRIGGER} 학습 목록`)) {
    await handleListCommand(message);
    return;
  }
  if (lowered.startsWith(`${TRIGGER} 학습 취소`)) {
    const rest = content.split("학습 취소")[1] || "";
    await handleCancelLearn(message, rest.trim());
    return;
  }
  if (lowered.startsWith(`${TRIGGER} 학습 내보내기`) || lowered.startsWith(`${TRIGGER} 학습 백업`)) {
    await handleExportLearn(message);
    return;
  }
  if (lowered.startsWith(`${TRIGGER} 실패로그`)) {
  await handleFailLogCommand(message);
  return;
  }
  if (lowered.startsWith(`${TRIGGER} 학습`)) {
    const rest = content.split("학습")[1] || "";
    await startLearnFlow(client, message, rest.trim());
    return;
  }

  const sLearn = getSession(message.author.id);
  if (sLearn && sLearn.mode === "learn") {
    await handleLearnInput(message);
    return;
  }
  const sExec = getSession(message.author.id);
  if (sExec && sExec.mode === "exec") {
    await handleExecInput(message);
    return;
  }

  await startNlpFlow(client, message, content);
}

async function onInteraction(client, interaction) {
  if (!interaction.isButton()) return;
  const id = interaction.customId || "";
  if (id.startsWith("godbot_list_prev_") || id.startsWith("godbot_list_next_")) {
    const store = loadStore();
    const isPrev = id.includes("_prev_");
    const page = parseInt(id.split("_").pop() || "1", 10);
    const next = isPrev ? Math.max(1, page - 1) : page + 1;
    const built = buildListEmbed(store, next);
    try {
      await interaction.update({ embeds: [built.eb], components: [built.row] });
    } catch {}
    return;
  }
  if (id.startsWith("godbot_fail_prev_") || id.startsWith("godbot_fail_next_")) {
  const store = loadStore();
  const isPrev = id.includes("_prev_");
  const parts = id.split("_");
  const page = parseInt(parts[3] || "1", 10);
  const cmd = parts[4] && parts[4] !== "-" ? parts[4] : null;
  const uid = parts[5] && parts[5] !== "-" ? parts[5] : null;
  const next = isPrev ? Math.max(1, page - 1) : page + 1;
  const built = buildFailLogEmbed(store, next, cmd, uid);
  try {
    await interaction.update({ embeds: [built.eb], components: [built.row] });
  } catch {}
  return;
 }
}

function initGodbotNLP(client) {
  client.on("messageCreate", (m) => onMessage(client, m));
  client.on("interactionCreate", (i) => onInteraction(client, i));
  setInterval(sweepSessions, SESSION_SWEEP_MS);
}

module.exports = { initGodbotNLP };
