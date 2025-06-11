const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const schedulePath = path.join(__dirname, "../schedule.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("일정")
    .setDescription("다가오는 일정을 확인합니다."),

  async execute(interaction) {
    if (!fs.existsSync(schedulePath)) {
      return await interaction.reply("📂 저장된 일정이 없습니다.");
    }

    let schedule = JSON.parse(fs.readFileSync(schedulePath));
    const today = new Date();

    schedule = schedule.filter((item) => {
      const dateObj = new Date(item.date);
      return dateObj >= today;
    });

    if (schedule.length === 0) {
      return await interaction.reply("📭 예정된 일정이 없습니다.");
    }

    const formatted = schedule
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((item) => `📅 ${item.date} - ${item.content}`)
      .join("\n");

    await interaction.reply(`📌 **다가오는 일정 목록입니다:**\n\n${formatted}`);
  },
};
