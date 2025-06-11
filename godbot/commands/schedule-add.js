const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const schedulePath = path.join(__dirname, "../schedule.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("일정추가")
    .setDescription("새 일정을 추가합니다.")
    .addStringOption((option) =>
      option
        .setName("날짜")
        .setDescription("날짜를 YYYY-MM-DD 형식으로 입력")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("내용")
        .setDescription("일정 내용을 입력")
        .setRequired(true),
    ),

  async execute(interaction) {
    const date = interaction.options.getString("날짜");
    const content = interaction.options.getString("내용");

    let schedule = [];
    if (fs.existsSync(schedulePath)) {
      schedule = JSON.parse(fs.readFileSync(schedulePath));
    }

    schedule.push({ date, content });
    fs.writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));

    await interaction.reply(
      `✅ 일정이 추가되었습니다!\n📅 ${date} - ${content}`,
    );
  },
};
