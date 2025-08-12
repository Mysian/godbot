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
} = require("discord.js");

const ADMIN_ROLE_ID = "1404486995564167218";
const TRIGGER = "갓봇!";
const DATA_DIR = path.join(__dirname, "../data");
const STORE_PATH = path.join(DATA_DIR, "godbot-learning.json");
const SESSION_TTL_MS = 5 * 60 * 1000;
const PAGE_SIZE = 10;

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
  USER: ["에게", "한테", "님에게", "유저", "사용자", "님", "상대", "상대방"],
  NUMBER: ["원", "정수", "금액", "포인트", "수량", "숫자", "코인", "갓비트"],
  STRING: ["내용", "사유", "메모", "메시지", "설명", "텍스트"],
  BOOLEAN: ["여부", "할까", "할까요", "진행", "포함"],
  ROLE: ["역할", "롤"],
  CHANNEL: ["채널"],
};

const CANCEL_WORDS = ["취소", "취소해", "중단", "중단해"];

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) fs.writeFileSync(STORE_PATH, JSON.stringify({ commands: {} }, null, 2));
}
function loadStore() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return { commands: {} };
  }
}
function saveStore(data) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

const sessions = new Map();
function newSession(userId) {
  const s = {
    step: 0,
    createdAt: Date.now(),
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
  if (Date.now() - (s.createdAt || 0) > SESSION_TTL_MS) {
    sessions.delete(userId);
    return null;
  }
  return s;
}
function endSession(userId) {
  sessions.delete(userId);
}

function isAdminAllowed(member) {
  if (!member) return false;
  return member.roles?.cache?.has(ADMIN_ROLE_ID) || false;
}

function normalizeKorean(str) {
  return (str || "").replace(/\s+/g, " ").trim();
}

function parseFloatAny(str) {
  if (!str) return null;
  const m = String(str).match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  return parseFloat(m[0].replace(",", "."));
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  return null;
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

async function fetchSlashSchema(client, name) {
  await client.application.commands.fetch();
  const cmd = client.application.commands.cache.find(c => c.name === name);
  if (!cmd) return null;
  const flat = flattenOptions(cmd.options || []);
  const options = flat.filter(o => o.type !== "SUB");
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
  };
}

function buildListEmbed(data, page) {
  const entries = Object.values(data.commands || {});
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
      const syn = (c.synonyms || []).slice(0, 6).join(", ");
      return `**${idx}. /**${c.name}  | 키워드: ${syn || "-"}\n옵션: ${optText || "-"}`;
    }).join("\n\n"))
    .setFooter({ text: `페이지 ${p}/${pages} • 총 ${total}개` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`godbot_list_prev_${p}`).setLabel("이전").setStyle(ButtonStyle.Secondary).setDisabled(p <= 1),
    new ButtonBuilder().setCustomId(`godbot_list_next_${p}`).setLabel("다음").setStyle(ButtonStyle.Secondary).setDisabled(p >= pages),
  );
  return { eb, row, page: p, pages };
}

function summarizePlan(guild, learned, collected) {
  const lines = [];
  lines.push(`/${learned.name}`);
  const opts = learned.options || [];
  for (const o of opts) {
    const key = o.name;
    let val = collected[key];
    if (o.type === "USER" && val && typeof val === "object") val = `<@${val.id}>`;
    if (o.type === "ROLE" && val && typeof val === "object") val = `<@&${val.id}>`;
    if (o.type === "CHANNEL" && val && typeof val === "object") val = `<#${val.id}>`;
    if (o.type === "BOOLEAN" && typeof val === "boolean") val = val ? "예" : "아니오";
    if (val === undefined || val === null || val === "") continue;
    lines.push(`${key}: ${val}`);
  }
  return lines.join("  ");
}

function extractFromText(guild, text, learned, author) {
  const base = stripTrigger(text);
  const content = normalizeKorean(base);
  const lower = content.toLowerCase();

  const userOpt = (learned.options || []).find(o => o.type === "USER");
  if (userOpt) {
    let m = content.match(/<@!?(\d+)>/);
    if (m) {
      const member = guild.members.cache.get(m[1]);
      if (member) {
        res[userOpt.name] = member.user;
      }
    }
  }

  const res = {};
  if (!res[userOpt?.name] && userOpt) {
    const selfHit = /(나|저|내|본인|자신)(?:에게|한테|게)?/.test(content);
    if (selfHit && author) {
      res[userOpt.name] = author;
    } else {
      const joins = (userOpt.synonyms || DefaultOptionSynonyms.USER);
      const rgx = new RegExp(`(.+?)\\s*(?:${joins.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`);
      const mm = content.match(rgx);
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

  const numberOpt = (learned.options || []).find(o => o.type === "NUMBER");
  if (numberOpt) {
    let num = null;
    const joins = (numberOpt.synonyms || DefaultOptionSynonyms.NUMBER);
    const near = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:${joins.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`);
    const m1 = content.match(near);
    if (m1) num = parseFloat(m1[1].replace(",", "."));
    if (num == null) {
      const m2 = content.match(/(\d+(?:[.,]\d+)?)/);
      if (m2) num = parseFloat(m2[1].replace(",", "."));
    }
    if (num != null) res[numberOpt.name] = num;
  }

  for (const o of (learned.options || [])) {
    if (res[o.name] != null) continue;
    if (o.type === "STRING") {
      const quoted = content.match(/["“](.+?)["”]/);
      if (quoted && quoted[1]) {
        res[o.name] = quoted[1].slice(0, 2000);
        continue;
      }
      const after = content.replace(/.*?\b(?:사유|메모|내용|설명|메시지)\b[:：]?\s*/i, "");
      if (after && after !== content) res[o.name] = after.slice(0, 2000);
    }
  }

  return res;
}

function buildFakeInteraction(baseMessage, learned, collected) {
  const get = name => collected[name];
  const options = {
    getString: n => {
      const v = get(n);
      return typeof v === "string" ? v : null;
    },
    getInteger: n => {
      const v = get(n);
      if (typeof v === "number") return Math.trunc(v);
      const f = parseFloatAny(v);
      return Number.isFinite(f) ? Math.trunc(f) : null;
    },
    getNumber: n => {
      const v = get(n);
      if (typeof v === "number") return v;
      const f = parseFloatAny(v);
      return Number.isFinite(f) ? f : null;
    },
    getUser: n => {
      const v = get(n);
      if (v && v.id) return v;
      return null;
    },
    getMember: n => {
      const v = get(n);
      if (v && v.id && baseMessage.guild) return baseMessage.guild.members.cache.get(v.id) || null;
      return null;
    },
    getRole: n => {
      const v = get(n);
      if (v && v.id) return v;
      return null;
    },
    getChannel: n => {
      const v = get(n);
      if (v && v.id) return v;
      return null;
    },
    getBoolean: n => {
      const v = get(n);
      if (typeof v === "boolean") return v;
      if (typeof v === "string") return ["예", "네", "true", "True", "TRUE", "y", "yes"].includes(v);
      return null;
    },
    get: n => get(n),
  };
  let deferred = false;
  let replied = false;
  const interaction = {
    client: baseMessage.client,
    user: baseMessage.author,
    member: baseMessage.member,
    guild: baseMessage.guild,
    channel: baseMessage.channel,
    commandName: learned.name,
    options,
    isChatInputCommand: () => true,
    reply: async p => { replied = true; return await baseMessage.channel.send(p); },
    deferReply: async () => { deferred = true; },
    editReply: async p => { return await baseMessage.channel.send(p); },
    followUp: async p => { return await baseMessage.channel.send(p); },
  };
  return interaction;
}

async function tryExecuteLearned(client, baseMessage, learned, collected) {
  const col = client.commands || client.slashCommands || new Collection();
  let cmd = col.get(learned.name);
  if (!cmd && col instanceof Map) cmd = col.get(learned.name);
  if (!cmd && typeof col.find === "function") cmd = col.find(c => c?.data?.name === learned.name || c?.name === learned.name);
  if (!cmd) return { ok: false, reason: "HANDLER_NOT_FOUND" };

  const interaction = buildFakeInteraction(baseMessage, learned, collected);
  try {
    if (typeof cmd.execute === "function") {
      await cmd.execute(interaction);
      return { ok: true };
    }
    if (typeof cmd.run === "function") {
      await cmd.run(interaction);
      return { ok: true };
    }
    if (typeof cmd.chatInputRun === "function") {
      await cmd.chatInputRun(interaction);
      return { ok: true };
    }
    return { ok: false, reason: "NO_EXECUTOR" };
  } catch (e) {
    console.error("godbot-nlp execute error:", e);
    return { ok: false, reason: "EXEC_ERROR", error: e };
  }
}

async function finishAndRun(baseMessage, session, learned) {
  const execRes = await tryExecuteLearned(baseMessage.client, baseMessage, learned, session.data);
  if (!execRes.ok) {
    const summary = summarizePlan(baseMessage.guild, learned, session.data);
    await baseMessage.channel.send(`실행 실패: /${learned.name} (${execRes.reason})\n${summary}`);
  }
  endSession(baseMessage.author.id);
}

async function askNextOption(message, session, learned) {
  while (session.currIndex < session.expectedOptions.length) {
    const opt = session.expectedOptions[session.currIndex];
    if (!opt) break;
    const name = opt.name;
    if (session.data[name] == null || session.data[name] === "") {
      session.awaiting = { type: opt.type, name };
      const reqText = opt.required ? "[필수]" : "[선택]";
      await message.channel.send(`값을 알려줘 ${reqText} ${name} (${opt.type})`);
      return;
    } else {
      session.currIndex++;
    }
  }
  await finishAndRun(message, session, learned);
}

async function startLearnFlow(client, message, slashName) {
  const name = (slashName || "").replace(/^\/+/, "").trim();
  if (!name) {
    await message.reply("학습할 슬래시 명령어를 '/명령어' 형태로 적어줘.");
    return;
  }
  const schema = await fetchSlashSchema(client, name);
  if (!schema) {
    await message.reply(`/${name} 명령어를 찾을 수 없어.`);
    return;
  }
  const store = loadStore();
  if (!store.commands[name]) {
    store.commands[name] = { name: schema.name, id: schema.id, description: schema.description, options: schema.options, synonyms: [] };
    saveStore(store);
  }
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
    const syns = txt.split(",").map(v => v.trim()).filter(Boolean);
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
      const syns = txt.split(",").map(v => v.trim()).filter(Boolean);
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
    s.awaiting = { type: "LEARN_OPT_SYNONYMS", idx: nextIdx };
    await message.reply(`${next.name} (${next.type}) 인식 키워드를 ,로 적어줘. 건너뛰려면 '건너뛰기'`);
    return true;
  }
  return false;
}

async function startNlpFlow(client, message, content) {
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
    await message.reply("무슨 명령인지 못 알아들었어. '갓봇! 학습 목록'에서 가능한 명령을 확인해줘.");
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

  const prefill = extractFromText(message.guild, body, match, message.author);
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
    if (!role) role = message.guild.roles.cache.find(r => r.name === txt) || null;
    if (!role) {
      await message.reply("역할을 못 찾았어. 역할명만 적어줘.");
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
    if (!ch) ch = message.guild.channels.cache.find(c => c.name === txt) || null;
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
  if (isCancelIntentAfterTrigger(lowered)) {
    const s = getSession(message.author.id);
    if (s) endSession(message.author.id);
    await message.reply("취소했어.");
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
}

function initGodbotNLP(client) {
  client.on("messageCreate", (m) => onMessage(client, m));
  client.on("interactionCreate", (i) => onInteraction(client, i));
}

module.exports = { initGodbotNLP };
