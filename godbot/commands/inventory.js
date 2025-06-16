const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const itemsPath = path.join(__dirname, '../data/items.json');
const skillsPath = path.join(__dirname, '../data/skills.json');

function loadJson(p) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, "{}");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("인벤토리")
    .setDescription("내가 소유한 아이템/스킬 목록을 확인합니다.")
    .addStringOption(opt =>
      opt.setName("옵션")
        .setDescription("종류를 선택하세요")
        .setRequired(true)
        .addChoices(
          { name: "소모품", value: "item" },
          { name: "스킬", value: "skill" }
        )
    ),
  async execute(interaction) {
    const opt = interaction.options.getString("옵션");
    const userId = interaction.user.id;

    // 소모품 인벤토리
    if (opt === "item") {
      const items = loadJson(itemsPath)[userId] || {};
      const keys = Object.keys(items);
      if (!keys.length) {
        await interaction.reply({ content: "소유한 소모품 아이템이 없습니다.", ephemeral: true });
        return;
      }
      const list = keys.map((k, i) =>
        `#${i + 1} | **${k}** x${items[k].count}\n${items[k].desc}`
      ).join("\n\n");
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🎒 내 소모품 인벤토리")
            .setDescription(list)
        ],
        ephemeral: true
      });
      return;
    }

    // 스킬 인벤토리
    if (opt === "skill") {
      const skills = loadJson(skillsPath)[userId] || {};
      const keys = Object.keys(skills);
      if (!keys.length) {
        await interaction.reply({ content: "소유한 스킬이 없습니다.", ephemeral: true });
        return;
      }
      const list = keys.map((k, i) =>
        `#${i + 1} | **${k}**\n${skills[k].desc}`
      ).join("\n\n");
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("📚 내 스킬 인벤토리")
            .setDescription(list)
        ],
        ephemeral: true
      });
      return;
    }
  }
};
