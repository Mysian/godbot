const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { addBE } = require('./be-util.js');

// === 코인 지급 관련 ===
const coinsPath   = path.join(__dirname, '../data/godbit-coins.json');
const walletsPath = path.join(__dirname, '../data/godbit-wallets.json');
async function loadJson(file, def) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def, null, 2));
  const release = await lockfile.lock(file, { retries: 5, minTimeout: 50 });
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  finally { await release(); }
  return data;
}
async function saveJson(file, data) {
  const release = await lockfile.lock(file, { retries: 5, minTimeout: 50 });
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
  finally { await release(); }
}
// --- 정답자에게 보상 지급
async function giveProblemReward(type, userId, beAmount, coinName, coinQty) {
  if (type === 'be') {
    await addBE(userId, beAmount, "문제 정답 보상");
  } else if (type === 'coin') {
    let wallets = await loadJson(walletsPath, {});
    wallets[userId] = wallets[userId] || {};
    wallets[userId][coinName] = (wallets[userId][coinName] || 0) + coinQty;
    await saveJson(walletsPath, wallets);
  }
}

// === 한국식 화폐 표기
function formatKoreanMoney(num) {
  if (typeof num !== 'number') num = parseInt(num, 10);
  if (isNaN(num)) return num;
  if (num >= 1e8) {
    const eok = Math.floor(num / 1e8);
    const rest = num % 1e8;
    return `${eok}억${rest > 0 ? ' ' + formatKoreanMoney(rest) : ''}`;
  } else if (num >= 1e4) {
    const man = Math.floor(num / 1e4);
    const rest = num % 1e4;
    return `${man}만${rest > 0 ? ' ' + rest.toLocaleString() : ''}`;
  } else {
    return num.toLocaleString();
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('문제')
    .setDescription('문제를 출제합니다 (정수/코인 보상)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(opt =>
      opt.setName('문제')
        .setDescription('출제할 문제를 입력하세요.')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('정답')
        .setDescription('정답(1개만)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('보상방식')
        .setDescription('정수 또는 코인 지급')
        .setRequired(true)
        .addChoices(
          { name: '정수 지급', value: 'be' },
          { name: '코인 지급', value: 'coin' }
        )
    )
    .addIntegerOption(opt =>
      opt.setName('정수금액')
        .setDescription('정수 지급 시 지급량')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('코인명')
        .setDescription('코인 지급 시 코인명(예: 영갓코인)')
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('코인수량')
        .setDescription('코인 지급 시 수량')
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('제한시간')
        .setDescription('정답 입력 제한시간(초, 기본 300)')
        .setMinValue(10)
        .setMaxValue(3600)
        .setRequired(false)
    ),

  async execute(interaction) {
    const qText = interaction.options.getString('문제');
    const answer = interaction.options.getString('정답');
    const rewardType = interaction.options.getString('보상방식');
    const beAmount = interaction.options.getInteger('정수금액') || 0;
    const coinName = interaction.options.getString('코인명') || '';
    const coinQty = interaction.options.getInteger('코인수량') || 0;
    const timeLimit = interaction.options.getInteger('제한시간') || 300; // 기본 300초(5분)

    if (rewardType === 'be' && beAmount < 1) {
      return await interaction.reply({ content: "정수 지급 금액을 입력하세요.", ephemeral: true });
    }
    if (rewardType === 'coin') {
      if (!coinName || coinQty < 1) {
        return await interaction.reply({ content: "코인 지급일 경우 코인명, 수량 모두 입력해야 합니다.", ephemeral: true });
      }
    }

    // === 문제 임베드
    let rewardDesc = '';
    if (rewardType === 'be') {
      rewardDesc = `**정답자 1명에게 \`${formatKoreanMoney(beAmount)} BE\` 지급!**`;
    } else if (rewardType === 'coin') {
      rewardDesc = `**정답자 1명에게 \`${coinName}\` ${coinQty.toLocaleString()}개 지급!**`;
    }

    const embed = new EmbedBuilder()
      .setTitle('❓ 문제 출제!')
      .setDescription(`**문제:** ${qText}\n\n${rewardDesc}`)
      .setColor(0x2479fa)
      .setFooter({ text: '정답을 맞히면 보상을 받습니다!' });

    const filter = m =>
  !m.author.bot &&
  m.channel.id === interaction.channel.id &&
  (
    m.content.trim().replace(/^[!./\-+_?#]+/, "") === answer.trim()
  );


    // 1. 임베드 + 타이머 메시지(텍스트) 동시 출력
    let timerMsg = await interaction.reply({
      content: `⏳ 제한시간 **${timeLimit}초** (남은시간: **${timeLimit}초**)`,
      embeds: [embed]
    });

    let remain = timeLimit;
    let timerInterval = setInterval(async () => {
      remain -= 5;
      if (remain < 0) remain = 0;
      try {
        await interaction.editReply({
          content: `⏳ 제한시간 **${timeLimit}초** (남은시간: **${remain}초**)`,
          embeds: [embed]
        });
      } catch (e) {}
    }, 5000);

    // 2. 정답 대기
    try {
      const collected = await interaction.channel.awaitMessages({
        filter,
        max: 1,
        time: timeLimit * 1000,
        errors: ['time']
      });
      clearInterval(timerInterval);

      const winner = collected.first().author;
      await giveProblemReward(rewardType, winner.id, beAmount, coinName, coinQty);

      let rewardText = '';
      if (rewardType === 'be') {
        rewardText = `\`${formatKoreanMoney(beAmount)} BE\``;
      } else if (rewardType === 'coin') {
        rewardText = `\`${coinName}\` ${coinQty.toLocaleString()}개`;
      }

      await interaction.editReply({
        content: `🎉 **정답자: <@${winner.id}>님!**`,
        embeds: [
          new EmbedBuilder()
            .setTitle('🎉 정답자 보상 지급!')
            .setDescription(`정답: **${answer}**\n\n🏆 <@${winner.id}>님이 정답을 맞혔습니다!\n${rewardText} 지급 완료!`)
            .setColor(0x43b581)
        ]
      });

    } catch (e) {
      clearInterval(timerInterval);
      await interaction.editReply({
        content: `⏰ 시간이 종료되어 정답자가 없습니다.`,
        embeds: [
          new EmbedBuilder()
            .setTitle('⏳ 정답자 없음')
            .setDescription('제한시간 내에 정답자가 없어 보상이 지급되지 않았습니다.')
            .setColor(0x888888)
        ]
      });
    }
  }
};
