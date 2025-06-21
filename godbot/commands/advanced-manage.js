const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType } = require('discord.js');
const { getStats } = require('../utils/activity-tracker');
const fs = require('fs');

const LONG_INACTIVE_DAYS = 90;
const NEWBIE_ROLE_ID = '1295701019430227988';
const NEWBIE_DAYS = 7;
const PAGE_SIZE = 30;
const EXEMPT_ROLE_IDS = [
  '1371476512024559756'
];

function formatTimeAgo(date) {
  if (!date) return '정보 없음';
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff < 0) return '방금 전';
  const d = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (d === 0) return '오늘';
  if (d === 1) return '어제';
  return `${d}일 전`;
}

function getMostRecentDate(obj) {
  if (!obj) return null;
  let latest = null;
  Object.keys(obj).forEach(dateStr => {
    const dt = new Date(dateStr);
    if (!latest || dt > latest) latest = dt;
  });
  return latest;
}

// 유저들의 mostRecentDate도 같이
async function fetchLongInactive(guild) {
  const stats = getStats({ from: null, to: null });
  const now = new Date();
  let arr = [];
  for (const stat of stats) {
    try {
      const member = await guild.members.fetch(stat.userId).catch(() => null);
      if (!member) continue;
      if (EXEMPT_ROLE_IDS.some(rid => member.roles.cache.has(rid))) continue;
      const lastDate = getMostRecentDate(require('../activity-data.json')[stat.userId]);
      if (!lastDate) continue;
      const diffDays = (now - lastDate) / (1000 * 60 * 60 * 24);
      if (diffDays < LONG_INACTIVE_DAYS) continue;
      arr.push({
        id: member.id,
        tag: `<@${member.id}>`,
        user: member.user,
        nickname: member.displayName,
        lastActive: lastDate,
      });
    } catch { }
  }
  return arr;
}

async function fetchInactiveNewbies(guild) {
  const stats = getStats({ from: null, to: null });
  const now = new Date();
  let arr = [];
  for (const stat of stats) {
    try {
      const member = await guild.members.fetch(stat.userId).catch(() => null);
      if (!member) continue;
      if (!member.roles.cache.has(NEWBIE_ROLE_ID)) continue;
      const joined = member.joinedAt;
      if (!joined || (now - joined) / (1000 * 60 * 60 * 24) < NEWBIE_DAYS) continue; // 7일 미만 제외
      const lastDate = getMostRecentDate(require('../activity-data.json')[stat.userId]);
      if (!lastDate) continue;
      const diffDays = (now - lastDate) / (1000 * 60 * 60 * 24);
      if (diffDays < NEWBIE_DAYS) continue;
      arr.push({
        id: member.id,
        tag: `<@${member.id}>`,
        user: member.user,
        nickname: member.displayName,
        joined: joined,
        lastActive: lastDate,
      });
    } catch { }
  }
  return arr;
}

function getEmbeds(list, page, title) {
  const embeds = [];
  const totalPages = Math.ceil(list.length / PAGE_SIZE) || 1;
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, list.length);
  const users = list.slice(start, end);
  const embed = new EmbedBuilder()
    .setTitle(`${title} (총 ${list.length}명)`)
    .setDescription(users.length === 0 ? '해당되는 유저가 없습니다.' : users.map((u, i) =>
      `${start + i + 1}. ${u.tag} | \`${u.id}\` | ${u.nickname} | ${formatTimeAgo(u.lastActive)}`
    ).join('\n'))
    .setFooter({ text: `${page + 1} / ${totalPages}` })
    .setColor('#ffab00');
  embeds.push(embed);
  return embeds;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('고급관리')
    .setDescription('필수옵션: [장기 미접속 유저, 비활동 신규 유저]')
    .addStringOption(opt =>
      opt.setName('필수옵션')
        .setDescription('관리 항목 선택')
        .setRequired(true)
        .addChoices(
          { name: '장기 미접속 유저', value: 'long' },
          { name: '비활동 신규 유저', value: 'newbie' },
        )
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    const option = interaction.options.getString('필수옵션');
    let userList = [];
    let title = '';
    if (option === 'long') {
      title = '장기 미접속 유저';
      userList = await fetchLongInactive(guild);
    } else {
      title = '비활동 신규 유저';
      userList = await fetchInactiveNewbies(guild);
    }
    let page = 0;
    let embeds = getEmbeds(userList, page, title);

    // 버튼 구성
    const makeRow = (disabled = false) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('prev').setLabel('이전').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page === 0),
      new ButtonBuilder().setCustomId('refresh').setLabel('새로고침').setStyle(ButtonStyle.Primary).setDisabled(disabled),
      new ButtonBuilder().setCustomId('next').setLabel('다음').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page >= Math.ceil(userList.length / PAGE_SIZE) - 1),
      new ButtonBuilder().setCustomId('kick').setLabel('전체 추방').setStyle(ButtonStyle.Danger).setDisabled(disabled),
      new ButtonBuilder().setCustomId('warn').setLabel('전체 경고 DM').setStyle(ButtonStyle.Success).setDisabled(disabled),
    );

    let lastInteraction = Date.now();
    const msg = await interaction.editReply({ embeds, components: [makeRow()], ephemeral: true });

    // 인터랙션 컬렉터 (2분, 누를 때마다 연장)
    const filter = i => i.user.id === interaction.user.id && i.message.id === msg.id;
    const collector = msg.createMessageComponentCollector({
      filter,
      time: 120000,
      componentType: ComponentType.Button,
    });

    collector.on('collect', async i => {
      lastInteraction = Date.now();
      if (i.customId === 'prev') {
        page = Math.max(page - 1, 0);
        await i.update({ embeds: getEmbeds(userList, page, title), components: [makeRow()], ephemeral: true });
      } else if (i.customId === 'next') {
        page = Math.min(page + 1, Math.ceil(userList.length / PAGE_SIZE) - 1);
        await i.update({ embeds: getEmbeds(userList, page, title), components: [makeRow()], ephemeral: true });
      } else if (i.customId === 'refresh') {
        if (option === 'long') userList = await fetchLongInactive(guild);
        else userList = await fetchInactiveNewbies(guild);
        embeds = getEmbeds(userList, page, title);
        await i.update({ embeds, components: [makeRow()], ephemeral: true });
      } else if (i.customId === 'kick') {
        await i.deferUpdate();
        let kicked = 0;
        for (const u of userList) {
          try {
            const m = await guild.members.fetch(u.id).catch(() => null);
            if (m) await m.kick(`고급관리 - ${title} 일괄 추방`);
            kicked++;
          } catch { }
        }
        await interaction.followUp({ content: `${kicked}명 추방 완료!`, ephemeral: true });
      } else if (i.customId === 'warn') {
        await i.deferUpdate();
        let warned = 0;
        for (const u of userList) {
          try {
            const m = await guild.members.fetch(u.id).catch(() => null);
            if (m) await m.send(`⚠️ [${guild.name}] 장기 미접속/비활동 상태로 추방될 수 있습니다. 활동이 필요합니다.`).catch(() => null);
            warned++;
          } catch { }
        }
        await interaction.followUp({ content: `${warned}명에게 DM 발송 완료!`, ephemeral: true });
      }
      collector.resetTimer();
    });

    collector.on('end', async () => {
      await msg.edit({ components: [makeRow(true)] });
    });
  },
};
