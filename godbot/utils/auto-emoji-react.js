const fs = require('fs');
const path = require('path');

const CHANNEL_ID = '1202425624061415464';
const REQUIRED_ROLE_ID = '1295701019430227988';

const MIN_WELCOME_EMOJI = 5;
const MAX_WELCOME_EMOJI = 7;

const STATE_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(STATE_DIR, 'emoji-react-state.json');

/*
  ⬇⬇⬇ 여기만 네 서버 커스텀 이모지로 채워줘 ⬇⬇⬇
  - 허용 형식: 
    1) '이모지이름:이모지ID'  (예: 'welcome:123456789012345678')
    2) '<:이모지이름:이모지ID>' 또는 '<a:이모지이름:이모지ID>' (애니메 이모지)
    3) '이모지ID' 만 (같은 길드에 존재하면 이름을 캐시에서 찾아 붙여줌)
  - 유니코드는 넣지 마 (커스텀만 사용)
*/
const EMOJI_CANDIDATES = [
  'alpakaDdabong:1217149460979908619',
  '<:happybee:1217070624342802502>',
  '<a:cerbbeat:1277560572807745578>',
  '1207735830869975040',
];

let state = { firstMessage: {} };

function ensureStateFile() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

function loadState() {
  ensureStateFile();
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') state = parsed;
  } catch {}
}

let saveTimer = null;
function saveStateDebounced() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch {}
    saveTimer = null;
  }, 200);
}

function markFirstInChannel(guildId, channelId, userId) {
  if (!state.firstMessage[guildId]) state.firstMessage[guildId] = {};
  if (!state.firstMessage[guildId][channelId]) state.firstMessage[guildId][channelId] = {};
  if (state.firstMessage[guildId][channelId][userId]) return false;
  state.firstMessage[guildId][channelId][userId] = true;
  saveStateDebounced();
  return true;
}

function pickNUnique(arr, n) {
  const pool = [...arr];
  const out = [];
  while (pool.length && out.length < n) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

function normalizeEmojiToken(token) {
  if (!token) return null;
  const t = String(token).trim();

  if (/^<a?:\w+:\d+>$/.test(t)) {
    const inner = t.slice(1, -1);
    const [, name, id] = inner.split(':');
    return `${name}:${id}`;
  }

  if (/^\w+:\d+$/.test(t)) {
    return t;
  }

  if (/^\d+$/.test(t)) {
    return t;
  }

  return null;
}

function toReactResolvable(token, guild) {
  if (!token) return null;

  if (/^\d+$/.test(token)) {
    const e = guild?.emojis?.cache?.get(token);
    if (e?.id && e?.name) return `${e.name}:${e.id}`;
    return token;
  }

  return token;
}

function buildResolvedEmojiList(guild) {
  const out = [];
  for (const raw of EMOJI_CANDIDATES) {
    const norm = normalizeEmojiToken(raw);
    if (!norm) continue;
    const resolvable = toReactResolvable(norm, guild);
    out.push(resolvable);
  }
  return out;
}

function registerEmojiAutoReact(client) {
  loadState();

  const handler = async (message) => {
    try {
      if (message.author?.bot) return;
      if (!message.guild) return;
      if (message.channelId !== CHANNEL_ID) return;
      const member = message.member;
      if (!member?.roles?.cache?.has(REQUIRED_ROLE_ID)) return;

      const guildId = message.guild.id;
      const channelId = message.channelId;
      const userId = message.author.id;

      const firstInChannel = markFirstInChannel(guildId, channelId, userId);
      if (!firstInChannel) return;

      const candidates = buildResolvedEmojiList(message.guild).filter(Boolean);
      if (candidates.length === 0) return;

      const min = Math.max(1, Math.min(MIN_WELCOME_EMOJI, candidates.length));
      const max = Math.max(min, Math.min(MAX_WELCOME_EMOJI, candidates.length));
      const count = min + Math.floor(Math.random() * (max - min + 1));

      const picks = pickNUnique(candidates, count);
      for (const e of picks) {
        try { await message.react(e); } catch {}
      }
    } catch {}
  };

  client.on('messageCreate', handler);
  return () => client.off('messageCreate', handler);
}

module.exports = { registerEmojiAutoReact };
