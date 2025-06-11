const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const favorPath = path.join(__dirname, '../data/favor.json');
const cooldownPath = path.join(__dirname, '../data/favor-cooldown.json');

function readJson(p) { if (!fs.existsSync(p)) return {}; return JSON.parse(fs.readFileSync(p)); }
function saveJson(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2)); }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('호감도차감')
    .setDescription('유저의 호감도를 1점 차감합니다. (24시간 쿨타임)')
    .addUserOption(opt => opt.setName('유저').setDescription('대상 유저').setRequired(true)),
  async execute(interaction) {
    const giver = interaction.user.id;
    const receiver = interaction.options.getUser('유저').id;
    if (giver === receiver) return interaction.reply({ content: '자기 자신에게는 호감도를 차감할 수 없습니다.', ephemeral: true });

    const favor = readJson(favorPath);
    const cooldown = readJson(cooldownPath);

    const now = Date.now();
    const cdKey = `rm_${giver}_${receiver}`;
    if (cooldown[cdKey] && now - cooldown[cdKey] < 24 * 60 * 60 * 1000) {
      const left = 24*60*60*1000 - (now - cooldown[cdKey]);
      const leftHr = Math.floor(left/1000/60/60);
      const leftMin = Math.floor(left/1000/60)%60;
      return interaction.reply({ content: `쿨타임이 남아 있습니다. (남은 시간: ${leftHr}시간 ${leftMin}분)`, ephemeral: true });
    }
    favor[receiver] = (favor[receiver] || 0) - 1;
    cooldown[cdKey] = now;
    saveJson(favorPath, favor);
    saveJson(cooldownPath, cooldown);

    return interaction.reply({ content: `<@${receiver}>의 호감도를 1점 차감했습니다.`, ephemeral: true });
  }
};
