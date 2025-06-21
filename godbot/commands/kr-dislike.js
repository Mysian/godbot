// commands/dislike.js
const { SlashCommandBuilder } = require('discord.js');
const relationship = require('../utils/relationship.js');
const fs = require('fs');
const path = require('path');
const cooldownPath = path.join(__dirname, '../data/dislike-cooldown.json');

function readCooldown() {
  if (!fs.existsSync(cooldownPath)) return {};
  return JSON.parse(fs.readFileSync(cooldownPath));
}
function saveCooldown(data) {
  fs.writeFileSync(cooldownPath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('싫어요')
    .setDescription('특정 유저와의 호감도를 조금 내립니다. (24시간 쿨타임)')
    .addUserOption(opt =>
      opt.setName('유저').setDescription('대상 유저').setRequired(true)
    ),
  async execute(interaction) {
    const me = interaction.user.id;
    const target = interaction.options.getUser('유저').id;
    if (me === target) {
      return interaction.reply({ content: '자기 자신에게는 싫어요를 사용할 수 없습니다.', ephemeral: true });
    }

    const cooldown = readCooldown();
    const now = Date.now();
    const cdKey = `${me}_${target}`;
    if (cooldown[cdKey] && now - cooldown[cdKey] < 24 * 60 * 60 * 1000) {
      const left = 24*60*60*1000 - (now - cooldown[cdKey]);
      const leftHr = Math.floor(left/1000/60/60);
      const leftMin = Math.floor(left/1000/60)%60;
      return interaction.reply({ content: `쿨타임이 남아 있습니다. (남은 시간: ${leftHr}시간 ${leftMin}분)`, ephemeral: true });
    }

    relationship.addScore(me, target, -1);
    cooldown[cdKey] = now;
    saveCooldown(cooldown);

    return interaction.reply({ content: `<@${target}>와의 관계도가 아주 조금 하락했습니다.`, ephemeral: true });
  }
};
