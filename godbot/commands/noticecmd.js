const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle 
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('명령어공지')
    .setDescription('버튼형 공지: 신고/민원, 태그, 서버 안내, 프로필 관리, 코인 시스템')
    .addStringOption(opt =>
      opt.setName('종류')
        .setDescription('공지 종류')
        .setRequired(true)
        .addChoices(
          { name: '신고 및 민원', value: 'report' },
          { name: '게임/서버 태그', value: 'tag' },
          { name: '까리한 디스코드 안내', value: 'info' },
          { name: '서버 프로필 관리', value: 'profile' },
          { name: '코인 시스템', value: 'coin' } // 코인 시스템 추가!
        )
    )
    .addChannelOption(opt =>
      opt.setName('채널')
        .setDescription('공지 채널')
        .setRequired(true)
    ),
  async execute(interaction) {
    const type = interaction.options.getString('종류');
    const channel = interaction.options.getChannel('채널');

    // ───────────── 1. 신고/민원 안내 ─────────────
    if (type === 'report') {
      const embed = new EmbedBuilder()
        .setTitle('🚨 신고 및 민원 안내')
        .setDescription([
          '• 디스코드 내에서 불편, 피해, 건의사항이 있을 땐 아래 버튼을 통해 즉시 접수할 수 있습니다.',
          '• **[신고]**: 규칙 위반, 비매너, 욕설, 트롤 등 유저 신고',
          '• **[민원]**: 불편사항, 운영 관련 문의/건의/제보 등',
          '',
          '아래 버튼을 클릭하여 해당 폼을 작성하거나, 제재 지침/경고 기록도 확인해 주세요. (누구나 이용 가능)'
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
        new ButtonBuilder()
          .setCustomId('punish_guide_open')
          .setLabel('제재 지침')
          .setEmoji('🛡️')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('warn_check_open')
          .setLabel('경고 확인')
          .setEmoji('📑')
          .setStyle(ButtonStyle.Primary),
      );

      await channel.send({ embeds: [embed], components: [row] });
      return void interaction.reply({ content: '신고/민원 공지 전송 완료!', ephemeral: true });
    }

    // ───────────── 2. 게임/서버 태그 안내 ─────────────
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

    // ───────────── 3. 까리한 디스코드 안내 ─────────────
    if (type === 'info') {
      const embed = new EmbedBuilder()
        .setTitle('📚 까리한 디스코드 서버 안내')
        .setDescription([
          '🌟 **까리한 디스코드** 🌟\n본 서버는 종합게임서버입니다.',
          '서버 링크: https://discord.gg/kkari',
          '',
          '[유의사항]',
          '본 서버는 **미성년자의 입장 및 이용을 제한**하고 있습니다.',
          '입장 후 @𝓛𝓿.0 상태로 7일이 경과되는 경우 **추방**됩니다.',
          '서버 미이용 기간이 **90일이 넘는 경우 추방**됩니다.',
          '',
          '• 서버의 소개, 규칙, 레벨 시스템, 사용 가능한 명령어 안내를 한 곳에서 확인할 수 있습니다.',
          '• 아래 버튼을 눌러 원하는 항목을 확인하세요!'
        ].join('\n'))
        .setColor(0xffcc00)
        .setFooter({ text: '갓봇의 더 자세한 사용법은 /도움말 을 이용하세요.' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('serverinfo_open')
          .setLabel('서버 안내')
          .setEmoji('📌')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('serverrules_open')
          .setLabel('서버 규칙')
          .setEmoji('📜')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('levelguide_open')
          .setLabel('레벨 가이드')
          .setEmoji('🌈')
          .setStyle(ButtonStyle.Secondary),
      );

      await channel.send({ embeds: [embed], components: [row] });
      return void interaction.reply({ content: '서버 안내 공지 전송 완료!', ephemeral: true });
    }

    // ───────────── 4. 서버 프로필 관리 안내 ─────────────
    if (type === 'profile') {
      const embed = new EmbedBuilder()
        .setTitle('📝 서버 프로필 관리 안내')
        .setDescription([
          '• 아래 버튼을 눌러 **프로필을 등록**하거나 **기존 프로필을 수정**할 수 있습니다.',
          '• 프로필 정보는 서버 내에서 다양한 기능과 소통에 활용됩니다.',
          '',
          '※ 최초 1회는 [프로필 등록] 버튼을, 이후엔 [프로필 수정] 버튼을 이용하세요.'
        ].join('\n'))
        .setColor(0x00bb77)
        .setFooter({ text: '갓봇의 더 자세한 사용법은 /도움말 을 이용하세요.' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('profile_register_open')
          .setLabel('프로필 등록')
          .setEmoji('🆕')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('profile_edit_open')
          .setLabel('프로필 수정')
          .setEmoji('📝')
          .setStyle(ButtonStyle.Secondary),
      );

      await channel.send({ embeds: [embed], components: [row] });
      return void interaction.reply({ content: '서버 프로필 안내 공지 전송 완료!', ephemeral: true });
    }

    // ───────────── 5. 코인 시스템 안내 + 버튼/모달 ─────────────
    if (type === 'coin') {
      const embed = new EmbedBuilder()
        .setTitle('💸 갓비트(가상 코인) 시스템')
        .setDescription([
          '디스코드에서 즐기는 랜덤 코인 거래/순위 시스템!',
          '• [코인 차트] : 시장 전체/개별 코인 가격 변화',
          '• [내 코인] : 보유 코인 자산, 수익률, 실현수익 조회',
          '• [매수/매도] : 실시간 코인 거래 (모달창 입력 필요)',
          '',
          '**아래 버튼을 눌러 코인 거래/조회 메뉴를 열어보세요!**'
        ].join('\n'))
        .setColor(0x5DADE2);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('coin_modal_buy')
          .setLabel('코인 매수')
          .setEmoji('🛒')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('coin_modal_sell')
          .setLabel('코인 매도')
          .setEmoji('💸')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('coin_modal_my')
          .setLabel('내 코인')
          .setEmoji('📊')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('coin_modal_chart')
          .setLabel('코인 차트')
          .setEmoji('📈')
          .setStyle(ButtonStyle.Secondary),
      );
      await channel.send({ embeds: [embed], components: [row] });
      return void interaction.reply({ content: '코인 시스템 안내 전송 완료!', ephemeral: true });
    }
  }
}

// ========== 버튼 클릭시 모달 또는 안내 동작 구현 ==========
// 반드시 봇 실행부(메인 파일 등)에서 아래 코드 import/실행 필요

const { Events } = require('discord.js');
module.exports.setupCoinModalHandler = (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    // --- 코인 매수 모달 ---
    if (interaction.customId === 'coin_modal_buy') {
      const modal = new ModalBuilder()
        .setCustomId('modal_buy')
        .setTitle('코인 매수')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('coin_name')
              .setLabel('코인명')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('예시: 까리코인')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('amount')
              .setLabel('매수 수량')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('숫자만 입력')
              .setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return;
    }
    // --- 코인 매도 모달 ---
    if (interaction.customId === 'coin_modal_sell') {
      const modal = new ModalBuilder()
        .setCustomId('modal_sell')
        .setTitle('코인 매도')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('coin_name')
              .setLabel('코인명')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('예시: 까리코인')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('amount')
              .setLabel('매도 수량')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('숫자만 입력')
              .setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return;
    }
    // --- 내코인 안내 ---
    if (interaction.customId === 'coin_modal_my') {
      await interaction.reply({ content: '`/갓비트 내코인` 명령어를 직접 입력해 주세요! (자동실행 연동 원하면 추후 추가 가능)', ephemeral: true });
      return;
    }
    // --- 차트 안내 ---
    if (interaction.customId === 'coin_modal_chart') {
      await interaction.reply({ content: '`/갓비트 코인차트` 명령어를 직접 입력해 주세요! (자동실행 연동 원하면 추후 추가 가능)', ephemeral: true });
      return;
    }
  });
}
