const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');

let beUtil = null;
try { beUtil = require('../utils/be-util'); } catch {}
if (!beUtil) { try { beUtil = require('../commands/be-util'); } catch {} }
function getBalance(userId) {
  if (beUtil && typeof beUtil.getBE === 'function') return beUtil.getBE(userId);
  if (beUtil && typeof beUtil.getBalance === 'function') return beUtil.getBalance(userId);
  return 0;
}

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
  try { return JSON.parse(fs.readFileSync(storePath, 'utf8') || '{}'); } catch { return {}; }
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

/* 숫자만 인식: ^[숫자(콤마허용)] [옵션:원|정수|BE]$ 만 허용 */
const STRICT_NUM_REGEX = /^\s*(\d{1,3}(?:,\d{3})+|\d+)\s*(원|정수|be)?\s*$/i;
function parseStrictNumericAmount(text) {
  if (!text) return null;
  const m = text.match(STRICT_NUM_REGEX);
  if (!m) return null;
  const raw = m[1].replace(/,/g, '');
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
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
  await setActive(message.channel.id, true, { startedBy: message.author.id, startedAt: Date.now(), bids: {}, highestBid: 0, highestBidder: null });
  await message.channel.send({ content: `경매 시작되었습니다. 최소 호가 단위는 ${formatBE(MIN_STEP)} 입니다. 보유 정수 내에서만 입찰 가능하며, 숫자(콤마 허용)만 입력하세요. 예) 500000, 500,000, 500000원, 500000정수, 500000 BE` });
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

  const amt = parseStrictNumericAmount(message.content || '');
  if (amt === null) return; // 숫자 형식이 아니면 무반응

  const be = getBalance(message.author.id);
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
      if (content === '!경매 시작') { await handleStart(message); return; }
      if (content === '!경매 종료') { await handleEnd(message); return; }
      await handleBid(message);
    } catch {}
  });
}

module.exports = { registerAuctionThread };
