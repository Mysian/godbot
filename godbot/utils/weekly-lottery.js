const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { loadBE, saveBE, getBE, addBE } = require('../commands/be-util');

const CHANNEL_ID = '1427667597901566024';
const BOT_BANK_ID = '1380841362752274504';
const DATA_PATH = path.join(__dirname, '../data/lottery.json');
const LOCK_PATH = DATA_PATH;
const TICKET_PRICE = 10000;
const MAX_NUMBER = 45;
const PICK_COUNT = 5;

function loadState() {
  if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, JSON.stringify({ round: 1, controlMessageId: null, rounds: {}, lastDrawAt: 0 }, null, 2));
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}
function saveState(s) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(s, null, 2));
}
function nowKST() {
  const d = new Date();
  return new Date(d.getTime() + 9 * 3600 * 1000);
}
function toUnix(ts) {
  return Math.floor(ts / 1000);
}
function kstYMD(d) {
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes(), ss: d.getUTCSeconds() };
}
function getNextSaturday20() {
  const n = nowKST();
  const k = kstYMD(n);
  const tmp = new Date(Date.UTC(k.y, k.m - 1, k.day, 20, 0, 0));
  let dow = tmp.getUTCDay();
  while (dow !== 6 || tmp <= new Date(Date.UTC(k.y, k.m - 1, k.day, k.hh, k.mm, k.ss))) {
    tmp.setUTCDate(tmp.getUTCDate() + 1);
    dow = tmp.getUTCDay();
  }
  return tmp;
}
function getThisSaturday20OrNext() {
  const n = nowKST();
  const k = kstYMD(n);
  const sat20 = new Date(Date.UTC(k.y, k.m - 1, k.day, 20, 0, 0));
  let d = sat20;
  while (d.getUTCDay() !== 6) d = new Date(d.getTime() + 24 * 3600 * 1000);
  if (d <= new Date(Date.UTC(k.y, k.m - 1, k.day, k.hh, k.mm, k.ss))) {
    const nd = new Date(d.getTime());
    nd.setUTCDate(nd.getUTCDate() + 7);
    return nd;
  }
  return d;
}
function isClosedForSales() {
  const n = nowKST();
  const k = kstYMD(n);
  const dow = new Date(Date.UTC(k.y, k.m - 1, k.day, 0, 0, 0)).getUTCDay();
  const mins = k.hh * 60 + k.mm;
  if (dow === 6 && mins >= 19 * 60 + 30) return true;
  if (dow === 0) return true;
  if (dow === 1 && mins <= 8 * 60 + 59) return true;
  return false;
}
function salesStatusText() {
  if (isClosedForSales()) return '판매 중지';
  return '판매 중';
}
function formatAmount(n) {
  return Number(n).toLocaleString('ko-KR');
}
function uniqueSortedFive(arr) {
  const s = Array.from(new Set(arr.map(x => Number(x)).filter(x => Number.isInteger(x) && x >= 1 && x <= MAX_NUMBER)));
  s.sort((a, b) => a - b);
  if (s.length !== PICK_COUNT) return null;
  return s;
}
function drawWinningNumbers() {
  const nums = [];
  while (nums.length < PICK_COUNT) {
    const x = 1 + Math.floor(Math.random() * MAX_NUMBER);
    if (!nums.includes(x)) nums.push(x);
  }
  nums.sort((a, b) => a - b);
  return nums;
}
function countMatches(a, b) {
  let c = 0;
  for (const x of a) if (b.includes(x)) c++;
  return c;
}
function prizeSplit(pool, winners5, winners4, winners3) {
  let p1 = Math.floor(pool * 0.75);
  let p2 = Math.floor(pool * 0.15);
  let p3 = Math.floor(pool * 0.10);
  let dist = { p1Each: 0, p2Each: 0, p3Each: 0, used: 0, remain: pool };
  if (winners5 > 0) { dist.p1Each = Math.floor(p1 / winners5); dist.used += dist.p1Each * winners5; }
  if (winners4 > 0) { dist.p2Each = Math.floor(p2 / winners4); dist.used += dist.p2Each * winners4; }
  if (winners3 > 0) { dist.p3Each = Math.floor(p3 / winners3); dist.used += dist.p3Each * winners3; }
  dist.remain = pool - dist.used;
  return dist;
}
async function computePoolBE() {
  const be = loadBE();
  return be[BOT_BANK_ID]?.amount || 0;
}
async function payPrize(toId, amount, round, rank) {
  if (amount <= 0) return;
  await addBE(BOT_BANK_ID, -amount, `복권 ${round}회차 상금 지급(${rank}) → <@${toId}>`);
  await addBE(toId, amount, `복권 ${round}회차 상금 수령(${rank})`);
}
function ensureRound(state, r) {
  if (!state.rounds[r]) state.rounds[r] = { tickets: [], result: null, drawnAt: 0 };
}
function buildControlEmbed(livePot, state, nextDrawTs, closed) {
  const r = state.round;
  const count = state.rounds[r]?.tickets?.length || 0;
  const status = closed ? '판매 중지' : '판매 중';
  const nextText = closed ? '다음 판매 재개' : '다음 추첨';
  const embed = new EmbedBuilder()
    .setTitle(`🎟️ 주간 복권 | ${r}회차`)
    .setColor(closed ? 0x9e9e9e : 0x00bcd4)
    .setDescription(['안녕하세요. 주간 복권 안내입니다.', '아래 버튼으로 응모, 기록 확인이 가능합니다.'].join('\n'))
    .addFields(
      { name: '예정 당첨금(현재 포트)', value: `**${formatAmount(livePot)} BE**`, inline: true },
      { name: '판매 상태', value: `**${status}**`, inline: true },
      { name: '응모 장수', value: `**${formatAmount(count)} 장**`, inline: true },
      { name: nextText, value: `<t:${toUnix(nextDrawTs.getTime())}:R> (<t:${toUnix(nextDrawTs.getTime())}:F>)`, inline: false }
    )
    .setFooter({ text: closed ? '토 19:30~월 08:59에는 판매가 중지됩니다.' : '판매는 월 09:00~토 19:29까지 가능합니다.' });
  return embed;
}
function controlRows(closed) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lottery_enter').setLabel('복권 응모').setStyle(ButtonStyle.Primary).setDisabled(closed),
    new ButtonBuilder().setCustomId('lottery_records').setLabel('복권 기록').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('lottery_mine').setLabel('내 복권 구매 이력').setStyle(ButtonStyle.Secondary)
  );
  return [row];
}
async function publishOrUpdate(client) {
  const channel = await client.channels.fetch(CHANNEL_ID);
  const state = loadState();
  ensureRound(state, state.round);
  const nextDraw = getThisSaturday20OrNext();
  const closed = isClosedForSales();
  const pot = await computePoolBE();
  const embed = buildControlEmbed(pot, state, nextDraw, closed);
  const rows = controlRows(closed);
  if (state.controlMessageId) {
    try {
      const msg = await channel.messages.fetch(state.controlMessageId);
      await msg.edit({ embeds: [embed], components: rows });
      return;
    } catch {}
  }
  const msg = await channel.send({ embeds: [embed], components: rows });
  state.controlMessageId = msg.id;
  saveState(state);
}
async function handleEnter(interaction) {
  if (isClosedForSales()) {
    await interaction.reply({ content: '현재는 판매가 중지된 시간입니다. 월요일 오전 9시에 판매가 재개됩니다.', ephemeral: true });
    return;
  }
  const modal = new ModalBuilder().setCustomId('lottery_enter_modal').setTitle('복권 응모(1줄 10,000 BE)');
  const input = new TextInputBuilder().setCustomId('numbers').setLabel('1~45 중 5개를 쉼표(,)로 입력해 주세요').setStyle(TextInputStyle.Short).setPlaceholder('예: 3,7,12,28,41').setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}
async function handleEnterModal(interaction) {
  const raw = interaction.fields.getTextInputValue('numbers');
  const parsed = raw.split(/[,\s]+/).filter(Boolean).map(v => parseInt(v.trim(), 10));
  const picked = uniqueSortedFive(parsed);
  if (!picked) {
    await interaction.reply({ content: '입력 형식이 잘못되었습니다. 1부터 45 사이의 서로 다른 숫자 5개를 쉼표로 구분해 입력해 주세요.', ephemeral: true });
    return;
  }
  if (isClosedForSales()) {
    await interaction.reply({ content: '현재는 판매가 중지된 시간입니다. 월요일 오전 9시에 판매가 재개됩니다.', ephemeral: true });
    return;
  }
  const balance = getBE(interaction.user.id);
  if (balance < TICKET_PRICE) {
    await interaction.reply({ content: `잔액이 부족합니다. 필요 금액: ${formatAmount(TICKET_PRICE)} BE`, ephemeral: true });
    return;
  }
  let release;
  try {
    release = await lockfile.lock(LOCK_PATH, { retries: { retries: 10, minTimeout: 30, maxTimeout: 120 } });
    const state = loadState();
    ensureRound(state, state.round);
    await addBE(interaction.user.id, -TICKET_PRICE, `복권 ${state.round}회차 1줄 구매(${picked.join('-')})`);
    await addBE(BOT_BANK_ID, TICKET_PRICE, `복권 ${state.round}회차 판매 수익`);
    const ticket = { id: `${interaction.user.id}-${Date.now()}`, userId: interaction.user.id, numbers: picked, ts: Date.now(), result: null, prize: 0, paid: false };
    state.rounds[state.round].tickets.push(ticket);
    saveState(state);
    await interaction.reply({ content: `응모가 완료되었습니다. 선택 번호: ${picked.join(', ')} | 가격: ${formatAmount(TICKET_PRICE)} BE`, ephemeral: true });
  } finally {
    if (release) await release();
  }
}
function buildRecordsEmbed(state, page) {
  const rounds = Object.keys(state.rounds).map(v => parseInt(v, 10)).filter(r => state.rounds[r]?.result).sort((a, b) => b - a);
  const per = 5;
  const maxPage = Math.max(1, Math.ceil(rounds.length / per));
  const p = Math.min(Math.max(1, page), maxPage);
  const slice = rounds.slice((p - 1) * per, (p - 1) * per + per);
  let desc = slice.map(r => {
    const rr = state.rounds[r];
    const res = rr.result;
    const w = res ? res.winning.join(', ') : '-';
    const w5 = res ? res.winners5 : 0;
    const w4 = res ? res.winners4 : 0;
    const w3 = res ? res.winners3 : 0;
    const pool = res ? res.pool : 0;
    return `• ${r}회차 | 당첨번호: [${w}] | 1등 ${w5}명, 2등 ${w4}명, 3등 ${w3}명 | 총포트 ${formatAmount(pool)} BE | 추첨 <t:${toUnix(rr.drawnAt)}:f>`;
  }).join('\n');
  if (!desc) desc = '아직 공개된 기록이 없습니다.';
  const embed = new EmbedBuilder()
    .setTitle('📚 복권 기록')
    .setColor(0x607d8b)
    .setDescription(desc)
    .setFooter({ text: `${p}/${maxPage} 페이지` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`lottery_records_prev:${p}`).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(p <= 1),
    new ButtonBuilder().setCustomId(`lottery_records_next:${p}`).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(p >= maxPage)
  );
  return { embed, components: [row] };
}
async function handleRecords(interaction) {
  const state = loadState();
  const view = buildRecordsEmbed(state, 1);
  await interaction.reply({ embeds: [view.embed], components: view.components, ephemeral: true });
}
async function handleRecordsPage(interaction, dir, cur) {
  const state = loadState();
  const page = dir === 'prev' ? Math.max(1, cur - 1) : cur + 1;
  const view = buildRecordsEmbed(state, page);
  await interaction.update({ embeds: [view.embed], components: view.components });
}
function buildMineEmbed(state, userId) {
  const rNow = state.round;
  const rPrev = rNow - 1;
  const list = [];
  const pushTickets = (rr, tag) => {
    if (!state.rounds[rr]) return;
    for (const t of state.rounds[rr].tickets || []) {
      if (t.userId !== userId) continue;
      const res = t.result ? `당첨(${t.result.rank}) ${formatAmount(t.prize)} BE` : (state.rounds[rr].result ? `낙첨` : `추첨 대기`);
      list.push(`${tag} ${rr}회차 | [${t.numbers.join(', ')}] | ${res} | 구매 <t:${toUnix(t.ts)}:R>`);
    }
  };
  pushTickets(rNow, '•');
  pushTickets(rPrev, '•');
  const text = list.length ? list.join('\n') : '구매 이력이 없습니다.';
  const embed = new EmbedBuilder().setTitle('🧾 내 복권 구매 이력').setColor(0x9c27b0).setDescription(text);
  return embed;
}
async function handleMine(interaction) {
  const state = loadState();
  const embed = buildMineEmbed(state, interaction.user.id);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
async function runDraw(client) {
  let release;
  try {
    release = await lockfile.lock(LOCK_PATH, { retries: { retries: 10, minTimeout: 30, maxTimeout: 120 } });
    const state = loadState();
    const r = state.round;
    ensureRound(state, r);
    if (state.rounds[r].result) return;
    const now = nowKST();
    const nextSat20 = getThisSaturday20OrNext();
    const diff = nextSat20.getTime() - (now.getTime() - 9 * 3600 * 1000);
    if (diff > 0) return;
    const winning = drawWinningNumbers();
    const tickets = state.rounds[r].tickets || [];
    const pool = await computePoolBE();
    let winners5 = 0, winners4 = 0, winners3 = 0;
    for (const t of tickets) {
      const m = countMatches(t.numbers, winning);
      if (m === 5) winners5++; else if (m === 4) winners4++; else if (m === 3) winners3++;
    }
    const dist = prizeSplit(pool, winners5, winners4, winners3);
    for (const t of tickets) {
      const m = countMatches(t.numbers, winning);
      if (m === 5) { t.result = { rank: '1등', match: 5 }; t.prize = dist.p1Each; }
      else if (m === 4) { t.result = { rank: '2등', match: 4 }; t.prize = dist.p2Each; }
      else if (m === 3) { t.result = { rank: '3등', match: 3 }; t.prize = dist.p3Each; }
      else { t.result = { rank: '낙첨', match: m }; t.prize = 0; }
      t.paid = false;
    }
    state.rounds[r].result = { winning, winners5, winners4, winners3, pool, used: dist.used, remain: dist.remain };
    state.rounds[r].drawnAt = Math.floor(Date.now() / 1000);
    saveState(state);
    for (const t of tickets) {
      if (t.prize > 0 && !t.paid) {
        await payPrize(t.userId, t.prize, r, t.result.rank);
        t.paid = true;
      }
    }
    saveState(state);
    const channel = await client.channels.fetch(CHANNEL_ID);
    const lines = [];
    lines.push(`당첨 번호: **${winning.join(', ')}**`);
    lines.push(`총 포트: **${formatAmount(pool)} BE** | 지급: **${formatAmount(state.rounds[r].result.used)} BE** | 이월: **${formatAmount(state.rounds[r].result.remain)} BE**`);
    lines.push(`1등(5개 일치): **${winners5}명** | 2등(4개): **${winners4}명** | 3등(3개): **${winners3}명**`);
    const winnersList = tickets.filter(t => t.prize > 0).slice(0, 20).map(t => `• <@${t.userId}> | [${t.numbers.join(', ')}] | ${t.result.rank} ${formatAmount(t.prize)} BE`).join('\n') || '당첨자가 없습니다.';
    const embed = new EmbedBuilder()
      .setTitle(`🎉 복권 ${r}회차 추첨 결과`)
      .setColor(0x4caf50)
      .setDescription(lines.join('\n'))
      .addFields({ name: '주요 당첨 목록', value: winnersList });
    await channel.send({ embeds: [embed] });
    state.round += 1;
    ensureRound(state, state.round);
    saveState(state);
    await publishOrUpdate(client);
  } finally {
    if (release) await release();
  }
}
async function tick(client) {
  await publishOrUpdate(client);
  await runDraw(client);
}
async function onInteractionCreate(interaction) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return;
  if (interaction.isButton()) {
    if (interaction.customId === 'lottery_enter') { await handleEnter(interaction); return; }
    if (interaction.customId === 'lottery_records') { await handleRecords(interaction); return; }
    if (interaction.customId === 'lottery_mine') { await handleMine(interaction); return; }
    if (interaction.customId.startsWith('lottery_records_prev:')) {
      const cur = parseInt(interaction.customId.split(':')[1], 10) || 1;
      await handleRecordsPage(interaction, 'prev', cur);
      return;
    }
    if (interaction.customId.startsWith('lottery_records_next:')) {
      const cur = parseInt(interaction.customId.split(':')[1], 10) || 1;
      await handleRecordsPage(interaction, 'next', cur);
      return;
    }
  }
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'lottery_enter_modal') { await handleEnterModal(interaction); return; }
  }
}
let _interval = null;
async function init(client) {
  client.on('interactionCreate', onInteractionCreate);
  client.once('ready', async () => {
    await publishOrUpdate(client);
    if (_interval) clearInterval(_interval);
    _interval = setInterval(() => tick(client).catch(() => {}), 30000);
  });
}
module.exports = { init, publish: publishOrUpdate };
