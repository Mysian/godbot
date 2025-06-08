const { SlashCommandBuilder } = require("discord.js");
const { loadUserCards, saveUserCards } = require("../utils/cardDataManager");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("카드선물")
    .setDescription("자신의 카드를 다른 유저에게 선물합니다.")
    .addUserOption(option =>
      option.setName("유저").setDescription("카드를 보낼 유저").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("카드id").setDescription("보낼 카드의 ID").setRequired(true)
    ),

  async execute(interaction) {
    const sender = interaction.user;
    const receiver = interaction.options.getUser("유저");
    const cardId = interaction.options.getString("카드id");

    if (sender.id === receiver.id) {
      return interaction.reply({
        content: "❌ 자기 자신에게는 카드를 선물할 수 없습니다!",
        ephemeral: true,
      });
    }

    const senderCards = loadUserCards(sender.id);
    const receiverCards = loadUserCards(receiver.id);

    const cardIndex = senderCards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      return interaction.reply({
        content: "❌ 해당 카드를 찾을 수 없습니다. 올바른 카드 ID인지 확인해주세요.",
        ephemeral: true,
      });
    }

    const [cardToSend] = senderCards.splice(cardIndex, 1); // 카드 제거
    receiverCards.push(cardToSend); // 카드 추가

    saveUserCards(sender.id, senderCards);
    saveUserCards(receiver.id, receiverCards);

    await interaction.reply({
      content: `🎁 <@${receiver.id}> 님께 카드 ${cardToSend.emoji} **${cardToSend.nameKr}** (${cardToSend.nameEn}) [${cardToSend.elementEmoji}] 등급: ${cardToSend.gradeEmoji} 을(를) 선물했습니다!`,
    });
  },
};
