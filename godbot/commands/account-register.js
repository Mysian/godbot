// 📁 commands/account/account-register.js
const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const accountPath = path.join(__dirname, "accounts.json");

function loadAccounts() {
  if (!fs.existsSync(accountPath)) return {};
  return JSON.parse(fs.readFileSync(accountPath));
}

function saveAccounts(data) {
  fs.writeFileSync(accountPath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("계정관리")
    .setDescription("게임 계정을 등록합니다.")
    .addStringOption((opt) =>
      opt
        .setName("계정종류")
        .setDescription("등록할 항목을 선택하세요.")
        .setRequired(true)
        .addChoices(
          { name: "🎮 스팀 친구 코드", value: "스팀 친구코드" },
          { name: "⚔️ 배틀넷 닉네임", value: "배틀넷" },
          { name: "🧢 라이엇 닉네임", value: "라이엇(롤, 발로란트 등)" },
        ),
    )
    .addStringOption((opt) =>
      opt
        .setName("정보")
        .setDescription("등록할 닉네임 또는 태그 (예: 닉네임#1234)")
        .setRequired(true),
    ),

  async execute(interaction) {
    const userId = interaction.user.id;
    const option = interaction.options.getString("계정종류");
    const value = interaction.options.getString("정보");

    const accounts = loadAccounts();
    if (!accounts[userId]) accounts[userId] = {};
    accounts[userId][option] = value;
    saveAccounts(accounts);

    await interaction.reply({
      content: `✅ ${interaction.user.username}님의 계정 정보가 등록되었습니다! \n📌 입력 시 (닉네임#숫자)형태의 태그가 있는 닉네임은 태그까지 기입해주세요.`,
      ephemeral: true,
    });
  },
};
