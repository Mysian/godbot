const fs = require('fs');
const path = require('path');

const CHANNEL_ID = '1202425624061415464';
const STATE_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(STATE_DIR, 'emoji-react-state.json');

const WELCOME_EMOJIS = [
  '🎉','🎊','🥳','👋','💜','✨','🌟','😄','😊','🤗','🫶','💫','🌈','🏠','🫡','🎈'
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

function registerEmojiAutoReact(client) {
  loadState();

  const handler = async (message) => {
    try {
      if (message.author?.bot) return;
      if (!message.guild) return;
      if (message.channelId !== CHANNEL_ID) return;

      const guildId = message.guild.id;
      const channelId = message.channelId;
      const userId = message.author.id;

      const firstInChannel = markFirstInChannel(guildId, channelId, userId);
      if (!firstInChannel) return;

      const count = 5 + Math.floor(Math.random() * 3);
      const picks = pickNUnique(WELCOME_EMOJIS, count);
      for (const e of picks) {
        try { await message.react(e); } catch {}
      }
    } catch {}
  };

  client.on('messageCreate', handler);
  return () => client.off('messageCreate', handler);
}

module.exports = { registerEmojiAutoReact };
