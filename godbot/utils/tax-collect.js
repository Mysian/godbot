const { loadBE, saveBE, addBE } = require('../commands/be-util.js');
const fs = require('fs');
const path = require('path');
const taxPoolPath = path.join(__dirname, '../data/tax-pool.json');
const SNAPSHOT_DIR = path.join(__dirname, '../data/');
const GODBOT_ID = '1380841362752274504';

function getTaxRate(amount) {
  if (amount < 5_000_000) return 0;
  if (amount < 10_000_000) return 0.001;
  if (amount < 50_000_000) return 0.005;
  if (amount < 100_000_000) return 0.01;
  if (amount < 500_000_000) return 0.015;
  if (amount < 1_000_000_000) return 0.02;
  if (amount < 5_000_000_000) return 0.035;
  if (amount < 10_000_000_000) return 0.05;
  if (amount < 100_000_000_000) return 0.075;
  if (amount < 500_000_000_000) return 0.10;
  if (amount < 1_000_000_000_000) return 0.25;
  return 0.5;
}

function loadTaxPool() {
  if (!fs.existsSync(taxPoolPath)) fs.writeFileSync(taxPoolPath, '{"pool":0,"history":[]}');
  return JSON.parse(fs.readFileSync(taxPoolPath, 'utf8'));
}
function saveTaxPool(pool) {
  fs.writeFileSync(taxPoolPath, JSON.stringify(pool, null, 2));
}

function saveTaxSnapshot() {
  const be = loadBE();
  const snapshot = {};
  for (const [userId, data] of Object.entries(be)) {
    snapshot[userId] = data.amount;
  }
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const filename = path.join(SNAPSHOT_DIR, `tax-snapshot-${yyyy}-${mm}-${dd}.json`);
  fs.writeFileSync(filename, JSON.stringify({
    date: `${yyyy}-${mm}-${dd}`,
    amounts: snapshot
  }, null, 2));
  const files = fs.readdirSync(SNAPSHOT_DIR)
    .filter(f => f.startsWith('tax-snapshot-') && f.endsWith('.json'))
    .sort();
  while (files.length > 7) {
    const oldFile = files.shift();
    fs.unlinkSync(path.join(SNAPSHOT_DIR, oldFile));
  }
  return filename;
}

async function collectTaxFromSnapshot(client, date = null) {
  const today = date
    ? new Date(date)
    : new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const filename = path.join(SNAPSHOT_DIR, `tax-snapshot-${yyyy}-${mm}-${dd}.json`);
  if (!fs.existsSync(filename)) return { error: "스냅샷 파일 없음" };

  const snap = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const amounts = snap.amounts;
  const be = loadBE();
  let taxPool = loadTaxPool();
  let totalTax = 0;
  let taxedUsers = [];
  let now = Date.now();

  for (const [userId, amount] of Object.entries(amounts)) {
    const taxRate = getTaxRate(amount);
    if (taxRate === 0) continue;
    const tax = Math.floor(amount * taxRate);
    if (tax <= 0) continue;
    if (!be[userId]) continue;
    be[userId].amount -= tax;
    if (be[userId].amount < 0) be[userId].amount = 0;
    be[userId].history = be[userId].history || [];
    be[userId].history.push({
      type: "spend",
      amount: tax,
      reason: `일일 정수세 납부 (${(taxRate*100).toFixed(1)}%)`,
      timestamp: now
    });
    totalTax += tax;
    taxedUsers.push({ userId, tax, after: be[userId].amount });
  }
  saveBE(be);

  if (totalTax <= 0) {
    return { totalTax: 0, taxedUsers: [] };
  }

  taxPool.pool += totalTax;
  taxPool.history.push({
    date: now,
    amount: totalTax,
    users: taxedUsers
  });
  if (taxPool.history.length > 1000) taxPool.history = taxPool.history.slice(-1000);
  saveTaxPool(taxPool);

  await addBE(GODBOT_ID, totalTax, "정수세 수납");

  if (client) {
    const channel = client.channels.cache.get('1380874052855529605');
    if (channel) {
      await channel.send(`💸 오늘의 정수세 납부가 완료되었습니다.\n총 세금: **${totalTax.toLocaleString('ko-KR')} BE**\n세금풀 적립 및 갓봇 계정 입금 완료!`);
    }
  }
  return { totalTax, taxedUsers };
}

async function collectDailyTax(client) {
  return await collectTaxFromSnapshot(client);
}

module.exports = {
  saveTaxSnapshot,
  collectTaxFromSnapshot,
  collectDailyTax,
  loadTaxPool
};
