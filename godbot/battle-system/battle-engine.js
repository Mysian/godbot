// battle-system/battle-engine.js

const attack = require('./attack');
const defend = require('./defend');
const dodge = require('./dodge');
const useItem = require('./item');
const useSkill = require('./skill');
const escape = require('./escape');
const resolvePassive = require('./passive');
const { applyEffects } = require('./context'); // 필요시

module.exports = {
  attack,
  defend,
  dodge,
  useItem,
  useSkill,
  escape,
  resolvePassive,
  applyEffects,
};
