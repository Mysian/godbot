const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const championList = require("../utils/champion-data");

const dataPath = path.join(__dirname, "../data/champion-users.json");

function loadData() {
  if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, "{}");
  return JSON.parse(fs.readFileSync(dataPath, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

function getSuccessRate(level) {
  if (level < 10) return 0.9;
  if (level < 30) return 0.8;
  if (level < 50) return 0.7;
  if (level < 100) return 0.6;
  if (level < 200) return 0.4;
  if (level < 500) return 0.3;
  if (level < 900) return 0.2;
  return 0.1;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("챔피언강화")
    .setDescription("보유한 챔피언을 강화합니다 (최대 999강)"),

  async execute(interaction) {
    const userId = interaction.user.id;
    const data = loadData();

    const champ = data[userId];
    if (!champ || !champ.name) {
      return interaction.reply({
        content: `❌ 먼저 /챔피언획득 으로 챔피언을 얻어야 합니다.`,
        ephemeral: true
      });
    }

    champ.level = champ.level ?? 0;
    champ.success = champ.success ?? 0;

    if (champ.level >= 999) {
      return interaction.reply({
        content: `⚠️ 이미 최대 강화 상태입니다! (**${champ.level}강**)`,
        ephemeral: true
      });
    }

    const rate = getSuccessRate(champ.level);
    const success = Math.random() < rate;

    if (success) {
      champ.level += 1;
      champ.success += 1;

      const base = championList.find(c => c.name === champ.name)?.stats;

      if (base) {
        champ.stats = champ.stats || { ...base }; // 기본값 복사

        champ.stats.attack += 1;
        champ.stats.ap += 1;
        champ.stats.hp += 10;
        champ.stats.defense += 1;
        champ.stats.penetration += (champ.level % 2 === 0) ? 1 : 0; // 2레벨마다 +1
      }

      saveData(data);
      return interaction.reply({
        content: `💪 강화 성공! **${champ.name} ${champ.level}강**`,
        ephemer
