// battle-system/dodge.js
module.exports = function dodge(user, context) {
  user.isDodging = true;
  context.dodging = true;
  return `${user.nickname || user.name} 점멸(회피) 시도! 다음 공격 20% 확률로 회피`;
};
