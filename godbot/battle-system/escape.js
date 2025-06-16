// battle-system/escape.js
module.exports = function escape(user, enemy, context) {
  // 실제 도망 로직은 champ-battle.js에서 턴수/확률 조건에 따라 호출!
  return `${user.nickname || user.name}이(가) 도망을 시도했습니다.`;
};
