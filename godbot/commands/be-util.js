// 📁 commands/be-util.js
const fs = require('fs');
const path = require('path');
const lockfile = require("proper-lockfile"); // 추가

const bePath = path.join(__dirname, '../data/BE.json');
const configPath = path.join(__dirname, '../data/BE-config.json');
const HISTORY_LIMIT = 1000; // 이력 최대 1000개

function loadBE() {
  if (!fs.existsSync(bePath)) fs.writeFileSync(bePath, '{}');
  return JSON.parse(fs.readFileSync(bePath, 'utf8'));
}
function saveBE(data) {
  fs.writeFileSync(bePath, JSON.stringify(data, null, 2));
}
function loadConfig() {
  if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, '{"fee":0}');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}
function saveConfig(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}
function getBE(userId) {
  const be = loadBE();
  return be[userId]?.amount || 0;
}

// lock 적용된 addBE
async function addBE(userId, amount, reason) {
  let release;
  try {
    release = await lockfile.lock(bePath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
    const be = loadBE();
    if (!be[userId]) be[userId] = { amount: 0, history: [] };
    be[userId].amount += amount;
    if (be[userId].amount < 0) be[userId].amount = 0;
    be[userId].history.push({
      type: amount > 0 ? "earn" : "spend",
      amount: Math.abs(amount),
      reason,
      timestamp: Date.now()
    });
    // 히스토리 1000개 제한
    if (be[userId].history.length > HISTORY_LIMIT) {
      be[userId].history = be[userId].history.slice(-HISTORY_LIMIT);
    }
    saveBE(be);
  } finally {
    if (release) await release();
  }
}

// lock 적용된 transferBE
async function transferBE(fromId, toId, amount, feePercent, reasonInput) {
  let release;
  try {
    release = await lockfile.lock(bePath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
    const be = loadBE();
    if (!be[fromId]) be[fromId] = { amount: 0, history: [] };
    if (!be[toId]) be[toId] = { amount: 0, history: [] };
    const fee = Math.floor(amount * feePercent / 100);
    const sendAmount = amount - fee;
    if (be[fromId].amount < amount) return { ok: false, reason: "잔액 부족" };
    if (sendAmount <= 0) return { ok: false, reason: "수수료가 전액 초과" };
    // reason 적용
    const sendReason = reasonInput || `정수송금 -> <@${toId}> (수수료 ${fee}BE)`;
    const recvReason = reasonInput || `정수송금 ← <@${fromId}> (수수료 ${fee}BE)`;
    // 송금 차감
    be[fromId].amount -= amount;
    be[fromId].history.push({
      type: "spend",
      amount: amount,
      reason: sendReason,
      timestamp: Date.now()
    });
    // 수령인 지급
    be[toId].amount += sendAmount;
    be[toId].history.push({
      type: "earn",
      amount: sendAmount,
      reason: recvReason,
      timestamp: Date.now()
    });
    // 히스토리 1000개 제한 (보내는 사람, 받는 사람 각각 체크)
    if (be[fromId].history.length > HISTORY_LIMIT) {
      be[fromId].history = be[fromId].history.slice(-HISTORY_LIMIT);
    }
    if (be[toId].history.length > HISTORY_LIMIT) {
      be[toId].history = be[toId].history.slice(-HISTORY_LIMIT);
    }
    saveBE(be);
    return { ok: true, fee, sendAmount };
  } finally {
    if (release) await release();
  }
}

/**
 * ✅ 서버에 존재하지 않는 유저들의 BE 데이터를 완전 삭제(금액 + 히스토리 전부)
 * - guild: Discord.Guild 인스턴스
 * - 반환: { removed: number } 제거된 계정 수
 */
async function cleanupBELeftMembers(guild) {
  let release;
  try {
    const members = await guild.members.fetch();
    const existingIds = new Set(members.map(m => m.id));

    release = await lockfile.lock(bePath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 120 } });
    const be = loadBE();
    let removed = 0;

    for (const uid of Object.keys(be)) {
      if (!existingIds.has(uid)) {
        delete be[uid];      // 금액/히스토리 포함해 해당 유저 키 전체 제거
        removed++;
      }
    }

    saveBE(be);
    return { removed };
  } finally {
    if (release) await release();
  }
}

/**
 * ✅ (대안) 멤버 ID 집합을 직접 넘겨서 청소할 수도 있음
 * - existingIds: Set<string>
 */
async function cleanupBEByIdSet(existingIds) {
  let release;
  try {
    release = await lockfile.lock(bePath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 120 } });
    const be = loadBE();
    let removed = 0;

    for (const uid of Object.keys(be)) {
      if (!existingIds.has(uid)) {
        delete be[uid];
        removed++;
      }
    }

    saveBE(be);
    return { removed };
  } finally {
    if (release) await release();
  }
}

module.exports = {
  loadBE, saveBE, loadConfig, saveConfig, getBE, addBE, transferBE,
  cleanupBELeftMembers, cleanupBEByIdSet
};
