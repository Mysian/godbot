const characterSkills = {
  rat: {
    name: "치명적인 갉기",
    description: "적에게 공격력의 120% 데미지를 입히고, 2턴간 방어력 10% 감소",
    type: "attack-debuff"
  },
  ox: {
    name: "우직한 돌진",
    description: "공격력의 150% 물리 데미지를 입힘",
    type: "heavy-attack"
  },
  tiger: {
    name: "맹렬한 포효",
    description: "공격력의 100% 피해 + 적의 마력 20% 감소",
    type: "attack-debuff-magic"
  },
  rabbit: {
    name: "회피의 점프",
    description: "다음 턴까지 받는 물리 피해 50% 감소",
    type: "defense-buff"
  },
  dragon: {
    name: "숨결의 폭풍",
    description: "전체 적에게 마력의 80% 광역 마법 데미지",
    type: "aoe-magic"
  },
  snake: {
    name: "독의 이빨",
    description: "공격력의 80% 피해 + 50% 확률로 2턴간 중독",
    type: "attack-poison"
  },
  horse: {
    name: "질풍같은 발굽",
    description: "공격력의 140% 피해 + 다음 턴 선공권 확보",
    type: "speed-attack"
  },
  sheep: {
    name: "포근한 치유",
    description: "자신의 체력을 마력의 80%만큼 회복",
    type: "self-heal"
  },
  monkey: {
    name: "교란의 곡예",
    description: "50% 확률로 적의 공격 실패 유도",
    type: "confuse"
  },
  rooster: {
    name: "날카로운 쪼기",
    description: "공격력의 100% 피해 + 1턴간 침묵 (스킬 봉인)",
    type: "attack-silence"
  },
  dog: {
    name: "충성의 포효",
    description: "자신의 방어력 30% 증가 + 팀원 전체 10% 방어 증가 (2턴)",
    type: "team-buff-defense"
  },
  pig: {
    name: "행운의 돌진",
    description: "공격력의 100% 데미지 + 30% 확률로 크리티컬 2배",
    type: "lucky-attack"
  }
};

module.exports = characterSkills;
