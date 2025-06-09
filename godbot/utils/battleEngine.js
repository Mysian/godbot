// utils/battleEngine.js
// ─────────────────────────────────────────────────────────────

const skills = require('./skills');

// 배틀 시작 시 호출: 컨텍스트 초기화
function initBattleContext(battle) {
  battle.context = {
    effects: {},
    cooldowns: {},
    flatReduction: {},
    percentReduction: {}
  };
  [battle.challenger, battle.opponent].forEach(id => {
    battle.context.effects[id] = [];
    battle.context.cooldowns[id] = {};
    battle.context.flatReduction[id] = 0;
    battle.context.percentReduction[id] = 0;
  });
}

// 매 턴 시작마다 이펙트 적용 & 지속턴 감소 & 쿨다운 감소
function processTurnStart(userData, battle) {
  // 이펙트 처리
  [battle.challenger, battle.opponent].forEach(id => {
    const list = battle.context.effects[id];
    const next = [];
    list.forEach(e => {
      switch (e.type) {
        case 'dot':
          battle.hp[id] = Math.max(0, battle.hp[id] - e.damage);
          battle.logs.push(`☠️ ${userData[id].name}은(는) 독으로 ${e.damage} 피해`);
          break;
        case 'kill':
          battle.hp[id] = 0;
          battle.logs.push(`💀 ${userData[id].name}은(는) 처형 당했습니다!`);
          break;
        case 'stunned':
          battle.logs.push(`💫 ${userData[id].name}은(는) 기절 상태!`);
          break;
        case 'damageReductionFlat':
          battle.context.flatReduction[id] += e.value;
          break;
        case 'damageReductionPercent':
          battle.context.percentReduction[id] += e.value;
          break;
      }
      if (e.turns > 1) next.push({...e, turns: e.turns - 1});
    });
    battle.context.effects[id] = next;
  });

  // 쿨다운 감소
  [battle.challenger, battle.opponent].forEach(id => {
    Object.keys(battle.context.cooldowns[id]).forEach(skillKey => {
      if (battle.context.cooldowns[id][skillKey] > 0) {
        battle.context.cooldowns[id][skillKey]--;
      }
    });
  });
}

// 순수 데미지 계산 (AD, AP, 방어력, 관통력, 크리/회피)
function calculateDamage(attacker, defender, isAttack = true) {
  const ad = isAttack ? attacker.attack : 0;
  const ap = isAttack ? attacker.ap : 0;
  let def = defender.defense - attacker.penetration;
  def = Math.max(0, def);

  let base = Math.max(0, ad + ap * 0.5 - def);
  const crit    = Math.random() < 0.1;
  const evade   = Math.random() < 0.05;
  if (evade)    return { damage: 0, critical: false, log: `${defender.name}이(가) 회피!` };
  if (crit)     base = Math.floor(base * 1.5);

  // flat & percent 감쇄 적용
  base = Math.max(0, base - battle.context.flatReduction[defender.id]);
  base = Math.floor(base * (1 - (battle.context.percentReduction[defender.id]/100)));

  return {
    damage: Math.round(base),
    critical: crit,
    log: `${attacker.name}의 공격: ${Math.round(base)}${crit? ' 💥크리티컬!':''}`
  };
}

module.exports = { initBattleContext, processTurnStart, calculateDamage };
