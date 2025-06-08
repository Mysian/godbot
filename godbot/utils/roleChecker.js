// utils/roleChecker.js

/**
 * 주어진 멤버가 특정 역할 ID를 가지고 있는지 확인
 * @param {GuildMember} member 디스코드 멤버 객체
 * @param {string} roleId 확인할 역할 ID
 * @returns {boolean} 역할을 가지고 있는 경우 true
 */
function hasRole(member, roleId) {
  return member.roles.cache.has(roleId);
}

module.exports = { hasRole };
