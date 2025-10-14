const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { loadBE, getBE, transferBE, addBE } = require('../commands/be-util');

const DATA_PATH = path.join(__dirname, '../data/lottery.json');
const LOCK_RETRY = { retries: 10, minTimeout: 30, maxTimeout: 120 };
const CHANNEL_ID_FALLBACK = '1427667597901566024';
const BOT_BANK_ID = '1380841362752274504';
const PRICE_PER_LINE = 10000;
const NUMBER_MIN = 1;
const NUMBER_MAX = 45;
const PICK_COUNT = 5;

const DEFAULT_DISTRIBUTION = { first: 70, second: 20, third: 10 };

function ensureFile() {
  if (!fs.existsSync(path.dirname(DATA_PATH))) fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, JSON.stringify({
    round: 1,
    rollover: 0,
    messageId: null,
    channelId: CHANNEL_ID_FALLBACK,
    distribution: DEFAULT_DISTRIBUTION,
    rounds: [],
    tickets: {},
    lastDrawAt: null,
    panelEditedAt: 0
  }, null, 2));
}

function loadState() {
  ensureFile();
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function saveState(s) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(s, null, 2));
}

async function withLock(fn) {
  let release;
  try {
    release = await lockfile.lock(DATA_PATH, { retries: LOCK_RETRY });
    const state = loadState();
    const out = await fn(state);
    saveState(state);
    return out;
  } finally {
    if (release) await release();
  }
}

function nowUtcMs() { return Date.now(); }
function toKst(dateMs) { return new Date(dateMs + 9 * 60 * 60 * 1000); }
function fromKst(y, m, d, hh, mm, ss = 0) {
  const utc = Date.UTC(y, m - 1, d, hh - 9, mm, ss);
  return new Date(utc).getTime();
}
function fmtNumber(n) { return Number(n).toLocaleString('ko-KR'); }
function discordTs(ms, style = 'R') { return `<t:${Math.floor(ms / 1000)}:${style}>`; }

function nextSaturday2000Kst(fromMs) {
  const k = toKst(fromMs);
  const day = k.getUTCDay();
  const dow = (day + 7) % 7;
  const addDays = (6 - dow + (k.getUTCHours() >= 20 || (dow === 6 && k.getUTCHours() > 20) ? 7 : 0));
  const target = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() + addDays, 20 - 9, 0, 0));
  return target.getTime();
}

function thisSaturday1930CloseKst(fromMs) {
  const draw = nextSaturday2000Kst(fromMs);
  return draw - 30 * 60 * 1000;
}

function nextMonday0900Kst(fromMs) {
  const k = toKst(fromMs);
  const dow = (k.getUTCDay() + 7) % 7;
  const add = ((1 - dow + 7) % 7) + (k.getUTCHours() >= 9 ? 7 : 0);
  const target = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() + add, 9 - 9, 0, 0));
  return target.getTime();
}

function isSalesClosed(nowMs) {
  const closeStart = thisSaturday1930CloseKst(nowMs);
  const closeEnd = nextMonday0900Kst(nowMs);
  return nowMs >= closeStart && nowMs < closeEnd;
}

function withinRangeUniqueFive(arr) {
  if (!Array.isArray(arr)) return false;
  if (arr.length !== PICK_COUNT) return false;
  const s = new Set();
  for (const n of arr) {
    if (typeof n !== 'number' || !Number.isInteger(n)) return false;
    if (n < NUMBER_MIN || n > NUMBER_MAX) return false;
    if (s.has(n)) return false;
    s.add(n);
  }
  return true;
}

function drawWinning() {
  const pool = [];
  for (let i = NUMBER_MIN; i <= NUMBER_MAX; i++) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, PICK_COUNT).sort((a, b) => a - b);
}

function matchCount(a, b) {
  let cnt = 0;
  const set = new Set(b);
  for (const x of a) if (set.has(x)) cnt++;
  return cnt;
}

function titleEmoji() { return '🎟️'; }
function statusText(nowMs) {
  if (isSalesClosed(nowMs)) return '판매 휴무 중입니다.';
  return '지금 구매하실 수 있습니다.';
}

async function buildPanel(client) {
  const state = loadState();
  const now = nowUtcMs();
  const drawAt = nextSaturday2000Kst(now);
  const closeAt = thisSaturday1930CloseKst(now);
  const sales = !isSalesClosed(now);
  const bank = getBE(BOT_BANK_ID);
  const potPreview = bank;
  const embed = new EmbedBuilder()
    .setTitle(`${titleEmoji()} 까리한 디스코드 주간 복권`)
    .setColor(0x4f8cff)
    .setDescription([
      `• 회차: **${state.round}회차**`,
      `• 당첨 예정 금액: **${fmtNumber(potPreview)} BE**`,
      `• 판매 상태: **${sales ? '판매 중' : '휴무'}**`,
      `• 판매 마감: ${discordTs(closeAt, 'R')} (토요일 19:30 KST)`,
      `• 추첨 시각: ${discordTs(drawAt, 'R')} (토요일 20:00 KST)`,
      `• 안내: ${statusText(now)}`
    ].join('\n'))
    .addFields(
      { name: '복권 규칙', value: `1~45 중 **${PICK_COUNT}개** 번호를 고르시면 됩니다. 1줄 **${fmtNumber(PRICE_PER_LINE)} BE**입니다. 1등(5개), 2등(4개), 3등(3개)이며, 각 등수의 배분 비율은 **1등 ${state.distribution.first}% • 2등 ${state.distribution.second}% • 3등 ${state.distribution.third}%** 입니다. 해당 등수 당첨자가 없을 경우 해당 금액은 다음 회차로 이월됩니다.` },
      { name: '이월 금액', value: `${fmtNumber(state.rollover)} BE`, inline: true },
      { name: '봇 은행(정수)', value: `${fmtNumber(bank)} BE`, inline: true }
    )
    .setFooter({ text: '모든 기준은 한국 시간(Asia/Seoul)입니다.' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lotto_buy').setLabel('복권 응모').setStyle(ButtonStyle.Primary).setEmoji('🧾'),
    new ButtonBuilder().setCustomId('lotto_history').setLabel('복권 기록').setStyle(ButtonStyle.Secondary).setEmoji('📜'),
    new ButtonBuilder().setCustomId('lotto_my').setLabel('내 복권 구매 이력').setStyle(ButtonStyle.Secondary).setEmoji('🗂️')
  );
  return { embeds: [embed], components: [row] };
}

async function publishOrUpdatePanel(client) {
  return await withLock(async (state) => {
    const channelId = state.channelId || CHANNEL_ID_FALLBACK;
    const channel = await client.channels.fetch(channelId);
    if (!channel) return;
    const panel = await buildPanel(client);
    let message = null;
    if (state.messageId) {
      try {
        const msg = await channel.messages.fetch(state.messageId);
        await msg.edit(panel);
        message = msg;
      } catch {
        const sent = await channel.send(panel);
        state.messageId = sent.id;
        message = sent;
      }
    } else {
      const sent = await channel.send(panel);
      state.messageId = sent.id;
      message = sent;
    }
    state.panelEditedAt = nowUtcMs();
    return message;
  });
}

async function scheduleAll(client) {
  await publishOrUpdatePanel(client);
  setupTick(client);
  setupDrawTimer(client);
}

let tickTimer = null;
function setupTick(client) {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => publishOrUpdatePanel(client).catch(() => {}), 60 * 1000);
}

let drawTimer = null;
function setupDrawTimer(client) {
  if (drawTimer) clearTimeout(drawTimer);
  const now = nowUtcMs();
  const drawAt = nextSaturday2000Kst(now);
  const wait = Math.max(5, drawAt - now);
  drawTimer = setTimeout(async () => {
    try { await runDraw(client); } finally { setupDrawTimer(client); }
  }, wait);
}

async function runDraw(client) {
  await withLock(async (state) => {
    const now = nowUtcMs();
    const drawAt = nextSaturday2000Kst(now - 60 * 1000);
    const channel = await client.channels.fetch(state.channelId || CHANNEL_ID_FALLBACK);
    const bankBefore = getBE(BOT_BANK_ID);
    const potBase = bankBefore;
    const pot = Math.max(0, potBase) + Math.max(0, state.rollover || 0);
    const resultNums = drawWinning();
    const round = state.round;

    const allTickets = Object.entries(state.tickets[round] || {}).map(([uid, lines]) => ({ uid, lines }));
    const firstWinners = [];
    const secondWinners = [];
    const thirdWinners = [];
    for (const { uid, lines } of allTickets) {
      for (const line of lines) {
        const mc = matchCount(line.numbers, resultNums);
        if (mc === 5) firstWinners.push({ uid, line });
        else if (mc === 4) secondWinners.push({ uid, line });
        else if (mc === 3) thirdWinners.push({ uid, line });
      }
    }

    const dist = state.distribution || DEFAULT_DISTRIBUTION;
    let remain = pot;
    const tiers = [
      { key: 'first', winners: firstWinners, pct: dist.first, title: '1등' },
      { key: 'second', winners: secondWinners, pct: dist.second, title: '2등' },
      { key: 'third', winners: thirdWinners, pct: dist.third, title: '3등' }
    ];

    const awards = {};
    for (const t of tiers) {
      const share = Math.floor(pot * (t.pct / 100));
      if (t.winners.length > 0) {
        const each = Math.max(0, Math.floor(share / t.winners.length));
        awards[t.key] = { total: share, each, count: t.winners.length };
        remain -= share;
      } else {
        awards[t.key] = { total: 0, each: 0, count: 0, rolled: share };
      }
    }

    const payouts = [];
    for (const t of tiers) {
      const a = awards[t.key];
      if (a.each > 0) {
        for (const w of t.winners) {
          payouts.push({ to: w.uid, amount: a.each, tier: t.title });
        }
      }
    }

    for (const p of payouts) {
      await transferBE(BOT_BANK_ID, p.to, p.amount, 0, `복권 ${round}회차 ${p.tier} 당첨`);
    }

    const rolled = (awards.first.rolled || 0) + (awards.second.rolled || 0) + (awards.third.rolled || 0) + Math.max(0, remain);
    state.rounds.unshift({
      round,
      drawAt,
      numbers: resultNums,
      potBefore: pot,
      bankBefore: bankBefore,
      winners: {
        first: awards.first,
        second: awards.second,
        third: awards.third
      },
      payoutCount: payouts.length,
      rolled
    });
    if (state.rounds.length > 50) state.rounds = state.rounds.slice(0, 50);

    state.rollover = rolled;
    state.lastDrawAt = drawAt;
    state.round += 1;
    delete state.tickets[round];

    const embed = new EmbedBuilder()
      .setTitle(`🎉 ${round}회차 복권 추첨 결과`)
      .setColor(0x22c55e)
      .setDescription([
        `• 당첨 번호: **${resultNums.join(', ')}**`,
        `• 총 상금(이월 포함): **${fmtNumber(pot)} BE**`,
        `• 1등: ${awards.first.count}명${awards.first.count ? ` (1인당 ${fmtNumber(awards.first.each)} BE)` : ''}`,
        `• 2등: ${awards.second.count}명${awards.second.count ? ` (1인당 ${fmtNumber(awards.second.each)} BE)` : ''}`,
        `• 3등: ${awards.third.count}명${awards.third.count ? ` (1인당 ${fmtNumber(awards.third.each)} BE)` : ''}`,
        `• 이월 금액: **${fmtNumber(rolled)} BE**`,
      ].join('\n'))
      .setFooter({ text: '당첨을 진심으로 축하드립니다. (세부 세금/정수세는 시스템 규칙에 따릅니다.)' });

    if (channel) await channel.send({ embeds: [embed] });
  });

  await publishOrUpdatePanel(client);
}

function parseNumbers(text) {
  const arr = String(text || '')
    .replace(/[^\d\s,]/g, ' ')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(x => parseInt(x, 10));
  const uniq = Array.from(new Set(arr));
  return uniq.slice(0, PICK_COUNT).sort((a, b) => a - b);
}

async function openBuyModal(interaction) {
  const now = nowUtcMs();
  if (isSalesClosed(now)) {
    await interaction.reply({ content: '현재는 복권 판매 휴무 시간입니다. 월요일 오전 9시 이후에 다시 이용해 주십시오.', ephemeral: true });
    return;
  }
  const modal = new ModalBuilder().setCustomId('lotto_buy_modal').setTitle('복권 응모');
  const input = new TextInputBuilder()
    .setCustomId('numbers')
    .setLabel('1~45 중 5개 번호 (쉼표/공백 구분)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('예: 3 7 12 27 41')
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handleBuySubmit(interaction) {
  const numbers = parseNumbers(interaction.fields.getTextInputValue('numbers'));
  if (!withinRangeUniqueFive(numbers)) {
    await interaction.reply({ content: '번호 형식이 올바르지 않습니다. 1~45 사이의 서로 다른 숫자 5개를 입력해 주십시오.', ephemeral: true });
    return;
  }
  const now = nowUtcMs();
  if (isSalesClosed(now)) {
    await interaction.reply({ content: '현재는 복권 판매 휴무 시간입니다. 월요일 오전 9시 이후에 다시 이용해 주십시오.', ephemeral: true });
    return;
  }

  const bank = loadBE();
  const my = bank[interaction.user.id]?.amount || 0;
  if (my < PRICE_PER_LINE) {
    await interaction.reply({ content: `정수가 부족하여 응모하실 수 없습니다. 최소 ${fmtNumber(PRICE_PER_LINE)} BE가 필요합니다.`, ephemeral: true });
    return;
  }

  await withLock(async (state) => {
    const round = state.round;
    if (!state.tickets[round]) state.tickets[round] = {};
    if (!state.tickets[round][interaction.user.id]) state.tickets[round][interaction.user.id] = [];
    state.tickets[round][interaction.user.id].push({ numbers, ts: now });

    const res = await transferBE(interaction.user.id, BOT_BANK_ID, PRICE_PER_LINE, 0, `복권 ${round}회차 1줄 구매 (${numbers.join(', ')})`);
    if (!res?.ok) throw new Error('결제 실패');

    await interaction.reply({ content: `응모가 완료되었습니다. 선택하신 번호는 **${numbers.join(', ')}** 입니다. 행운을 빕니다.`, ephemeral: true });
  });

  try { await publishOrUpdatePanel(interaction.client); } catch {}
}

async function openHistory(interaction) {
  const state = loadState();
  const items = state.rounds.slice(0, 10);
  if (items.length === 0) {
    await interaction.reply({ content: '아직 추첨 기록이 없습니다.', ephemeral: true });
    return;
  }
  const lines = items.map(r => {
    const ts = discordTs(r.drawAt, 'f');
    return `• **${r.round}회차** ${ts} | 번호: ${r.numbers.join(', ')} | 총상금 ${fmtNumber(r.potBefore)} BE | 1등 ${r.winners.first.count}명, 2등 ${r.winners.second.count}명, 3등 ${r.winners.third.count}명 | 이월 ${fmtNumber(r.rolled)} BE`;
  });
  const embed = new EmbedBuilder()
    .setTitle('📜 복권 기록(최근 10개)')
    .setColor(0x64748b)
    .setDescription(lines.join('\n'));
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function openMy(interaction) {
  const state = loadState();
  const roundNow = state.round;
  const recentRounds = [roundNow - 1, roundNow - 2, roundNow - 3, roundNow - 4, roundNow - 5].filter(x => x > 0);
  const chunks = [];

  for (const r of recentRounds) {
    const roundData = state.rounds.find(x => x.round === r);
    const myLines = (state.tickets[r]?.[interaction.user.id] || []);
    if (myLines.length === 0 && !roundData) continue;

    if (!roundData) {
      if (myLines.length) {
        chunks.push(`**${r}회차** (추첨 전)\n${myLines.map(l => `- ${l.numbers.join(', ')}`).join('\n')}`);
      }
      continue;
    }

    const nums = roundData.numbers;
    const tierOf = (mc) => mc === 5 ? '1등' : mc === 4 ? '2등' : mc === 3 ? '3등' : '낙첨';
    const awards = roundData.winners;
    let earned = 0;
    const awardsMap = {};
    if (awards.first.each) awardsMap['1등'] = awards.first.each;
    if (awards.second.each) awardsMap['2등'] = awards.second.each;
    if (awards.third.each) awardsMap['3등'] = awards.third.each;
    const lines = (state.tickets[r]?.[interaction.user.id] || []).map(l => {
      const mc = matchCount(l.numbers, nums);
      const t = tierOf(mc);
      const gain = awardsMap[t] || 0;
      earned += gain;
      return `- ${l.numbers.join(', ')} → ${t}${gain ? ` (+${fmtNumber(gain)} BE)` : ''}`;
    });
    if (lines.length) {
      chunks.push(`**${r}회차** (당첨번호: ${nums.join(', ')})\n${lines.join('\n')}${earned ? `\n획득 합계: **${fmtNumber(earned)} BE**` : ''}`);
    }
  }

  if (chunks.length === 0) {
    await interaction.reply({ content: '최근 회차 기준으로 구매 이력이 없거나, 조회 가능한 정보가 없습니다.', ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder().setTitle('🗂️ 내 복권 구매 이력').setColor(0x8b5cf6).setDescription(chunks.join('\n\n'));
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function onInteraction(interaction) {
  if (interaction.isButton()) {
    const id = interaction.customId;
    if (id === 'lotto_buy') return openBuyModal(interaction);
    if (id === 'lotto_history') return openHistory(interaction);
    if (id === 'lotto_my') return openMy(interaction);
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'lotto_buy_modal') return handleBuySubmit(interaction);
  }
}

async function createLotterySystem(client, channelId) {
  await withLock(async (state) => {
    if (channelId) state.channelId = channelId;
    if (!state.distribution) state.distribution = DEFAULT_DISTRIBUTION;
    if (!state.tickets) state.tickets = {};
    if (!state.rounds) state.rounds = [];
  });

  client.on('interactionCreate', onInteraction);
  const start = async () => {
    try {
      console.log('[lottery] start → panel/schedule');
      await scheduleAll(client);
    } catch (e) {
      console.error('[lottery] scheduleAll failed:', e);
    }
  };

  if (typeof client.isReady === 'function' && client.isReady()) {
    start();
  } else {
    client.once('ready', start);
  }
}

module.exports = { createLotterySystem };

