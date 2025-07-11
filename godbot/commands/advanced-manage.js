const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ComponentType,
  StringSelectMenuBuilder,
  Events,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const LONG_INACTIVE_DAYS = 90;
const NEWBIE_ROLE_ID = '1295701019430227988';
const NEWBIE_DAYS = 7;
const PAGE_SIZE = 30;
const EXEMPT_ROLE_IDS = ['1371476512024559756'];
const LOG_CHANNEL_ID = '1380874052855529605';

const WARN_HISTORY_PATH = path.join(__dirname, '../data/warn-history.json');
const VOICE_NOTIFY_PATH = path.join(__dirname, '../data/voice-notify.json');

const PERIODS = [
  { label: '1일', value: '1' },
  { label: '7일', value: '7' },
  { label: '14일', value: '14' },
  { label: '30일', value: '30' },
  { label: '60일', value: '60' },
  { label: '90일', value: '90' }
];

// ====== 음성채널 자동이동 관련 ======
let voiceAutoEnabled = false;
const voiceAutoTimers = new Map();
const VOICE_AUTO_CATEGORY_IDS = [
  '1207980297854124032',
  '1273762376889532426',
  '1369008627045765173'
];
const VOICE_AUTO_MOVE_CHANNEL_ID = '1202971727915651092';
const VOICE_AUTO_NOTICE_CHANNEL_ID = '1202971727915651092';
const VOICE_AUTO_MINUTES = 60;
let voiceAutoListenerRegistered = false;
function setupVoiceAutoListener(client) {
  if (voiceAutoListenerRegistered) return;
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    if (!voiceAutoEnabled) return;
    const member = newState.member || oldState.member;
    const channel = newState.channel || oldState.channel;
    if (!channel || !VOICE_AUTO_CATEGORY_IDS.includes(channel.parentId)) {
      if (voiceAutoTimers.has(member.id)) voiceAutoTimers.delete(member.id);
      return;
    }
    const members = channel.members.filter(m => !m.user.bot);
    if (members.size === 1) {
      if (!voiceAutoTimers.has(member.id)) {
        voiceAutoTimers.set(member.id, setTimeout(async () => {
          if (channel.members.filter(m => !m.user.bot).size === 1) {
            try {
              await member.voice.setChannel(VOICE_AUTO_MOVE_CHANNEL_ID, `장시간 혼자 대기 자동 이동`);
              const noticeChannel = member.guild.channels.cache.get(VOICE_AUTO_NOTICE_CHANNEL_ID)
                || member.guild.systemChannel;
              if (noticeChannel) {
                noticeChannel.send({
                  content: `\`${member.displayName}\`님, 음성채널에 장시간 혼자 머물러 계셔서 자동으로 이동되었습니다.`
                });
              }
            } catch (e) {}
          }
          voiceAutoTimers.delete(member.id);
        }, VOICE_AUTO_MINUTES * 60 * 1000));
      }
    } else {
      if (voiceAutoTimers.has(member.id)) {
        clearTimeout(voiceAutoTimers.get(member.id));
        voiceAutoTimers.delete(member.id);
      }
    }
  });
  voiceAutoListenerRegistered = true;
}
// ====================================

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

// ====== 음성알림 관련 ======
function loadVoiceNotify() {
  if (!fs.existsSync(VOICE_NOTIFY_PATH)) fs.writeFileSync(VOICE_NOTIFY_PATH, '{}');
  return JSON.parse(fs.readFileSync(VOICE_NOTIFY_PATH, 'utf8'));
}
function saveVoiceNotify(data) {
  fs.writeFileSync(VOICE_NOTIFY_PATH, JSON.stringify(data, null, 2));
}
// ==========================

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

function getUserDisplay(arr) {
  if (!arr.length) return '없음';
  if (arr.length <= 30) return arr.map(u => `${u.nickname} (\`${u.id}\`)`).join('\n');
  return arr.slice(0, 30).map(u => `${u.nickname} (\`${u.id}\`)`).join('\n') + `\n...외 ${arr.length - 30}명`;
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('고급관리')
    .setDescription('서버 관리 기능을 한 번에!')
    .addStringOption(opt =>
      opt.setName('필수옵션')
        .setDescription('관리 항목 선택')
        .setRequired(true)
        .addChoices(
          { name: '장기 미접속 유저', value: 'long' },
          { name: '비활동 신규 유저', value: 'newbie' },
          { name: '음성채널 알림 설정', value: 'voice_notify' },
          { name: '음성채널 자동이동 설정', value: 'voice_auto' }
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

    // ===== 음성채널 알림/자동이동 설정 기능 분기 =====
    if (option === 'voice_notify') {
      const notifyData = loadVoiceNotify();
      const guildId = interaction.guildId;
      const isOn = !!notifyData[guildId];
      const embed = new EmbedBuilder()
        .setTitle('음성채널 입장/퇴장 알림 설정')
        .setDescription(
          `현재 상태: **${isOn ? 'ON' : 'OFF'}**\n\n` +
          `- 음성채널 입장/퇴장 시 알림 메시지가 서버에 전송됩니다.\n` +
          `- 버튼을 클릭해 ON/OFF 전환이 가능합니다.`
        )
        .setColor(isOn ? 0x43b581 : 0xff5555);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('notify_on').setLabel('ON').setStyle(ButtonStyle.Success).setDisabled(isOn),
        new ButtonBuilder().setCustomId('notify_off').setLabel('OFF').setStyle(ButtonStyle.Danger).setDisabled(!isOn)
      );
      const msg = await interaction.editReply({ embeds: [embed], components: [row], ephemeral: true });

      const filter = i => i.user.id === interaction.user.id && i.message.id === msg.id;
      const collector = msg.createMessageComponentCollector({ filter, time: 60000 });
      collector.on('collect', async i => {
        const newOn = i.customId === 'notify_on';
        notifyData[guildId] = newOn;
        saveVoiceNotify(notifyData);
        await i.update({
          embeds: [
            new EmbedBuilder()
              .setTitle('음성채널 입장/퇴장 알림 설정')
              .setDescription(
                `현재 상태: **${newOn ? 'ON' : 'OFF'}**\n\n` +
                `- 음성채널 입장/퇴장 시 알림 메시지가 서버에 전송됩니다.\n` +
                `- 버튼을 클릭해 ON/OFF 전환이 가능합니다.`
              )
              .setColor(newOn ? 0x43b581 : 0xff5555)
          ],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('notify_on').setLabel('ON').setStyle(ButtonStyle.Success).setDisabled(newOn),
            new ButtonBuilder().setCustomId('notify_off').setLabel('OFF').setStyle(ButtonStyle.Danger).setDisabled(!newOn)
          )],
          ephemeral: true
        });
      });
      return;
    }

    if (option === 'voice_auto') {
      const embed = new EmbedBuilder()
        .setTitle('음성채널 장시간 1인 자동이동 설정')
        .setDescription(
          `현재 상태: **${voiceAutoEnabled ? 'ON' : 'OFF'}**\n\n` +
          `- 감시 카테고리 내에서 1명이 60분 이상 혼자 있으면 자동으로 지정 채널로 이동합니다.\n` +
          `- 버튼을 클릭해 ON/OFF 전환이 가능합니다.`
        )
        .setColor(voiceAutoEnabled ? 0x43b581 : 0xff5555);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('auto_on').setLabel('ON').setStyle(ButtonStyle.Success).setDisabled(voiceAutoEnabled),
        new ButtonBuilder().setCustomId('auto_off').setLabel('OFF').setStyle(ButtonStyle.Danger).setDisabled(!voiceAutoEnabled)
      );
      const msg = await interaction.editReply({ embeds: [embed], components: [row], ephemeral: true });

      setupVoiceAutoListener(interaction.client);

      const filter = i => i.user.id === interaction.user.id && i.message.id === msg.id;
      const collector = msg.createMessageComponentCollector({ filter, time: 60000 });
      collector.on('collect', async i => {
        voiceAutoEnabled = i.customId === 'auto_on';
        if (!voiceAutoEnabled) {
          for (const t of voiceAutoTimers.values()) clearTimeout(t);
          voiceAutoTimers.clear();
        }
        await i.update({
          embeds: [
            new EmbedBuilder()
              .setTitle('음성채널 장시간 1인 자동이동 설정')
              .setDescription(
                `현재 상태: **${voiceAutoEnabled ? 'ON' : 'OFF'}**\n\n` +
                `- 감시 카테고리 내에서 1명이 60분 이상 혼자 있으면 자동으로 지정 채널로 이동합니다.\n` +
                `- 버튼을 클릭해 ON/OFF 전환이 가능합니다.`
              )
              .setColor(voiceAutoEnabled ? 0x43b581 : 0xff5555)
          ],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('auto_on').setLabel('ON').setStyle(ButtonStyle.Success).setDisabled(voiceAutoEnabled),
            new ButtonBuilder().setCustomId('auto_off').setLabel('OFF').setStyle(ButtonStyle.Danger).setDisabled(!voiceAutoEnabled)
          )],
          ephemeral: true
        });
      });
      return;
    }
    // ============ 기존 기능(유저 목록) ============
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
    }

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

    let embeds = getEmbeds(userList, page, title, selectedDays);

    const msg = await interaction.editReply({
      embeds,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('prev').setLabel('이전').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId('refresh').setLabel('새로고침').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('next').setLabel('다음').setStyle(ButtonStyle.Secondary).setDisabled(page >= Math.ceil(userList.length / PAGE_SIZE) - 1),
          new ButtonBuilder().setCustomId('kick').setLabel('전체 추방').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('warn').setLabel('전체 경고 DM').setStyle(ButtonStyle.Success)
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('period')
            .setPlaceholder(`비활동 기간(일) 선택`)
            .addOptions(PERIODS.map(p => ({
              label: p.label,
              value: p.value,
              default: String(selectedDays) === p.value
            })))
        ),
      ],
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
          if (option === 'long') {
            warnedObj = readWarnHistory();
            userList = await fetchLongInactive(guild, selectedDays, warnedObj);
          } else if (option === 'newbie') {
            warnedObj = readWarnHistory();
            userList = await fetchInactiveNewbies(guild, selectedDays, warnedObj);
          }
        } else if (i.customId === 'kick') {
          await i.deferUpdate();
          let kicked = 0;
          let kickedList = [];
          for (const u of userList) {
            if (!u.warned) continue;
            try {
              const m = await guild.members.fetch(u.id).catch(() => null);
              if (m) {
                await m.kick(`고급관리 - ${title} 일괄 추방`);
                kicked++;
                kickedList.push({ nickname: u.nickname, id: u.id });
              }
            } catch { }
          }
          const kickTitle = option === 'long' ? '장기 미접속 유저 일괄 추방' : '비활동 신규 유저 일괄 추방';
          const kickDesc =
            `관리자: <@${interaction.user.id}>\n` +
            `기준: ${option === 'long' ? '장기 미접속 유저' : '비활동 신규 유저'}\n` +
            `비활동 일수: ${selectedDays}일\n` +
            `전체 대상: ${userList.filter(u => u.warned).length}명\n` +
            `추방 성공: ${kicked}명`;

          const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setTitle(kickTitle)
              .setDescription(kickDesc)
              .setColor('#c0392b')
              .setTimestamp();
            if (kickedList.length)
              logEmbed.addFields({
                name: `추방 닉네임(ID) [${kickedList.length}명]`,
                value: getUserDisplay(kickedList)
              });
            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
          }
          await interaction.followUp({ content: `${kicked}명 추방 완료!`, ephemeral: true });
        } else if (i.customId === 'warn') {
          await i.deferUpdate();
          let warned = 0, failed = [];
          let warnedList = [];
          warnedObj = readWarnHistory();
          for (const u of userList) {
            if (warnedObj[u.id]) continue;
            try {
              const m = await guild.members.fetch(u.id).catch(() => null);
              if (m) {
                await m.send(`⚠️ [${guild.name}] 장기 미접속/비활동 상태로 추방될 수 있습니다. 활동이 필요합니다.`)
                  .catch(() => { failed.push({ id: u.id, nickname: u.nickname }); });
                warnedObj[u.id] = { ts: Date.now() };
                warned++;
                warnedList.push({ nickname: u.nickname, id: u.id });
                await new Promise(res => setTimeout(res, 1200));
              }
            } catch {
              failed.push({ id: u.id, nickname: u.nickname });
            }
          }
          saveWarnHistory(warnedObj);
          if (option === 'long') {
            userList = await fetchLongInactive(guild, selectedDays, warnedObj);
          } else if (option === 'newbie') {
            userList = await fetchInactiveNewbies(guild, selectedDays, warnedObj);
          }
          embeds = getEmbeds(userList, page, title, selectedDays);

          const warnTitle = option === 'long' ? '장기 미접속 유저 경고 DM' : '비활동 신규 유저 경고 DM';
          const warnDesc =
            `관리자: <@${interaction.user.id}>\n` +
            `기준: ${option === 'long' ? '장기 미접속 유저' : '비활동 신규 유저'}\n` +
            `비활동 일수: ${selectedDays}일\n` +
            `전체 대상: ${warned + failed.length}명\n` +
            `DM 성공: ${warned}명 / 실패: ${failed.length}명`;

          const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setTitle(warnTitle)
              .setDescription(warnDesc)
              .setColor('#e67e22')
              .setTimestamp();
            if (warnedList.length)
              logEmbed.addFields({
                name: `성공 닉네임(ID) [${warnedList.length}명]`,
                value: getUserDisplay(warnedList)
              });
            if (failed.length)
              logEmbed.addFields({
                name: `실패 닉네임(ID) [${failed.length}명]`,
                value: getUserDisplay(failed)
              });
            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
          }

          let resultMsg = `✅ DM 발송: ${warned}명 / 실패: ${failed.length}명`;
          if (failed.length > 0) {
            resultMsg += "\n\n❌ 실패 닉네임(ID):\n";
            resultMsg += getUserDisplay(failed);
          }
          await interaction.followUp({ content: resultMsg, ephemeral: true });
          await msg.edit({ embeds, components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('prev').setLabel('이전').setStyle(ButtonStyle.Secondary).setDisabled(true),
              new ButtonBuilder().setCustomId('refresh').setLabel('새로고침').setStyle(ButtonStyle.Primary).setDisabled(true),
              new ButtonBuilder().setCustomId('next').setLabel('다음').setStyle(ButtonStyle.Secondary).setDisabled(true),
              new ButtonBuilder().setCustomId('kick').setLabel('전체 추방').setStyle(ButtonStyle.Danger).setDisabled(true),
              new ButtonBuilder().setCustomId('warn').setLabel('전체 경고 DM').setStyle(ButtonStyle.Success).setDisabled(true)
            ),
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('period')
                .setPlaceholder(`비활동 기간(일) 선택`)
                .setDisabled(true)
                .addOptions(PERIODS.map(p => ({
                  label: p.label,
                  value: p.value,
                  default: String(selectedDays) === p.value
                })))
            ),
          ] });
        }
        embeds = getEmbeds(userList, page, title, selectedDays);
        await i.update({ embeds, components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prev').setLabel('이전').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId('refresh').setLabel('새로고침').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('next').setLabel('다음').setStyle(ButtonStyle.Secondary).setDisabled(page >= Math.ceil(userList.length / PAGE_SIZE) - 1),
            new ButtonBuilder().setCustomId('kick').setLabel('전체 추방').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('warn').setLabel('전체 경고 DM').setStyle(ButtonStyle.Success)
          ),
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('period')
              .setPlaceholder(`비활동 기간(일) 선택`)
              .addOptions(PERIODS.map(p => ({
                label: p.label,
                value: p.value,
                default: String(selectedDays) === p.value
              })))
          ),
        ], ephemeral: true });
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
        embeds = getEmbeds(userList, page, title, selectedDays);
        await i.update({ embeds, components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prev').setLabel('이전').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId('refresh').setLabel('새로고침').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('next').setLabel('다음').setStyle(ButtonStyle.Secondary).setDisabled(page >= Math.ceil(userList.length / PAGE_SIZE) - 1),
            new ButtonBuilder().setCustomId('kick').setLabel('전체 추방').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('warn').setLabel('전체 경고 DM').setStyle(ButtonStyle.Success)
          ),
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('period')
              .setPlaceholder(`비활동 기간(일) 선택`)
              .addOptions(PERIODS.map(p => ({
                label: p.label,
                value: p.value,
                default: String(selectedDays) === p.value
              })))
          ),
        ], ephemeral: true });
        collector.resetTimer();
        selectCollector.resetTimer();
      } catch (err) { }
    });

    collector.on('end', async () => {
      try {
        await msg.edit({ components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prev').setLabel('이전').setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('refresh').setLabel('새로고침').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('next').setLabel('다음').setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('kick').setLabel('전체 추방').setStyle(ButtonStyle.Danger).setDisabled(true),
            new ButtonBuilder().setCustomId('warn').setLabel('전체 경고 DM').setStyle(ButtonStyle.Success).setDisabled(true)
          ),
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('period')
              .setPlaceholder(`비활동 기간(일) 선택`)
              .setDisabled(true)
              .addOptions(PERIODS.map(p => ({
                label: p.label,
                value: p.value,
                default: String(selectedDays) === p.value
              })))
          ),
        ] });
      } catch { }
    });
    selectCollector.on('end', async () => {
      try {
        await msg.edit({ components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prev').setLabel('이전').setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('refresh').setLabel('새로고침').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('next').setLabel('다음').setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('kick').setLabel('전체 추방').setStyle(ButtonStyle.Danger).setDisabled(true),
            new ButtonBuilder().setCustomId('warn').setLabel('전체 경고 DM').setStyle(ButtonStyle.Success).setDisabled(true)
          ),
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('period')
              .setPlaceholder(`비활동 기간(일) 선택`)
              .setDisabled(true)
              .addOptions(PERIODS.map(p => ({
                label: p.label,
                value: p.value,
                default: String(selectedDays) === p.value
              })))
          ),
        ] });
      } catch { }
    });
  }
};
