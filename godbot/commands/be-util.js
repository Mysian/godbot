// 📁 commands/be-util.js
const fs = require('fs');
const path = require('path');
const lockfile = require("proper-lockfile"); // 추가

const bePath = path.join(__dirname, '../data/BE.json');
const configPath = path.join(__dirname, '../data/BE-config.json');

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
    saveBE(be);
    return { ok: true, fee, sendAmount };
  } finally {
    if (release) await release();
  }
}

module.exports = { loadBE, saveBE, loadConfig, saveConfig, getBE, addBE, transferBE };
