// commands/activity-status.js

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const activityLogger = require('../utils/activity-logger');
const guildMemberCache = new Map(); // (유저닉네임 → 유저ID 캐싱용)
const PERIODS = [
  { label: '1일', value: '1', description: '최근 1일' },
  { label: '7일', value: '7', description: '최근 7일' },
  { label: '14일', value: '14', description: '최근 14일' },
  { label: '30일', value: '30', description: '최근 30일' },
  { label: '60일', value: '60', description: '최근 60일' },
  { label: '90일', value: '90', description: '최근 90일' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('활동현황')
    .setDescription('특정 유저의 활동 기록을 확인합니다.')
    .addStringOption(option =>
      option.setName('유저닉네임')
        .setDescription('조회할 유저의 닉네임을 입력하세요.')
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
    await interaction.deferReply({ ephemeral: true });

    const nickname = interaction.options.getString('유저닉네임');
    const keyword = interaction.options.getString('키워드') || '';
    const days = Number(interaction.options.getString('기간')) || 7; // 기본 7일

    // 유저ID 조회
    let member = null;
    if (guildMemberCache.has(nickname)) {
      member = guildMemberCache.get(nickname);
    } else {
      // 서버에서 닉네임 검색 (중복 있을 시 첫번째)
      const allMembers = await interaction.guild.members.fetch();
      member = allMembers.find(m => m.displayName === nickname || m.user.username === nickname);
      if (!member) {
        return interaction.editReply(`❌ 해당 닉네임의 유저를 찾을 수 없음: **${nickname}**`);
      }
      guildMemberCache.set(nickname, member);
    }
    const userId = member.id;

    // 활동 내역 가져오기
    const allActivities = activityLogger.getUserActivities(userId);
    if (!allActivities.length) {
      return interaction.editReply(`❌ 최근 활동 기록 없음: **${nickname}**`);
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
      return interaction.editReply(`✅ **${nickname}**님의 최근 ${days}일 내 활동 중 \`${keyword}\` 관련 기록이 없습니다.`);
    }

    // 최근 활동순 정렬 (최신순)
    filtered = filtered.sort((a, b) => b.time - a.time);

    // 임베드 준비
    const embed = new EmbedBuilder()
      .setTitle(`🕹️ ${nickname}님의 활동 현황`)
      .setDescription([
        `• 기간: **${days}일**`,
        keyword ? `• 키워드: **${keyword}**` : '',
        `• 전체 기록: **${filtered.length}건**`,
      ].filter(Boolean).join('\n'))
      .setColor(0x47cf73)
      .setFooter({ text: '최대 20건만 표시', iconURL: member.displayAvatarURL() });

    // 최근 활동 20건 출력
    const recent = filtered.slice(0, 20).map((a, idx) => {
      const t = new Date(a.time);
      const dateStr = `${t.getFullYear()}.${t.getMonth()+1}.${t.getDate()} ${t.getHours()}:${t.getMinutes().toString().padStart(2, '0')}`;
      let detailStr = '';
      if (a.details?.name) detailStr += `\`${a.details.name}\``;
      if (a.details?.song) detailStr += ` 🎵${a.details.song}`;
      if (a.details?.artist) detailStr += ` by ${a.details.artist}`;
      return `\`${idx+1}.\` [${dateStr}] **${a.activityType}** ${detailStr}`;
    });

    embed.addFields({
      name: `활동 내역`,
      value: recent.join('\n'),
    });

    await interaction.editReply({ embeds: [embed] });
  }
};
