// 📁 commands/account/account-reset.js
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
    .setName("계정정보초기화")
    .setDescription("특정 유저의 계정 정보를 모두 삭제합니다.")
    .addUserOption((opt) =>
      opt.setName("유저명").setDescription("초기화할 유저").setRequired(true),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("유저명");
    const accounts = loadAccounts();

    if (!accounts[target.id]) {
      return interaction.reply({
        content: "📭 삭제할 정보가 없습니다.",
        ephemeral: true,
      });
    }

    delete accounts[target.id];
    saveAccounts(accounts);

    await interaction.reply({
      content: `🗑️ ${target.username}님의 계정 정보가 초기화되었습니다.`,
      ephemeral: true,
    });
  },
};
