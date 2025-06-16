// battle-system/passive.js
const passives = require('../utils/passive-skills'); 
module.exports = function resolvePassive(user, enemy, context, event) {
  let logs = [];
  const champName = user.name;
  if (passives[champName] && typeof passives[champName].passive === 'function') {
    const log = passives[champName].passive(user, enemy, context, event);
    if (log) logs.push(log);
  }
  return logs;
};
