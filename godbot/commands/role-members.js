const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('역할현황')
    .setDescription('선택한 역할을 가진 유저 목록을 확인')
    .addRoleOption(option =>
      option.setName('역할')
        .setDescription('조회할 역할 선택')
        .setRequired(true)),
  async execute(interaction) {
    const role = interaction.options.getRole('역할');
    const members = role.members.map(member => ({
      id: member.user.id,
      tag: member.user.tag,
      displayName: member.displayName || member.user.username,
      mention: `<@${member.user.id}>`
    }));

    if (members.length === 0)
      return interaction.reply({ content: `해당 역할을 가진 유저가 없어!`, ephemeral: true });

    // 가나다 / 알파벳 순 정렬
    members.sort((a, b) => {
      // 한글 우선, 그 다음 알파벳
      return a.displayName.localeCompare(b.displayName, 'ko-KR');
    });

    // 30명씩 페이지 분할
    const pageSize = 30;
    const totalPages = Math.ceil(members.length / pageSize);

    function makeEmbed(page) {
      const slice = members.slice((page - 1) * pageSize, page * pageSize);
      return new EmbedBuilder()
        .setTitle(`📑 역할현황: ${role.name} (${members.length}명)`)
        .setDescription(
          slice
            .map((m, i) =>
              `${i + 1 + (page - 1) * pageSize}. ${m.mention} / \`${m.id}\` / **${m.displayName}**`
            )
            .join('\n')
        )
        .setFooter({ text: `페이지 ${page} / ${totalPages}` })
        .setColor(role.color || 0x5ad2ff);
    }

    // 첫 페이지 임베드
    let page = 1;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('prev').setLabel('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('next').setLabel('➡️').setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1)
    );

    const msg = await interaction.reply({
      embeds: [makeEmbed(page)],
      components: [row],
      ephemeral: true,
      fetchReply: true,
    });

    if (totalPages === 1) return;

    // 버튼 인터랙션 처리 (300초)
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300_000 });

    collector.on('collect', async btnInt => {
      if (btnInt.user.id !== interaction.user.id)
        return btnInt.reply({ content: '본인만 조작할 수 있어!', ephemeral: true });

      if (btnInt.customId === 'prev') page--;
      if (btnInt.customId === 'next') page++;

      row.components[0].setDisabled(page === 1);
      row.components[1].setDisabled(page === totalPages);

      await btnInt.update({ embeds: [makeEmbed(page)], components: [row] });
    });

    collector.on('end', async () => {
      // 비활성화 버튼
      row.components.forEach(btn => btn.setDisabled(true));
      await msg.edit({ components: [row] });
    });
  }
};
