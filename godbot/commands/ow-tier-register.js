// 📁 commands/ow-tier-register.js
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
    .setName("옵치티어등록")
    .setDescription("오버워치 포지션별 티어를 등록합니다.")
    .addStringOption((option) =>
      option
        .setName("탱커")
        .setDescription("탱커 포지션 티어")
        .addChoices(
          ...Object.keys(tierEmojis).map((t) => ({ name: t, value: t })),
        ),
    )
    .addStringOption((option) =>
      option
        .setName("딜러")
        .setDescription("딜러 포지션 티어")
        .addChoices(
          ...Object.keys(tierEmojis).map((t) => ({ name: t, value: t })),
        ),
    )
    .addStringOption((option) =>
      option
        .setName("힐러")
        .setDescription("힐러 포지션 티어")
        .addChoices(
          ...Object.keys(tierEmojis).map((t) => ({ name: t, value: t })),
        ),
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const data = {
      탱커: interaction.options.getString("탱커") || "브론즈",
      딜러: interaction.options.getString("딜러") || "브론즈",
      힐러: interaction.options.getString("힐러") || "브론즈",
    };

    let db = {};
    if (fs.existsSync(filePath)) {
      db = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }

    db[userId] = data;
    fs.writeFileSync(filePath, JSON.stringify(db, null, 2));

    await interaction.reply({
      content: `✅ 오버워치 티어가 등록되었습니다.`,
      ephemeral: true,
    });
  },
};
