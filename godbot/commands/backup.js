const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip"); // npm install adm-zip 필요

// ===== 챔배 시스템 주요 파일 =====
const champBattleSystemFiles = [
  { abs: "../commands/champ-battle.js", rel: "commands/champ-battle.js" },
  { abs: "../utils/battleEngine.js", rel: "utils/battleEngine.js" },
  { abs: "../utils/battle-ui.js", rel: "utils/battle-ui.js" },
  { abs: "../utils/skills.js", rel: "utils/skills.js" },
  { abs: "../utils/skills-cooldown.js", rel: "utils/skills-cooldown.js" },
  { abs: "../utils/passive-skills.js", rel: "utils/passive-skills.js" },
  { abs: "../utils/battle-embed.js", rel: "utils/battle-embed.js" },
  { abs: "../utils/champion-data.js", rel: "utils/champion-data.js" },
  { abs: "../utils/champion-utils.js", rel: "utils/champion-utils.js" },
  { abs: "../utils/file-db.js", rel: "utils/file-db.js" },
  { abs: "../data/battle-active.json", rel: "data/battle-active.json" },
  { abs: "../data/champion-users.json", rel: "data/champion-users.json" }
];

// 모든 주요 .json 데이터 백업 (거래소/화폐/아이템/인벤토리 포함)
const fileMap = {
  "모든 파일 백업하기": {
    paths: [
      { path: path.join(__dirname, "../data/champion-users.json"), rel: "data/champion-users.json" },
      { path: path.join(__dirname, "../data/champion-records.json"), rel: "data/champion-records.json" },
      { path: path.join(__dirname, "../data/champion-enhance-history.json"), rel: "data/champion-enhance-history.json" },
      { path: path.join(__dirname, "../data/profiles.json"), rel: "data/profiles.json" },
      { path: path.join(__dirname, "../data/favor.json"), rel: "data/favor.json" },
      { path: path.join(__dirname, "../activity.json"), rel: "activity.json" },
      { path: path.join(__dirname, "../schedule.json"), rel: "schedule.json" },
      // 파랑 정수, 거래소, 아이템 추가
      { path: path.join(__dirname, "../data/BE.json"), rel: "data/BE.json" },
      { path: path.join(__dirname, "../data/BE-config.json"), rel: "data/BE-config.json" },
      { path: path.join(__dirname, "../data/champion-market.json"), rel: "data/champion-market.json" },
      { path: path.join(__dirname, "../data/items.json"), rel: "data/items.json" }, // 인벤토리
      { path: path.join(__dirname, "../data/item-market.json"), rel: "data/item-market.json" } // 아이템상점
    ],
    location: "📦 전체 백업 (모든 폴더구조 유지)"
  },
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
  },
  "파랑 정수 데이터": {
    path: path.join(__dirname, "../data/BE.json"),
    location: "📁 data 폴더"
  },
  "파랑 정수 설정": {
    path: path.join(__dirname, "../data/BE-config.json"),
    location: "📁 data 폴더"
  },
  "챔피언 거래소": {
    path: path.join(__dirname, "../data/champion-market.json"),
    location: "📁 data 폴더"
  },
  "인벤토리": {
    path: path.join(__dirname, "../data/items.json"),
    location: "📁 data 폴더"
  },
  "아이템상점": {
    path: path.join(__dirname, "../data/item-market.json"),
    location: "📁 data 폴더"
  },
  "챔배시스템파일 백업": {
    files: champBattleSystemFiles,
    desc: "챔피언 배틀 시스템 주요 파일(zip)만 포함",
    zipName: "champ-battle-system-only.zip"
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("백업")
    .setDescription("저장된 JSON 데이터 또는 챔배 시스템 코드를 백업합니다.")
    .addStringOption(option =>
      option
        .setName("선택옵션")
        .setDescription("백업할 데이터 종류를 선택하세요.")
        .setRequired(true)
        .addChoices(
          { name: "모든 파일 백업하기", value: "모든 파일 백업하기" },
          { name: "챔피언정보", value: "챔피언정보" },
          { name: "챔피언 배틀 전적", value: "챔피언 배틀 전적" },
          { name: "챔피언 강화기록 로그", value: "챔피언 강화기록 로그" },
          { name: "프로필정보", value: "프로필정보" },
          { name: "호감도", value: "호감도" },
          { name: "서버 이용현황 관리 로그", value: "서버 이용현황 관리 로그" },
          { name: "일정", value: "일정" },
          { name: "파랑 정수 데이터", value: "파랑 정수 데이터" },
          { name: "파랑 정수 설정", value: "파랑 정수 설정" },
          { name: "챔피언 거래소", value: "챔피언 거래소" },
          { name: "인벤토리", value: "인벤토리" },
          { name: "아이템상점", value: "아이템상점" },
          { name: "챔배시스템파일 백업", value: "챔배시스템파일 백업" }
        )
    ),

  async execute(interaction) {
    const choice = interaction.options.getString("선택옵션");

    // 1. 챔배시스템 주요 파일만 백업
    if (choice === "챔배시스템파일 백업") {
      const entry = fileMap[choice];
      const zip = new AdmZip();
      let found = false;
      for (const f of entry.files) {
        const absPath = path.join(__dirname, f.abs);
        if (fs.existsSync(absPath)) {
          zip.addLocalFile(absPath, path.dirname(f.rel));
          found = true;
        }
      }
      if (!found) {
        return interaction.reply({
          content: "❌ 백업할 챔배 시스템 파일이 하나도 존재하지 않습니다.",
          ephemeral: true
        });
      }
      const zipBuffer = zip.toBuffer();
      const file = new AttachmentBuilder(zipBuffer, { name: entry.zipName });
      await interaction.reply({
        content: `📦 ${entry.desc}\n\n🗂 딱 지정된 주요 js/json 파일만 포함!`,
        files: [file],
        ephemeral: true
      });
      return;
    }

    // 2. 모든 json 데이터만 백업(zip)
    if (choice === "모든 파일 백업하기") {
      const entry = fileMap["모든 파일 백업하기"];
      const zip = new AdmZip();
      let found = false;
      for (const fileEntry of entry.paths) {
        if (fs.existsSync(fileEntry.path)) {
          zip.addLocalFile(fileEntry.path, path.dirname(fileEntry.rel));
          found = true;
        }
      }
      if (!found) {
        return interaction.reply({
          content: "❌ 백업할 파일이 없습니다.",
          ephemeral: true
        });
      }
      const zipBuffer = zip.toBuffer();
      const file = new AttachmentBuilder(zipBuffer, { name: "backup-all.zip" });
      await interaction.reply({
        content: `📦 모든 데이터 백업본(zip)입니다.\n\n🗂 저장 위치 및 폴더 구조까지 그대로 포함!`,
        files: [file],
        ephemeral: true
      });
      return;
    }

    // 3. 단일 파일 백업
    const entry = fileMap[choice];
    if (!entry || !entry.path || !fs.existsSync(entry.path)) {
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
