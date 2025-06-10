const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const fileMap = {
  "챔피언정보": path.join(__dirname, "../data/champion-users.json"),
  "호감도": path.join(__dirname, "../data/favorability-data.json"),
  "롤티어": path.join(__dirname, "../data/lol-tier.json"),
  "옵치티어": path.join(__dirname, "../data/ow-tier.json"),
  "계정정보": path.join(__dirname, "../accounts.json"),
  "서버 이용현황 관리 로그": path.join(__dirname, "../activity.json"),
  "챔피언 배틀 전적": path.join(__dirname, "../data/champion-records.json") // ✅ 추가
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
          { name: "호감도", value: "호감도" },
          { name: "롤티어", value: "롤티어" },
          { name: "옵치티어", value: "옵치티어" },
          { name: "계정정보", value: "계정정보" },
          { name: "서버 이용현황 관리 로그", value: "서버 이용현황 관리 로그" },
          { name: "챔피언 배틀 전적", value: "챔피언 배틀 전적" } // ✅ 추가
        )
    ),

  async execute(interaction) {
    const choice = interaction.options.getString("선택옵션");
    const filePath = fileMap[choice];

    if (!fs.existsSync(filePath)) {
      return interaction.reply({
        content: `❌ ${choice} 데이터 파일이 존재하지 않습니다.`,
        ephemeral: true
      });
    }

    const file = new AttachmentBuilder(filePath);
    await interaction.reply({
      content: `📦 선택한 데이터 **${choice}**의 백업본입니다.`,
      files: [file],
      ephemeral: true
    });
  }
};
