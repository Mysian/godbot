// battle-system/context.js
module.exports = {
  applyEffects(user, enemy, context) {
    const logs = [];
    const myEffects = context.effects[user.id] || [];
    // 효과 하나씩 순회, 만료 관리
    for (let i = myEffects.length - 1; i >= 0; i--) {
      const effect = myEffects[i];

      // 도트(고정 피해)
      if (effect.type === 'dot' && effect.turns > 0) {
        user.hp = Math.max(0, user.hp - effect.damage);
        logs.push(`☠️ 도트 피해! (${effect.damage})`);
        effect.turns--;
      }
      // 힐/회복
      if (effect.type === 'heal' && effect.turns > 0) {
        user.hp = Math.min(user.stats.hp, user.hp + effect.value);
        logs.push(`💚 회복 효과! (+${effect.value})`);
        effect.turns--;
      }
      // 스턴/기절
      if (effect.type === 'stunned' && effect.turns > 0) {
        user.stunned = true;
        logs.push('😵 기절 상태!');
        effect.turns--;
      }
      // 무적/피해무효
      if (effect.type === 'invulnerable' && effect.turns > 0) {
        user.invulnerable = true;
        logs.push('🛡️ 무적 상태!');
        effect.turns--;
      }
      // 처형/즉사
      if (effect.type === 'execute' && effect.turns > 0) {
        user.hp = 0;
        logs.push('💀 처형!');
        effect.turns = 0;
      }
      // 지연 데미지
      if (effect.type === 'delayedDamage' && effect.turns > 0) {
        effect.turns--;
        if (effect.turns === 0) {
          user.hp = Math.max(0, user.hp - effect.damage);
          logs.push(`💥 지연 피해! (${effect.damage})`);
        }
      }
      // 부활(예시)
      if (effect.type === 'revive' && effect.turns > 0) {
        // 별도 구현 가능 (이펙트 대신 passive에서 직접 user.hp 등 조작이 일반적)
        effect.turns--;
      }
      // TODO: 추가 효과들 (ex. atkBuffPercent, defDownPercent 등)
      // 추가적으로 원하는 모든 타입을 여기에 구현 가능
      // 예: 공격력/방어력/관통력 증감, 다음 공격/방어 무효, missNext, dodgeNextAttack 등...

      // 만료된 효과 삭제
      if (effect.turns <= 0) {
        myEffects.splice(i, 1);
      }
    }
    // 기절/무적 등 턴 종료시 자동 해제
    if (!myEffects.some(e => e.type === 'stunned' && e.turns > 0)) user.stunned = false;
    if (!myEffects.some(e => e.type === 'invulnerable' && e.turns > 0)) user.invulnerable = false;
    context.effects[user.id] = myEffects;
    return logs;
  }
};
