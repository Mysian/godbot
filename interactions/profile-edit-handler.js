// 이건 interactionCreate 이벤트에 등록된 곳에서 버튼 커스텀 ID를 기준으로 처리해줘야 해.
// 예: client.on('interactionCreate', async interaction => { ... });

if (interaction.isButton()) {
  const userId = interaction.user.id;
  const profiles = loadProfiles();

  if (!profiles[userId]) {
    return interaction.reply({ content: '⚠️ 먼저 `/프로필등록` 명령어로 프로필을 등록해 주세요.', ephemeral: true });
  }

  if (interaction.customId === 'edit_status') {
    const modal = new ModalBuilder()
      .setCustomId('edit_status_modal')
      .setTitle('상태 메시지 수정');

    const input = new TextInputBuilder()
      .setCustomId('status_input')
      .setLabel('새 상태 메시지를 입력하세요')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('예: 요즘 롤만 해요!')
      .setMaxLength(50)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  if (interaction.customId === 'edit_games') {
    // 추후 Modal로 선호 게임 3개 수정 받는 구조 추가
    await interaction.reply({ content: '🔧 해당 기능은 곧 업데이트될 예정입니다.', ephemeral: true });
  }

  if (interaction.customId === 'edit_owtier') {
    // Modal로 티어 + 포지션 입력 받기
    await interaction.reply({ content: '🔧 오버워치 티어/포지션 수정 기능 준비 중입니다.', ephemeral: true });
  }

  if (interaction.customId === 'edit_loltier') {
    // Modal로 롤 티어 + 포지션 입력 받기
    await interaction.reply({ content: '🔧 롤 티어/포지션 수정 기능 준비 중입니다.', ephemeral: true });
  }

  if (interaction.customId === 'edit_nicks') {
    await interaction.reply({ content: '🔧 스팀/롤/배틀넷 닉네임 수정 기능도 곧 지원됩니다.', ephemeral: true });
  }
}
