// utils/sensitivity.js
const fs = require('fs');
const path = require('path');

const TARGET_CHANNEL_ID = '1382614214908317788';
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'sensitivity.json');

const GAMES = {
  cs2: { id: 'cs2', name: 'CS2/CS:GO', yaw: 0.022, aliases: ['cs', 'csgo', 'cs2', 'counterstrike'] },
  valorant: { id: 'valorant', name: 'VALORANT', yaw: 0.07, aliases: ['val', 'valorant', 'valo'] },
  apex: { id: 'apex', name: 'Apex Legends', yaw: 0.022, aliases: ['apex', 'apexlegends', 'apex-legend'] },
  overwatch2: { id: 'overwatch2', name: 'Overwatch 2', yaw: 0.006666, aliases: ['ow2', 'overwatch2'] },
  overwatch: { id: 'overwatch', name: 'Overwatch (OW1)', yaw: 0.0066, aliases: ['ow', 'overwatch', 'ow1'] },
  r6: { id: 'r6', name: 'Rainbow Six Siege', yaw: 0.02, aliases: ['r6', 'siege', 'rainbowsix', 'rainbow6'] }
};

function resolveGameId(input) {
  if (!input) return null;
  const q = String(input).toLowerCase();
  for (const g of Object.values(GAMES)) {
    if (g.id === q || g.aliases.includes(q)) return g.id;
  }
  return null;
}

function cm360(dpi, sens, yaw) {
  return (360 * 2.54) / (dpi * sens * yaw);
}

function sensFromCm(cm, dpi, yaw) {
  return (360 * 2.54) / (dpi * yaw * cm);
}

function fmt(n) {
  if (!isFinite(n)) return 'NaN';
  if (Math.abs(n) >= 100) return n.toFixed(2);
  if (Math.abs(n) >= 10) return n.toFixed(3);
  return n.toFixed(4);
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {} }, null, 0));
}

function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const json = JSON.parse(raw);
    if (!json.users) json.users = {};
    return json;
  } catch {
    return { users: {} };
  }
}

let writeTimer = null;
function writeStoreSafe(store) {
  ensureStore();
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(store)); } catch {}
  }, 50);
}

function getUser(store, id) {
  if (!store.users[id]) store.users[id] = { dpi: 800, baseGame: 'valorant', baseSens: 0.3, updatedAt: Date.now() };
  return store.users[id];
}

function listGamesText() {
  const rows = Object.values(GAMES).map(g => `• ${g.name} (${g.id})`);
  return rows.join('\n');
}

function buildConversion(user, targets) {
  const baseGame = GAMES[user.baseGame];
  if (!baseGame) return { text: '지원하지 않는 기준 게임이야.', fields: [] };
  const dpi = Number(user.dpi);
  const baseSens = Number(user.baseSens);
  const baseCm = cm360(dpi, baseSens, baseGame.yaw);
  const fields = [];
  for (const gid of targets) {
    const g = GAMES[gid];
    if (!g) continue;
    const tsens = sensFromCm(baseCm, dpi, g.yaw);
    fields.push({ name: `${g.name}`, value: `감도 ${fmt(tsens)} | cm/360 ${fmt(baseCm)}` });
  }
  const text = `기준: ${baseGame.name} | DPI ${dpi} | 감도 ${fmt(baseSens)} | cm/360 ${fmt(baseCm)}`;
  return { text, fields };
}

function parseArgs(content) {
  return content.trim().split(/\s+/g).slice(1);
}

function reply(channel, content) {
  return channel.send({ content });
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function handleCommand(message) {
  if (message.channelId !== TARGET_CHANNEL_ID) return;
  const content = message.content.trim();
  if (!content.startsWith('!감도')) return;

  const store = readStore();
  const me = getUser(store, message.author.id);
  const args = parseArgs(content);

  if (args.length === 0) {
    const help =
      [
        '사용법:',
        '!감도 설정 <게임> <DPI> <감도>',
        '!감도 수정 dpi <값>',
        '!감도 수정 게임 <게임>',
        '!감도 수정 감도 <값>',
        '!감도 내설정',
        '!감도 변환',
        '!감도 변환 <게임1,게임2,...>',
        '!감도 목록',
        '!감도 게임 <게임> <감도?> <DPI?>'
      ].join('\n');
    await reply(message.channel, help);
    return;
  }

  const sub = args[0].toLowerCase();

  if (sub === '목록') {
    await reply(message.channel, listGamesText());
    return;
  }

  if (sub === '내설정') {
    const base = GAMES[me.baseGame];
    const baseCm = cm360(Number(me.dpi), Number(me.baseSens), base.yaw);
    await reply(message.channel, [
      `DPI ${me.dpi}`,
      `기준 게임 ${base.name} (${base.id})`,
      `기준 감도 ${fmt(me.baseSens)}`,
      `cm/360 ${fmt(baseCm)}`
    ].join('\n'));
    return;
  }

  if (sub === '설정') {
    if (args.length < 4) {
      await reply(message.channel, '형식: !감도 설정 <게임> <DPI> <감도>');
      return;
    }
    const gid = resolveGameId(args[1]);
    if (!gid) {
      await reply(message.channel, '지원하지 않는 게임이야. !감도 목록 으로 확인해봐.');
      return;
    }
    const dpi = Number(args[2]);
    const sens = Number(args[3]);
    if (!(dpi > 0) || !(sens > 0)) {
      await reply(message.channel, 'DPI와 감도는 숫자로 입력해줘.');
      return;
    }
    me.baseGame = gid;
    me.dpi = dpi;
    me.baseSens = sens;
    me.updatedAt = Date.now();
    writeStoreSafe(store);
    const base = GAMES[gid];
    const baseCm = cm360(dpi, sens, base.yaw);
    await reply(message.channel, `설정 완료. 기준 ${base.name}, DPI ${dpi}, 감도 ${fmt(sens)}, cm/360 ${fmt(baseCm)}`);
    return;
  }

  if (sub === '수정') {
    if (args.length < 3) {
      await reply(message.channel, '형식: !감도 수정 dpi <값> | !감도 수정 게임 <게임> | !감도 수정 감도 <값>');
      return;
    }
    const field = args[1].toLowerCase();
    if (field === 'dpi') {
      const dpi = Number(args[2]);
      if (!(dpi > 0)) {
        await reply(message.channel, 'DPI는 숫자로 입력해줘.');
        return;
      }
      me.dpi = dpi;
    } else if (field === '게임') {
      const gid = resolveGameId(args[2]);
      if (!gid) {
        await reply(message.channel, '지원하지 않는 게임이야.');
        return;
      }
      me.baseGame = gid;
    } else if (field === '감도') {
      const sens = Number(args[2]);
      if (!(sens > 0)) {
        await reply(message.channel, '감도는 숫자로 입력해줘.');
        return;
      }
      me.baseSens = sens;
    } else {
      await reply(message.channel, '수정 가능한 항목: dpi | 게임 | 감도');
      return;
    }
    me.updatedAt = Date.now();
    writeStoreSafe(store);
    const base = GAMES[me.baseGame];
    const baseCm = cm360(Number(me.dpi), Number(me.baseSens), base.yaw);
    await reply(message.channel, `수정 완료. 기준 ${base.name}, DPI ${me.dpi}, 감도 ${fmt(me.baseSens)}, cm/360 ${fmt(baseCm)}`);
    return;
  }

  if (sub === '변환') {
    const targetsRaw = (args[1] || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(resolveGameId)
      .filter(Boolean);
    const targetIds = targetsRaw.length ? targetsRaw : Object.keys(GAMES).filter(k => k !== me.baseGame);
    const { text, fields } = buildConversion(me, targetIds);
    const lines = [text, ...fields.map(f => `• ${f.name}: ${f.value}`)];
    const chunks = chunk(lines, 15);
    for (const c of chunks) await reply(message.channel, c.join('\n'));
    return;
  }

  if (sub === '게임') {
    if (args.length < 2) {
      await reply(message.channel, '형식: !감도 게임 <게임> <감도?> <DPI?>');
      return;
    }
    const gid = resolveGameId(args[1]);
    if (!gid) {
      await reply(message.channel, '지원하지 않는 게임이야.');
      return;
    }
    let sens = me.baseSens;
    let dpi = me.dpi;
    if (args[2]) sens = Number(args[2]) || sens;
    if (args[3]) dpi = Number(args[3]) || dpi;
    const baseCm = cm360(dpi, sens, GAMES[gid].yaw);
    const targets = Object.keys(GAMES).filter(k => k !== gid);
    const fields = targets.map(t => {
      const tsens = sensFromCm(baseCm, dpi, GAMES[t].yaw);
      return `• ${GAMES[t].name}: 감도 ${fmt(tsens)} | cm/360 ${fmt(baseCm)}`;
    });
    const header = `기준 ${GAMES[gid].name} | DPI ${dpi} | 감도 ${fmt(sens)} | cm/360 ${fmt(baseCm)}`;
    const chunks = chunk([header, ...fields], 15);
    for (const c of chunks) await reply(message.channel, c.join('\n'));
    return;
  }

  await reply(message.channel, '알 수 없는 하위 명령어야. !감도 입력해서 도움말 확인해줘.');
}

module.exports = {
  register(client) {
    client.on('messageCreate', handleCommand);
  }
};
