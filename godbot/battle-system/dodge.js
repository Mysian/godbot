// battle-system/dodge.js
module.exports = function dodge(user, enemy, context) {
  // 회피 시도 플래그 (이 턴에 '점멸' 선택 시)
  user.isDodging = true;
  context.dodging = true;

  // 회피에 관련된 패시브도 여기서 모두 트리거 (e.g. 패시브 효과 발동 체크)
  if (user.passive && typeof user.passive === "function") {
    // dodge/회피 관련 패시브 트리거 (onDodge)
    const log = user.passive(user, enemy, context, "onDodge");
    if (log) context.logs.push(log);
  }

  // 회피 성공 확률(기본 20%+ 버프/디버프 등)
  let dodgeChance = 0.20;
  if (user.dodgeChanceUp) dodgeChance += user.dodgeChanceUp / 100;

  // 상대 패시브에 의한 회피불가
  if (user.dodgeBlocked) {
    context.logs.push("❌ 회피 불가 상태!");
    user.isDodging = false;
    context.dodging = false;
    return `${user.nickname || user.name}는 회피 불가 상태로 점멸 실패!`;
  }

  // 실제 회피 성공/실패 판단은 다음 공격 시점에서 처리됨(attack.js 참고)
  // 여기서는 회피 시도 사실만 남김.
  context.logs.push(`${user.nickname || user.name} 점멸(회피) 시도! (다음 공격 ${Math.floor(dodgeChance * 100)}% 확률로 회피)`);
  return `${user.nickname || user.name} 점멸(회피) 시도! (다음 공격 ${Math.floor(dodgeChance * 100)}% 확률로 회피)`;
};
