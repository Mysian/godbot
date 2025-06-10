// utils/battleEngine.js
const skills = require('./skills');

// 전투 시작할 때 컨텍스트 초기화
function initBattleContext(battle) {
  battle.context = {
    effects: {},
    cooldowns: {},
    flatReduction: {},
    percentReduction: {},
    doubleDamage: {},
    invulnerable: {},
    dodgeNextAttack: {},
    userData: battle.userData || {},
  };
  [battle.challenger, battle.opponent].forEach(id => {
    battle.context.effects[id] = [];
    battle.context.cooldowns[id] = {};
    battle.context.flatReduction[id] = 0;
    battle.context.percentReduction[id] = 0;
    battle.context.doubleDamage[id] = false;
    battle.context.invulnerable[id] = false;
    battle.context.dodgeNextAttack[id] = false;
  });
}

// 매 턴 시작 시 이펙트 적용·턴 감소·쿨다운 감소
function processTurnStart(userData, battle) {
  [battle.challenger, battle.opponent].forEach(id => {
    battle.context.flatReduction[id] = 0;
    battle.context.percentReduction[id] = 0;
    battle.context.doubleDamage[id] = false;
    battle.context.invulnerable[id] = false;
    battle.context.dodgeNextAttack[id] = false;

    const next = [];
    for (const e of battle.context.effects[id]) {
      switch (e.type) {
        case 'dot':
          battle.hp[id] = Math.max(0, battle.hp[id] - e.damage);
          battle.logs.push(`☠️ ${userData[id].name}은(는) 독 ${e.damage} 피해`);
          break;
        case 'stunned':
          battle.logs.push(`💫 ${userData[id].name}은(는) 기절 상태!`);
          break;
        case 'damageReduction':
          battle.context.flatReduction[id] += e.value;
          battle.logs.push(`🛡️ ${userData[id].name}의 피해가 ${e.value}만큼 감소!`);
          break;
        case 'damageReductionPercent':
          battle.context.percentReduction[id] += e.value;
          battle.logs.push(`🛡️ ${userData[id].name}의 피해가 ${e.value}% 감소!`);
          break;
        case 'doubleDamage':
          battle.context.doubleDamage[id] = true;
          battle.logs.push(`🔥 ${userData[id].name}의 다음 공격 피해가 2배!`);
          break;
        case 'invulnerable':
          battle.context.invulnerable[id] = true;
          battle.logs.push(`🛡️ ${userData[id].name}은(는) 무적 상태!`);
          break;
        case 'dodgeNextAttack':
          battle.context.dodgeNextAttack[id] = true;
          battle.logs.push(`💨 ${userData[id].name}은(는) 다음 공격을 회피!`);
          break;
        // 필요한 만큼 추가
      }
      if (e.turns > 1) next.push({ ...e, turns: e.turns - 1 });
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

// 공격/스킬 데미지 계산 및 스킬 효과 적용
function calculateDamage(
  attacker,
  defender,
  isAttack = true,
  context = {},
  championName = null
) {
  // 0) 기절, 회피, 무효화, 무적 등 체크
  if (context.effects?.[attacker.id]?.some(e => e.type === 'stunned') || attacker.stunned) {
    return { 
      damage: 0, 
      critical: false, 
      log: `${attacker.name}은(는) 기절 상태라 공격 불가!` 
    };
  }
  if (context.dodgeNextAttack?.[defender.id]) {
    context.dodgeNextAttack[defender.id] = false;
    return { 
      damage: 0, 
      critical: false, 
      log: `${defender.name}이(가) 완벽히 회피!` 
    };
  }
  if (context.invulnerable?.[defender.id]) {
    context.invulnerable[defender.id] = false;
    return { 
      damage: 0, 
      critical: false, 
      log: `${defender.name}이(가) 무적! 피해 0` 
    };
  }

  // 1) 스탯 추출
  const atkStats = attacker.stats ?? attacker;
  const defStats = defender.stats ?? defender;
  const atkName  = attacker.name ?? '공격자';
  const defName  = defender.name ?? '방어자';
  const ad  = isAttack ? (atkStats.attack || 0) : 0;
  const ap  = isAttack ? (atkStats.ap || 0) : 0;
  const pen = atkStats.penetration || 0;

  // 2) 기본 방어력 보정
  let defVal = Math.max(0, (defStats.defense || 0) - pen);
  let base   = Math.max(0, ad + ap * 0.5 - defVal);

  // 3) 회피/치명
  const evade = Math.random() < 0.05;
  if (evade) return { damage: 0, critical: false, log: `${defName}이(가) 회피!` };
  const crit = Math.random() < 0.1;
  if (crit) base = Math.floor(base * 1.5);

  // 4) 분산 랜덤 (±15%)
  const variance = Math.floor(base * 0.15);
  const minD = Math.max(0, base - variance);
  const maxD = base + variance;
  base = minD + Math.floor(Math.random() * (maxD - minD + 1));

  // 5) doubleDamage 체크
  if (isAttack && context.doubleDamage?.[attacker.id]) {
    base *= 2;
    context.doubleDamage[attacker.id] = false;
  }

  // 6) flat/percent 감쇄
  base = Math.max(0, base - (context.flatReduction[defender.id] || 0));
  base = Math.floor(
    base * (1 - ((context.percentReduction[defender.id] || 0) / 100))
  );

  // 7) 챔피언 스킬 effect 적용 및 로그
  let skillLog = '';
  let skillName = '';
  let skillDesc = '';
  let effectMsg = '';

  if (championName && skills[championName] && typeof skills[championName].effect === 'function') {
    skillName = skills[championName].name;
    skillDesc = skills[championName].description;
    // effect 함수가 effectMsg 포함된 객체 반환하도록 유도
    let skillResult = skills[championName].effect(
      attacker, defender, isAttack, base, context
    );

    // effect 함수가 객체로 반환 시 상세 정보 추출(향후 확장 대응)
    if (typeof skillResult === 'object' && skillResult !== null) {
      base = skillResult.baseDamage ?? base;
      if (skillResult.log) effectMsg = skillResult.log;
    } else {
      // 숫자형 damage만 반환 시
      base = skillResult;
    }

    // 특수 효과 상세 메시지 자동 감지(예: 처형, 추가 피해, 상태이상 등)
    if (championName === "다리우스" && defender.hp === 0) {
      effectMsg = "상대가 즉시 처형됐습니다!";
    }
    // 필요시 다른 스킬도 effectMsg 추가
  }

  // 8) 결과 리턴: 스킬 명칭, 설명, 효과, 피해, 치명타 여부 포함
  let log = '';
  if (skillName) {
    log += `\n✨ **${atkName}가 「${skillName}」를 사용합니다!**\n`;
    log += `> _${skillDesc}_\n`;
  }
  if (effectMsg) {
    log += `➡️ **${effectMsg}**\n`;
  }
  log += `${atkName}의 공격: ${Math.round(base)}${crit ? ' 💥크리티컬!' : ''}`;

  return { damage: Math.round(base), critical: crit, log };
}

module.exports = { initBattleContext, processTurnStart, calculateDamage };
