// battle-system/escape.js
const applyPassives = require("../passive");

module.exports = function escape(user, enemy, context = {}) {
  context.logs = context.logs || [];

  // 패시브 효과 (onEscape)
  applyPassives(user, enemy, context, "onEscape");
  applyPassives(enemy, user, context, "onEnemyEscape");

  // 이 부분에서 실제 도망 성공/실패 확률 계산은 champ-battle.js 또는 battle-controller.js 등에서 판정 후 전달해야 함
  // 단순 로그만 표시
  context.logs.push(`${user.nickname || user.name}이(가) 도망을 시도했습니다.`);

  // 패시브에서 상태 변화가 있으면 반영(예: 도망불가 효과 등)
  // 예시: user.escapeBlocked = true; 등 패시브 구현에서 적용

  // 최종 로그/상태 반환
  return {
    success: true, // 성공/실패 여부는 외부에서 판정
    logs: context.logs,
    user,
    enemy,
    context,
  };
};
