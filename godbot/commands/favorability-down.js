const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../data/favorability-data.json");

function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("호감도내리기")
    .setDescription("다른 유저의 호감도를 -1 내립니다 (24시간 쿨타임).")
    .addUserOption(option =>
      option.setName("유저").setDescription("호감도를 내릴 유저").setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("유저");
    const userId = interaction.user.id;

    if (userId === target.id) {
      return interaction.reply({
        content: "❌ 본인의 호감도는 조작할 수 없습니다!",
        ephemeral: true,
      });
    }

    const data = loadData();
    const now = Date.now();
    const last = data[userId]?.lastDown || 0;

    if (now - last < 86400000) {
      const remain = Math.ceil((86400000 - (now - last)) / 3600000);
      return interaction.reply({
        content: `⏳ 쿨타임이 남았습니다! 약 ${remain}시간 후 재사용 가능`,
        ephemeral: true,
      });
    }

    if (!data[target.id]) data[target.id] = { score: 0 };
    if (typeof data[target.id].score !== "number") data[target.id].score = 0;

    data[target.id].score -= 1;

    if (!data[userId]) data[userId] = {};
    data[userId].lastDown = now;

    saveData(data);

    return interaction.reply({
      content: `⚠️ <@${target.id}>의 호감도를 **-1** 내렸습니다.`,
      ephemeral: true,
    });
  }
};
