const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBE, loadConfig, addBE } = require('./be-util');
const fs = require('fs');
const path = require('path');

const DONOR_ROLE = '1397076919127900171'; // 도너 역할 ID
const cooldownPath = path.join(__dirname, '../data/be-send-cooldown.json');

// 쿨타임 설정(단위 ms)
const COOLDOWN_STAGE = [
  30 * 60 * 1000,       // 0단계: 30분
  2 * 60 * 60 * 1000,   // 1단계: 2시간
  8 * 60 * 60 * 1000,   // 2단계: 8시간
  24 * 60 * 60 * 1000,  // 3단계: 24시간
  48 * 60 * 60 * 1000   // 4단계: 48시간
];
const COOLDOWN_LABEL = ['30분', '2시간', '8시간', '24시간', '48시간'];

function loadCooldowns() {
  if (!fs.existsSync(cooldownPath)) fs.writeFileSync(cooldownPath, '{}');
  return JSON.parse(fs.readFileSync(cooldownPath, 'utf8'));
}
function saveCooldowns(data) {
  fs.writeFileSync(cooldownPath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수송금')
    .setDescription('유저에게 정수(BE)를 송금(수수료 5%)')
    .addUserOption(opt => opt.setName('유저').setDescription('받을 유저').setRequired(true))
    .addIntegerOption(opt => opt.setName('금액').setDescription('송금할 금액').setRequired(true))
    .addStringOption(opt => opt.setName('사유').setDescription('송금 목적/사유를 입력하세요').setRequired(true)),
  async execute(interaction) {
    const to = interaction.options.getUser('유저');
    let amount = interaction.options.getInteger('금액');
    const reason = interaction.options.getString('사유') || '';
    if (to.id === interaction.user.id) return interaction.reply({ content: '자기 자신에게는 송금할 수 없습니다.', ephemeral: true });
    if (amount <= 0) return interaction.reply({ content: '1 BE 이상만 송금할 수 있습니다.', ephemeral: true });

    // 도너 역할 여부 체크
    const isDonor = interaction.member.roles.cache.has(DONOR_ROLE);

    // 쿨타임 체크 (도너는 면제)
    if (!isDonor) {
      const cooldowns = loadCooldowns();
      const now = Date.now();
      let stage = cooldowns[interaction.user.id]?.stage || 0;
      let lastSend = cooldowns[interaction.user.id]?.lastSend || 0;
      let nextAvailable = lastSend + COOLDOWN_STAGE[Math.min(stage, COOLDOWN_STAGE.length - 1)];

      if (now < nextAvailable) {
        const remainSec = Math.ceil((nextAvailable - now) / 1000);
        let h = Math.floor(remainSec / 3600);
        let m = Math.floor((remainSec % 3600) / 60);
        let s = remainSec % 60;
        let timeStr = [
          h ? `${h}시간` : '',
          m ? `${m}분` : '',
          s ? `${s}초` : ''
        ].filter(Boolean).join(' ');
        return interaction.reply({
          content: `🕒 송금 쿨타임! ${timeStr} 후에 다시 송금할 수 있습니다.`,
          ephemeral: true
        });
      }

      // 쿨타임 단계 올리기(단, 24시간 이상 지난 경우 자동 0단계로 복구)
      if (now - lastSend > 24 * 60 * 60 * 1000) stage = 0;
      else stage = Math.min(stage + 1, COOLDOWN_STAGE.length - 1);

      cooldowns[interaction.user.id] = {
        stage,
        lastSend: now
      };
      saveCooldowns(cooldowns);
    }

    // 송금 처리
    const config = loadConfig();
    const feeRate = config.fee || 10; // 기본 10%
    let fromBalance = getBE(interaction.user.id);

    let maxAmount = Math.floor(fromBalance / (1 + feeRate / 100));
    if (amount > maxAmount) amount = maxAmount;

    const fee = Math.floor(amount * (feeRate / 100));
    const outgo = amount + fee;

    if (fromBalance < outgo || amount <= 0) {
      return interaction.reply({ content: `송금 가능한 잔액이 없습니다.`, ephemeral: true });
    }

    await addBE(interaction.user.id, -outgo, `[송금] -> <@${to.id}> | ${reason}`);
    await addBE(to.id, amount, `[송금입금] <- <@${interaction.user.id}> | ${reason}`);

    // 안내문 생성
    let desc = [
      `**${amount.toLocaleString('ko-KR')} 🔷 BE**를 <@${to.id}>에게 송금 완료!`,
      `\`사유:\` ${reason}`,
      `||수수료: **${fee.toLocaleString('ko-KR')} 🔷 BE**`,
      `실제 출금액: **${outgo.toLocaleString('ko-KR')} 🔷 BE**||`
    ];
    if (isDonor) {
      desc.push('\n💜 𝕯𝖔𝖓𝖔𝖗 서버 후원자는 송금 쿨타임이 **면제**됩니다!');
    } else {
      // 일반 유저
      const cooldowns = loadCooldowns();
      let stage = cooldowns[interaction.user.id]?.stage || 0;
      desc.push(`\n🕒 다음 송금 가능: **${COOLDOWN_LABEL[stage]} 후**`);
    }

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🔷 파랑 정수 송금')
          .setDescription(desc.join('\n'))
          .setColor(0x3399ff)
          .setTimestamp()
      ]
    });
  }
};
