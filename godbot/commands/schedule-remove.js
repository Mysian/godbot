const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const schedulePath = path.join(__dirname, "../schedule.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("일정제거")
    .setDescription("특정 날짜의 일정을 삭제합니다.")
    .addStringOption((option) =>
      option
        .setName("날짜")
        .setDescription("삭제할 일정의 날짜 (YYYY-MM-DD)")
        .setRequired(true),
    ),

  async execute(interaction) {
    const dateToRemove = interaction.options.getString("날짜");

    if (!fs.existsSync(schedulePath)) {
      return await interaction.reply("❌ 저장된 일정이 없습니다.");
    }

    let schedule = JSON.parse(fs.readFileSync(schedulePath));
    const originalLength = schedule.length;

    schedule = schedule.filter((item) => item.date !== dateToRemove);

    if (schedule.length === originalLength) {
      return await interaction.reply(
        `❌ ${dateToRemove}에 해당하는 일정이 없습니다.`,
      );
    }

    fs.writeFileSync(schedulePath, JSON.stringify(schedule, null, 2));
    await interaction.reply(`🗑️ ${dateToRemove} 날짜의 일정이 제거되었습니다.`);
  },
};
