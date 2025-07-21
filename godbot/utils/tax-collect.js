// godbot/commands/tax-collect.js
const { loadBE, saveBE } = require('../commands/be-util.js');
const fs = require('fs');
const path = require('path');
const taxPoolPath = path.join(__dirname, '../data/tax-pool.json');

// 세금률 산정 함수
function getTaxRate(amount) {
  if (amount < 5_000_000) return 0;
  if (amount >= 1_000_000_000_000) return 0.5;     // 1조 이상: 50%
  if (amount >=   10_000_000_000) return 0.25;     // 1,000억 이상: 25%
  if (amount >=    5_000_000_000) return 0.10;     // 500억 이상: 10%
  if (amount >=    1_000_000_000) return 0.075;    // 100억 이상: 7.5%
  if (amount >=      500_000_000) return 0.05;     // 50억 이상: 5%
  if (amount >=      100_000_000) return 0.035;    // 10억 이상: 3.5%
  if (amount >=       50_000_000) return 0.02;     // 5억 이상: 2%
  if (amount >=       10_000_000) return 0.015;    // 1억 이상: 1.5%
  if (amount >=        5_000_000) return 0.01;     // 5천만원 이상: 1%
  if (amount >=        1_000_000) return 0.005;    // 1천만원 이상: 0.5%
  return 0.001; // 500만원 이상: 0.1%
}

// 세금풀 불러오기/저장
function loadTaxPool() {
  if (!fs.existsSync(taxPoolPath)) fs.writeFileSync(taxPoolPath, '{"pool":0,"history":[]}');
  return JSON.parse(fs.readFileSync(taxPoolPath, 'utf8'));
}
function saveTaxPool(pool) {
  fs.writeFileSync(taxPoolPath, JSON.stringify(pool, null, 2));
}

// 실제 세금 부과 실행
async function collectDailyTax(client) {
  const be = loadBE();
  let taxPool = loadTaxPool();
  let totalTax = 0;
  let taxedUsers = [];
  let now = Date.now();

  for (const [userId, data] of Object.entries(be)) {
    const amount = data.amount;
    const taxRate = getTaxRate(amount);
    if (taxRate === 0) continue; // 면제
    const tax = Math.floor(amount * taxRate);
    if (tax <= 0) continue;
    be[userId].amount -= tax;
    if (be[userId].amount < 0) be[userId].amount = 0;
    // 히스토리 추가
    be[userId].history = be[userId].history || [];
    be[userId].history.push({
      type: "spend",
      amount: tax,
      reason: `일일 정수세 납부 (${(taxRate*100).toFixed(1)}%)`,
      timestamp: now
    });
    // 세금풀 적립
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

  // 로그 채널 안내
  if (client) {
    const channel = client.channels.cache.get('로그채널ID여기에');
    if (channel) {
      await channel.send(`💸 오늘의 정수세 납부가 완료되었습니다.\n총 세금: **${totalTax.toLocaleString('ko-KR')} BE**\n세금풀 적립 완료!`);
    }
  }
  return { totalTax, taxedUsers };
}

module.exports = { collectDailyTax, loadTaxPool };
