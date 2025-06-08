// 📁 commands/lol-tier-view.js
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName("롤티어")
    .setDescription("해당 유저의 포지션별 롤 티어를 확인합니다.")
    .addUserOption((option) =>
      option
        .setName("유저명")
        .setDescription("확인할 유저를 선택하세요.")
        .setRequired(true),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("유저명");
    let data = {};
    if (fs.existsSync(DATA_PATH)) {
      data = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
    }

    const record = data[target.id];
    if (!record) {
      return interaction.reply(
        `⚠️ ${target.username}님의 등록된 티어 정보가 없습니다.`,
      );
    }

    const embed = {
      color: 0x00aaff,
      title: `${target.username}님의 롤 포지션별 티어`,
      fields: Object.entries(record).map(([pos, tier]) => ({
        name: `📌 ${pos}`,
        value: `${TIERS[tier]} ${tier}`,
        inline: true,
      })),
    };

    await interaction.reply({ embeds: [embed] });
  },
};
