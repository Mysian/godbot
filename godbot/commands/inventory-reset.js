const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const itemsPath = path.join(__dirname, '../data/items.json');
const skillsPath = path.join(__dirname, '../data/skills.json');

// 유틸
function loadJson(p) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, "{}");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(p === itemsPath || p === skillsPath ? data : data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("인벤토리초기화")
    .setDescription("유저 또는 전체의 소모품/스킬 인벤토리를 초기화합니다. (관리자만)")
    .addUserOption(opt =>
      opt.setName("선택옵션")
        .setDescription("초기화할 유저 (미지정시 전체)")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const target = interaction.options.getUser("선택옵션");
    let items = loadJson(itemsPath);
    let skills = loadJson(skillsPath);

    if (target) {
      // 특정 유저만 초기화
      const userId = target.id;
      const beforeItems = !!items[userId];
      const beforeSkills = !!skills[userId];
      delete items[userId];
      delete skills[userId];
      saveJson(itemsPath, items);
      saveJson(skillsPath, skills);
      await interaction.reply({
        content: `<@${userId}>의 인벤토리가 초기화되었습니다. (소모품/스킬 모두)`,
        ephemeral: true
      });
    } else {
      // 전체 초기화
      items = {};
      skills = {};
      saveJson(itemsPath, items);
      saveJson(skillsPath, skills);
      await interaction.reply({
        content: `모든 유저의 인벤토리(소모품/스킬)가 전부 초기화되었습니다!`,
        ephemeral: true
      });
    }
  }
};
