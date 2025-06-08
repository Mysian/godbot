const { SlashCommandBuilder } = require("discord.js");
const { getUserCardData, saveUserCardData } = require("../utils/cardDataManager");

const upgradeRates = {
  E: 1.0,
  D: 0.9,
  C: 0.8,
  B: 0.7,
  A: 0.6,
  S: 0.5,
  SS: 0.4,
  SSS: 0.2,
  Z: 0.1,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("카드강화")
    .setDescription("보유한 카드 중 동일한 카드를 강화합니다.")
    .addIntegerOption(option =>
      option.setName("카드번호")
        .setDescription("강화할 카드의 번호를 입력하세요. (카드상자 순서 기준)")
        .setRequired(true)
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const targetIndex = interaction.options.getInteger("카드번호") - 1;

    const userData = getUserCardData(userId);
    const cards = userData.cards || [];

    if (!cards[targetIndex]) {
      return interaction.reply({
        content: "❌ 해당 카드 번호가 존재하지 않아요!",
        ephemeral: true,
      });
    }

    const targetCard = cards[targetIndex];

    // 동일한 카드(속성, 이름, 등급, 레벨 동일) 찾기
    const matchingIndex = cards.findIndex((c, idx) =>
      idx !== targetIndex &&
      c.korName === targetCard.korName &&
      c.element === targetCard.element &&
      c.grade === targetCard.grade &&
      c.level === targetCard.level
    );

    if (matchingIndex === -1) {
      return interaction.reply({
        content: "❗ 동일한 카드를 2장 이상 보유해야 강화할 수 있어요.",
        ephemeral: true,
      });
    }

    // 강화 확률 계산
    const successRate = upgradeRates[targetCard.grade] || 0;
    const success = Math.random() < successRate;

    if (success) {
      // 기존 카드 강화: 능력치 1.5배, 레벨+1
      targetCard.stats.attack = Math.floor(targetCard.stats.attack * 1.5);
      targetCard.stats.defense = Math.floor(targetCard.stats.defense * 1.5);
      targetCard.stats.hp = Math.floor(targetCard.stats.hp * 1.5);
      targetCard.stats.magic = Math.floor(targetCard.stats.magic * 1.5);
      targetCard.stats.luck = Math.floor(targetCard.stats.luck * 1.5);
      targetCard.level += 1;

      // 중복카드 삭제
      cards.splice(matchingIndex, 1);

      saveUserCardData(userId, userData);

      return interaction.reply({
        content: `✅ 강화 성공! **${targetCard.korName}** 카드가 더 강해졌어요! 🔥\nLv.${targetCard.level} | 공격력 ${targetCard.stats.attack} | 체력 ${targetCard.stats.hp}`,
        ephemeral: true,
      });
    } else {
      // 강화 실패: 중복카드 하나 삭제
      cards.splice(matchingIndex, 1);
      saveUserCardData(userId, userData);

      return interaction.reply({
        content: `💥 아쉽게도 강화에 실패했어요...\n**${targetCard.korName}** 카드는 그대로이며, 중복카드 하나는 사라졌어요.`,
        ephemeral: true,
      });
    }
  },
};
