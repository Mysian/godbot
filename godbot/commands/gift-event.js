// 📁 commands/gift-event.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType } = require('discord.js');
const { addBE } = require('./be-util.js');

// 한국식 화폐 표기 함수
function formatKoreanMoney(num) {
  if (typeof num !== 'number') num = parseInt(num, 10);
  if (isNaN(num)) return num;

  if (num >= 1e8) { // 억 이상
    const eok = Math.floor(num / 1e8);
    const rest = num % 1e8;
    return `${eok}억${rest > 0 ? ' ' + formatKoreanMoney(rest) : ''}`;
  } else if (num >= 1e4) { // 만 이상
    const man = Math.floor(num / 1e4);
    const rest = num % 1e4;
    return `${man}만${rest > 0 ? ' ' + rest.toLocaleString() : ''}`;
  } else {
    return num.toLocaleString();
  }
}

// 보상 테이블: 소수점 확률 반영, 5,000이하 압도적, 10만 극악
const rewardTable = [
  { min: 1000, max: 2500, weight: 8500, effect: '🎁', effectMsg: '나쁘지 않네요' },    // 85%
  { min: 2501, max: 5000, weight: 1100, effect: '✨', effectMsg: '오~ 소소한데요?' },   // 11%
  { min: 5001, max: 15000, weight: 300, effect: '💎', effectMsg: '제법 특별하신듯??' },   // 3%
  { min: 15001, max: 40000, weight: 95, effect: '🔥', effectMsg: '에? 이게 뜬다고..?' }, // 0.95%
  { min: 40001, max: 100000, weight: 5, effect: '🌈', effectMsg: 'ㅁㅊ 이게 떴다고???? 복권 사러가셈 님아 이거 극악 확률인데;;;' },  // 0.05%
];

function pickReward() {
  const total = rewardTable.reduce((sum, r) => sum + r.weight, 0);
  let rand = Math.random() * total;
  for (const r of rewardTable) {
    if (rand < r.weight) {
      const amount = Math.floor(Math.random() * (r.max - r.min + 1)) + r.min;
      return { ...r, amount };
    }
    rand -= r.weight;
  }
  // fallback
  const last = rewardTable[rewardTable.length - 1];
  return { ...last, amount: last.max };
}

// 연출 세트 (금액 표기 한국식 적용)
function getEffectEmbed(user, reward) {
  const formatted = formatKoreanMoney(reward.amount);
  if (reward.amount <= 2500) {
    // 평범
    return new EmbedBuilder()
      .setTitle(`${reward.effect} [정수 획득!] ${reward.effect}`)
      .setDescription(`<@${user.id}>님, ${reward.effectMsg} \n**${formatted} BE**를 획득!`)
      .setColor(0x5bbcff)
      .setFooter({ text: reward.effectMsg });
  } else if (reward.amount <= 5000) {
    // 특별
    return new EmbedBuilder()
      .setTitle(`${reward.effect} [정수 획득!] ${reward.effect}`)
      .setDescription(`✨ <@${user.id}>님이 정수를 얻었다!\n**${formatted} BE** 지급! ✨`)
      .setColor(0x8ae65c)
      .setFooter({ text: reward.effectMsg });
  } else if (reward.amount <= 15000) {
    // 레어
    return new EmbedBuilder()
      .setTitle(`${reward.effect} [정수 획득!] ${reward.effect}`)
      .setDescription(`💎 <@${user.id}>님이 정수를 얻었습니다!\n**${formatted} BE**`)
      .setColor(0xa953ff)
      .setFooter({ text: reward.effectMsg });
  } else if (reward.amount <= 40000) {
    // 초레어
    return new EmbedBuilder()
      .setTitle(`${reward.effect} [정수 획득!!] ${reward.effect}`)
      .setDescription(`🔥 <@${user.id}>님이 정수를 터뜨렸다! \n**${formatted} BE**`)
      .setColor(0xf75525)
      .setFooter({ text: reward.effectMsg });
  } else {
    // 신화의 정수
    return new EmbedBuilder()
      .setTitle(`${reward.effect} [정수 획득!!!] ${reward.effect}`)
      .setDescription(`🌈 <@${user.id}>님이 극악의 확률로 대량의 정수를 획득!!!\n**${formatted} BE**\n\n*이 행운의 주인공은 당신!*`)
      .setColor(0xf4e642)
      .setFooter({ text: reward.effectMsg });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수이벤트')
    .setDescription('60초 선착순 1명만 파랑 정수를 받을 수 있는 깜짝 이벤트!'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle(`🎲 [깜짝 정수 이벤트] 🎲`)
      .setDescription(
        `60초 안에 **가장 먼저** '정수 받기' 버튼을 누르면\n\n`
        + `💰 *얼마를 받게 될지 아무도 모릅니다!*\n\n`
        + `당신의 운에 맡겨보세요!`
      )
      .addFields({ name: '참여방법', value: `버튼을 가장 먼저 누르세요!` })
      .setColor(0x3b8beb)
      .setFooter({ text: '정수 금액은 수령 후 공개!' });

    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('gift_event_btn')
        .setLabel(`정수 받기`)
        .setStyle(ButtonStyle.Primary)
    );

    const msg = await interaction.channel.send({ embeds: [embed], components: [btnRow] });
    await interaction.reply({ content: '이벤트가 시작됐어요! 채팅방을 확인해보세요!', ephemeral: true });

    let claimed = false;
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000 // 60초
    });

    collector.on('collect', async i => {
      if (claimed) return;
      claimed = true;
      collector.stop('claimed');
      // 보상 추첨 & 지급
      const reward = pickReward();
      await addBE(i.user.id, reward.amount, `정수이벤트 (${interaction.channel.name})`);
      // 연출
      await i.update({
        embeds: [
          getEffectEmbed(i.user, reward)
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('claimed')
              .setLabel('이미 수령됨')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          )
        ]
      });
    });

    collector.on('end', async (collected, reason) => {
      if (claimed) return;
      await msg.edit({
        embeds: [
          new EmbedBuilder()
            .setTitle(`[이벤트 종료]`)
            .setDescription('수령자가 없어 지급되지 않았습니다.')
            .setColor(0x888888)
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('timeout')
              .setLabel('수령자 없음')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          )
        ]
      });
    });
  }
};
