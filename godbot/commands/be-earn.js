const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const bePath = path.join(__dirname, '../data/BE.json');
function loadJson(p) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, "{}");
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}
function getUserBe(userId) {
  const be = loadJson(bePath);
  return be[userId]?.amount || 0;
}
function setUserBe(userId, diff, reason = "") {
  const be = loadJson(bePath);
  be[userId] = be[userId] || { amount: 0, history: [] };
  be[userId].amount += diff;
  be[userId].history.push({ type: diff > 0 ? "earn" : "lose", amount: Math.abs(diff), reason, timestamp: Date.now() });
  saveJson(bePath, be);
}

const ALBA_MIN = 10, ALBA_MAX = 95, ALBA_COOLDOWN = 60 * 60 * 1000 * 24; // 1일
const GAMBLE_MIN_RATE = 0.1, GAMBLE_MAX_RATE = 0.5, GAMBLE_COOLDOWN = 60 * 60 * 1000 * 8; // 8시간

const cooldownPath = path.join(__dirname, '../data/earn-cooldown.json');
function getCooldown(userId, type) {
  const data = loadJson(cooldownPath);
  return data[userId]?.[type] || 0;
}
function setCooldown(userId, type, ms) {
  const data = loadJson(cooldownPath);
  data[userId] = data[userId] || {};
  data[userId][type] = Date.now() + ms;
  saveJson(cooldownPath, data);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수획득')
    .setDescription('파랑 정수(BE) 획득: 알바/도박/내기')
    .addStringOption(option =>
      option
        .setName('종류')
        .setDescription('정수를 획득할 방법을 선택하세요.')
        .setRequired(true)
        .addChoices(
          { name: '알바', value: 'alba' },
          { name: '도박', value: 'gamble' },
          { name: '내기', value: 'game' }
        )
    ),

  async execute(interaction) {
    const kind = interaction.options.getString('종류');
    const userId = interaction.user.id;

    if (kind === 'alba') {
      // 알바 쿨타임 체크
      const left = getCooldown(userId, 'alba') - Date.now();
      if (left > 0) {
        await interaction.reply({ content: `⏰ 알바는 ${(left/1000/60).toFixed(1)}분 뒤에 다시 할 수 있어!`, ephemeral: true });
        return;
      }
      // 100 BE는 절대 안나오게
      let reward = Math.floor(Math.random() * (ALBA_MAX - ALBA_MIN + 1)) + ALBA_MIN;
      if (reward === 100) reward = 99;
      setUserBe(userId, reward, "알바 수익");
      setCooldown(userId, 'alba', ALBA_COOLDOWN);

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle("💼 알바 완료!")
          .setDescription(`💰 ${reward} BE를 벌었어!\n(알바는 하루 1회만 가능)`)
        ],
        ephemeral: true
      });
      return;
    }

    if (kind === 'gamble') {
      // 도박 쿨타임 체크
      const left = getCooldown(userId, 'gamble') - Date.now();
      if (left > 0) {
        await interaction.reply({ content: `⏰ 도박은 ${(left/1000/60/60).toFixed(1)}시간 뒤에 다시 할 수 있어!`, ephemeral: true });
        return;
      }
      const userBe = getUserBe(userId);
      if (userBe < 50) {
        await interaction.reply({ content: '도박하려면 최소 50 BE 필요!', ephemeral: true });
        return;
      }
      // 베팅금 = 보유 BE의 10~50% 중 랜덤
      const betRate = Math.random() * (GAMBLE_MAX_RATE - GAMBLE_MIN_RATE) + GAMBLE_MIN_RATE;
      const bet = Math.floor(userBe * betRate);
      if (bet < 10) {
        await interaction.reply({ content: `베팅 가능한 금액이 부족해!`, ephemeral: true });
        return;
      }
      // 성공 40%: 1.5~3배, 실패 60%: 전액 손실
      if (Math.random() < 0.4) {
        const gainRate = Math.random() * 1.5 + 1.5; // 1.5~3배
        const reward = Math.floor(bet * gainRate);
        setUserBe(userId, reward, `도박 성공(+${(gainRate).toFixed(2)}배)`);
        setCooldown(userId, 'gamble', GAMBLE_COOLDOWN);
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setTitle("🎲 도박 성공!")
            .setDescription(`💸 ${bet} BE → 💰 ${reward} BE 획득!\n(성공 배수: ${gainRate.toFixed(2)}배)`)
          ],
          ephemeral: true
        });
      } else {
        setUserBe(userId, -bet, '도박 실패(전액 손실)');
        setCooldown(userId, 'gamble', GAMBLE_COOLDOWN);
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setTitle("💀 도박 실패!")
            .setDescription(`😥 ${bet} BE 전액 잃었어...\n(도박은 8시간마다 1회 가능)`)
          ],
          ephemeral: true
        });
      }
      return;
    }

    // 내기(홀짝 게임)
    if (kind === 'game') {
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle("⚔️ 내기(홀짝) 베타")
          .setDescription(
            `아래 버튼을 누르면 **내기 게임**을 시작할 수 있어!\n` +
            `- 2명 참가, 각각 베팅금 입력, 홀/짝 선택\n` +
            `- 승자는 전액 획득, 패자는 전액 손실 (최소 100 BE 필요)\n` +
            `- 쿨타임 없음, 베타 운영중\n\n` +
            `[내기 게임은 추후 별도 구현/버튼 시스템 도입 필요]`
          )
        ],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('start_bet_game').setLabel('내기(홀짝) 시작').setStyle(ButtonStyle.Primary)
        )],
        ephemeral: true
      });
      // 내기(홀짝) 기능은 추후 완성, 일단 안내만!
    }
  }
};
