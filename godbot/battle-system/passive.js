// battle-system/passive.js
const passives = require('../utils/passive-skills'); // 패시브 데이터 파일
module.exports = function resolvePassive(user, enemy, context, event) {
  let logs = [];
  const champName = user.name;
  // 패시브는 각 챔피언마다 events 구조로 (onAttack, onDefend, ...) 구현!
  if (passives[champName] && passives[champName].events && typeof passives[champName].events[event] === 'function') {
    const log = passives[champName].events[event](user, enemy, context);
    if (log) logs.push(log);
  }
  return logs;
};
