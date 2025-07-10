const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const bePath = path.join(__dirname, '../data/BE.json');

function loadBE() {
  if (!fs.existsSync(bePath)) fs.writeFileSync(bePath, '{}');
  return JSON.parse(fs.readFileSync(bePath, 'utf8'));
}

const EMBED_IMAGE = 'https://media.discordapp.net/attachments/1388728993787940914/1392698206189523113/Image_fx.jpg?ex=68707ac7&is=686f2947&hm=cf727fd173aaf411d649eec368a03b3715b7518075715dde84f97a9976a6b7a8&=&format=webp';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수조회')
    .setDescription('파랑 정수(BE) 잔액과 최근 거래내역을 확인합니다.')
    .addUserOption(opt =>
      opt.setName('유저')
        .setDescription('조회할 대상 유저 (입력 안하면 본인)')
        .setRequired(false)
    ),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('유저') || interaction.user;
    const be = loadBE();
    const data = be[targetUser.id];

    if (!data) {
      await interaction.reply({
        content: `❌ <@${targetUser.id}>님의 🔷파랑 정수(BE) 데이터가 없습니다.`,
        ephemeral: true
      });
      return;
    }

    // 콤마(,) 처리!
    const formatAmount = n => Number(n).toLocaleString('ko-KR');

    const history = (data.history || []).slice(-5).reverse().map(h =>
      `${h.type === "earn" ? "🔷" : "🔻"} ${formatAmount(h.amount)} BE | ${h.reason || "사유 없음"} | <t:${Math.floor(h.timestamp / 1000)}:R>`
    ).join('\n') || "내역 없음";

    const embed = new EmbedBuilder()
      .setTitle(`💙 ${targetUser.tag}`)
      .setDescription(`<@${targetUser.id}>님의 🔷파랑 정수(BE) 잔액: **${formatAmount(data.amount)} BE**`)
      .addFields(
        { name: "📜 최근 거래 내역", value: history }
      )
      .setColor(0x3399ff)
      .setImage(EMBED_IMAGE);   // ← 이 라인만 추가!

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
};
