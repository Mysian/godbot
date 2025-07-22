const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('구독')
    .setDescription('패트리온 페이지에서 까리한 디스코드 서버를 후원할 수 있습니다!'),

  async execute(interaction) {
    // 버튼 만들기
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('패트리온 구독하기')
        .setStyle(ButtonStyle.Link)
        .setURL('https://www.patreon.com/kkari')
        .setEmoji('💎')
    );

    await interaction.reply({
      content: [
        '💎 **까리한 디스코드 서버를 후원하고 다양한 프리미엄 혜택을 받아보세요!**',
        '',
        '패트리온을 통해 구독하면 전용 역할, 전용 채널 등 다양한 혜택이 제공됩니다.',
        '',
        '> 아래 버튼을 눌러 패트리온 구독 페이지로 이동하세요!'
      ].join('\n'),
      components: [row],
      ephemeral: false // 공개 채팅에 보임
    });
  }
};
