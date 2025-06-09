// utils/battleEngine.js
const skills = require('./skills');

// 전투 시작할 때 컨텍스트 초기화
function initBattleContext(battle) {
  battle.context = {
    effects: {},            // [{type, …, turns}, …]
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
        // …필요한 다른 타입도 여기에 추가
      }
      if (e.turns > 1) {
        next.push({ ...e, turns: e.turns - 1 });
      }
    }
    battle.context.effects[id] = next;
  });

  // 스킬 쿨다운 감소
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
  // invulnerable 무적 여부 우선 확인
  if (context.invulnerable?.[defender.id]) {
    // 한 번만 무적 적용
    delete context.invulnerable[defender.id];
    return { damage: 0, critical: false, log: `${defender.name}이(가) 무적! 피해 0` };
  }

  // attacker, defender 객체에 stats가 있으면 그걸 쓰고 없으면 그대로 사용
  const atkStats = attacker.stats ?? attacker;
  const defStats = defender.stats ?? defender;
  const atkName  = attacker.name ?? '공격자';
  const defName  = defender.name ?? '방어자';

  const ad  = isAttack ? (atkStats.attack || 0) : 0;
  const ap  = isAttack ? (atkStats.ap || 0) : 0;
  const pen = atkStats.penetration || 0;

  let defVal = Math.max(0, (defStats.defense || 0) - pen);
  let base   = Math.max(0, ad + ap * 0.5 - defVal);

  const crit  = Math.random() < 0.1;
  const evade = Math.random() < 0.05;
  if (evade) {
    return { damage: 0, critical: false, log: `${defName}이(가) 회피!` };
  }
  if (crit) {
    base = Math.floor(base * 1.5);
  }

  // doubleDamage 이펙트 적용
  if (isAttack && context.doubleDamage?.[attacker.id]) {
    base *= 2;
    delete context.doubleDamage[attacker.id];
    // 로그에 더블데미지 표시
  }

  // flat 및 percent 감쇄
  base = Math.max(0, base - (context.flatReduction[defender.id] || 0));
  base = Math.floor(
    base * (1 - ((context.percentReduction[defender.id] || 0) / 100))
  );

  const damage = Math.round(base);
  let log = `${atkName}의 공격: ${damage}${crit ? ' 💥크리티컬!' : ''}`;
  if (isAttack && context.doubleDamage?.[attacker.id] === undefined) {
    // 이미 삭제됐으므로 로그에 추가
    // (만약 중복 기재를 막고 싶으면 위에서 삭제 직후에만 로그 붙이도록)
    // log += ' 💥더블데미지!';
  }

  return {
    damage,
    critical: crit,
    log
  };
}

module.exports = { initBattleContext, processTurnStart, calculateDamage };
