// battle-system/defend.js
module.exports = function defend(user, context) {
  user.isDefending = true;
  context.defending = true;
  return `${user.nickname || user.name} 방어자세! 다음 피해 50% 감소`;
};
