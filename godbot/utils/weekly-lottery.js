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
const PER_ROUND_MAX_TICKETS = 100;
const PER_ROUND_MAX_SPEND = 1000000;

function loadState() {
  if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, JSON.stringify({ round: 1, rounds: {}, lastDrawAt: 0 }, null, 2));
  const s = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  if (!s.rounds) s.rounds = {};
  return s;
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
function getThisSaturday20OrNext() {
  const n = nowKST();
  const k = kstYMD(n);
  const base = new Date(Date.UTC(k.y, k.m - 1, k.day, 11, 0, 0));
  let sat = base;
  while (sat.getUTCDay() !== 6) sat = new Date(sat.getTime() + 24 * 3600 * 1000);
  const nowUtc = new Date(Date.UTC(k.y, k.m - 1, k.day, k.hh, k.mm, k.ss));
  if (sat <= nowUtc) {
    const nd = new Date(sat.getTime());
    nd.setUTCDate(nd.getUTCDate() + 7);
    return nd;
  }
  return sat;
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
function uniqueSortedPick(arr, pickCount) {
  if (!Array.isArray(arr)) return null;
  const f = arr.filter(v => Number.isInteger(v) && v >= 1 && v <= MAX_NUMBER);
  const set = Array.from(new Set(f));
  if (set.length !== pickCount) return null;
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
function prizeByTier(matches, pool, rule, counts) {
  const pick = rule?.pick ?? (counts?.w6 !== undefined ? 6 : 5);
  if (pick === 6) {
    if (matches === 6) return counts.w6 ? Math.floor((pool * 0.6) / counts.w6) : Math.floor(pool * 0.6);
    if (matches === 5) return counts.w5 ? Math.floor((pool * 0.25) / counts.w5) : Math.floor(pool * 0.25);
    if (matches === 4) return counts.w4 ? Math.floor((pool * 0.10) / counts.w4) : Math.floor(pool * 0.10);
    if (matches === 3) return counts.w3 ? Math.floor((pool * 0.05) / counts.w3) : Math.floor(pool * 0.05);
    return 0;
  } else {
    if (matches === 5) return counts.w5 ? Math.floor((pool * 0.7) / counts.w5) : Math.floor(pool * 0.7);
    if (matches === 4) return counts.w4 ? Math.floor((pool * 0.2) / counts.w4) : Math.floor(pool * 0.2);
    if (matches === 3) return counts.w3 ? Math.floor((pool * 0.1) / counts.w3) : Math.floor(pool * 0.1);
    return 0;
  }
}
function ensureRound(state, r) {
  if (!state.rounds[r]) state.rounds[r] = { tickets: [], result: null, drawnAt: 0, rule: null, messageId: null, closedEdited: false };
  if (!state.rounds[r].rule) {
    const legacyExists = state.rounds[r].result || state.rounds[r].tickets.some(t => Array.isArray(t.numbers) && t.numbers.length === 5);
    state.rounds[r].rule = legacyExists ? { pick: 5 } : { pick: 6 };
  }
}
async function computePoolBE() {
  const all = await loadBE();
  const rec = all[BOT_BANK_ID];
  return rec && typeof rec.amount === 'number' ? rec.amount : 0;
}
function controlRows(closed, forceDisabled) {
  const disabled = !!forceDisabled || !!closed;
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lottery_enter').setLabel('응모하기').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('lottery_records').setLabel('기록 보기').setStyle(ButtonStyle.Secondary).setDisabled(!!forceDisabled),
    new ButtonBuilder().setCustomId('lottery_mine').setLabel('내 응모내역').setStyle(ButtonStyle.Secondary).setDisabled(!!forceDisabled)
  );
  return [row1];
}
function computeTierAmounts(rule, pool, res) {
  const inferredPick = rule?.pick ?? (res && Object.prototype.hasOwnProperty.call(res, 'winners6') ? 6 : 5);
  if (inferredPick === 6) {
    const a1 = res.winners6 > 0 ? Math.floor(pool * 0.6 / res.winners6) : 0;
    const a2 = res.winners5 > 0 ? Math.floor(pool * 0.25 / res.winners5) : 0;
    const a3 = res.winners4 > 0 ? Math.floor(pool * 0.10 / res.winners4) : 0;
    const a4 = res.winners3 > 0 ? Math.floor(pool * 0.05 / res.winners3) : 0;
    return { a1, a2, a3, a4, pick: 6 };
  } else {
    const a1 = res.winners5 > 0 ? Math.floor(pool * 0.7 / res.winners5) : 0;
    const a2 = res.winners4 > 0 ? Math.floor(pool * 0.2 / res.winners4) : 0;
    const a3 = res.winners3 > 0 ? Math.floor(pool * 0.1 / res.winners3) : 0;
    return { a1, a2, a3, pick: 5 };
  }
}
function buildControlEmbed(livePot, state, nextDrawTs, closed, ended) {
  const r = state.round;
  const count = state.rounds[r]?.tickets?.length || 0;
  const status = ended ? '판매 종료' : (closed ? '판매 중지' : '판매 중');
  const nextText = closed ? '다음 판매 재개' : '다음 추첨';
  const embed = new EmbedBuilder()
    .setTitle(`🎟️ 주간 복권 | ${r}회차${ended ? ' (종료)' : ''}`)
    .setColor(ended ? 0x9e9e9e : (closed ? 0x9e9e9e : 0x00bcd4))
    .setDescription(['아래 버튼으로 응모, 기록 확인이 가능합니다.'].join('\n'))
    .addFields(
      { name: '배분 예정 전체 금액', value: `**${formatAmount(livePot)} BE**`, inline: true },
      { name: '판매 상태', value: `**${status}**`, inline: true },
      { name: '응모 장수', value: `**${formatAmount(count)} 장**`, inline: true },
      { name: nextText, value: `<t:${toUnix(nextDrawTs.getTime())}:R> (<t:${toUnix(nextDrawTs.getTime())}:F>)`, inline: false }
    )
    .setFooter({ text: ended ? '해당 회차는 종료되었습니다.' : (closed ? '토 19:30~월 08:59에는 판매가 중지됩니다.' : '토 20:00에 추첨이 진행됩니다.') });
  return embed;
}
async function buildEndedEmbedFromMessage(msg) {
  const e = msg.embeds?.[0];
  const nb = new EmbedBuilder(e?.data || {}).setColor(0x9e9e9e);
  const title = e?.title || '주간 복권';
  nb.setTitle(title.includes('(종료)') ? title : `${title} (종료)`);
  nb.setFooter({ text: '해당 회차는 종료되었습니다.' });
  return nb;
}
async function disableOldMessages(client, state) {
  const ch = await client.channels.fetch(CHANNEL_ID);
  const keys = Object.keys(state.rounds).map(v => parseInt(v, 10)).filter(v => v < state.round);
  for (const rr of keys) {
    const info = state.rounds[rr];
    if (!info?.messageId) continue;
    if (info.closedEdited) continue;
    try {
      const msg = await ch.messages.fetch(info.messageId);
      const endedEmbed = await buildEndedEmbedFromMessage(msg);
      await msg.edit({ embeds: [endedEmbed], components: controlRows(true, true) });
      info.closedEdited = true;
      saveState(state);
    } catch {}
  }
}
async function publishOrUpdate(client) {
  const channel = await client.channels.fetch(CHANNEL_ID);
  const state = loadState();
  ensureRound(state, state.round);
  const nextDraw = getThisSaturday20OrNext();
  const closed = isClosedForSales();
  const pot = await computePoolBE();
  if (state.rounds[state.round].messageId) {
    try {
      const msg = await channel.messages.fetch(state.rounds[state.round].messageId);
      const embed = buildControlEmbed(pot, state, nextDraw, closed, false);
      await msg.edit({ embeds: [embed], components: controlRows(closed, false) });
    } catch {
      const embed = buildControlEmbed(pot, state, nextDraw, closed, false);
      const rows = controlRows(closed, false);
      const msg = await channel.send({ embeds: [embed], components: rows });
      state.rounds[state.round].messageId = msg.id;
      saveState(state);
    }
  } else {
    await disableOldMessages(client, state);
    const embed = buildControlEmbed(pot, state, nextDraw, closed, false);
    const rows = controlRows(closed, false);
    const msg = await channel.send({ embeds: [embed], components: rows });
    state.rounds[state.round].messageId = msg.id;
    saveState(state);
  }
}
function buildRecordsEmbed(state, page) {
  const rounds = Object.keys(state.rounds).map(v => parseInt(v, 10)).filter(r => state.rounds[r]?.result).sort((a, b) => b - a);
  const per = 50;
  const maxPage = Math.max(1, Math.ceil(rounds.length / per));
  const p = Math.min(maxPage, Math.max(1, page || 1));
  const list = rounds.slice((p - 1) * per, (p - 1) * per + per).map(rr => {
    const r = state.rounds[rr];
    const res = r.result || {};
    const w = res.win ? res.win.join(', ') : '-';
    const pool = res.pool || 0;
    const inferredRule = r.rule || { pick: (Object.prototype.hasOwnProperty.call(res, 'winners6') ? 6 : 5) };
    const amt = computeTierAmounts(inferredRule, pool, res);
    if (amt.pick === 6) {
      const w6 = res.winners6 || 0;
      const w5 = res.winners5 || 0;
      const w4 = res.winners4 || 0;
      const w3 = res.winners3 || 0;
      return `• ${rr}회차 | 당첨번호: [${w}] | 1등 ${w6}명(인당 ${formatAmount(amt.a1)}), 2등 ${w5}명(인당 ${formatAmount(amt.a2)}), 3등 ${w4}명(인당 ${formatAmount(amt.a3)}), 4등 ${w3}명(인당 ${formatAmount(amt.a4)}) | 총 복권 금액 ${formatAmount(pool)} BE | 추첨 <t:${toUnix(r.drawnAt)}:f>`;
    } else {
      const w5 = res.winners5 || 0;
      const w4 = res.winners4 || 0;
      const w3 = res.winners3 || 0;
      return `• ${rr}회차 | 당첨번호: [${w}] | 1등 ${w5}명(인당 ${formatAmount(amt.a1)}), 2등 ${w4}명(인당 ${formatAmount(amt.a2)}), 3등 ${w3}명(인당 ${formatAmount(amt.a3)}) | 총 복권 금액 ${formatAmount(pool)} BE | 추첨 <t:${toUnix(r.drawnAt)}:f>`;
    }
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
      const res = t.result == null ? `추첨 대기` : (t.result.win ? `당첨 금액 ${formatAmount(t.prize)} BE` : `낙첨`);
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
  const state = loadState();
  ensureRound(state, state.round);
  const pick = state.rounds[state.round].rule.pick || 6;
  const modal = new ModalBuilder().setCustomId('lottery_enter_modal').setTitle(`복권 응모(1줄 ${formatAmount(TICKET_PRICE)} BE)`);
  const input = new TextInputBuilder().setCustomId('numbers').setLabel(`숫자 ${pick}개 입력(1~45, 쉼표) | 비우거나 0=자동`).setStyle(TextInputStyle.Short).setPlaceholder('예: 3,7,12,28,41,44 | 공란 또는 0=랜덤').setRequired(false);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}
function drawNumbers(pick) {
  const set = new Set();
  while (set.size < pick) {
    set.add(1 + Math.floor(Math.random() * MAX_NUMBER));
  }
  return Array.from(set).sort((a, b) => a - b);
}
async function handleEnterModal(interaction) {
  const state = loadState();
  ensureRound(state, state.round);
  const pick = state.rounds[state.round].rule.pick || 6;
  const raw = (interaction.fields.getTextInputValue('numbers') || '').trim();
  let picked = null;
  if (raw.length === 0) {
    picked = drawNumbers(pick);
  } else {
    const parsed = raw.split(/[,\s]+/).filter(Boolean).map(v => parseInt(v.trim(), 10));
    if (parsed.length === 1 && parsed[0] === 0) {
      picked = drawNumbers(pick);
    } else if (parsed.some(v => v === 0)) {
      picked = drawNumbers(pick);
    } else {
      picked = uniqueSortedPick(parsed, pick);
      if (!picked) {
        await interaction.reply({ content: `입력 형식이 잘못되었습니다. 1부터 45 사이의 서로 다른 숫자 ${pick}개를 쉼표로 구분해 입력하거나, 공란/0으로 자동 선택을 이용해 주세요.`, ephemeral: true });
        return;
      }
    }
  }
  if (isClosedForSales()) {
    await interaction.reply({ content: '현재는 판매가 중지된 시간입니다. 월요일 오전 9시에 판매가 재개됩니다.', ephemeral: true });
    return;
  }
  let release;
  try {
    release = await lockfile.lock(LOCK_PATH, { retries: { retries: 10, minTimeout: 30, maxTimeout: 120 } });
    const s = loadState();
    ensureRound(s, s.round);
    const myCount = s.rounds[s.round].tickets.filter(t => t.userId === interaction.user.id).length;
    if (myCount >= PER_ROUND_MAX_TICKETS) {
      await interaction.reply({ content: `해당 회차 구매 한도(${PER_ROUND_MAX_TICKETS}장)를 초과했습니다. 현재 ${myCount}장 구매하였습니다.`, ephemeral: true });
      return;
    }
    const nextCount = myCount + 1;
    if (nextCount * TICKET_PRICE > PER_ROUND_MAX_SPEND) {
      await interaction.reply({ content: `해당 회차 최대 구매 금액(${formatAmount(PER_ROUND_MAX_SPEND)} BE)을 초과할 수 없습니다. 현재 ${formatAmount(myCount * TICKET_PRICE)} BE 사용됨.`, ephemeral: true });
      return;
    }
    const balance = getBE(interaction.user.id);
    if (balance < TICKET_PRICE) {
      await interaction.reply({ content: `잔액이 부족합니다. 필요 금액: ${formatAmount(TICKET_PRICE)} BE`, ephemeral: true });
      return;
    }
    await addBE(interaction.user.id, -TICKET_PRICE, `복권 ${s.round}회차 1줄 구매(${picked.join('-')})`);
    await addBE(BOT_BANK_ID, TICKET_PRICE, `복권 ${s.round}회차 판매 수익`);
    const ticket = { id: `${interaction.user.id}-${Date.now()}`, userId: interaction.user.id, numbers: picked, ts: Date.now(), result: null, prize: 0, paid: false };
    s.rounds[s.round].tickets.push(ticket);
    saveState(s);
    const remain = PER_ROUND_MAX_TICKETS - (myCount + 1);
    await interaction.reply({ content: `응모 완료: [${picked.join(', ')}] | 가격 ${formatAmount(TICKET_PRICE)} BE | 이번 회차 남은 구매 가능 장수: ${remain}장`, ephemeral: true });
  } finally {
    if (release) await release();
  }
}
function runDrawInternal(state, ts) {
  const r = state.round;
  ensureRound(state, r);
  const rule = state.rounds[r].rule || { pick: 6 };
  const win = drawNumbers(rule.pick);
  const pool = Math.max(0, getBE(BOT_BANK_ID) || 0);
  let counts = rule.pick === 6 ? { w6: 0, w5: 0, w4: 0, w3: 0 } : { w5: 0, w4: 0, w3: 0 };
  for (const t of state.rounds[r].tickets) {
    const m = compareWin(t.numbers, win);
    if (rule.pick === 6) {
      if (m === 6) counts.w6++;
      else if (m === 5) counts.w5++;
      else if (m === 4) counts.w4++;
      else if (m === 3) counts.w3++;
    } else {
      if (m === 5) counts.w5++;
      else if (m === 4) counts.w4++;
      else if (m === 3) counts.w3++;
    }
  }
  for (const t of state.rounds[r].tickets) {
    const m = compareWin(t.numbers, win);
    const prize = prizeByTier(m, pool, rule, counts);
    const winFlag = m >= 3;
    t.result = { win: winFlag, matches: m };
    t.prize = prize;
    t.paid = false;
  }
  if (rule.pick === 6) {
    state.rounds[r].result = { win, pool, winners6: counts.w6, winners5: counts.w5, winners4: counts.w4, winners3: counts.w3 };
  } else {
    state.rounds[r].result = { win, pool, winners5: counts.w5, winners4: counts.w4, winners3: counts.w3 };
  }
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
    if (t.prize > 0) {
      await addBE(BOT_BANK_ID, -t.prize, `복권 ${r}회차 당첨금 차감`);
      await addBE(t.userId, t.prize, `복권 ${r}회차 당첨금 지급`);
    }
    t.paid = true;
  }
  saveState(state);
}
async function announceDraw(client, state) {
  const r = state.round - 1;
  const ch = await client.channels.fetch(CHANNEL_ID);
  const res = state.rounds[r].result;
  const rule = state.rounds[r].rule || { pick: (Object.prototype.hasOwnProperty.call(res, 'winners6') ? 6 : 5) };
  const win = res.win.map(n => `\`${n}\``).join('  ');
  const drawnAt = state.rounds[r].drawnAt || Math.floor(Date.now() / 1000);
  const title = `🎊 복권 ${r}회차 추첨 결과`;
  const amt = computeTierAmounts(rule, res.pool, res);
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0xFBC02D)
    .setDescription(`당첨 번호\n${win}`)
    .addFields(
      ...(amt.pick === 6
        ? [
            { name: '1등', value: `${res.winners6}명 (인당 ${formatAmount(amt.a1)} BE)`, inline: true },
            { name: '2등', value: `${res.winners5}명 (인당 ${formatAmount(amt.a2)} BE)`, inline: true },
            { name: '3등', value: `${res.winners4}명 (인당 ${formatAmount(amt.a3)} BE)`, inline: true },
            { name: '4등', value: `${res.winners3}명 (인당 ${formatAmount(amt.a4)} BE)`, inline: true }
          ]
        : [
            { name: '1등', value: `${res.winners5}명 (인당 ${formatAmount(amt.a1)} BE)`, inline: true },
            { name: '2등', value: `${res.winners4}명 (인당 ${formatAmount(amt.a2)} BE)`, inline: true },
            { name: '3등', value: `${res.winners3}명 (인당 ${formatAmount(amt.a3)} BE)`, inline: true }
          ]),
      { name: '총 복권 금액', value: `${formatAmount(res.pool)} BE`, inline: true },
      { name: '추첨 시각', value: `<t:${drawnAt}:F>`, inline: true }
    )
    .setFooter({ text: '다음 회차에 참여하려면 채널 하단 최신 임베드의 버튼을 사용하세요.' });
  await ch.send({ embeds: [embed] });
}
async function tick(client) {
  const state = loadState();
  ensureRound(state, state.round);
  const next = getThisSaturday20OrNext();
  const nextUnix = Math.floor(next.getTime() / 1000);
  const nowUnix = Math.floor(Date.now() / 1000);
  const inWindow = nowUnix >= nextUnix - 120 && nowUnix <= nextUnix + 120;
  const alreadyDrawnThisWindow = state.lastDrawAt && Math.abs(Math.floor(state.lastDrawAt / 1000) - nextUnix) <= 300;
  if (!state.rounds[state.round]?.result && inWindow && !alreadyDrawnThisWindow) {
    runDrawInternal(state, Date.now());
    saveState(state);
    await payPrizes(client, state);
    await announceDraw(client, state);
    await disableOldMessages(client, state);
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
