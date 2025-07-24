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
    .setDescription('버튼형 공지: 신고/민원, 태그, 서버 안내, 프로필 관리')
    .addStringOption(opt =>
      opt.setName('종류')
        .setDescription('공지 종류')
        .setRequired(true)
        .addChoices(
          { name: '까리한 디스코드 안내', value: 'info' },
          { name: '서버 프로필 관리', value: 'profile' },
          { name: '신고 및 민원', value: 'report' },
          { name: '게임/서버 태그', value: 'tag' },
          { name: '후원 안내', value: 'donate' },
          { name: '겐지 키우기 및 챔피언 모험', value: 'genji_adv' },
          { name: '갓비트 시세 요약', value: 'godbit_summary' },
          { name: '봇 관리', value: 'bot_manage' },
          { name: '상태 설정 (afk)', value: 'afk_status' },
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



    // ───────────── 5. 겐지 키우기 챔피언 모험 ─────────────
    if (type === 'genji_adv') {
  const embed = new EmbedBuilder()
    .setTitle('⚔️ 겐지 키우기 & 챔피언 모험 안내')
    .setDescription([
      '### 겐지 키우기',
      '1. **오버워치 모든 영웅과 1:1 대결!** 겐지로 스테이지를 클리어하며 능력치를 키워보세요.',
      '2. 다양한 버튼(공격, 수리검, 질풍참 등) 선택형 전투! 클리어 시 능력치 업그레이드 제공!',
      '`/겐지키우기` 명령어 입력 또는 아래 버튼 클릭!',
      '',
      '### 챔피언 모험 (무한 도전 RPG)',
      '1. **챔피언을 직접 키우고 강화**해서 끝없이 스테이지를 도전!',
      '2. 랜덤 몬스터, 보스, 드래곤 등과 실시간 전투. 패배 시 강화 레벨 1단계 하락!',
      '`/모험` 명령어 입력 또는 아래 버튼 클릭!',
    ].join('\n'))
    .setColor(0x8864e5)
    .setFooter({ text: '갓봇의 더 자세한 사용법은 /도움말 을 이용하세요.' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('genji_open')
      .setLabel('겐지 키우기')
      .setEmoji('🥷')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('adventure_open')
      .setLabel('챔피언 모험')
      .setEmoji('🏹')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('genji_rank_open')
      .setLabel('겐지 랭크')
      .setEmoji('🥇')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('adventure_rank_open')
      .setLabel('모험 순위')
      .setEmoji('🥈')
      .setStyle(ButtonStyle.Secondary),
  );

  await channel.send({ embeds: [embed], components: [row] });
  return void interaction.reply({ content: '겐지키우기/챔피언모험 안내 공지 전송 완료!', ephemeral: true });
}

 // ───────────── 6. 봇 관리 안내 ─────────────
if (type === 'bot_manage') {
  const embed = new EmbedBuilder()
    .setTitle('🤖 봇 관리 패널 (메인스탭 전용)')
    .setDescription([
      '※ 이 기능은 **메인스탭(관리진)**만 사용 가능합니다.',
      '',
      '**1. [봇업데이트]**: 서버에서 최신 코드로 git pull!',
      '**2. [봇명령어업데이트]**: slash 명령어 전체 재등록!',
      '**3. [봇재시작]**: 봇 프로세스 PM2 재시작!',
      '',
      '아래 버튼 클릭 시 바로 실행됩니다.'
    ].join('\n'))
    .setColor(0x2D3748)
    .setFooter({ text: '🛠️ 관리자 전용 기능입니다.' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('bot_pull_open')
      .setLabel('봇업데이트')
      .setEmoji('⬇️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('bot_deploy_commands_open')
      .setLabel('봇명령어업데이트')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('bot_restart_open')
      .setLabel('봇재시작')
      .setEmoji('♻️')
      .setStyle(ButtonStyle.Danger),
  );

  await channel.send({ embeds: [embed], components: [row] });
  return void interaction.reply({ content: '봇 관리 안내 공지 전송 완료!', ephemeral: true });
}
    
    // ───────────── 7. 갓비트 시세 요약 ─────────────
if (type === 'godbit_summary') {
  const embed = new EmbedBuilder()
    .setTitle('📊 갓비트 시세 요약')
    .setDescription([
      '• 까리한 디스코드만의 랜덤 가상코인 시세/현황판!',
      '• 주요 코인 가격을 한눈에 확인할 수 있습니다.',
      '',
      '자세한 시세는 `/갓비트 코인차트` 명령어 참고!',
      '실거래는 `/갓비트 매수`, `/갓비트 매도` 명령어로!',
    ].join('\n'))
    .setColor(0x4EC3F7)
    .setFooter({ text: '코인 가격은 실시간으로 변동됩니다. (상세: /갓비트 코인차트)' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('godbit_simple_summary')
      .setLabel('갓비트 시세 요약')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Primary),
  );

  await channel.send({ embeds: [embed], components: [row] });
  return void interaction.reply({ content: '갓비트 시세 요약 공지 전송 완료!', ephemeral: true });
}

// ───────────── 8. 상태 설정 (afk) 안내 ─────────────
if (type === 'afk_status') {
  const embed = new EmbedBuilder()
    .setTitle('💤 상태 메시지(AFK) 설정')
    .setDescription([
      '• "잠시 자리를 비웠어요!" 같은 상태 메시지를 등록하면,',
      '• 누군가 당신을 @멘션할 때 자동으로 안내 메시지가 전송됩니다.',
      '',
      '상태 메시지는 언제든 변경/해제 가능!',
      '',
      '▶️ 아래 버튼으로 상태 메시지를 직접 등록하거나, 기존 메시지를 해제하세요.'
    ].join('\n'))
    .setColor(0x95A5A6)
    .setFooter({ text: '상태 메시지는 전체 채팅방 어디서든 동작합니다.' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('set_status_open')
      .setLabel('상태 메시지 등록')
      .setEmoji('💬')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('remove_status_open')
      .setLabel('상태 메시지 해제')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger),
  );

  await channel.send({ embeds: [embed], components: [row] });
  return void interaction.reply({ content: '상태 메시지(AFK) 안내 공지 전송 완료!', ephemeral: true });
}

// ───────────── 9. 후원 안내 ─────────────
if (type === 'donate') {
  const embed = new EmbedBuilder()
    .setTitle('💖 까리한 디스코드 후원 안내')
    .setDescription([
      `**💸 후원금 안내**`,
      `- 1,000원당 후원자 역할 **3일** 자동 부여`,
      ``,
      `**🎁 상품 후원 안내**`,
      `- 상품 1건 후원 시 후원자 역할 **7일** 자동 부여`,
      ``,
      `※ 모든 후원 내역 및 역할은 누적 관리됩니다.\n\n정말 감사한 마음을 담아, 모든 후원은 신중하게 관리됩니다.`
    ].join('\n'))
    .addFields(
      { 
        name: '🎁 후원자의 혜택', 
        value: [
          '• 서버 내 **경험치 부스터 +333**',
          '• 후원자 역할 𝕯𝖔𝖓𝖔𝖗 부여 및 서버 멤버 상단 고정',
          '• 추가 정수 획득 기회'
        ].join('\n'), 
        inline: false 
      },
      { 
        name: '💰 후원금의 용도', 
        value: [
          '• 서버 부스터 잔여분 진행',
          "• 정수 **'경매 현물'** 마련 (게임 아이템, 기프티콘, 실제 상품 등)",
          '• 내전(서버 내 대회) 보상',
          '• 마인크래프트 등 자체 서버 호스팅 및 유지(일정 금액 달성 시)',
          "• 자체 봇 '갓봇'의 개발 및 서버 호스팅 비용"
        ].join('\n'), 
        inline: false 
      }
    )
    .setColor(0xf9bb52)
    .setFooter({ text: '후원 관련 문의는 운영진 또는 영갓에게 DM!' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('donate_money')
      .setLabel('💸 후원금')
      .setEmoji('💸')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('donate_item')
      .setLabel('🎁 상품 후원')
      .setEmoji('🎁')
      .setStyle(ButtonStyle.Success)
  );

  await channel.send({ embeds: [embed], components: [row] });
  return void interaction.reply({ content: '💖 후원 안내 공지 전송 완료!', ephemeral: true });
}
  }
}
