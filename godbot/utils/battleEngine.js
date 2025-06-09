// utils/battleEngine.js
const skills = require('./skills');

// 전투 시작할 때 컨텍스트 초기화
function initBattleContext(battle) {
  battle.context = {
    effects: {},            // [{type, turns, …}, …]
    cooldowns: {},          // { skillName: remainingTurns, … }
    flatReduction: {},      // { userId: flatAmount, … }
    percentReduction: {},   // { userId: percentValue, … }
    doubleDamage: {},       // { userId: true, … }
    invulnerable: {}        // { userId: true, … }
  };
  [battle.challenger, battle.opponent].forEach(id => {
    battle.context.effects[id] = [];
    battle.context.cooldowns[id] = {};
    battle.context.flatReduction[id] = 0;
    battle.context.percentReduction[id] = 0;
    battle.context.doubleDamage[id] = false;
    battle.context.invulnerable[id] = false;
  });
}

// 매 턴 시작 시 이펙트 적용·턴 감소·쿨다운 감소
function processTurnStart(userData, battle) {
  [battle.challenger, battle.opponent].forEach(id => {
    const next = [];
    for (const e of battle.context.effects[id]) {
      switch (e.type) {
        case 'dot':
          battle.hp[id] = Math.max(0, battle.hp[id] - e.damage);
          battle.logs.push(`☠️ ${userData[id].name}은(는) 독 ${e.damage} 피해`);
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
        case 'doubleDamage':
          // 다음 공격 때 2배 데미지 적용
          battle.context.doubleDamage[id] = true;
          break;
        case 'invulnerable':
          // 다음 턴 전체 무적 처리
          battle.context.invulnerable[id] = true;
          break;
        // 기타 이펙트도 여기에…
      }
      if (e.turns > 1) {
        next.push({ ...e, turns: e.turns - 1 });
      }
    }
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

// 공격/스킬 데미지 계산
function calculateDamage(
  attacker,
  defender,
  isAttack = true,
  context = {}
) {
  // 1) 무적 여부 우선 확인
  if (context.invulnerable?.[defender.id]) {
    delete context.invulnerable[defender.id];
    return { damage: 0, critical: false, log: `${defender.name}이(가) 무적! 피해 0` };
  }

  // 2) stat 추출
  const atkStats = attacker.stats ?? attacker;
  const defStats = defender.stats ?? defender;
  const atkName  = attacker.name ?? '공격자';
  const defName  = defender.name ?? '방어자';

  const ad  = isAttack ? (atkStats.attack || 0) : 0;
  const ap  = isAttack ? (atkStats.ap || 0) : 0;
  const pen = atkStats.penetration || 0;

  // 3) 방어력 계산
  let defVal = Math.max(0, (defStats.defense || 0) - pen);
  let base   = Math.max(0, ad + ap * 0.5 - defVal);

  // 4) 회피/치명
  const evade = Math.random() < 0.05;
  if (evade) {
    return { damage: 0, critical: false, log: `${defName}이(가) 회피!` };
  }
  const crit = Math.random() < 0.1;
  if (crit) base = Math.floor(base * 1.5);

  // 5) 랜덤 분산 (±15%)
  const variance = Math.floor(base * 0.15);
  const minD = Math.max(0, base - variance);
  const maxD = base + variance;
  base = minD + Math.floor(Math.random() * (maxD - minD + 1));

  // 6) doubleDamage 이펙트
  if (isAttack && context.doubleDamage?.[attacker.id]) {
    base *= 2;
    delete context.doubleDamage[attacker.id];
  }

  // 7) flat/percent 감쇄
  base = Math.max(0, base - (context.flatReduction[defender.id] || 0));
  base = Math.floor(
    base * (1 - ((context.percentReduction[defender.id] || 0) / 100))
  );

  // 8) 최종 반환
  const damage = Math.round(base);
  let log = `${atkName}의 공격: ${damage}${crit ? ' 💥크리티컬!' : ''}`;
  return { damage, critical: crit, log };
}

module.exports = { initBattleContext, processTurnStart, calculateDamage };
