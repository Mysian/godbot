// battle-system/item.js
const items = require('../utils/items'); // 반드시 items.js에서 사용 아이템 효과 정의!

module.exports = function useItem(user, itemName, context) {
  context = context || {};
  context.logs = context.logs || [];
  context.effects = context.effects || {};

  if (!itemName) {
    context.logs.push(`아이템을 선택해주세요.`);
    return context.logs;
  }
  if (!user.items || !user.items[itemName] || user.items[itemName].count <= 0) {
    context.logs.push(`${itemName} 아이템이 없습니다.`);
    return context.logs;
  }
  if (!items[itemName] || typeof items[itemName].effect !== 'function') {
    context.logs.push(`${itemName} 효과를 찾을 수 없습니다.`);
    return context.logs;
  }
  if (!context.enemyId && context.enemy) context.enemyId = context.enemy.id;

  try {
    const log = items[itemName].effect(user, context);
    if (log) context.logs.push(log);
    user.items[itemName].count -= 1;
  } catch (e) {
    context.logs.push(`❌ 아이템 효과 실행 중 오류가 발생했습니다.`);
    console.error('[아이템 효과 실행 에러]', e);
  }

  return context.logs;
};
