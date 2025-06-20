const {
  SlashCommandBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const affinityStore = require('./affinity-store.js');

const PAGE_SIZE = 10;

// % 계산
function getPercent(rank, total) {
  if (total <= 1) return 100;
  return Math.max(1, Math.round((rank / total) * 100));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('친화력')
    .setDescription('서버 유저 친화력 순위/레벨/행적을 확인합니다.')
    .addUserOption(opt =>
      opt
        .setName('유저')
        .setDescription('특정 유저의 친화력과 최근 행적을 확인')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const affinity = affinityStore.getAll();
    const userId = interaction.options.getUser('유저')?.id || interaction.user.id;
    const targetUser = await interaction.guild.members.fetch(userId).catch(() => null);

    // 친화력 랭킹 집계
    const sorted = Object.entries(affinity)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => (b.level - a.level) || (b.exp - a.exp));

    const total = sorted.length;
    const targetIdx = sorted.findIndex(u => u.id === userId);
    const targetData = affinity[userId] || { level: 0, exp: 0 };

    // === [1] 특정 유저 친화력/행적 상세 조회 ===
    if (interaction.options.getUser('유저')) {
      if (!targetUser) {
        await interaction.editReply({ content: '❌ 해당 유저를 찾을 수 없습니다.' });
        return;
      }
      // 행적 분할
      const recents = affinityStore.getLogs(userId, 50);
      const totalPages = Math.max(1, Math.ceil(recents.length / 10));
      let page = 0;

      const getEmbed = (idx) => {
        const actions = recents.slice(idx * 10, (idx + 1) * 10);
        const desc = actions.length
          ? actions.map(a => `• [${new Date(a.ts).toLocaleString('ko-KR')}]\n  ${a.type} : ${a.desc}`).join('\n\n')
          : '최근 행적 없음';

        return new EmbedBuilder()
          .setTitle(`${targetUser.user.username}님의 친화력`)
          .addFields(
            { name: "친화력 레벨", value: `${targetData.level ?? 0} / 10 (EXP: ${targetData.exp ?? 0}%)`, inline: true },
            { name: "랭킹/상위 퍼센트", value: `${targetIdx + 1}위 (${getPercent(targetIdx + 1, total)}%)`, inline: true },
            { name: "최근 행적", value: desc, inline: false }
          )
          .setFooter({ text: `페이지 ${idx + 1} / ${totalPages}` })
          .setThumbnail(targetUser.user.displayAvatarURL());
      };

      const row = () => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('prev_page').setLabel('◀ 이전').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId('next_page').setLabel('다음 ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
      );

      await interaction.editReply({ embeds: [getEmbed(page)], components: [row()] });

      if (totalPages > 1) {
        const collector = interaction.channel.createMessageComponentCollector({
          filter: i => i.user.id === interaction.user.id,
          time: 120000
        });
        collector.on('collect', async i => {
          if (i.customId === 'prev_page' && page > 0) page--;
          if (i.customId === 'next_page' && page < totalPages - 1) page++;
          await i.update({ embeds: [getEmbed(page)], components: [row()] });
        });
        collector.on('end', () => {});
      }
      return;
    }

    // === [2] 전체 순위 (닉네임 검색, 10명씩, 하단 본인 표시) ===
    let searchTerm = null;
    let curPage = 0;
    let filtered = sorted;

    const getListEmbed = () => {
      const show = filtered.slice(curPage * PAGE_SIZE, (curPage + 1) * PAGE_SIZE);
      const desc = show.length
        ? show.map((u, i) =>
            `**${curPage * PAGE_SIZE + i + 1}.** <@${u.id}>  |  레벨: ${u.level}  |  EXP: ${u.exp ?? 0}%`
          ).join('\n')
        : '표시할 유저가 없습니다.';

      const self = affinity[interaction.user.id] || { level: 0, exp: 0 };
      const selfIdx = sorted.findIndex(u => u.id === interaction.user.id);
      const percent = getPercent(selfIdx + 1, total);

      return new EmbedBuilder()
        .setTitle('서버 친화력 순위')
        .setDescription(desc)
        .addFields(
          { name: '전체 유저 수', value: `${total}명`, inline: true },
          { name: '검색어', value: searchTerm ? `${searchTerm}` : '없음', inline: true },
          { name: '\u200B', value: '\u200B', inline: true }
        )
        .setFooter({ text: `페이지 ${curPage + 1} / ${Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}` })
        .addFields(
          {
            name: `🧑‍💻 내 친화력`,
            value: `<@${interaction.user.id}> | 레벨: ${self.level} / 10 (EXP: ${self.exp ?? 0}%)\n순위: ${selfIdx + 1}위 / 상위 ${percent}%`
          }
        );
    };

    const getRow = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('prev_page').setLabel('◀ 이전').setStyle(ButtonStyle.Secondary).setDisabled(curPage === 0),
      new ButtonBuilder().setCustomId('next_page').setLabel('다음 ▶').setStyle(ButtonStyle.Secondary).setDisabled((curPage + 1) * PAGE_SIZE >= filtered.length),
      new ButtonBuilder().setCustomId('search').setLabel('🔎 유저 검색').setStyle(ButtonStyle.Primary)
    );

    await interaction.editReply({ embeds: [getListEmbed()], components: [getRow()] });

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 120000
    });

    collector.on('collect', async i => {
      if (i.customId === 'prev_page' && curPage > 0) curPage--;
      if (i.customId === 'next_page' && (curPage + 1) * PAGE_SIZE < filtered.length) curPage++;
      if (i.customId === 'search') {
        const modal = new ModalBuilder()
          .setCustomId('affinity_search_modal')
          .setTitle('유저 닉네임 검색')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('search_input')
                .setLabel('유저 닉네임 입력(포함 검색)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );
        await i.showModal(modal);
        return;
      }
      await i.update({ embeds: [getListEmbed()], components: [getRow()] });
    });

    interaction.client.on('interactionCreate', async modalI => {
      if (!modalI.isModalSubmit() || modalI.customId !== 'affinity_search_modal') return;
      if (modalI.user.id !== interaction.user.id) return;

      const query = modalI.fields.getTextInputValue('search_input');
      searchTerm = query;
      // 닉네임 포함 검색(비동기)
      const members = await interaction.guild.members.fetch({ force: false });
      const matchedIds = members
        .filter(m => m.user.username.includes(query) || (m.nickname && m.nickname.includes(query)))
        .map(m => m.id);
      filtered = sorted.filter(u => matchedIds.includes(u.id));
      curPage = 0;

      await modalI.reply({ embeds: [getListEmbed()], components: [getRow()], ephemeral: true });
    });
    collector.on('end', () => {});
  }
};
