const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const profilePath = path.join(__dirname, "../../data/profile-data.json");
const recordPath = path.join(__dirname, "../../data/champion-records.json");

function loadData(pathStr) {
  if (!fs.existsSync(pathStr)) fs.writeFileSync(pathStr, "{}");
  return JSON.parse(fs.readFileSync(pathStr));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("내프로필")
    .setDescription("본인의 등록된 프로필을 확인합니다."),
  async execute(interaction) {
    const user = interaction.user;
    const member = await interaction.guild.members.fetch(user.id);

    const profiles = loadData(profilePath);
    const records = loadData(recordPath);

    if (!profiles[user.id]) {
      return interaction.reply({
        content: "❗ 먼저 `/프로필등록` 명령어로 프로필을 등록해줘!",
        ephemeral: true,
      });
    }

    const profile = profiles[user.id];
    const record = records[user.id] || { name: "-", win: 0, draw: 0, lose: 0 };
    const joinedAt = Math.floor(member.joinedTimestamp / 1000);

    const embed = new EmbedBuilder()
      .setTitle(`📂 ${user.username}님의 프로필`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: "👤 상태 메시지", value: profile.status || "없음" },
        { name: "🎮 선호 게임", value: profile.favoriteGames?.join(", ") || "없음" },
        {
          name: "🛡️ 오버워치 티어",
          value: `${profile.overwatch?.tier || "-"} (${profile.overwatch?.position || "-"})`,
          inline: true,
        },
        {
          name: "⚔️ 롤 티어",
          value: `${profile.lol?.tier || "-"} (${profile.lol?.position || "-"})`,
          inline: true,
        },
        { name: "🎩 스팀 닉네임", value: profile.steam || "-", inline: true },
        { name: "🏆 롤 닉네임", value: profile.lolNick || "-", inline: true },
        { name: "🧢 배틀넷 닉네임", value: profile.battlenet || "-", inline: true },
        { name: "❤️ 호감도", value: `${profile.liked ?? 0}`, inline: true },
        { name: "📦 소지 챔피언", value: record.name || "없음", inline: true },
        { name: "📊 승/무/패", value: `${record.win}승 / ${record.draw}무 / ${record.lose}패`, inline: true },
        { name: "📅 서버 가입일", value: `<t:${joinedAt}:R>`, inline: false }
      )
      .setColor("Green");

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  },
};
