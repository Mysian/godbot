// battle-system/item.js
const items = require('../utils/items'); // 반드시 items.js에서 사용 아이템 효과 정의!

module.exports = function useItem(user, itemName, context) {
  if (!itemName) return [];
  if (!user.items || !user.items[itemName] || user.items[itemName] <= 0) return [`${itemName} 아이템이 없습니다.`];
  if (!items[itemName]) return [`${itemName} 효과를 찾을 수 없습니다.`];
  const log = items[itemName](user, context);
  if (log) {
    user.items[itemName] -= 1;
    return [log];
  }
  return [];
};
