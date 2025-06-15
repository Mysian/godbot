const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const bePath = path.join(__dirname, '../data/BE.json');

function loadBE() {
  if (!fs.existsSync(bePath)) fs.writeFileSync(bePath, "{}");
  return JSON.parse(fs.readFileSync(bePath, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수조회')
    .setDescription('특정 유저의 파랑 정수(BE) 잔액과 최근 거래 내역을 확인합니다.')
    .addUserOption(opt =>
      opt.setName('유저')
        .setDescription('조회할 대상 유저')
        .setRequired(true)
    ),
  async execute(interaction) {
    const user = interaction.options.getUser('유저');
    const be = loadBE();
    const data = be[user.id];

    if (!data) {
      await interaction.reply({
        content: `❌ <@${user.id}>님의 파랑 정수(BE) 데이터가 없습니다.`,
        ephemeral: false
      });
      return;
    }

    // 최근 거래 내역 5개만 노출
    const history = (data.history || []).slice(-5).reverse().map(h =>
      `${h.type === "earn" ? "🔵" : "🔻"} ${h.amount} BE | ${h.reason || "사유 없음"} | <t:${Math.floor(h.timestamp / 1000)}:R>`
    ).join("\n") || "내역 없음";

    const embed = new EmbedBuilder()
      .setTitle(`💙 ${user.tag} (${user.id})`)
      .setDescription(`<@${user.id}>님의 파랑 정수(BE) 잔액: **${data.amount} BE**`)
      .addFields(
        { name: "📜 최근 거래 내역", value: history }
      )
      .setColor(0x3399ff);

    await interaction.reply({
      embeds: [embed],
      ephemeral: false // 모두에게 보이게
    });
  }
};
