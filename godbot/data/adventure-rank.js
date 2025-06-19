const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const adventurePath = path.join(__dirname, "../data/adventure.json");

function loadAdventure() {
  if (!fs.existsSync(adventurePath)) fs.writeFileSync(adventurePath, "{}");
  return JSON.parse(fs.readFileSync(adventurePath, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("모험순위")
    .setDescription("모험 컨텐츠에서 각 유저별 최고 기록을 보여줍니다."),
  async execute(interaction) {
    const adv = loadAdventure();
    const sorted = Object.entries(adv)
      .map(([user, dat]) => ({ user, stage: dat.stage || 0, clear: dat.clear || 0 }))
      .sort((a, b) => b.stage - a.stage);
    let desc = sorted.slice(0, 20).map((x, i) =>
      `#${i + 1} <@${x.user}> — ${x.stage - 1}스테이지 (클리어 ${x.clear || 0}회)`
    ).join("\n");
    if (!desc) desc = "아직 모험에 참가한 유저가 없습니다.";
    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle("🏆 모험 최고 기록 랭킹").setDescription(desc)],
      ephemeral: false
    });
  }
};
