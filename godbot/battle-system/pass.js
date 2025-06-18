const { getChampionNameByUserId } = require('../utils/champion-utils');

module.exports = function pass(user, enemy, context, logs) {
  logs = logs || [];
  logs.push(`😴 ${getChampionNameByUserId(user.id)}가 우물에서 쉽니다!`);
  // 어떤 상태든 무조건 휴식만 기록!
  return logs;
};
