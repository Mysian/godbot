const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('구독')
    .setDescription('까리한 디스코드 정기 구독 서비스'),

  async execute(interaction) {
    // Embed 메시지 구성
    const embed = new EmbedBuilder()
      .setColor('#FFD700') // 금색 느낌
      .setTitle('💎 까리한 디스코드 구독 안내')
      .setURL('https://www.patreon.com/kkari')
      .setDescription('**서버의 발전과 이벤트를 위해 여러분의 후원이 필요합니다!**\n패트리온을 통해 구독하면 다양한 프리미엄 혜택이 제공됩니다.')
      .addFields(
        { name: '🎁 후원자의 혜택', value: `• 서버 내 **경험치 부스터 +333**\n• 서버 멤버 리스트 상단 고정\n• 정수 추가 피드백`, inline: false },
        { name: '💰 후원금의 용도', value: `• 서버 부스터 잔여분 진행\n• 정수 **'경매 현물'** 마련 (게임 아이템, 기프티콘, 실제 상품 등)\n• 내전(서버 내 대회) 보상\n• 마인크래프트 등 자체 서버 호스팅 및 유지(일정 금액 달성 시)\n• 그대가 서버를 사랑하는 척도(= 까리한 서버에 애정 표명!)`, inline: false },
        { name: '📝 안내', value: `- 현재 구독은 3달러 단일 구독만 존재합니다.` }
      )
      .setFooter({ text: '여러분의 애정이 서버를 더욱 까리하게 만듭니다.' });

    // 버튼(링크)
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('💎 까리한 디스코드 구독')
        .setStyle(ButtonStyle.Link)
        .setURL('https://www.patreon.com/kkari')
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: false // 모두 보임
    });
  }
};
