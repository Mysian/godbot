const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

// 스킬 예시 (원하는 대로 확장/수정)
const SKILL_LIST = [
  { name: "불꽃참격", desc: "적에게 불 속성 피해를 입힌다." },
  { name: "빙결파동", desc: "적을 얼려서 1턴간 행동 불가로 만든다." },
  { name: "회복의 빛", desc: "내 체력을 30% 회복한다." },
  { name: "무적의 외침", desc: "2턴간 모든 피해를 막는다." },
  { name: "약점 감지", desc: "상대의 방어력을 2턴간 30% 감소시킨다." }
];

const marketPath = path.join(__dirname, "../data/skill-market.json");

function loadMarket() {
  if (!fs.existsSync(marketPath)) fs.writeFileSync(marketPath, "{}");
  return JSON.parse(fs.readFileSync(marketPath, "utf8"));
}
function saveMarket(market) {
  fs.writeFileSync(marketPath, JSON.stringify(market, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("스킬상점등록")
    .setDescription("상점에 판매할 스킬을 등록합니다. (관리자만)")
    .addStringOption(opt =>
      opt.setName("스킬명")
        .setDescription("스킬 이름")
        .setRequired(true)
        .addChoices(...SKILL_LIST.map(skill => ({
          name: skill.name, value: skill.name
        })))
    )
    .addIntegerOption(opt =>
      opt.setName("가격")
        .setDescription("판매 가격 (BE)")
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName("수량")
        .setDescription("판매 수량(재고)")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const name = interaction.options.getString("스킬명");
    const price = interaction.options.getInteger("가격");
    const stock = interaction.options.getInteger("수량");
    const sellerTag = interaction.user.tag;
    const skill = SKILL_LIST.find(i => i.name === name);
    if (!skill) {
      await interaction.reply({ content: "등록할 수 없는 스킬입니다.", ephemeral: true });
      return;
    }
    // 상품 등록
    const market = loadMarket();
    const id = `${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    market[id] = {
      name,
      desc: skill.desc,
      price,
      stock,
      sellerTag,
      timestamp: Date.now()
    };
    saveMarket(market);
    await interaction.reply({ content: `✅ [${name}] 스킬을 ${price} BE/개, ${stock}개로 등록 완료!`, ephemeral: true });
  }
};
