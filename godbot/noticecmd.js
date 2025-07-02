// commands/noticecmd.js

const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('명령어공지')
    .setDescription('신고/민원, 태그 설정 안내 버튼 출력')
    .addStringOption(opt =>
      opt.setName('종류')
        .setDescription('공지 종류 (신고민원, 태그)')
        .setRequired(true)
        .addChoices(
          { name: '신고 및 민원', value: 'report' },
          { name: '게임/서버 태그', value: 'tag' }
        ))
    .addChannelOption(opt =>
      opt.setName('채널')
        .setDescription('공지 채널')
        .setRequired(true)),
  async execute(interaction) {
    const type = interaction.options.getString('종류');
    const channel = interaction.options.getChannel('채널');
    
    // ───────────── 신고/민원 안내 ─────────────
    if (type === 'report') {
      const embed = new EmbedBuilder()
        .setTitle('🚨 신고 및 민원 안내')
        .setDescription([
          '• 디스코드 내에서 불편, 피해, 건의사항이 있을 땐 아래 버튼을 통해 즉시 접수할 수 있습니다.',
          '• **[신고]**: 규칙 위반, 비매너, 욕설, 트롤 등 유저 신고',
          '• **[민원]**: 불편사항, 운영 관련 문의/건의/제보 등',
          '',
          '아래 버튼을 클릭하여 해당 폼을 작성해 주세요. (누구나 이용 가능)'
        ].join('\n'))
        .setColor(0x4063f7)
        .setFooter({ text: '갓봇의 더 자세한 사용법은 /도움말 을 이용하세요.' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('complaint_open')
          .setLabel('민원')
          .setEmoji('📮')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('report_open')
          .setLabel('신고')
          .setEmoji('🚨')
          .setStyle(ButtonStyle.Danger),
      );

      await channel.send({ embeds: [embed], components: [row] });
      return void interaction.reply({ content: '신고/민원 공지 전송 완료!', ephemeral: true });
    }

    // ───────────── 태그 설정 안내 ─────────────
    if (type === 'tag') {
      const embed = new EmbedBuilder()
        .setTitle('🎮 게임/서버 태그 설정 안내')
        .setDescription([
          '• 서버 내 게임/서버 태그는 **아래 버튼**을 눌러 직접 선택·설정할 수 있습니다.',
          '• 원하는 역할(태그)을 자유롭게 추가/삭제할 수 있습니다.',
          '',
          '**[게임 태그 설정]**: 배틀그라운드·롤·발로란트 등 게임별 역할 태그',
          '**[서버 태그 설정]**: 플레이 스타일, 알림, 성인 채팅방 등 서버 공통 태그',
          '',
          '원하는 항목을 아래에서 바로 설정해 보세요!'
        ].join('\n'))
        .setColor(0x4ad5d1)
        .setFooter({ text: '갓봇의 더 자세한 사용법은 /도움말 을 이용하세요.' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('game_tag_open')
          .setLabel('게임 태그 설정')
          .setEmoji('🎮')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('server_tag_open')
          .setLabel('서버 태그 설정')
          .setEmoji('💎')
          .setStyle(ButtonStyle.Secondary),
      );

      await channel.send({ embeds: [embed], components: [row] });
      return void interaction.reply({ content: '태그 설정 안내 공지 전송 완료!', ephemeral: true });
    }
  }
}
