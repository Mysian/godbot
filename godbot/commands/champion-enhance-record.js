// commands/champion-enhance-record.js
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const usersPath = path.join(__dirname, "../data/champion-users.json");
const historyPath = path.join(__dirname, "../data/champion-enhance-history.json");

function loadJSON(p) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, "{}");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언강화전적")
    .setDescription("유저의 챔피언 강화 전적을 확인합니다.")
    .addUserOption(opt =>
      opt.setName("유저")
        .setDescription("확인할 유저를 선택하세요.")
        .setRequired(true)
    ),
  async execute(interaction) {
    const targetUser = interaction.options.getUser("유저");
    const userId = targetUser.id;
    const history = loadJSON(historyPath);
    const users = loadJSON(usersPath);

    const record = history[userId] || null;
    const champData = users[userId] || null;

    let desc = "";

    if (record) {
      const { total, success, fail, max } = record;
      const winRate = total > 0 ? Math.round((success / total) * 1000) / 10 : 0;

      desc += `**📊 강화 전적**\n`;
      desc += `> 🏆 승률: **${winRate}%**\n`;
      desc += `> 🎯 총 강화 시도: **${total}회**\n`;
      desc += `> ✅ 성공: **${success}회**\n`;
      desc += `> ❌ 실패: **${fail}회**\n`;
      desc += `> 🥇 역대 최대 강화 레벨: **${max}강**\n\n`;
    } else {
      desc += "아직 강화 기록이 없습니다.\n";
    }

    if (champData && champData.name && typeof champData.level === "number") {
      desc += `**🦸 현재 강화중인 챔피언**\n`;
      desc += `> 이름: **${champData.name}**\n`;
      desc += `> 강화 단계: **${champData.level}강**\n`;
    } else {
      desc += `**🦸 현재 챔피언이 없습니다.**\n/챔피언획득 으로 챔피언을 만나세요!`;
    }

    const embed = new EmbedBuilder()
      .setTitle(`💪 ${targetUser.username}님의 챔피언 강화 전적`)
      .setDescription(desc)
      .setColor(0x41b883)
      .setThumbnail(targetUser.displayAvatarURL());

    await interaction.reply({ embeds: [embed] });
  }
};
