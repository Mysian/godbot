// 📁 commands/gift-event.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType } = require('discord.js');
const { addBE } = require('./be-util.js');

// 보상 테이블 (가중치, 이펙트, 설명)
const rewardTable = [
  { min: 1000, max: 4000, weight: 7000, effect: '🎁', effectMsg: '평범한 정수!' },
  { min: 4001, max: 8000, weight: 2000, effect: '✨', effectMsg: '특별한 정수!' },
  { min: 8001, max: 20000, weight: 900, effect: '💎', effectMsg: '레어 정수!!' },
  { min: 20001, max: 30000, weight: 100, effect: '🔥', effectMsg: '초레어 정수!!!' }
];

// 보상 추첨 함수
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수이벤트')
    .setDescription('60초 안에 선착순 1명에게 파랑 정수를 지급하는 깜짝 이벤트!'),
  async execute(interaction) {
    const reward = pickReward();

    const embed = new EmbedBuilder()
      .setTitle(`${reward.effect} [깜짝 정수 이벤트] ${reward.effect}`)
      .setDescription(`60초 안에 **가장 먼저 버튼**을 누르면 최대 \`${rewardTable[rewardTable.length-1].max.toLocaleString()} BE\`!\n\n*누가 먼저 받을까?*`)
      .addFields({ name: '참여방법', value: `버튼을 가장 먼저 누르세요!` })
      .setColor(0x3b8beb)
      .setFooter({ text: reward.effectMsg });

    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('gift_event_btn')
        .setLabel(`정수 받기 (${reward.amount.toLocaleString()} BE)`)
        .setStyle(ButtonStyle.Primary)
    );

    const msg = await interaction.channel.send({ embeds: [embed], components: [btnRow] });
    await interaction.reply({ content: '이벤트가 시작됐어! 채팅방을 확인해!', ephemeral: true });

    let claimed = false;
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000 // 60초
    });

    collector.on('collect', async i => {
      if (claimed) return;
      claimed = true;
      collector.stop('claimed');
      await addBE(i.user.id, reward.amount, `정수이벤트 (${interaction.channel.name})`);
      await i.update({
        embeds: [
          new EmbedBuilder()
            .setTitle(`${reward.effect} [정수 획득!] ${reward.effect}`)
            .setDescription(`<@${i.user.id}>님이 **${reward.amount.toLocaleString()} BE**를 획득!`)
            .setColor(0x43b581)
            .setFooter({ text: reward.effectMsg })
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
            .setDescription('60초 내에 수령자가 없어 지급되지 않았어!')
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
