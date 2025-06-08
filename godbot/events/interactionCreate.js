
const fs = require("fs");
const path = require("path");
const { Events } = require("discord.js");
const getSkillById = require("./utils/skills");
const applySkillEffect = require("./utils/applySkillEffect");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;
    const userFile = path.join(__dirname, "data", `${userId}.json`);

    if (!fs.existsSync(userFile)) {
      return interaction.reply({ content: "❌ 유저 데이터를 찾을 수 없습니다.", ephemeral: true });
    }

    const userData = JSON.parse(fs.readFileSync(userFile));
    const card = userData.cards?.[userData.cards.length - 1]; // 가장 최근 카드
    if (!card) {
      return interaction.reply({ content: "❌ 카드가 없습니다.", ephemeral: true });
    }

    const opponent = {
      name: "👾 적 몬스터",
      stats: { hp: 100, defense: 10, magic: 5 }
    };

    let result = "";

    if (interaction.customId === "attack") {
      const damage = Math.max(card.stats.attack - opponent.stats.defense, 1);
      opponent.stats.hp -= damage;
      result = `💥 **공격 성공!** ${opponent.name}에게 **${damage}** 데미지!`;
    } else if (interaction.customId === "defend") {
      result = `🛡️ **방어 태세**로 다음 공격을 대비합니다!`;
    } else if (interaction.customId === "skill") {
      const animalId = card.id.split("_")[1]; // ex: 🔥_dragon_Z
      const skill = getSkillById(animalId)[0];
      result = applySkillEffect(card, opponent, skill);
    }

    const status = `
📊 ${opponent.name} 남은 체력: ${Math.max(opponent.stats.hp, 0)}`;
    await interaction.update({ content: result + status, components: [] });
  }
};
