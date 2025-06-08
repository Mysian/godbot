const { SlashCommandBuilder } = require("discord.js");
const { getUserCardData } = require("../utils/cardDataManager");

const elementEmojis = {
  불: "🔥",
  물: "💧",
  나무: "🌳",
  어둠: "🌑",
  빛: "🌟",
};

const gradeStyle = {
  Z: "🟣 **Z급**",
  SSS: "🔵 **SSS급**",
  SS: "🔷 **SS급**",
  S: "🟦 **S급**",
  A: "🟢 **A급**",
  B: "🟩 **B급**",
  C: "🟨 **C급**",
  D: "🟧 **D급**",
  E: "🟠 **E급**",
  F: "⚪ **F급**",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("카드상자")
    .setDescription("보유 중인 모든 카드를 확인합니다."),

  async execute(interaction) {
    const userId = interaction.user.id;
    const userData = getUserCardData(userId);
    const cards = userData.cards || [];

    if (cards.length === 0) {
      return interaction.reply({
        content: "📦 아직 보유 중인 카드가 없습니다. `/카드뽑기`로 카드를 뽑아보세요!",
        ephemeral: true,
      });
    }

    const cardList = cards
      .map((card, index) => {
        const elementEmoji = elementEmojis[card.element] || "";
        const gradeLabel = gradeStyle[card.grade] || card.grade;
        return `**[${index + 1}]** ${card.emoji} ${card.korName} (${card.engName}) - ${elementEmoji} \`${card.element}\` 속성 / 등급: ${gradeLabel} / Lv.${card.level}`;
      })
      .join("\n");

    await interaction.reply({
      content: `🃏 <@${userId}>님의 카드 목록입니다:\n\n${cardList}`,
      ephemeral: true,
    });
  },
};
