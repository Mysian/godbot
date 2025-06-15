const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

// 상점에 추가할 수 있는 대표 아이템들
const ITEM_LIST = [
  { name: "체력 20% 회복 물약", desc: "전투 중 체력 20% 회복" },
  { name: "기절 수류탄", desc: "10% 확률로 1턴 기절" },
  { name: "BF대검", desc: "공격력 +20" },
  { name: "쓸 데 없이 큰 지팡이", desc: "주문력 +30" },
  { name: "민첩의 망토", desc: "치명타 확률 +2%, 2턴간 지속" }
];

const marketPath = path.join(__dirname, "../data/item-market.json");

function loadMarket() {
  if (!fs.existsSync(marketPath)) fs.writeFileSync(marketPath, "{}");
  return JSON.parse(fs.readFileSync(marketPath, "utf8"));
}
function saveMarket(market) {
  fs.writeFileSync(marketPath, JSON.stringify(market, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("아이템상점:상품등록")
    .setDescription("상점에 판매할 아이템을 등록합니다. (관리자만)")
    .addStringOption(opt =>
      opt.setName("아이템명")
        .setDescription("아이템 이름")
        .setRequired(true)
        .addChoices(...ITEM_LIST.map(item => ({
          name: item.name, value: item.name
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
    const name = interaction.options.getString("아이템명");
    const price = interaction.options.getInteger("가격");
    const stock = interaction.options.getInteger("수량");
    const sellerTag = interaction.user.tag;
    const item = ITEM_LIST.find(i => i.name === name);
    if (!item) {
      await interaction.reply({ content: "등록할 수 없는 아이템입니다.", ephemeral: true });
      return;
    }
    // 상품 등록
    const market = loadMarket();
    const id = `${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    market[id] = {
      name,
      desc: item.desc,
      price,
      stock,
      sellerTag,
      timestamp: Date.now()
    };
    saveMarket(market);
    await interaction.reply({ content: `✅ [${name}]을(를) ${price} BE/개, ${stock}개로 등록 완료!`, ephemeral: true });
  }
};
