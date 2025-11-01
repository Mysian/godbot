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

function ensureThreadState(obj) {
  return Object.assign({
    active: false,
    bids: {},
    highestBid: 0,
    highestBidder: null,
    startedBy: null,
    startedAt: null,
    startPrice: 0,
    endAt: null,             // ms UTC
    anonymous: false,
    anonMap: {},             // userId -> label
    anonSeq: 0
  }, obj || {});
}

async function setActive(threadId, active, payload) {
  const store = readStore();
  store[threadId] = ensureThreadState(store[threadId]);
  store[threadId].active = active;
  if (payload && typeof payload === 'object') Object.assign(store[threadId], payload);
  await writeStore(store);
  return store[threadId];
}
function getState(threadId) {
  const store = readStore();
  if (!store[threadId]) return null;
  return ensureThreadState(store[threadId]);
}
async function updateBid(threadId, userId, amount) {
  const store = readStore();
  if (!store[threadId]) return null;
  const st = ensureThreadState(store[threadId]);
  if (!st.active) return null;
  if (!st.bids) st.bids = {};
  st.bids[userId] = amount;
  if (amount > (st.highestBid || 0)) {
    st.highestBid = amount;
    st.highestBidder = userId;
  }
  store[threadId] = st;
  await writeStore(store);
  return st;
}

function parseKSTDateToUTCms(s) {
  // 입력 예: 2025.12.23 23:59:59 (KST)
  const m = s.match(/^\s*(\d{4})\.(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})\s*$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const ss = Number(m[6]);
  // KST(UTC+9) → UTC
  const utcMs = Date.UTC(y, mo - 1, d, hh - 9, mm, ss);
  return Number.isFinite(utcMs) ? utcMs : null;
}

function formatKST(ms) {
  if (!ms) return '-';
  const date = new Date(ms);
  // UTC → KST(+9)
  const kstMs = date.getTime() + 9 * 60 * 60 * 1000;
  const k = new Date(kstMs);
  const Y = k.getUTCFullYear();
  const M = String(k.getUTCMonth() + 1).padStart(2, '0');
  const D = String(k.getUTCDate()).padStart(2, '0');
  const h = String(k.getUTCHours()).padStart(2, '0');
  const m = String(k.getUTCMinutes()).padStart(2, '0');
  const s = String(k.getUTCSeconds()).padStart(2, '0');
  return `${Y}.${M}.${D} ${h}:${m}:${s}`;
}

async function announceEnd(client, threadId) {
  const st = getState(threadId);
  if (!st || !st.active) return;
  await setActive(threadId, false, {}); // 먼저 비활성화
  try {
    const channel = await client.channels.fetch(threadId);
    if (!channel || !channel.isThread?.()) return;
    if (!st.highestBidder) {
      await channel.send('입찰자가 없어 유찰되었습니다.');
      return;
    }
    const winnerId = st.highestBidder;
    const amount = st.highestBid;
    const winner = await channel.client.users.fetch(winnerId).catch(() => null);
    const winnerTag = winner ? `<@${winner.id}>` : `<@${winnerId}>`;
    await channel.send(`최종 입찰가 ${formatBE(amount)}\n낙찰: ${winnerTag}\n낙찰을 진심으로 축하드립니다!`);
  } catch {}
}

async function handleStart(message) {
  if (!message.channel.isThread()) return;
  if (message.channel.parentId !== PARENT_CHANNEL_ID) return;
  if (!canManage(message.member)) return;
  await setActive(message.channel.id, true, { 
    startedBy: message.author.id, 
    startedAt: Date.now(), 
    bids: {}, 
    highestBid: 0, 
    highestBidder: null,
    // 시작 시점에 기존 옵션은 유지(재시작 시 편의)
  });
  await message.channel.send({ 
    content: `경매를 시작하였습니다.\n- 최소 호가 단위: ${formatBE(MIN_STEP)}\n- 시작가: ${formatBE(getState(message.channel.id)?.startPrice || 0)}\n- 종료: ${formatKST(getState(message.channel.id)?.endAt)} (KST)\n- 익명 경매: ${(getState(message.channel.id)?.anonymous ? '사용' : '미사용')}\n숫자(콤마 허용)만 입력해 주시고, 보유 정수 내에서만 입찰해 주십시오. 예) 500000, 500,000, 500000원, 500000정수, 500000 BE`
  });
}

async function handleEnd(message) {
  if (!message.channel.isThread()) return;
  if (message.channel.parentId !== PARENT_CHANNEL_ID) return;
  if (!canManage(message.member)) return;
  await announceEnd(message.client, message.channel.id);
}

function ensureAnonymousLabel(state, userId) {
  if (!state.anonMap) state.anonMap = {};
  if (!state.anonSeq) state.anonSeq = 0;
  if (!state.anonMap[userId]) {
    state.anonSeq += 1;
    state.anonMap[userId] = `익명#${state.anonSeq}`;
  }
  return state.anonMap[userId];
}

async function handleBid(message) {
  if (!message.channel.isThread()) return;
  if (message.channel.parentId !== PARENT_CHANNEL_ID) return;
  const state = getState(message.channel.id);
  if (!state || !state.active) return;
  if (message.author.bot) return;

  // 종료시간 자동 체크
  if (state.endAt && Date.now() >= state.endAt) {
    await announceEnd(message.client, message.channel.id);
    return;
  }

  const amt = parseStrictNumericAmount(message.content || '');
  if (amt === null) return; // 숫자 형식이 아니면 무반응

  const be = getBalance(message.author.id);
  if (amt > be) {
    await message.reply({ content: `보유 정수가 부족하십니다. 현재 보유 ${formatBE(be)} / 제시 ${formatBE(amt)}` });
    return;
  }

  const current = state.highestBid || 0;
  const minIfNoBid = Math.max(state.startPrice || 0, MIN_STEP);
  const minRequired = current > 0 ? current + MIN_STEP : minIfNoBid;
  if (amt < minRequired) {
    await message.reply({ content: `호가가 부족합니다. 현재 최고가 ${formatBE(current)} → 최소 제시액은 ${formatBE(minRequired)} 이상이어야 합니다.` });
    return;
  }

  const updated = await updateBid(message.channel.id, message.author.id, amt);
  if (!updated) return;

  if (updated.anonymous) {
    const label = ensureAnonymousLabel(updated, message.author.id);
    // 본문 삭제 후 익명 안내
    await message.delete().catch(() => {});
    await setActive(message.channel.id, true, { anonMap: updated.anonMap, anonSeq: updated.anonSeq }); // 저장
    await message.channel.send(`입찰자: ${label}, 입찰가: ${formatBE(amt)}`);
  } else {
    await message.channel.send(`입찰자: <@${message.author.id}>, 입찰가: ${formatBE(amt)}`);
  }
}

function parseOptionPairs(text) {
  // 시작가=123456, 종료=2025.12.23 23:59:59, 익명=on
  // 공백/쉼표 분리 허용
  const result = {};
  const tokens = text.split(/[,]\s*|\s+/).filter(Boolean);
  // 종료는 공백 포함되므로 재조합
  // 전략: 전체 문자열에서 키=값 패턴을 정규식으로 스캔
  const regex = /(시작가|시작가=|start|startPrice)\s*=\s*([0-9][0-9,]*)|(?:종료|end|endAt)\s*=\s*([0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2}\s+[0-9]{1,2}:[0-9]{2}:[0-9]{2})|(?:익명|anonymous)\s*=\s*(on|off)/gi;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m[1]) {
      const n = Number(m[2].replace(/,/g, ''));
      if (Number.isFinite(n) && n >= 0) result.startPrice = n;
    } else if (m[3]) {
      result.endAtText = m[3];
    } else if (m[4]) {
      result.anonymous = (m[4].toLowerCase() === 'on');
    }
  }
  return result;
}

async function handleConfigure(message) {
  if (!message.channel.isThread()) return;
  if (message.channel.parentId !== PARENT_CHANNEL_ID) return;
  if (!canManage(message.member)) return;

  const raw = (message.content || '').trim();
  // 명령어 변형들 허용
  if (!/^!(경매\s*(설정|옵션|변경))/.test(raw)) return;

  const st = getState(message.channel.id) || ensureThreadState();
  if (!st.active) {
    // 진행 중일 때만 변경
    // 단, 옵션 조회는 허용
  }

  const argsText = raw.replace(/^!(경매\s*(설정|옵션|변경))\s*/,'');
  if (!argsText) {
    const info = [
      `현재 설정을 안내드립니다.`,
      `- 진행 상태: ${st.active ? '진행 중' : '종료됨'}`,
      `- 시작가: ${formatBE(st.startPrice || 0)}`,
      `- 최소 호가 단위: ${formatBE(MIN_STEP)}`,
      `- 종료 시각: ${formatKST(st.endAt)} (KST)`,
      `- 익명 경매: ${st.anonymous ? '사용' : '미사용'}`,
      `\n설정 예시) !경매 설정 시작가=500000 종료=2025.12.23 23:59:59 익명=on`
    ].join('\n');
    await message.channel.send(info);
    return;
  }

  if (!st.active) {
    await message.channel.send('현재 진행 중인 경매가 없습니다. 경매를 먼저 시작해 주십시오.');
    return;
  }

  const parsed = parseOptionPairs(argsText);
  const patch = {};
  if (typeof parsed.startPrice === 'number') {
    // 이미 입찰이 있다면 시작가 조정은 최고가 미만으로 의미 없음 → 그대로 저장만
    patch.startPrice = parsed.startPrice;
  }
  if (parsed.endAtText) {
    const ms = parseKSTDateToUTCms(parsed.endAtText);
    if (!ms || ms <= Date.now()) {
      await message.channel.send('종료 시각 형식이 올바르지 않거나 현재 시각보다 이전입니다. 예) 2025.12.23 23:59:59');
      return;
    }
    patch.endAt = ms;
  }
  if (typeof parsed.anonymous === 'boolean') {
    patch.anonymous = parsed.anonymous;
  }

  await setActive(message.channel.id, true, patch);
  const newSt = getState(message.channel.id);
  await message.channel.send(
    [
      '경매 설정을 적용하였습니다.',
      `- 시작가: ${formatBE(newSt.startPrice || 0)}`,
      `- 최소 호가 단위: ${formatBE(MIN_STEP)}`,
      `- 종료 시각: ${formatKST(newSt.endAt)} (KST)`,
      `- 익명 경매: ${newSt.anonymous ? '사용' : '미사용'}`
    ].join('\n')
  );
}

function startAutoCloser(client) {
  setInterval(async () => {
    try {
      const store = readStore();
      const now = Date.now();
      const threadIds = Object.keys(store || {});
      for (const tid of threadIds) {
        const st = ensureThreadState(store[tid]);
        if (!st.active) continue;
        if (st.endAt && now >= st.endAt) {
          await announceEnd(client, tid);
        }
      }
    } catch {}
  }, 30000); // 30초마다 체크
}

function registerAuctionThread(client) {
  startAutoCloser(client);

  client.on('messageCreate', async (message) => {
    try {
      if (!message.guild) return;
      const content = (message.content || '').trim();
      if (content === '!경매 시작') { await handleStart(message); return; }
      if (content === '!경매 종료') { await handleEnd(message); return; }
      if (/^!(경매\s*(설정|옵션|변경))\b/.test(content)) { await handleConfigure(message); return; }

      // 진행 중/종료 상태 및 종료시간 자동 체크는 handleBid 내부에서 처리
      await handleBid(message);
    } catch {}
  });
}

module.exports = { registerAuctionThread };
