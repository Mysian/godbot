// 📁 commands/lol-tier-register.js
const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "lol-tier.json");
const TIERS = {
  아이언: "🥉",
  브론즈: "🥉",
  실버: "🥈",
  골드: "🥇",
  플래티넘: "💎",
  에메랄드: "🟢",
  다이아몬드: "🔷",
  마스터: "🔶",
  그랜드마스터: "🔥",
  챌린저: "👑",
};

const POSITIONS = ["탑", "정글", "미드", "원딜", "서폿"];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("롤티어등록")
    .setDescription("당신의 포지션별 롤 티어를 등록합니다.")
    .addStringOption((option) =>
      option
        .setName("포지션")
        .setDescription("롤 포지션을 선택하세요.")
        .setRequired(true)
        .addChoices(...POSITIONS.map((pos) => ({ name: pos, value: pos }))),
    )
    .addStringOption((option) =>
      option
        .setName("티어")
        .setDescription("티어를 선택하세요.")
        .setRequired(true)
        .addChoices(
          ...Object.keys(TIERS).map((tier) => ({ name: tier, value: tier })),
        ),
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const position = interaction.options.getString("포지션");
    const tier = interaction.options.getString("티어");

    let data = {};
    if (fs.existsSync(DATA_PATH)) {
      data = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8") || "{}");
    }

    if (!data[userId]) {
      data[userId] = {};
    }

    data[userId][position] = tier;
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

    await interaction.reply({
      content: `✅ ${interaction.user.username}님의 **${position}** 포지션 티어가 ${TIERS[tier]} **${tier}**로 등록되었습니다!`,
      ephemeral: true,
    });
  },
};
