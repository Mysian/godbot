// 📁 commands/problem-cancel.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');

const problemFilePath = path.join(__dirname, '../data/problem.json');

function loadProblems() {
  if (!fs.existsSync(problemFilePath)) fs.writeFileSync(problemFilePath, '{}');
  return JSON.parse(fs.readFileSync(problemFilePath, 'utf8'));
}
function saveProblems(data) {
  fs.writeFileSync(problemFilePath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('문제취소')
    .setDescription('가장 최근에 출제한 문제를 취소합니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const guildId = interaction.guildId;
    let release;
    try {
      release = await lockfile.lock(problemFilePath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });

      const problems = loadProblems();
      const problem = problems[guildId];

      if (!problem) {
        await interaction.reply({ content: '현재 취소할 수 있는 문제가 없습니다.', ephemeral: true });
        return;
      }

      const channel = await interaction.guild.channels.fetch(problem.channelId);
      if (channel) {
        try {
          const msg = await channel.messages.fetch(problem.messageId);
          if (msg) await msg.delete();
        } catch {}
      }

      delete problems[guildId];
      saveProblems(problems);

      await interaction.reply({ content: '문제가 성공적으로 취소되었습니다.', ephemeral: true });
    } finally {
      if (release) await release();
    }
  }
};
