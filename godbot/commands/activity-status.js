// commands/activity-status.js

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder } = require('discord.js');
const activityLogger = require('../utils/activity-logger');

const PERIODS = [
  { label: '1일', value: '1', description: '최근 1일' },
  { label: '7일', value: '7', description: '최근 7일' },
  { label: '14일', value: '14', description: '최근 14일' },
  { label: '30일', value: '30', description: '최근 30일' },
  { label: '60일', value: '60', description: '최근 60일' },
  { label: '90일', value: '90', description: '최근 90일' },
];

const PAGE_SIZE = 10; // 한 페이지당 최대 50개

module.exports = {
  data: new SlashCommandBuilder()
    .setName('활동현황')
    .setDescription('특정 유저의 활동 기록을 확인합니다.')
    .addUserOption(option =>
      option.setName('유저')
        .setDescription('조회할 유저를 선택하세요.')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('키워드')
        .setDescription('활동명/게임명 등 키워드로 필터링 (선택)'))
    .addStringOption(option =>
      option.setName('기간')
        .setDescription('조회할 기간 선택')
        .addChoices(...PERIODS.map(p => ({ name: p.label, value: p.value })))
        .setRequired(false)),
  
  async execute(interaction) {
    // 명령어 재사용 시 초기화: Collector/Embed 모두 새로 생성
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.options.getUser('유저');
    const guildMember = await interaction.guild.members.fetch(member.id);
    const keyword = interaction.options.getString('키워드') || '';
    const days = Number(interaction.options.getString('기간')) || 7; // 기본 7일

    // 활동 내역 가져오기
    const allActivities = activityLogger.getUserActivities(member.id);
    if (!allActivities.length) {
      return interaction.editReply(`❌ 최근 활동 기록 없음: **${guildMember.displayName}**`);
    }

    // 기간 필터
    const now = Date.now();
    const ms = days * 24 * 60 * 60 * 1000;
    let filtered = allActivities.filter(a => (now - a.time) <= ms);

    // 키워드 필터
    if (keyword) {
      filtered = filtered.filter(a =>
        (a.details?.name?.toLowerCase().includes(keyword.toLowerCase()) ||
         a.activityType?.toLowerCase().includes(keyword.toLowerCase()) ||
         a.details?.song?.toLowerCase().includes(keyword.toLowerCase()) ||
         a.details?.artist?.toLowerCase().includes(keyword.toLowerCase()) ||
         false)
      );
    }

    if (!filtered.length) {
      return interaction.editReply(`✅ **${guildMember.displayName}**님의 최근 ${days}일 내 활동 중 \`${keyword}\` 관련 기록이 없습니다.`);
    }

    // 최근 활동순 정렬 (최신순)
    filtered = filtered.sort((a, b) => b.time - a.time);

    // 페이징 관련 변수
    let currentPage = 0;
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

    // Embed 생성 함수
    function buildEmbed(page) {
      const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      const embed = new EmbedBuilder()
        .setTitle(`🕹️ ${guildMember.displayName}님의 활동 현황`)
        .setDescription([
          `• 기간: **${days}일**`,
          keyword ? `• 키워드: **${keyword}**` : '',
          `• 전체 기록: **${filtered.length}건**`,
          `• 페이지: **${page + 1} / ${totalPages}**`
        ].filter(Boolean).join('\n'))
        .setColor(0x47cf73)
        .setFooter({ text: '표시 기록: 최대 50개', iconURL: guildMember.displayAvatarURL() });

      embed.addFields({
        name: '활동 내역',
        value: slice.map((a, idx) => {
          const t = new Date(a.time);
          const dateStr = `${t.getFullYear()}.${t.getMonth() + 1}.${t.getDate()} ${t.getHours()}:${t.getMinutes().toString().padStart(2, '0')}`;
          let detailStr = '';
          if (a.details?.name) detailStr += `\`${a.details.name}\``;
          if (a.details?.song) detailStr += ` 🎵${a.details.song}`;
          if (a.details?.artist) detailStr += ` by ${a.details.artist}`;
          return `\`${page * PAGE_SIZE + idx + 1}.\` [${dateStr}] **${a.activityType}** ${detailStr}`;
        }).join('\n'),
      });

      return embed;
    }

    // 버튼 ActionRow 생성 함수
    function buildActionRow(page) {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('prev_page')
          .setLabel('이전')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId('next_page')
          .setLabel('다음')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages - 1),
      );
    }

    // 첫 Embed/버튼 전송
    const msg = await interaction.editReply({
      embeds: [buildEmbed(currentPage)],
      components: totalPages > 1 ? [buildActionRow(currentPage)] : [],
      ephemeral: true
    });

    if (totalPages <= 1) return;

    // Collector로 300초(5분) 동안 페이징
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 300_000 // 300초
    });

    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({ content: '명령어를 실행한 유저만 조작할 수 있습니다.', ephemeral: true });
        return;
      }
      if (i.customId === 'prev_page' && currentPage > 0) {
        currentPage--;
      }
      if (i.customId === 'next_page' && currentPage < totalPages - 1) {
        currentPage++;
      }
      await i.update({
        embeds: [buildEmbed(currentPage)],
        components: [buildActionRow(currentPage)],
        ephemeral: true
      });
    });

    collector.on('end', async () => {
      // 만료 시 버튼 비활성화
      if (msg.editable) {
        await msg.edit({ components: [] });
      }
    });
  }
};
