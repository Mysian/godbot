// battle-system/passive.js
const passives = require('../utils/passive-skills');

function runPassive(user, enemy, context, trigger) {
  let logs = [];
  const champName = user.name;
  if (passives[champName] && typeof passives[champName].passive === 'function') {
    const log = passives[champName].passive(user, enemy, context, trigger);
    if (Array.isArray(log)) logs.push(...log);
    else if (log) logs.push(log);
  }
  return logs;
}

module.exports = runPassive;
