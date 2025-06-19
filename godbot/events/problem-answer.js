// 📁 events/problem-answer.js
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { addBE } = require('../commands/be-util.js');
const lockfile = require('proper-lockfile');

const problemFilePath = path.join(__dirname, '../data/problem.json');
const BE_REWARD = '파랑 정수';
const ARI_REWARD = '아리포인트';
const XP_REWARD = '경험치';

function loadProblems() {
  if (!fs.existsSync(problemFilePath)) fs.writeFileSync(problemFilePath, '{}');
  return JSON.parse(fs.readFileSync(problemFilePath, 'utf8'));
}
function saveProblems(data) {
  fs.writeFileSync(problemFilePath, JSON.stringify(data, null, 2));
}
function formatNumber(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const guildId = message.guildId;
    const problems = loadProblems();
    const problem = problems[guildId];
    if (!problem || message.channelId !== problem.channelId) return;

    const match = message.content.match(/^!(.+)/);
    if (!match) return;

    const userAnswer = match[1].trim();
    const isCorrect = userAnswer.toLowerCase() === problem.answer.toLowerCase();

    if (!isCorrect) return;

    let release;
    try {
      release = await lockfile.lock(problemFilePath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });

      const refreshed = loadProblems();
      const p = refreshed[guildId];
      if (!p || p.channelId !== message.channelId) return;

      let rewardMsg = '';
      let rewardValue = formatNumber(problem.reward);

      if (problem.rewardType === BE_REWARD) {
        await addBE(message.author.id, problem.reward, '문제 정답 맞힘');
        rewardMsg = `${rewardValue} BE`;
      } else if (problem.rewardType === ARI_REWARD) {
        rewardMsg = `${rewardValue} pt (지급은 별도 봇 처리!)`;
      } else if (problem.rewardType === XP_REWARD) {
        rewardMsg = `${rewardValue} xp (지급은 별도 봇 처리!)`;
      }

      const rewardEmbed = new EmbedBuilder()
        .setDescription(`<@${message.author.id}>님, 정답을 맞혔습니다!`)
        .addFields(
          { name: '문제', value: problem.question },
          { name: '정답', value: problem.answer },
          { name: '보상', value: rewardMsg }
        )
        .setColor(0x53baff)
        .setTimestamp();

      await message.channel.send({ embeds: [rewardEmbed] });

      delete refreshed[guildId];
      saveProblems(refreshed);

      try {
        const msg = await message.channel.messages.fetch(problem.messageId);
        if (msg) await msg.delete();
      } catch {}
    } finally {
      if (release) await release();
    }
  }
};
