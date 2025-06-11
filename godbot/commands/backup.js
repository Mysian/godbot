// 📁 commands/backup.js
const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

// ✅ 실제 JSON 파일 경로들 설정
const fileMap = {
  "챔피언정보": {
    path: path.join(__dirname, "../data/champion-users.json"),
    location: "📁 data 폴더"
  },
  "챔피언 배틀 전적": {
    path: path.join(__dirname, "../data/champion-records.json"),
    location: "📁 data 폴더"
  },
  "챔피언 강화기록 로그": {
    path: path.join(__dirname, "../data/champion-enhance-history.json"),
    location: "📁 data 폴더"
  },
  "프로필정보": {
    path: path.join(__dirname, "../data/profiles.json"),
    location: "📁 data 폴더"
  },
  "호감도": {
    path: path.join(__dirname, "../data/favor.json"),
    location: "📁 data 폴더"
  },
  "서버 이용현황 관리 로그": {
    path: path.join(__dirname, "../activity.json"),
    location: "📁 common 또는 루트 경로"
  },
  "일정": {
    path: path.join(__dirname, "../schedule.json"),
    location: "📁 루트 경로"
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("백업")
    .setDescription("저장된 JSON 데이터를 백업합니다.")
    .addStringOption(option =>
      option
        .setName("선택옵션")
        .setDescription("백업할 데이터 종류를 선택하세요.")
        .setRequired(true)
        .addChoices(
          { name: "챔피언정보", value: "챔피언정보" },
          { name: "챔피언 배틀 전적", value: "챔피언 배틀 전적" },
          { name: "챔피언 강화기록 로그", value: "챔피언 강화기록 로그" },
          { name: "프로필정보", value: "프로필정보" },
          { name: "호감도", value: "호감도" },
          { name: "서버 이용현황 관리 로그", value: "서버 이용현황 관리 로그" },
          { name: "일정", value: "일정" }
        )
    ),

  async execute(interaction) {
    const choice = interaction.options.getString("선택옵션");
    const entry = fileMap[choice];

    if (!entry || !fs.existsSync(entry.path)) {
      return interaction.reply({
        content: `❌ ${choice} 데이터 파일이 존재하지 않습니다.`,
        ephemeral: true
      });
    }

    const file = new AttachmentBuilder(entry.path);
    await interaction.reply({
      content: `📦 선택한 데이터 **${choice}**의 백업본입니다.\n\n🗂 저장 위치: \`${entry.location}\``,
      files: [file],
      ephemeral: true
    });
  }
};
