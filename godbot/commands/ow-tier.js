// 📁 commands/ow-tier.js
const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "../data/ow-tier.json");

const tierEmojis = {
  브론즈: "🥉",
  실버: "🥈",
  골드: "🥇",
  플래티넘: "💠",
  다이아몬드: "💎",
  마스터: "👑",
  그랜드마스터: "🔥",
  챌린저: "🏆",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("옵치티어")
    .setDescription("오버워치 포지션별 티어를 확인합니다.")
    .addUserOption((option) =>
      option
        .setName("유저명")
        .setDescription("티어를 확인할 유저를 선택하세요."),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("유저명") || interaction.user;
    let db = {};

    if (fs.existsSync(filePath)) {
      db = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }

    const data = db[target.id];
    if (!data) {
      return await interaction.reply({
        content: "❌ 등록된 티어 정보가 없습니다.",
        ephemeral: true,
      });
    }

    await interaction.reply({
      embeds: [
        {
          title: `🎮 ${target.username}님의 오버워치 티어`,
          fields: Object.entries(data).map(([position, tier]) => ({
            name: position,
            value: `${tierEmojis[tier]} ${tier}`,
            inline: true,
          })),
          color: 0x00aaff,
        },
      ],
      ephemeral: true,
    });
  },
};
