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
  const tmp = new Date(Date.UTC(k.y, k.m - 1, k.day, 11, 0, 0));
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
  const sat20 = new Date(Date.UTC(k.y, k.m - 1, k.day, 11, 0, 0));
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
  return n.toLocaleString('ko-KR');
}
function uniqueSortedFive(arr) {
  if (!Array.isArray(arr)) return null;
  const f = arr.filter(v => Number.isInteger(v) && v >= 1 && v <= MAX_NUMBER);
  const set = Array.from(new Set(f));
  if (set.length !== PICK_COUNT) return null;
  set.sort((a, b) => a - b);
  return set;
}
function compareWin(picked, win) {
  let m = 0;
  let i = 0;
  let j = 0;
  while (i < picked.length && j < win.length) {
    if (picked[i] === win[j]) {
      m++;
      i++;
      j++;
    } else if (picked[i] < win[j]) {
      i++;
    } else {
      j++;
    }
  }
  return m;
}
function winningPrize(matches, pool, winners5, winners4, winners3) {
  if (matches === 5) {
    if (winners5 === 0) return Math.floor(pool * 0.7);
    return Math.floor((pool * 0.7) / winners5);
  }
  if (matches === 4) {
    if (winners4 === 0) return Math.floor(pool * 0.2);
    return Math.floor((pool * 0.2) / winners4);
  }
  if (matches === 3) {
    if (winners3 === 0) return Math.floor(pool * 0.1);
    return Math.floor((pool * 0.1) / winners3);
  }
  return 0;
}
function ensureRound(state, r) {
  if (!state.rounds[r]) state.rounds[r] = { tickets: [], result: null, drawnAt: 0 };
}
async function computePoolBE() {
  const be = await loadBE(BOT_BANK_ID);
  return be.balance || 0;
}
function controlRows(closed) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lottery_enter').setLabel('응모하기').setStyle(ButtonStyle.Primary).setDisabled(closed),
    new ButtonBuilder().setCustomId('lottery_records').setLabel('기록 보기').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('lottery_mine').setLabel('내 응모내역').setStyle(ButtonStyle.Secondary)
  );
  return [row1];
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
    .setFooter({ text: closed ? '토 19:30~월 08:59에는 판매가 중지됩니다.' : '토 20:00에 추첨이 진행됩니다.' });
  return embed;
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
function buildRecordsEmbed(state, page) {
  const rounds = Object.keys(state.rounds).map(v => parseInt(v, 10)).filter(r => state.rounds[r]?.result).sort((a, b) => b - a);
  const per = 5;
  const maxPage = Math.max(1, Math.ceil(rounds.length / per));
  const p = Math.min(maxPage, Math.max(1, page || 1));
  const list = rounds.slice((p - 1) * per, (p - 1) * per + per).map(rr => {
    const r = state.rounds[rr];
    const w = r.result?.win?.join(', ') || '-';
    const pool = r.result?.pool || 0;
    const w5 = r.result?.winners5 || 0;
    const w4 = r.result?.winners4 || 0;
    const w3 = r.result?.winners3 || 0;
    return `• ${rr}회차 | 당첨번호: [${w}] | 1등 ${w5}명, 2등 ${w4}명, 3등 ${w3}명 | 총포트 ${formatAmount(pool)} BE | 추첨 <t:${toUnix(r.drawnAt)}:f>`;
  }).join('\n');
  const embed = new EmbedBuilder().setTitle('📜 복권 기록').setColor(0x607d8b).setDescription(list || '아직 공개된 기록이 없습니다.');
  return embed;
}
async function handleRecords(interaction) {
  await interaction.reply({ embeds: [buildRecordsEmbed(loadState(), 1)], components: [recordsPager(1)], ephemeral: true });
}
function recordsPager(page) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`lottery_records_prev:${page}`).setLabel('이전').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`lottery_records_next:${page}`).setLabel('다음').setStyle(ButtonStyle.Secondary)
  );
  return row;
}
async function handleRecordsPage(interaction, dir, cur) {
  const p = dir === 'prev' ? Math.max(1, cur - 1) : cur + 1;
  await interaction.update({ embeds: [buildRecordsEmbed(loadState(), p)], components: [recordsPager(p)] });
}
async function handleMine(interaction) {
  const state = loadState();
  const rNow = state.round;
  const rPrev = state.round - 1;
  const list = [];
  const pushTickets = (rr, tag) => {
    if (!state.rounds[rr]) return;
    for (const t of state.rounds[rr].tickets) {
      if (t.userId !== interaction.user.id) continue;
      const res = t.result == null ? `추첨 대기` : (t.result.win ? `당첨 ${formatAmount(t.prize)} BE` : `낙첨`);
      list.push(`${tag} ${rr}회차 | [${t.numbers.join(', ')}] | ${res} | 구매 <t:${toUnix(t.ts)}:R>`);
    }
  };
  pushTickets(rNow, '•');
  pushTickets(rPrev, '•');
  const text = list.length ? list.join('\n') : '구매 내역이 없습니다.';
  const embed = new EmbedBuilder().setTitle('🧾 내 응모 내역').setColor(0x795548).setDescription(text);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
async function handleEnter(interaction) {
  if (isClosedForSales()) {
    await interaction.reply({ content: '현재는 판매가 중지된 시간입니다. 월요일 오전 9시에 판매가 재개됩니다.', ephemeral: true });
    return;
  }
  const modal = new ModalBuilder().setCustomId('lottery_enter_modal').setTitle('복권 응모(1줄 10,000 BE)');
  const input = new TextInputBuilder().setCustomId('numbers').setLabel('숫자 5개 입력(1~45, 쉼표로 구분)').setStyle(TextInputStyle.Short).setPlaceholder('예: 3,7,12,28,41').setRequired(true);
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
function drawNumbers() {
  const set = new Set();
  while (set.size < PICK_COUNT) {
    set.add(1 + Math.floor(Math.random() * MAX_NUMBER));
  }
  return Array.from(set).sort((a, b) => a - b);
}
function runDrawInternal(state, ts) {
  const r = state.round;
  ensureRound(state, r);
  const win = drawNumbers();
  const pool = state.rounds[r].tickets.length * TICKET_PRICE + 0;
  let winners5 = 0;
  let winners4 = 0;
  let winners3 = 0;
  for (const t of state.rounds[r].tickets) {
    const m = compareWin(t.numbers, win);
    if (m === 5) winners5++;
    else if (m === 4) winners4++;
    else if (m === 3) winners3++;
  }
  for (const t of state.rounds[r].tickets) {
    const m = compareWin(t.numbers, win);
    const prize = winningPrize(m, pool, winners5, winners4, winners3);
    t.result = { win: m >= 3, matches: m };
    t.prize = prize;
    t.paid = false;
  }
  state.rounds[r].result = { win, pool, winners5, winners4, winners3 };
  state.rounds[r].drawnAt = Math.floor(ts / 1000);
  state.lastDrawAt = ts;
  state.round = r + 1;
  ensureRound(state, state.round);
}
async function payPrizes(client, state) {
  const r = state.round - 1;
  if (!state.rounds[r] || !state.rounds[r].result) return;
  for (const t of state.rounds[r].tickets) {
    if (t.paid) continue;
    if (t.prize > 0) await addBE(t.userId, t.prize, `복권 ${r}회차 당첨금 지급`);
    t.paid = true;
  }
  saveState(state);
}
async function announceDraw(client, state) {
  const r = state.round - 1;
  const ch = await client.channels.fetch(CHANNEL_ID);
  const res = state.rounds[r].result;
  const win = res.win.join(', ');
  const msg = [
    `🎊 복권 ${r}회차 추첨 결과`,
    `당첨 번호: [${win}]`,
    `1등 ${res.winners5}명, 2등 ${res.winners4}명, 3등 ${res.winners3}명`,
    `총 포트: ${formatAmount(res.pool)} BE`
  ].join('\n');
  await ch.send({ content: msg });
}
async function tick(client) {
  const state = loadState();
  const now = nowKST();
  const k = kstYMD(now);
  const next = getThisSaturday20OrNext();
  const nextUnix = Math.floor(next.getTime() / 1000);
  const nowUnix = Math.floor(Date.now() / 1000);
  const closed = isClosedForSales();
  if (Math.abs(nowUnix - nextUnix) <= 120 && !state.rounds[state.round]?.result && !closed) {
    runDrawInternal(state, Date.now());
    saveState(state);
    await payPrizes(client, state);
    await announceDraw(client, state);
    await publishOrUpdate(client);
    return;
  }
  if (Math.floor(Date.now() / 60000) % 5 === 0) {
    await publishOrUpdate(client);
  }
}
async function handleMineMenu(interaction, state, r) {
  const mine = state.rounds[r]?.tickets?.filter(t => t.userId === interaction.user.id) || [];
  const options = mine.map((t, idx) => ({ label: `[${t.numbers.join(', ')}] ${new Date(t.ts).toLocaleString('ko-KR')}`, value: String(idx) }));
  if (!options.length) {
    await interaction.reply({ content: '구매 내역이 없습니다.', ephemeral: true });
    return;
  }
  const menu = new StringSelectMenuBuilder().setCustomId('lottery_mine_menu').setPlaceholder('상세 내역 보기').addOptions(options);
  const row = new ActionRowBuilder().addComponents(menu);
  await interaction.reply({ content: '확인할 내역을 선택하세요.', components: [row], ephemeral: true });
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
