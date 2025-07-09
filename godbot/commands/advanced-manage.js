const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType, StringSelectMenuBuilder } = require('discord.js');
const { getStats } = require('../utils/activity-tracker');
const fs = require('fs');
const path = require('path');

const LONG_INACTIVE_DAYS = 90;
const NEWBIE_ROLE_ID = '1295701019430227988';
const NEWBIE_DAYS = 7;
const PAGE_SIZE = 30;
const EXEMPT_ROLE_IDS = ['1371476512024559756'];

// [추가] 스팀게임 태그 역할ID 및 범위 역할ID
const STEAM_TAG_ROLE_ID = '1202781853875183697';
const GAME_MEMBER_ROLE_ID = '816619403205804042';
const ROLE_KEYWORDS = [
  "소환사의 협곡",
  "칼바람 나락",
  "롤토체스",
  "이벤트 모드",
  "DJ MAX",
  "FC",
  "GTA",
  "GTFO",
  "TRPG",
  "건파이어 리본",
  "구스구스 덕",
  "데드락",
  "데바데",
  "델타포스",
  "돈스타브",
  "래프트",
  "레인보우식스",
  "레포",
  "로스트아크",
  "리썰컴퍼니",
  "리스크 오브 레인",
  "마스터 듀얼",
  "마인크래프트",
  "마피아42",
  "메이플스토리",
  "몬스터 헌터",
  "문명",
  "발로란트",
  "배틀그라운드",
  "배틀필드",
  "백룸",
  "백 포 블러드",
  "블레이드 앤 소울",
  "블루아카이브",
  "비세라 클린업",
  "서든어택",
  "선 헤이븐",
  "스컬",
  "스타듀밸리",
  "스타크래프트",
  "스팀게임",
  "에이펙스",
  "엘소드",
  "오버워치",
  "왁제이맥스",
  "워프레임",
  "원신",
  "원스 휴먼",
  "이터널 리턴",
  "좀보이드",
  "카운터스트라이크",
  "코어 키퍼",
  "콜오브듀티",
  "테라리아",
  "테이블 탑 시뮬레이터",
  "테일즈런너",
  "파스모포비아",
  "파워워시 시뮬레이터",
  "파티 애니멀즈",
  "팰월드",
  "페긴",
  "프래그 펑크",
  "휴먼폴플랫",
  "헬다이버즈",
  "히오스"
];

const WARN_HISTORY_PATH = path.join(__dirname, '../data/warn-history.json');
const PERIODS = [
  { label: '1일', value: '1' },
  { label: '7일', value: '7' },
  { label: '14일', value: '14' },
  { label: '30일', value: '30' },
  { label: '60일', value: '60' },
  { label: '90일', value: '90' }
];

function readWarnHistory() {
  if (!fs.existsSync(WARN_HISTORY_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(WARN_HISTORY_PATH, 'utf8'));
  } catch {
    return {};
  }
}
function saveWarnHistory(obj) {
  fs.writeFileSync(WARN_HISTORY_PATH, JSON.stringify(obj, null, 2));
}

function formatTimeAgo(date) {
  if (!date) return '기록 없음';
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

async function fetchLongInactive(guild, days, warnedObj) {
  const activityData = fs.existsSync(__dirname + '/../activity-data.json') ?
    JSON.parse(fs.readFileSync(__dirname + '/../activity-data.json', 'utf8')) : {};
  const now = new Date();
  const allMembers = await guild.members.fetch();
  let arr = [];
  for (const member of allMembers.values()) {
    if (EXEMPT_ROLE_IDS.some(rid => member.roles.cache.has(rid))) continue;
    if (member.user.bot) continue;
    const userData = activityData[member.id];
    if (!userData) {
      arr.push({
        id: member.id,
        tag: `<@${member.id}>`,
        user: member.user,
        nickname: member.displayName,
        lastActive: null,
        warned: !!warnedObj[member.id]
      });
      continue;
    }
    const lastDate = getMostRecentDate(userData);
    if (!lastDate) {
      arr.push({
        id: member.id,
        tag: `<@${member.id}>`,
        user: member.user,
        nickname: member.displayName,
        lastActive: null,
        warned: !!warnedObj[member.id]
      });
      continue;
    }
    const diffDays = (now - lastDate) / (1000 * 60 * 60 * 24);
    if (diffDays >= days) {
      arr.push({
        id: member.id,
        tag: `<@${member.id}>`,
        user: member.user,
        nickname: member.displayName,
        lastActive: lastDate,
        warned: !!warnedObj[member.id]
      });
    }
  }
  return arr;
}

async function fetchInactiveNewbies(guild, days, warnedObj) {
  const activityData = fs.existsSync(__dirname + '/../activity-data.json') ?
    JSON.parse(fs.readFileSync(__dirname + '/../activity-data.json', 'utf8')) : {};
  const now = new Date();
  const allMembers = await guild.members.fetch();
  let arr = [];
  for (const member of allMembers.values()) {
    if (!member.roles.cache.has(NEWBIE_ROLE_ID)) continue;
    if (!member.joinedAt || (now - member.joinedAt) / (1000 * 60 * 60 * 24) < days) continue;
    const userData = activityData[member.id];
    let lastDate = null;
    if (userData) lastDate = getMostRecentDate(userData);
    if (!lastDate || (now - lastDate) / (1000 * 60 * 60 * 24) >= days) {
      arr.push({
        id: member.id,
        tag: `<@${member.id}>`,
        user: member.user,
        nickname: member.displayName,
        joined: member.joinedAt,
        lastActive: lastDate,
        warned: !!warnedObj[member.id]
      });
    }
  }
  return arr;
}

async function fetchNoGameRoleMembers(guild) {
  const allMembers = await guild.members.fetch();

  // 키워드가 포함된 역할들만 추출
  const rolesWithKeywords = guild.roles.cache.filter(r =>
    ROLE_KEYWORDS.some(keyword => r.name.toLowerCase().includes(keyword.toLowerCase()))
  );

  let arr = [];
  for (const member of allMembers.values()) {
    if (member.user.bot) continue;
    if (!member.roles.cache.has(GAME_MEMBER_ROLE_ID)) continue;

    // 해당 역할 중 1개라도 있으면 필터링 대상에서 제외
    let hasAny = false;
    for (const role of rolesWithKeywords.values()) {
      if (member.roles.cache.has(role.id)) {
        hasAny = true;
        break;
      }
    }
    if (!hasAny) {
      arr.push({
        id: member.id,
        tag: `<@${member.id}>`,
        user: member.user,
        nickname: member.displayName,
      });
    }
  }
  return arr;
}

// [여기 추가] 게임 미선택 유저용 임베드 생성
function getGameRoleEmbeds(list, page) {
  const totalPages = Math.ceil(list.length / PAGE_SIZE) || 1;
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, list.length);
  const users = list.slice(start, end);
  const embed = new EmbedBuilder()
    .setTitle(`게임 미선택 유저 (총 ${list.length}명)`)
    .setDescription(users.length === 0 ? '해당되는 유저가 없습니다.' : users.map((u, i) =>
      `${start + i + 1}. ${u.tag} | \`${u.id}\` | ${u.nickname}`
    ).join('\n'))
    .setFooter({ text: `${page + 1} / ${totalPages}` })
    .setColor('#3498db');
  return [embed];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('고급관리')
    .setDescription('필수옵션: [장기 미접속 유저, 비활동 신규 유저, 게임 미선택 유저]')
    .addStringOption(opt =>
      opt.setName('필수옵션')
        .setDescription('관리 항목 선택')
        .setRequired(true)
        .addChoices(
          { name: '장기 미접속 유저', value: 'long' },
          { name: '비활동 신규 유저', value: 'newbie' },
          { name: '게임 미선택 유저', value: 'nogame' },
        )
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    const option = interaction.options.getString('필수옵션');
    let userList = [];
    let title = '';
    let defaultDays = option === 'long' ? LONG_INACTIVE_DAYS : NEWBIE_DAYS;
    let selectedDays = defaultDays;
    let warnedObj = readWarnHistory();
    let page = 0;

    // 기존 셀렉트(비활동 기간) row
    const makePeriodRow = (disabled = false) =>
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('period')
          .setPlaceholder(`비활동 기간(일) 선택`)
          .setDisabled(disabled)
          .addOptions(PERIODS.map(p => ({
            label: p.label,
            value: p.value,
            default: String(selectedDays) === p.value
          })))
      );

    // 기존 버튼 row
    const makeRow = (disabled = false) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('prev').setLabel('이전').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page === 0),
      new ButtonBuilder().setCustomId('refresh').setLabel('새로고침').setStyle(ButtonStyle.Primary).setDisabled(disabled),
      new ButtonBuilder().setCustomId('next').setLabel('다음').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page >= Math.ceil(userList.length / PAGE_SIZE) - 1),
      new ButtonBuilder().setCustomId('kick').setLabel('전체 추방').setStyle(ButtonStyle.Danger).setDisabled(disabled || option === 'nogame'),
      new ButtonBuilder().setCustomId('warn').setLabel('전체 경고 DM').setStyle(ButtonStyle.Success).setDisabled(disabled || option === 'nogame'),
      // [게임 미선택 유저용 버튼]
      ...(option === 'nogame' ? [
        new ButtonBuilder().setCustomId('steamtag').setLabel('전체 임의 태그 부여').setStyle(ButtonStyle.Success).setDisabled(disabled)
      ] : [])
    );

    // 신규 게임 미선택 유저 버튼 로직 (별도로)
    const makeGameRow = (disabled = false) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('prev').setLabel('이전').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page === 0),
      new ButtonBuilder().setCustomId('refresh').setLabel('새로고침').setStyle(ButtonStyle.Primary).setDisabled(disabled),
      new ButtonBuilder().setCustomId('next').setLabel('다음').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page >= Math.ceil(userList.length / PAGE_SIZE) - 1),
      new ButtonBuilder().setCustomId('steamtag').setLabel('전체 임의 태그 부여').setStyle(ButtonStyle.Success).setDisabled(disabled)
    );

    // 리스트 추출
    if (option === 'long') {
      title = '장기 미접속 유저';
      const getUserList = async () => {
        warnedObj = readWarnHistory();
        return await fetchLongInactive(guild, selectedDays, warnedObj);
      };
      userList = await getUserList();
    } else if (option === 'newbie') {
      title = '비활동 신규 유저';
      const getUserList = async () => {
        warnedObj = readWarnHistory();
        return await fetchInactiveNewbies(guild, selectedDays, warnedObj);
      };
      userList = await getUserList();
    } else if (option === 'nogame') {
      title = '게임 미선택 유저';
      userList = await fetchNoGameRoleMembers(guild);
    }

    let embeds;
    if (option === 'nogame') {
      embeds = getGameRoleEmbeds(userList, page);
    } else {
      const getEmbeds = (list, page, title, days) => {
        const embeds = [];
        const totalPages = Math.ceil(list.length / PAGE_SIZE) || 1;
        const start = page * PAGE_SIZE;
        const end = Math.min(start + PAGE_SIZE, list.length);
        const users = list.slice(start, end);
        const embed = new EmbedBuilder()
          .setTitle(`${title} (총 ${list.length}명) [비활동 기준 ${days}일]`)
          .setDescription(users.length === 0 ? '해당되는 유저가 없습니다.' : users.map((u, i) =>
            `${start + i + 1}. ${u.tag} | \`${u.id}\` | ${u.nickname} | ${formatTimeAgo(u.lastActive)}${u.warned ? " ⚠️경고DM발송됨" : ""}`
          ).join('\n'))
          .setFooter({ text: `${page + 1} / ${totalPages}` })
          .setColor('#ffab00');
        embeds.push(embed);
        return embeds;
      };
      embeds = getEmbeds(userList, page, title, selectedDays);
    }

    const msg = await interaction.editReply({
      embeds,
      components: [option === 'nogame' ? makeGameRow() : makeRow(), ...(option === 'long' || option === 'newbie' ? [makePeriodRow()] : [])],
      ephemeral: true
    });

    const filter = i => i.user.id === interaction.user.id && i.message.id === msg.id;

    const collector = msg.createMessageComponentCollector({
      filter,
      time: 120000,
      componentType: ComponentType.Button
    });

    const selectCollector = msg.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id && i.message.id === msg.id && i.componentType === ComponentType.StringSelect,
      time: 120000,
      componentType: ComponentType.StringSelect
    });

    collector.on('collect', async i => {
      try {
        if (i.customId === 'prev') {
          page = Math.max(page - 1, 0);
        } else if (i.customId === 'next') {
          page = Math.min(page + 1, Math.ceil(userList.length / PAGE_SIZE) - 1);
        } else if (i.customId === 'refresh') {
          if (option === 'nogame') {
            userList = await fetchNoGameRoleMembers(guild);
            page = 0;
            embeds = getGameRoleEmbeds(userList, page);
            await i.update({ embeds, components: [makeGameRow()], ephemeral: true });
            collector.resetTimer();
            return;
          } else if (option === 'long') {
            warnedObj = readWarnHistory();
            userList = await fetchLongInactive(guild, selectedDays, warnedObj);
          } else if (option === 'newbie') {
            warnedObj = readWarnHistory();
            userList = await fetchInactiveNewbies(guild, selectedDays, warnedObj);
          }
        } else if (i.customId === 'kick' && (option === 'long' || option === 'newbie')) {
          await i.deferUpdate();
          let kicked = 0;
          for (const u of userList) {
            if (!u.warned) continue;
            try {
              const m = await guild.members.fetch(u.id).catch(() => null);
              if (m) await m.kick(`고급관리 - ${title} 일괄 추방`);
              kicked++;
            } catch { }
          }
          await interaction.followUp({ content: `${kicked}명 추방 완료!`, ephemeral: true });
        } else if (i.customId === 'warn' && (option === 'long' || option === 'newbie')) {
          await i.deferUpdate();
          let warned = 0;
          warnedObj = readWarnHistory();
          for (const u of userList) {
            if (warnedObj[u.id]) continue;
            try {
              const m = await guild.members.fetch(u.id).catch(() => null);
              if (m) {
                await m.send(`⚠️ [${guild.name}] 장기 미접속/비활동 상태로 추방될 수 있습니다. 활동이 필요합니다.`).catch(() => null);
                warnedObj[u.id] = { ts: Date.now() };
                warned++;
              }
            } catch { }
          }
          saveWarnHistory(warnedObj);
          if (option === 'long') {
            userList = await fetchLongInactive(guild, selectedDays, warnedObj);
          } else if (option === 'newbie') {
            userList = await fetchInactiveNewbies(guild, selectedDays, warnedObj);
          }
          embeds = getGameRoleEmbeds(userList, page);
          await interaction.followUp({ content: `${warned}명에게 DM 발송 완료!`, ephemeral: true });
          embeds = (option === 'nogame') ? getGameRoleEmbeds(userList, page) : embeds;
          await msg.edit({ embeds, components: [option === 'nogame' ? makeGameRow(true) : makeRow(true), ...(option === 'long' || option === 'newbie' ? [makePeriodRow(true)] : [])] });
        } else if (i.customId === 'steamtag' && option === 'nogame') {
          await i.deferUpdate();
          let tagged = 0;
          for (const u of userList) {
            try {
              const m = await guild.members.fetch(u.id).catch(() => null);
              if (m && !m.roles.cache.has(STEAM_TAG_ROLE_ID)) {
                await m.roles.add(STEAM_TAG_ROLE_ID, '고급관리 - 게임 미선택 유저 자동 태그');
                await m.send('💡 [까리한 디스코드] 게임 태그가 하나도 없는 유저로 확인됩니다. 임의로 스팀게임 태그가 부여됩니다.').catch(() => null);
                tagged++;
              }
            } catch { }
          }
          userList = await fetchNoGameRoleMembers(guild); // 최신화
          embeds = getGameRoleEmbeds(userList, page);
          await interaction.followUp({ content: `${tagged}명에게 임의 태그 부여 및 DM 안내 완료!`, ephemeral: true });
          await msg.edit({ embeds, components: [makeGameRow()], ephemeral: true });
        }
        // 페이지네이션/새로고침
        if (option === 'nogame') {
          embeds = getGameRoleEmbeds(userList, page);
          await i.update({ embeds, components: [makeGameRow()], ephemeral: true });
        } else {
          const getEmbeds = (list, page, title, days) => {
            const embeds = [];
            const totalPages = Math.ceil(list.length / PAGE_SIZE) || 1;
            const start = page * PAGE_SIZE;
            const end = Math.min(start + PAGE_SIZE, list.length);
            const users = list.slice(start, end);
            const embed = new EmbedBuilder()
              .setTitle(`${title} (총 ${list.length}명) [비활동 기준 ${days}일]`)
              .setDescription(users.length === 0 ? '해당되는 유저가 없습니다.' : users.map((u, i) =>
                `${start + i + 1}. ${u.tag} | \`${u.id}\` | ${u.nickname} | ${formatTimeAgo(u.lastActive)}${u.warned ? " ⚠️경고DM발송됨" : ""}`
              ).join('\n'))
              .setFooter({ text: `${page + 1} / ${totalPages}` })
              .setColor('#ffab00');
            embeds.push(embed);
            return embeds;
          };
          embeds = getEmbeds(userList, page, title, selectedDays);
          await i.update({ embeds, components: [makeRow(), makePeriodRow()], ephemeral: true });
        }
        collector.resetTimer();
      } catch (err) { }
    });

    selectCollector.on('collect', async i => {
      try {
        const value = i.values[0];
        selectedDays = parseInt(value, 10);
        if (option === 'long') {
          warnedObj = readWarnHistory();
          userList = await fetchLongInactive(guild, selectedDays, warnedObj);
        } else if (option === 'newbie') {
          warnedObj = readWarnHistory();
          userList = await fetchInactiveNewbies(guild, selectedDays, warnedObj);
        }
        page = 0;
        const getEmbeds = (list, page, title, days) => {
          const embeds = [];
          const totalPages = Math.ceil(list.length / PAGE_SIZE) || 1;
          const start = page * PAGE_SIZE;
          const end = Math.min(start + PAGE_SIZE, list.length);
          const users = list.slice(start, end);
          const embed = new EmbedBuilder()
            .setTitle(`${title} (총 ${list.length}명) [비활동 기준 ${days}일]`)
            .setDescription(users.length === 0 ? '해당되는 유저가 없습니다.' : users.map((u, i) =>
              `${start + i + 1}. ${u.tag} | \`${u.id}\` | ${u.nickname} | ${formatTimeAgo(u.lastActive)}${u.warned ? " ⚠️경고DM발송됨" : ""}`
            ).join('\n'))
            .setFooter({ text: `${page + 1} / ${totalPages}` })
            .setColor('#ffab00');
          embeds.push(embed);
          return embeds;
        };
        embeds = getEmbeds(userList, page, title, selectedDays);
        await i.update({ embeds, components: [makeRow(), makePeriodRow()], ephemeral: true });
        collector.resetTimer();
        selectCollector.resetTimer();
      } catch (err) { }
    });

    collector.on('end', async () => {
      try {
        if (option === 'nogame') {
          await msg.edit({ components: [makeGameRow(true)] });
        } else {
          await msg.edit({ components: [makeRow(true), makePeriodRow(true)] });
        }
      } catch { }
    });
    selectCollector.on('end', async () => {
      try {
        if (option === 'nogame') {
          await msg.edit({ components: [makeGameRow(true)] });
        } else {
          await msg.edit({ components: [makeRow(true), makePeriodRow(true)] });
        }
      } catch { }
    });
  }
};
