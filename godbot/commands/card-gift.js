
const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("카드선물")
    .setDescription("카드를 다른 유저에게 선물합니다.")
    .addUserOption(option =>
      option.setName("유저").setDescription("카드를 선물할 유저").setRequired(true)
    ),
  async execute(interaction) {
    const senderId = interaction.user.id;
    const receiver = interaction.options.getUser("유저");
    if (!receiver || receiver.id === senderId) return interaction.reply("❌ 유효하지 않은 대상입니다.");

    const senderPath = path.join(__dirname, "..", "data", `${senderId}.json`);
    const receiverPath = path.join(__dirname, "..", "data", `${receiver.id}.json`);

    if (!fs.existsSync(senderPath)) return interaction.reply("❌ 보유한 카드가 없습니다.");
    const senderData = JSON.parse(fs.readFileSync(senderPath));
    const senderCards = senderData.cards || [];
    if (senderCards.length === 0) return interaction.reply("❌ 카드가 없습니다.");

    const giftedCard = senderCards.pop();
    fs.writeFileSync(senderPath, JSON.stringify(senderData, null, 2));

    let receiverData = { cards: [] };
    if (fs.existsSync(receiverPath)) {
      receiverData = JSON.parse(fs.readFileSync(receiverPath));
    }
    receiverData.cards = receiverData.cards || [];
    receiverData.cards.push(giftedCard);
    fs.writeFileSync(receiverPath, JSON.stringify(receiverData, null, 2));

    interaction.reply(`🎁 **${giftedCard.name}** 카드를 <@${receiver.id}>에게 선물했습니다!`);
  }
};
