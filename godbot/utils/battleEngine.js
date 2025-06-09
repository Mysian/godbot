// battleEngine.js  
// ───────────────  
const skills = require("./skills");

function processTurnStart(userData, battle) {
  // 매 턴 시작 시 DOT, 버프/디버프, kill 이펙트 등 처리
  for (const id of [battle.challenger, battle.opponent]) {
    const effects = battle.context.effects[id] || [];
    let newEffects = [];
    for (const e of effects) {
      switch (e.type) {
        case "dot":
          battle.hp[id] = Math.max(0, battle.hp[id] - e.damage);
          battle.logs.push(`☠️ ${userData[id].name}은(는) 독 피해 ${e.damage}`);
          break;
        case "kill":
          battle.hp[id] = 0;
          battle.logs.push(`💀 ${userData[id].name}은(는) 즉시 사망했습니다!`);
          break;
        // flat 감소
        case "damageReductionFlat":
          battle.context.flatReduction[id] = (battle.context.flatReduction[id] || 0) + e.value;
          break;
        // % 감소
        case "damageReductionPercent":
          battle.context.percentReduction[id] = (battle.context.percentReduction[id] || 0) + e.value;
          break;
        // 이후 턴에도 유지할 이펙트 제외
      }
      if (e.turns > 0) {
        e.turns--;
        if (e.turns > 0) newEffects.push(e);
      }
    }
    battle.context.effects[id] = newEffects;
  }
}

function calculateDamage(attacker, defender, isAttack = true, context = {}) {
  // 원본 데미지
  const atkP = isAttack ? attacker.attack : 0;
  const apP  = attacker.ap || 0;
  const pen  = attacker.penetration || 0;
  let def   = defender.defense || 0;

  // 방어 무시
  def = Math.max(0, def - pen);

  let dmg = Math.max(0, atkP + apP - def);

  // 치명·회피
  const crit  = Math.random() < (0.1 + (pen * 0.02));
  const evade= Math.random() < 0.05;
  if (evade) return { damage: 0, critical: false, log: `😎 ${defender.name}이(가) 회피!` };
  if (crit)  dmg = Math.floor(dmg * 1.5);

  // 스킬 효과 적용
  if (isAttack && context.skill) {
    const skillFn = skills[attacker.name];
    if (skillFn) {
      dmg = skillFn.apply(attacker, defender, true, dmg, context);
    }
  }

  // flat reduction
  const flat = context.flatReduction[defender.id] || 0;
  dmg = Math.max(0, dmg - flat);

  // percent reduction
  const pct = context.percentReduction[defender.id] || 0;
  dmg = Math.floor(dmg * (1 - pct / 100));

  return {
    damage: Math.round(dmg),
    critical: crit,
    log: `${attacker.name}의 공격: ${Math.round(dmg)} 데미지${crit? " (💥 크리티컬!)":""}`
  };
}

module.exports = { calculateDamage, processTurnStart };
