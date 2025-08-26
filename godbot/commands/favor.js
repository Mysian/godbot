const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const favorPath = path.join(__dirname, '../data/favor.json');
const cooldownPath = path.join(__dirname, '../data/favor-cooldown.json');
const bePath = path.join(__dirname, '../data/BE.json');
const relationship = require('../utils/relationship.js');

function readJson(p) { if (!fs.existsSync(p)) return {}; return JSON.parse(fs.readFileSync(p, 'utf8')); }
function saveJson(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2)); }
function addBE(userId, amount, reason) {
  const be = readJson(bePath);
  if (!be[userId]) be[userId] = { amount: 0, history: [] };
  be[userId].amount += amount;
  be[userId].history.push({ type: "earn", amount, reason, timestamp: Date.now() });
  saveJson(bePath, be);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('호감도')
    .setDescription('호감도 지급/차감')
    .addSubcommand(sc =>
      sc.setName('지급')
        .setDescription('유저에게 호감도 1점 지급 (24시간 쿨타임)')
        .addUserOption(opt => opt.setName('유저').setDescription('대상 유저').setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName('차감')
        .setDescription('유저의 호감도 1점 차감 (24시간 쿨타임)')
        .addUserOption(opt => opt.setName('유저').setDescription('대상 유저').setRequired(true))
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const giver = interaction.user.id;
    const receiver = interaction.options.getUser('유저').id;

    if (giver === receiver) {
      return interaction.reply({
        content: sub === '지급' ? '자기 자신에게는 호감도를 줄 수 없어.' : '자기 자신에게는 호감도를 차감할 수 없어.',
        ephemeral: true
      });
    }

    const favor = readJson(favorPath);
    const cooldown = readJson(cooldownPath);
    const now = Date.now();

    if (sub === '지급') {
      const cdKey = `${giver}_${receiver}`;
      if (cooldown[cdKey] && now - cooldown[cdKey] < 24 * 60 * 60 * 1000) {
        const left = 24 * 60 * 60 * 1000 - (now - cooldown[cdKey]);
        const leftHr = Math.floor(left / 1000 / 60 / 60);
        const leftMin = Math.floor(left / 1000 / 60) % 60;
        return interaction.reply({ content: `쿨타임이 남아 있어. (남은 시간: ${leftHr}시간 ${leftMin}분)`, ephemeral: true });
      }

      favor[receiver] = (favor[receiver] || 0) + 1;
      cooldown[cdKey] = now;
      saveJson(favorPath, favor);
      saveJson(cooldownPath, cooldown);

      relationship.onPositive(giver, receiver, 0.3);
      relationship.onPositive(receiver, giver, 0.3);

      const amount = Math.floor(Math.random() * 2) + 1;
      addBE(giver, amount, "호감도 지급 성공 보상");

      return interaction.reply({
        content: `<@${receiver}>에게 호감도를 1점 지급했어!\n🎁 파랑 정수 ${amount} BE를 획득했어!`,
        ephemeral: true
      });
    }

    if (sub === '차감') {
      const cdKey = `rm_${giver}_${receiver}`;
      if (cooldown[cdKey] && now - cooldown[cdKey] < 24 * 60 * 60 * 1000) {
        const left = 24 * 60 * 60 * 1000 - (now - cooldown[cdKey]);
        const leftHr = Math.floor(left / 1000 / 60 / 60);
        const leftMin = Math.floor(left / 1000 / 60) % 60;
        return interaction.reply({ content: `쿨타임이 남아 있어. (남은 시간: ${leftHr}시간 ${leftMin}분)`, ephemeral: true });
      }

      favor[receiver] = (favor[receiver] || 0) - 1;
      cooldown[cdKey] = now;
      saveJson(favorPath, favor);
      saveJson(cooldownPath, cooldown);

      relationship.addScore(giver, receiver, -0.3);

      const amount = Math.floor(Math.random() * 2) + 1;
      addBE(giver, amount, "호감도 차감 성공 보상");

      return interaction.reply({
        content: `<@${receiver}>의 호감도를 1점 차감했어.\n🎁 파랑 정수 ${amount} BE를 획득했어!`,
        ephemeral: true
      });
    }
  }
};
