// battle-system/item.js
const items = require('../utils/items'); // 반드시 items.js에서 사용 아이템 효과 정의!

module.exports = function useItem(user, itemName, context) {
  if (!itemName) return [`아이템을 선택해주세요.`];
  if (!user.items || !user.items[itemName] || user.items[itemName].count <= 0) return [`${itemName} 아이템이 없습니다.`];
  if (!items[itemName]) return [`${itemName} 효과를 찾을 수 없습니다.`];
  // context 구조 보장
  context = context || {};
  context.logs = context.logs || [];
  context.effects = context.effects || {};
  // 적 정보 (enemyId) 보장 (item 버튼 사용 시 넘기면 됨)
  if (!context.enemyId && context.enemy) context.enemyId = context.enemy.id;

  // 아이템 효과 실행(함수)
  const log = items[itemName].effect(user, context);
  if (log) context.logs.push(log);

  // 소모형: count 차감
  user.items[itemName].count -= 1;

  // 기타 예외/후처리(추가 확장 시 여기에!)
  return context.logs;
};
