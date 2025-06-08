const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../data/favorability-data.json");

function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("호감도")
    .setDescription("해당 유저의 호감도를 확인합니다.")
    .addUserOption(option =>
      option.setName("유저").setDescription("확인할 유저를 선택하세요").setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("유저");
    const data = loadData();
    const score = typeof data[target.id]?.score === "number" ? data[target.id].score : 0;

    let emoji = "😐";
    if (score >= 10) emoji = "😍";
    else if (score >= 5) emoji = "😊";
    else if (score <= -10) emoji = "💀";
    else if (score <= -5) emoji = "😠";

    await interaction.reply({
      content: `🧭 <@${target.id}>의 호감도는 **${score}점**입니다. ${emoji}`,
      ephemeral: true
    });
  }
};
