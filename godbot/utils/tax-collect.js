const { loadBE, saveBE, addBE } = require('../commands/be-util.js');
const fs = require('fs');
const path = require('path');
const taxPoolPath = path.join(__dirname, '../data/tax-pool.json');
const SNAPSHOT_DIR = path.join(__dirname, '../data/');
const GODBOT_ID = '1380841362752274504'; // 너의 갓봇 사용자ID!

// 세금률 산정 함수
function getTaxRate(amount) {
  if (amount < 5_000_000) return 0; // 500만 미만: 면제
  if (amount < 10_000_000) return 0.001; // 500만~1천만: 0.1%
  if (amount < 50_000_000) return 0.005; // 1천만~5천만: 0.5%
  if (amount < 100_000_000) return 0.01; // 5천만~1억: 1%
  if (amount < 500_000_000) return 0.015; // 1억~5억: 1.5%
  if (amount < 1_000_000_000) return 0.02; // 5억~10억: 2%
  if (amount < 5_000_000_000) return 0.035; // 10억~50억: 3.5%
  if (amount < 10_000_000_000) return 0.05; // 50억~100억: 5%
  if (amount < 100_000_000_000) return 0.075; // 100억~500억: 7.5%
  if (amount < 500_000_000_000) return 0.10; // 500억~1,000억: 10%
  if (amount < 1_000_000_000_000) return 0.25; // 1,000억~1조: 25%
  return 0.5; // 1조 이상: 50%
}

// 세금풀 불러오기/저장
function loadTaxPool() {
  if (!fs.existsSync(taxPoolPath)) fs.writeFileSync(taxPoolPath, '{"pool":0,"history":[]}');
  return JSON.parse(fs.readFileSync(taxPoolPath, 'utf8'));
}
function saveTaxPool(pool) {
  fs.writeFileSync(taxPoolPath, JSON.stringify(pool, null, 2));
}

// 1. 17:55 스냅샷 저장 함수 (7일치만 남기고 나머지 자동 삭제)
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

  // 🔥 7일보다 오래된 스냅샷 파일 자동 삭제
  const files = fs.readdirSync(SNAPSHOT_DIR)
    .filter(f => f.startsWith('tax-snapshot-') && f.endsWith('.json'))
    .sort();
  while (files.length > 7) {
    const oldFile = files.shift();
    fs.unlinkSync(path.join(SNAPSHOT_DIR, oldFile));
  }
  return filename;
}

// 2. 18:00 스냅샷 기준 세금 징수 함수
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

  // 세금풀 업데이트
  taxPool.pool += totalTax;
  taxPool.history.push({
    date: now,
    amount: totalTax,
    users: taxedUsers
  });
  if (taxPool.history.length > 1000) taxPool.history = taxPool.history.slice(-1000);
  saveTaxPool(taxPool);

  // === 갓봇 계정에 입금 (락/히스토리 자동!)
  await addBE(GODBOT_ID, totalTax, "정수세 수납");

  // 로그 채널 안내
  if (client) {
    const channel = client.channels.cache.get('1380874052855529605');
    if (channel) {
      await channel.send(`💸 오늘의 정수세 납부가 완료되었습니다.\n총 세금: **${totalTax.toLocaleString('ko-KR')} BE**\n세금풀 적립 및 갓봇 계정 입금 완료!`);
    }
  }
  return { totalTax, taxedUsers };
}

// === 호환성: 기존 방식도 남겨둠 ===
async function collectDailyTax(client) {
  return await collectTaxFromSnapshot(client);
}

module.exports = {
  saveTaxSnapshot,
  collectTaxFromSnapshot,
  collectDailyTax,
  loadTaxPool
};
