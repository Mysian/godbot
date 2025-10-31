// utils/auction-thread.js
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { getBE } = require('../commands/be-util');

const PARENT_CHANNEL_ID = '1247745291944464424';
const MANAGER_ROLE_IDS = new Set(['786128824365482025', '1201856430580432906']);
const MIN_STEP = 10000;

const storePath = path.join(__dirname, '../data/auctions.json');

function ensureStore() {
  if (!fs.existsSync(path.dirname(storePath))) fs.mkdirSync(path.dirname(storePath), { recursive: true });
  if (!fs.existsSync(storePath)) fs.writeFileSync(storePath, '{}');
}
function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(storePath, 'utf8') || '{}');
}
async function writeStore(data) {
  ensureStore();
  let release;
  try {
    release = await lockfile.lock(storePath, { retries: { retries: 8, minTimeout: 20, maxTimeout: 120 } });
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
  } finally {
    if (release) await release();
  }
}

function formatBE(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' BE';
}

const digitMap = { '영':0,'공':0,'일':1,'한':1,'이':2,'두':2,'삼':3,'세':3,'사':4,'네':4,'오':5,'육':6,'륙':6,'칠':7,'팔':8,'구':9,'열':10 };
function parseKoreanSection(sec) {
  let total = 0;
  let num = 0;
  const pushUnit = (u) => { if (num === 0) num = 1; total += num * u; num = 0; };
  for (let i = 0; i < sec.length; i++) {
    const ch = sec[i];
    if (digitMap.hasOwnProperty(ch)) {
      const val = digitMap[ch];
      if (val >= 10) { num = 1; pushUnit(10); }
      else num = (num || 0) + val;
    } else if (ch === '십') pushUnit(10);
    else if (ch === '백') pushUnit(100);
    else if (ch === '천') pushUnit(1000);
    else if (/\d/.test(ch)) num = (num * 10) + Number(ch);
  }
  return total + num;
}
function parseKoreanAmount(text) {
  const t = text.replace(/\s+/g, '').toLowerCase();
  const numMatch = t.match(/(\d{1,3}(?:,\d{3})+|\d+)/);
  if (numMatch) {
    let n = Number(numMatch[0].replace(/,/g, ''));
    if (/[만]\s*원?/.test(t) && !/억/.test(t) && !/만원\s*단위아님/.test(t)) {}
    if (/만원/.test(t) && !/억/.test(t) && n < 100000) n *= 10000;
    return n;
  }
  const cleaned = t.replace(/[원\s,\.be정수입니다정수요입니다요요요]+/g, '');
  if (cleaned.includes('억')) {
    const parts = cleaned.split('억');
    const left = parts[0], right = parts[1] || '';
    const leftVal = left ? parseKoreanSection(left) * 100000000 : 0;
    let manVal = 0;
    let rest = right;
    if (right.includes('만')) {
      const [man, tail] = right.split('만');
      manVal = parseKoreanSection(man) * 10000;
      rest = tail || '';
    }
    const last = parseKoreanSection(rest);
    return leftVal + manVal + last;
  }
  if (cleaned.includes('만')) {
    const [man, tail] = cleaned.split('만');
    const manVal = parseKoreanSection(man) * 10000;
    const last = parseKoreanSection(tail || '');
    return manVal + last;
  }
  return parseKoreanSection(cleaned);
}

function canManage(member) {
  if (!member) return false;
  return member.roles.cache.some(r => MANAGER_ROLE_IDS.has(r.id));
}

async function setActive(threadId, active, payload) {
  const store = readStore();
  if (!store[threadId]) store[threadId] = { active: false, bids: {}, highestBid: 0, highestBidder: null, startedBy: null, startedAt: null };
  store[threadId].active = active;
  if (payload && typeof payload === 'object') Object.assign(store[threadId], payload);
  await writeStore(store);
  return store[threadId];
}
function getState(threadId) {
  const store = readStore();
  return store[threadId] || null;
}
async function updateBid(threadId, userId, amount) {
  const store = readStore();
  if (!store[threadId] || !store[threadId].active) return null;
  if (!store[threadId].bids) store[threadId].bids = {};
  store[threadId].bids[userId] = amount;
  if (amount > (store[threadId].highestBid || 0)) {
    store[threadId].highestBid = amount;
    store[threadId].highestBidder = userId;
  }
  await writeStore(store);
  return store[threadId];
}

async function handleStart(message) {
  if (!message.channel.isThread()) return;
  if (message.channel.parentId !== PARENT_CHANNEL_ID) return;
  if (!canManage(message.member)) return;
  const st = await setActive(message.channel.id, true, { startedBy: message.author.id, startedAt: Date.now(), bids: {}, highestBid: 0, highestBidder: null });
  await message.channel.send({
    content: `경매 시작되었습니다. 최소 호가 단위는 ${formatBE(MIN_STEP)} 입니다. 본인 보유 정수 내에서만 입찰 가능합니다. 숫자·콤마·한글 금액 모두 인식합니다.`
  });
  return st;
}

async function handleEnd(message) {
  if (!message.channel.isThread()) return;
  if (message.channel.parentId !== PARENT_CHANNEL_ID) return;
  if (!canManage(message.member)) return;
  const state = getState(message.channel.id);
  await setActive(message.channel.id, false, {});
  if (!state || !state.highestBidder) {
    await message.channel.send('입찰자가 없어 유찰되었습니다.');
    return;
  }
  const winnerId = state.highestBidder;
  const amount = state.highestBid;
  const winner = await message.client.users.fetch(winnerId).catch(() => null);
  const winnerTag = winner ? `<@${winner.id}>` : `<@${winnerId}>`;
  await message.channel.send(`최종 입찰가 ${formatBE(amount)}\n낙찰: ${winnerTag}\n낙찰을 축하합니다!`);
}

async function handleBid(message) {
  if (!message.channel.isThread()) return;
  if (message.channel.parentId !== PARENT_CHANNEL_ID) return;
  const state = getState(message.channel.id);
  if (!state || !state.active) return;
  if (message.author.bot) return;
  const raw = message.content || '';
  const amt = parseKoreanAmount(raw);
  if (!Number.isFinite(amt) || amt <= 0) return;
  const be = getBE(message.author.id);
  if (amt > be) {
    await message.reply({ content: `보유 정수 부족: 현재 보유 ${formatBE(be)} / 제시 ${formatBE(amt)}` });
    return;
  }
  const minRequired = (state.highestBid || 0) + MIN_STEP;
  if (amt < minRequired) {
    await message.reply({ content: `호가가 너무 낮습니다. 현재 최고가 ${formatBE(state.highestBid || 0)} → 최소 제시액 ${formatBE(minRequired)} 이상이어야 합니다.` });
    return;
  }
  await updateBid(message.channel.id, message.author.id, amt);
  await message.channel.send(`입찰 희망자: <@${message.author.id}>, 입찰 희망 가격(정수) : ${formatBE(amt)}`);
}

function registerAuctionThread(client) {
  client.on('messageCreate', async (message) => {
    try {
      if (!message.guild) return;
      const content = (message.content || '').trim();
      if (content === '!경매 시작') {
        await handleStart(message);
        return;
      }
      if (content === '!경매 종료') {
        await handleEnd(message);
        return;
      }
      await handleBid(message);
    } catch (e) {}
  });
}

module.exports = { registerAuctionThread };
