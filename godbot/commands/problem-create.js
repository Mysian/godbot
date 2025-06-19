// 📁 commands/problem-create.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
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
  data: new SlashCommandBuilder()
    .setName('문제')
    .setDescription('문제를 출제합니다 (문제, 정답, 보상 종류, 보상, [힌트])')
    .addStringOption(opt =>
      opt.setName('문제').setDescription('문제 내용을 입력하세요').setRequired(true))
    .addStringOption(opt =>
      opt.setName('정답').setDescription('정답을 입력하세요').setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('보상').setDescription('정답 보상 수치').setRequired(true))
    .addStringOption(opt =>
      opt.setName('보상종류')
        .setDescription('보상 종류를 선택하세요')
        .setRequired(true)
        .addChoices(
          { name: '파랑 정수', value: BE_REWARD },
          { name: '아리포인트', value: ARI_REWARD },
          { name: '경험치', value: XP_REWARD }
        )
    )
    .addStringOption(opt =>
      opt.setName('힌트').setDescription('힌트(선택)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;
    const authorId = interaction.user.id;
    const question = interaction.options.getString('문제');
    const answer = interaction.options.getString('정답');
    const reward = interaction.options.getInteger('보상');
    const rewardType = interaction.options.getString('보상종류') || BE_REWARD;
    const hint = interaction.options.getString('힌트') || null;

    if (reward <= 0) {
      await interaction.reply({ content: '보상은 1 이상이어야 합니다.', ephemeral: true });
      return;
    }

    let release;
    try {
      release = await lockfile.lock(problemFilePath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });

      const problems = loadProblems();

      if (Object.values(problems).some(x => x.channelId === channelId)) {
        await interaction.reply({ content: '이미 이 채널에는 풀이중인 문제가 있습니다.', ephemeral: true });
        return;
      }

      let rewardStr = '';
      if (rewardType === BE_REWARD) rewardStr = `정수 ${formatNumber(reward)} BE`;
      if (rewardType === ARI_REWARD) rewardStr = `포인트 ${formatNumber(reward)} pt`;
      if (rewardType === XP_REWARD) rewardStr = `경험치 ${formatNumber(reward)} xp`;

      const embed = new EmbedBuilder()
        .addFields(
          { name: '📜 문제', value: question, inline: false },
          ...(hint ? [{ name: '💡 힌트', value: hint, inline: false }] : []),
          { name: '💎 보상', value: rewardStr, inline: false }
        )
        .setFooter({ text: `정답을 맞히면 보상이 지급됩니다! (정답 입력: !정답)` });

      const msg = await interaction.channel.send({ embeds: [embed] });

      problems[guildId] = {
        channelId,
        authorId,
        question,
        answer: answer.trim(),
        reward,
        rewardType,
        hint,
        messageId: msg.id,
        timestamp: Date.now()
      };
      saveProblems(problems);

      await interaction.reply({ content: `문제가 출제되었습니다!`, ephemeral: true });
    } finally {
      if (release) await release();
    }
  }
};
