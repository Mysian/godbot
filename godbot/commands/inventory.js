const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const itemsPath = path.join(__dirname, '../data/items.json');

function loadItems() {
  if (!fs.existsSync(itemsPath)) fs.writeFileSync(itemsPath, "{}");
  return JSON.parse(fs.readFileSync(itemsPath, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("인벤토리")
    .setDescription("내가 소유한 아이템 목록을 확인합니다."),
  async execute(interaction) {
    const items = loadItems()[interaction.user.id] || {};
    const keys = Object.keys(items);
    if (!keys.length) {
      await interaction.reply({ content: "소유한 아이템이 없습니다.", ephemeral: true });
      return;
    }
    const list = keys.map((k, i) => `#${i + 1} | **${k}** x${items[k].count}\n${items[k].desc}`).join("\n\n");
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎒 내 인벤토리")
          .setDescription(list)
      ],
      ephemeral: true
    });
  }
};
