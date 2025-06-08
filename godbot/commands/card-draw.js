const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getUserCardData, addCardToUser } = require("../utils/cardDataManager");
const { getCurrentDrawCount, incrementDrawCount } = require("../utils/drawLimitManager");
const { hasBoosterRole } = require("../utils/roleChecker");
const { generateRandomCard } = require("../utils/cardGenerator");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("카드뽑기")
    .setDescription("하루 최대 3회, 부스터 유저는 6회까지 카드를 뽑을 수 있습니다!"),

  async execute(interaction) {
    const userId = interaction.user.id;
    const isBooster = hasBoosterRole(interaction.member);
    const drawLimit = isBooster ? 6 : 3;

    const currentCount = getCurrentDrawCount(userId);
    if (currentCount >= drawLimit) {
      return interaction.reply({
        content: `❗️ 카드 뽑기 횟수를 모두 사용했습니다! (남은 횟수: 0/${drawLimit})`,
        ephemeral: true,
      });
    }

    // 카드 생성
    const newCard = generateRandomCard();
    addCardToUser(userId, newCard);
    incrementDrawCount(userId);

    // 카드 embed
    const embed = new EmbedBuilder()
      .setTitle("✨ 카드 뽑기 결과!")
      .setDescription(`당신은 새로운 카드를 획득했습니다!`)
      .addFields(
        { name: "이름", value: newCard.name, inline: true },
        { name: "속성", value: `${newCard.element.emoji} ${newCard.element.kor}`, inline: true },
        { name: "등급", value: `${newCard.grade.emoji} ${newCard.grade.label}`, inline: true }
      )
      .setColor(newCard.grade.color)
      .setFooter({ text: `남은 뽑기 횟수: ${drawLimit - currentCount - 1}/${drawLimit}` });

    return interaction.reply({ embeds: [embed] });
  },
};
