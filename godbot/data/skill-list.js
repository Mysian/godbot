// data/skill-list.js

module.exports = [
  {
    name: "불꽃참격",
    desc: "적에게 불 속성 피해를 입힙니다. (피해량 +30, 화상 부여 2턴)",
    price: 200,
    icon: "🔥",
    effect: "fireSlash"
  },
  {
    name: "빙결파동",
    desc: "적을 얼려서 1턴간 행동 불가로 만듭니다. (추가 피해 +10)",
    price: 250,
    icon: "❄️",
    effect: "iceWave"
  },
  {
    name: "회복의 빛",
    desc: "내 체력을 30% 회복합니다.",
    price: 300,
    icon: "💡",
    effect: "healLight"
  },
  {
    name: "무적의 외침",
    desc: "2턴간 모든 피해를 막습니다.",
    price: 500,
    icon: "🛡️",
    effect: "invincibleShout"
  },
  {
    name: "약점 감지",
    desc: "상대의 방어력을 2턴간 30% 감소시킵니다.",
    price: 220,
    icon: "🔎",
    effect: "defenseDetect"
  },
  {
    name: "마나번",
    desc: "적의 마나를 50 소모시키고 1턴간 스킬 사용 불가로 만듭니다.",
    price: 270,
    icon: "🧪",
    effect: "manaBurn"
  },
  {
    name: "치명 일격",
    desc: "이 공격은 반드시 치명타로 들어갑니다. (치명타 배수 적용)",
    price: 400,
    icon: "⚡",
    effect: "criticalStrike"
  },
  {
    name: "속도 증가",
    desc: "3턴간 내 공격 속도를 2배로 만듭니다.",
    price: 320,
    icon: "💨",
    effect: "speedUp"
  }
  // 필요하면 자유롭게 추가!
];
