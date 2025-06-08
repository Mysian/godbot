// 부스터 역할 ID는 프로젝트에 맞게 수정 가능
const BOOSTER_ROLE_ID = "1207437971037356142";

function hasBoosterRole(member) {
  return member.roles.cache.has(BOOSTER_ROLE_ID);
}

module.exports = {
  hasBoosterRole,
};
