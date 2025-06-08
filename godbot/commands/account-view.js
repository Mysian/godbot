// 📁 commands/account/account-view.js
const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const accountPath = path.join(__dirname, "accounts.json");

function loadAccounts() {
  if (!fs.existsSync(accountPath)) return {};
  return JSON.parse(fs.readFileSync(accountPath));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("계정")
    .setDescription("해당 유저의 계정 정보를 확인합니다.")
    .addUserOption((opt) =>
      opt.setName("유저명").setDescription("확인할 유저").setRequired(true),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("유저명");
    const accounts = loadAccounts();
    const userInfo = accounts[target.id];

    if (!userInfo) {
      return interaction.reply({
        content: `❌ ${target.username} 님의 등록된 계정 정보가 없습니다.`,
        ephemeral: true,
      });
    }

    const fields = Object.entries(userInfo)
      .map(([key, val]) => `- **${key}** : \`${val}\``)
      .join("\n");

    await interaction.reply({
      content: `📂 **${target.username}** 님의 계정 정보:\n${fields}`,
      ephemeral: true,
    });
  },
};
