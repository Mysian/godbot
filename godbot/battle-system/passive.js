// battle-system/passive.js
const passives = require('../utils/passive-skills');

function resolvePassive(user, enemy, context, trigger) {
  let logs = [];
  const champName = user.name;
  if (passives[champName] && typeof passives[champName].passive === 'function') {
    const log = passives[champName].passive(user, enemy, context, trigger);
    if (log) logs.push(log);
  }
  return logs;
}

module.exports = resolvePassive;
