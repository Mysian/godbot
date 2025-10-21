const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ComponentType,
  StringSelectMenuBuilder,
  Events,
  ChannelType,
  UserSelectMenuBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const LONG_INACTIVE_DAYS = 90;
const NEWBIE_ROLE_ID = '1295701019430227988';
const NEWBIE_DAYS = 7;
const PAGE_SIZE = 30;
const INACTIVE_THREAD_DAYS = 30;
const THREAD_PAGE_SIZE = 5;
const EXEMPT_ROLE_IDS = [
  '1371476512024559756',
  '1208987442234007582',
  '1207437971037356142',
  '1397076919127900171'
];
const LOG_CHANNEL_ID = '1380874052855529605';
const BOOSTER_ROLE_ID = '1207437971037356142';
const DONOR_ROLE_ID = '1397076919127900171';
const THREAD_PARENT_WHITELIST = [
  '1202425624061415464',
  '1209147973255036959'
];

const COLOR_ROLE_IDS = [
  '1294259058102239305', '1374740411662209085', '1296493619359780925',
  '1296628752742350848', '1296628913493114991', '1374740544298684456',
  '1374740211707150367', '1224021837038616626', '1296493760108040264',
  '1374740012784025600', '1374740162684391456', '1294259479474339912',
  '1296493906854285344'
];
let colorRoleInactiveOn = false;

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

let voiceAutoEnabled = false;
const voiceAutoTimers = new Map();
const VOICE_AUTO_CATEGORY_IDS = [
  '1207980297854124032',
  '1273762376889532426',
  '1369008627045765173'
];
const VOICE_AUTO_MOVE_CHANNEL_ID = '1202971727915651092';
const VOICE_AUTO_NOTICE_CHANNEL_ID = '1202971727915651092';
const VOICE_AUTO_MINUTES = 120;
let voiceAutoListenerRegistered = false;

function resetVoiceAutoTimer(member, channel) {
  if (voiceAutoTimers.has(member.id)) {
    clearTimeout(voiceAutoTimers.get(member.id));
    voiceAutoTimers.delete(member.id);
  }
  if (
    channel &&
    VOICE_AUTO_CATEGORY_IDS.includes(channel.parentId) &&
    channel.members.filter(m => !m.user.bot).size === 1
  ) {
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
}

const APPROVAL_SETTINGS_PATH = path.join(__dirname, '../data/approval-settings.json');
function loadApprovalToggle() {
  if (!fs.existsSync(APPROVAL_SETTINGS_PATH)) return { enabled: true };
  try { return JSON.parse(fs.readFileSync(APPROVAL_SETTINGS_PATH, 'utf8')); } catch { return { enabled: true }; }
}
function saveApprovalToggle(obj) {
  fs.writeFileSync(APPROVAL_SETTINGS_PATH, JSON.stringify(obj, null, 2));
}

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
        resetVoiceAutoTimer(member, channel);
      }
    } else {
      if (voiceAutoTimers.has(member.id)) {
        clearTimeout(voiceAutoTimers.get(member.id));
        voiceAutoTimers.delete(member.id);
      }
    }
  });
  const activityHandler = async (payload) => {
    let userId = null, member = null, guild = null, voiceChannel = null;
    if (payload.member && payload.member.voice && payload.member.voice.channel) {
      userId = payload.member.id;
      member = payload.member;
      voiceChannel = payload.member.voice.channel;
      guild = payload.guild;
    } else if (payload.user && payload.guild && payload.guild.members) {
      userId = payload.user.id;
      guild = payload.guild;
      member = await guild.members.fetch(userId).catch(() => null);
      if (member && member.voice && member.voice.channel) voiceChannel = member.voice.channel;
    } else if (payload.author && payload.guild && payload.guild.members) {
      userId = payload.author.id;
      guild = payload.guild;
      member = await guild.members.fetch(userId).catch(() => null);
      if (member && member.voice && member.voice.channel) voiceChannel = member.voice.channel;
    }
    if (member && voiceChannel && VOICE_AUTO_CATEGORY_IDS.includes(voiceChannel.parentId)) {
      if (voiceChannel.members.filter(m => !m.user.bot).size === 1) {
        resetVoiceAutoTimer(member, voiceChannel);
      }
    }
  };
  client.on('messageCreate', activityHandler);
  client.on('interactionCreate', activityHandler);
  client.on('messageReactionAdd', (reaction, user) => {
    if (user.bot) return;
    if (!reaction.message.guild) return;
    reaction.message.guild.members.fetch(user.id).then(member => {
      if (member && member.voice && member.voice.channel &&
        VOICE_AUTO_CATEGORY_IDS.includes(member.voice.channel.parentId)
      ) {
        if (member.voice.channel.members.filter(m => !m.user.bot).size === 1) {
          resetVoiceAutoTimer(member, member.voice.channel);
        }
      }
    });
  });
  voiceAutoListenerRegistered = true;
}

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

function loadVoiceNotify() {
  if (!fs.existsSync(VOICE_NOTIFY_PATH)) fs.writeFileSync(VOICE_NOTIFY_PATH, '{}');
  return JSON.parse(fs.readFileSync(VOICE_NOTIFY_PATH, 'utf8'));
}
function saveVoiceNotify(data) {
  fs.writeFileSync(VOICE_NOTIFY_PATH, JSON.stringify(data, null, 2));
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

function getUserDisplay(arr) {
  if (!arr.length) return '없음';
  if (arr.length <= 30) return arr.map(u => `${u.nickname} (\`${u.id}\`)`).join('\n');
  return arr.slice(0, 30).map(u => `${u.nickname} (\`${u.id}\`)`).join('\n') + `\n...외 ${arr.length - 30}명`;
}

async function fetchLongInactive(guild, days, warnedObj) {
  const activityData = fs.existsSync(__dirname + '/../activity-data.json')
    ? JSON.parse(fs.readFileSync(__dirname + '/../activity-data.json', 'utf8')) : {};
  const now = new Date();
  const allMembers = await guild.members.fetch();
  let arr = [];
  for (const member of allMembers.values()) {
    if (EXEMPT_ROLE_IDS.some(rid => member.roles.cache.has(rid))) continue;
    if (member.user.bot) continue;
    const userData = activityData[member.id];
    const isBooster = member.roles.cache.has(BOOSTER_ROLE_ID);
    const isDonor   = member.roles.cache.has(DONOR_ROLE_ID);
    if (!userData || !getMostRecentDate(userData)) {
      if (isBooster || isDonor) continue;
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
    const diffDays = (now - lastDate) / (1000 * 60 * 60 * 24);
    if (isDonor && diffDays >= 90) {
      arr.push({
        id: member.id,
        tag: `<@${member.id}>`,
        user: member.user,
        nickname: member.displayName,
        lastActive: lastDate,
        warned: !!warnedObj[member.id]
      });
      continue;
    }
    if (isBooster && diffDays >= 60) {
      arr.push({
        id: member.id,
        tag: `<@${member.id}>`,
        user: member.user,
        nickname: member.displayName,
        lastActive: lastDate,
        warned: !!warnedObj[member.id]
      });
      continue;
    }
    if (!isBooster && !isDonor && diffDays >= days) {
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
    if (EXEMPT_ROLE_IDS.some(rid => member.roles.cache.has(rid))) continue;
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

async function collectAllThreads(guild, allowedParentIds = THREAD_PARENT_WHITELIST, includePrivateArchived = false) {
  const channels = guild.channels.cache.filter(ch =>
    ch &&
    [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(ch.type) &&
    allowedParentIds.includes(ch.id)
  );

  const threads = [];
  const withTimeout = (p, ms = 8000) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
  ]);
  for (const ch of channels.values()) {
    if (!ch?.threads?.fetchActive) continue;
    try {
      const active = await withTimeout(ch.threads.fetchActive().catch(() => null));
      if (active?.threads?.size) threads.push(...active.threads.values());
    } catch (_) {}
    try {
      const archivedPub = await withTimeout(ch.threads.fetchArchived({ type: 'public', limit: 100 }).catch(() => null));
      if (archivedPub?.threads?.size) threads.push(...archivedPub.threads.values());
    } catch (_) {}
    if (includePrivateArchived) {
      try {
        const archivedPriv = await withTimeout(ch.reads.fetchArchived({ type: 'private', limit: 100 }).catch(() => null));
        if (archivedPriv?.threads?.size) threads.push(...archivedPriv.threads.values());
      } catch (_) {}
    }
  }
  const uniq = new Map();
  for (const t of threads) uniq.set(t.id, t);
  return Array.from(uniq.values());
}

function calcThreadLastActivity(thread) {
  const candidates = [
    thread.lastMessage?.createdTimestamp || null,
    thread.archiveTimestamp || (thread.archivedAt ? +thread.archivedAt : null) || null,
    thread.lastPinTimestamp || null,
    thread.createdTimestamp || null,
  ].filter(Boolean);
  if (!candidates.length) return 0;
  return Math.max(...candidates);
}
async function fetchInactiveThreads(guild, days = INACTIVE_THREAD_DAYS) {
  const now = Date.now();
  const all = await collectAllThreads(guild, THREAD_PARENT_WHITELIST, false);
  const result = [];
  for (const th of all) {
    const lastTs = calcThreadLastActivity(th);
    const diffDays = lastTs ? (now - lastTs) / (1000 * 60 * 60 * 24) : Infinity;
    if (diffDays >= days) {
      const parentName = th.parent?.name || '-';
      result.push({
        id: th.id,
        name: th.name || '(제목 없음)',
        url: th.url,
        parentId: th.parentId || '',
        parentName,
        lastTs,
        diffDays: Math.floor(diffDays),
      });
    }
  }
  result.sort((a, b) => a.lastTs - b.lastTs);
  return result;
}

function progressEmbed(title, total, success, failed) {
  const pct = total === 0 ? 100 : Math.floor(((success + failed) / total) * 100);
  const barLen = 20;
  const filled = Math.floor((pct / 100) * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(`진행률 ${pct}%\n${bar}\n성공 ${success} | 실패 ${failed} | 총 ${total}`)
    .setColor('#5865F2')
    .setTimestamp();
}

async function runWithConcurrency(items, concurrency, handler, onTick) {
  let idx = 0, inFlight = 0, done = 0;
  return await new Promise(resolve => {
    const launch = () => {
      while (inFlight < concurrency && idx < items.length) {
        const cur = items[idx++];
        inFlight++;
        Promise.resolve(handler(cur))
          .catch(() => {})
          .finally(() => {
            inFlight--;
            done++;
            if (onTick) onTick(done, items.length);
            if (done === items.length) resolve();
            else launch();
          });
      }
    };
    if (items.length === 0) resolve();
    else launch();
  });
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
          { name: '장기 미접속 유저(강제 처리)', value: 'long_force' },
          { name: '비활동 신규 유저', value: 'newbie' },
          { name: '입장절차 토글', value: 'approval_toggle' },
          { name: '음성채널 알림 설정', value: 'voice_notify' },
          { name: '음성채널 자동이동 설정', value: 'voice_auto' },
          { name: '세금누락 강제처리', value: 'tax_force' },
          { name: '30일 미접속 색상 칭호 해제', value: 'colorrole_inactive' },
          { name: '비활동 스레드 제거', value: 'thread_cleanup' }
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

    if (option === 'approval_toggle') {
  const cur = loadApprovalToggle();
  const isOn = !!cur.enabled;
  const embed = new EmbedBuilder()
    .setTitle('입장 절차 토글')
    .setDescription(`현재 상태: **${isOn ? 'ON' : 'OFF'}**\n\n- 새로 들어오는(또는 재입장) 유저의 '서버 입장 절차' 진행 여부를 제어합니다.\n- 버튼을 눌러 ON/OFF 전환하세요.`)
    .setColor(isOn ? 0x43b581 : 0xff5555);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('approval_on').setLabel('ON').setStyle(ButtonStyle.Success).setDisabled(isOn),
    new ButtonBuilder().setCustomId('approval_off').setLabel('OFF').setStyle(ButtonStyle.Danger).setDisabled(!isOn),
  );

  const msg = await interaction.editReply({ embeds: [embed], components: [row], ephemeral: true });
  const filter = i => i.user.id === interaction.user.id && i.message.id === msg.id;
  const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

  collector.on('collect', async i => {
    const newOn = i.customId === 'approval_on';
    saveApprovalToggle({ enabled: newOn });
    await i.update({
      embeds: [
        new EmbedBuilder()
          .setTitle('입장 절차 토글')
          .setDescription(`현재 상태: **${newOn ? 'ON' : 'OFF'}**\n\n- 새로 들어오는(또는 재입장) 유저의 '서버 입장 절차' 진행 여부를 제어합니다.\n- 버튼을 눌러 ON/OFF 전환하세요.`)
          .setColor(newOn ? 0x43b581 : 0xff5555)
      ],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('approval_on').setLabel('ON').setStyle(ButtonStyle.Success).setDisabled(newOn),
        new ButtonBuilder().setCustomId('approval_off').setLabel('OFF').setStyle(ButtonStyle.Danger).setDisabled(!newOn),
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
          `- 감시 카테고리 내에서 1명이 ${VOICE_AUTO_MINUTES}분 이상 혼자 있으면 자동으로 지정 채널로 이동합니다.\n` +
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
                `- 감시 카테고리 내에서 1명이 ${VOICE_AUTO_MINUTES}분 이상 혼자 있으면 자동으로 지정 채널로 이동합니다.\n` +
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

    if (option === 'tax_force') {
      await interaction.editReply({ content: '세금 누락 강제 처리 중...', ephemeral: true });
      const { collectTaxFromSnapshot, saveTaxSnapshot } = require('../utils/tax-collect.js');
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const SNAPSHOT_DIR = path.join(__dirname, '../data/');
      const filename = path.join(SNAPSHOT_DIR, `tax-snapshot-${dateStr}.json`);
      if (!fs.existsSync(filename)) {
        saveTaxSnapshot();
      }
      const result = await collectTaxFromSnapshot(interaction.client, dateStr);
      if (result?.error) {
        await interaction.followUp({ content: `❌ 스냅샷 파일 생성 후에도 에러! 관리자 문의 바람!`, ephemeral: true });
      } else {
        await interaction.followUp({ content: `💸 오늘 정수세 누락 강제징수 완료!\n총 세금: ${result.totalTax.toLocaleString('ko-KR')} BE`, ephemeral: true });
      }
      return;
    }

    if (option === 'colorrole_inactive') {
      const embed = new EmbedBuilder()
        .setTitle('30일 미접속 색상 칭호 해제')
        .setDescription(
          `현재 상태: **${colorRoleInactiveOn ? 'ON' : 'OFF'}**\n\n` +
          `- 색상 역할을 보유한 유저가 30일 이상 미접속이면 색상 칭호를 자동 해제합니다.\n` +
          `- 버튼을 클릭해 ON/OFF 전환이 가능합니다.\n` +
          `- 아래 '미접속 대상 미리보기' 버튼으로 현재 대상 유저를 확인할 수 있습니다.\n` +
          `- '대상 모두 칭호 해제' 버튼 클릭 시, 즉시 해제됩니다.`
        )
        .setColor(colorRoleInactiveOn ? 0x43b581 : 0xff5555);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('colorrole_on').setLabel('ON').setStyle(ButtonStyle.Success).setDisabled(colorRoleInactiveOn),
        new ButtonBuilder().setCustomId('colorrole_off').setLabel('OFF').setStyle(ButtonStyle.Danger).setDisabled(!colorRoleInactiveOn),
        new ButtonBuilder().setCustomId('colorrole_preview').setLabel('미접속 대상 미리보기').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('colorrole_remove').setLabel('대상 모두 칭호 해제').setStyle(ButtonStyle.Danger)
      );
      const msg = await interaction.editReply({ embeds: [embed], components: [row], ephemeral: true });
      const filter = i => i.user.id === interaction.user.id && i.message.id === msg.id;
      const collector = msg.createMessageComponentCollector({ filter, time: 60000 });
      collector.on('collect', async i => {
        if (i.customId === 'colorrole_on' || i.customId === 'colorrole_off') {
          colorRoleInactiveOn = i.customId === 'colorrole_on';
          await i.update({
            embeds: [
              new EmbedBuilder()
                .setTitle('30일 미접속 색상 칭호 해제')
                .setDescription(
                  `현재 상태: **${colorRoleInactiveOn ? 'ON' : 'OFF'}**\n\n` +
                  `- 색상 역할을 보유한 유저가 30일 이상 미접속이면 색상 칭호를 자동 해제합니다.\n` +
                  `- 버튼을 클릭해 ON/OFF 전환이 가능합니다.\n` +
                  `- 아래 '미접속 대상 미리보기' 버튼으로 현재 대상 유저를 확인할 수 있습니다.\n` +
                  `- '대상 모두 칭호 해제' 버튼 클릭 시, 즉시 해제됩니다.`
                )
                .setColor(colorRoleInactiveOn ? 0x43b581 : 0xff5555)
            ],
            components: [row],
            ephemeral: true
          });
        } else if (i.customId === 'colorrole_preview') {
          await i.deferReply({ ephemeral: true });
          const targetUsers = await fetchInactiveColorRoleUsers(guild, 30);
          if (targetUsers.length === 0) {
            await i.followUp({ content: '해당되는 유저가 없습니다!', ephemeral: true });
          } else {
            const userList = targetUsers.map(u => `${u.tag} | \`${u.id}\` | ${u.nickname} | ${formatTimeAgo(u.lastActive)}`).join('\n');
            await i.followUp({ content: `대상 유저 (${targetUsers.length}명):\n${userList}`, ephemeral: true });
          }
        } else if (i.customId === 'colorrole_remove') {
          await i.deferReply({ ephemeral: true });
          const targetUsers = await fetchInactiveColorRoleUsers(guild, 30);
          let success = 0, failed = 0;
          for (const u of targetUsers) {
            try {
              const m = await guild.members.fetch(u.id).catch(() => null);
              if (m) {
                for (const rid of COLOR_ROLE_IDS) {
                  if (m.roles.cache.has(rid)) {
                    await m.roles.remove(rid, '30일 미접속 색상 칭호 자동 해제');
                  }
                }
                success++;
              }
            } catch { failed++; }
          }
          await i.followUp({ content: `색상 칭호 해제 완료! 성공: ${success}명 / 실패: ${failed}명`, ephemeral: true });
        }
      });
      return;
    }

    if (option === 'long_force') {
      const embed = new EmbedBuilder()
        .setTitle('장기 미접속 유저(강제 처리)')
        .setDescription('대상 1명을 선택하면, DM 없이 즉시 강제 추방됩니다.')
        .setColor('#c0392b');
      const rowSelect = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder().setCustomId('lf_user').setPlaceholder('대상 유저 선택').setMinValues(1).setMaxValues(1)
      );
      const rowButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('lf_confirm').setLabel('강제 추방').setStyle(ButtonStyle.Danger).setDisabled(true),
        new ButtonBuilder().setCustomId('lf_cancel').setLabel('취소').setStyle(ButtonStyle.Secondary).setDisabled(false)
      );
      const msg = await interaction.editReply({ embeds: [embed], components: [rowSelect, rowButtons], ephemeral: true });
      let targetId = null;
      const filter = i => i.user.id === interaction.user.id && i.message.id === msg.id;
      const collector = msg.createMessageComponentCollector({ filter, time: 120000 });
      collector.on('collect', async i => {
        try {
          if (i.componentType === ComponentType.UserSelect && i.customId === 'lf_user') {
            targetId = i.values[0];
            const targetMention = `<@${targetId}>`;
            const picked = new EmbedBuilder()
              .setTitle('장기 미접속 유저(강제 처리)')
              .setDescription(`선택된 대상: ${targetMention}\n이 상태에서 [강제 추방]을 누르면 곧바로 추방됩니다.`)
              .setColor('#e74c3c');
            const enabledButtons = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('lf_confirm').setLabel('강제 추방').setStyle(ButtonStyle.Danger).setDisabled(false),
              new ButtonBuilder().setCustomId('lf_cancel').setLabel('취소').setStyle(ButtonStyle.Secondary).setDisabled(false)
            );
            await i.update({ embeds: [picked], components: [rowSelect, enabledButtons], ephemeral: true });
          } else if (i.componentType === ComponentType.Button && i.customId === 'lf_confirm') {
            await i.deferUpdate();
            if (!targetId) {
              await interaction.followUp({ content: '대상을 먼저 선택하세요.', ephemeral: true });
              return;
            }
            let ok = false;
            try {
              const m = await guild.members.fetch(targetId).catch(() => null);
              if (!m) throw new Error('notfound');
              await m.kick('고급관리 - 장기 미접속(강제 처리): DM 생략, 즉시 추방');
              ok = true;
            } catch {
              ok = false;
            }
            if (ok) {
              const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
              if (logChannel) {
                const logEmbed = new EmbedBuilder()
                  .setTitle('장기 미접속 유저 강제 추방')
                  .setDescription(
                    `관리자: <@${interaction.user.id}>\n` +
                    `대상: <@${targetId}> (\`${targetId}\`)\n` +
                    `처리: DM 생략 후 즉시 추방`
                  )
                  .setColor('#c0392b')
                  .setTimestamp();
                logChannel.send({ embeds: [logEmbed] }).catch(() => {});
              }
              await interaction.followUp({ content: `🛑 <@${targetId}> 강제 추방 완료`, ephemeral: true });
              try {
                await msg.edit({
                  components: [new ActionRowBuilder().addComponents(
                    new UserSelectMenuBuilder().setCustomId('lf_user').setPlaceholder('대상 유저 선택').setMinValues(1).setMaxValues(1).setDisabled(true)
                  ), new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('lf_confirm').setLabel('강제 추방').setStyle(ButtonStyle.Danger).setDisabled(true),
                    new ButtonBuilder().setCustomId('lf_cancel').setLabel('취소').setStyle(ButtonStyle.Secondary).setDisabled(true)
                  )]
                });
              } catch {}
              collector.stop('done');
            } else {
              await interaction.followUp({ content: '❌ 추방 실패. 권한 또는 대상 상태를 확인하세요.', ephemeral: true });
            }
          } else if (i.componentType === ComponentType.Button && i.customId === 'lf_cancel') {
            await i.update({
              embeds: [new EmbedBuilder().setTitle('장기 미접속 유저(강제 처리)').setDescription('취소되었습니다.').setColor('#95a5a6')],
              components: [new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder().setCustomId('lf_user').setPlaceholder('대상 유저 선택').setMinValues(1).setMaxValues(1).setDisabled(true)
              ), new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('lf_confirm').setLabel('강제 추방').setStyle(ButtonStyle.Danger).setDisabled(true),
                new ButtonBuilder().setCustomId('lf_cancel').setLabel('취소').setStyle(ButtonStyle.Secondary).setDisabled(true)
              )],
              ephemeral: true
            });
            collector.stop('cancel');
          }
        } catch {}
      });
      collector.on('end', async () => {
        try {
          await msg.edit({
            components: [new ActionRowBuilder().addComponents(
              new UserSelectMenuBuilder().setCustomId('lf_user').setPlaceholder('대상 유저 선택').setMinValues(1).setMaxValues(1).setDisabled(true)
            ), new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('lf_confirm').setLabel('강제 추방').setStyle(ButtonStyle.Danger).setDisabled(true),
              new ButtonBuilder().setCustomId('lf_cancel').setLabel('취소').setStyle(ButtonStyle.Secondary).setDisabled(true)
            )]
          });
        } catch {}
      });
      return;
    }

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

        if (option === 'thread_cleanup') {
  await interaction.editReply({ content: '🔎 비활동 스레드를 검색 중입니다…', ephemeral: true });
  let threads = await fetchInactiveThreads(guild, INACTIVE_THREAD_DAYS);
  let page = 0;

      const totalPages = () => Math.max(1, Math.ceil(threads.length / THREAD_PAGE_SIZE));
      const pageSlice = () => {
        const start = page * THREAD_PAGE_SIZE;
        return threads.slice(start, start + THREAD_PAGE_SIZE);
      };

      const buildEmbed = () => {
        const cur = pageSlice();
        const desc = cur.length
          ? cur.map((t, idx) =>
              `${page * THREAD_PAGE_SIZE + idx + 1}. [${t.name}](${t.url}) | \`${t.id}\` | #${t.parentName} | 마지막 활동 ${t.diffDays}일 전`
            ).join('\n')
          : '해당되는 스레드가 없습니다.';

        return new EmbedBuilder()
          .setTitle(`비활동 스레드 제거 (기준 ${INACTIVE_THREAD_DAYS}일)`)
          .setDescription(desc)
          .setFooter({ text: `${page + 1} / ${totalPages()} • 이 페이지에서 개별 삭제 또는 일괄 삭제가 가능합니다.` })
          .setColor(0x7289da);
      };

      const buildComponents = () => {
        const cur = pageSlice();
        const row1 = new ActionRowBuilder();
        cur.forEach(t => {
          row1.addComponents(
            new ButtonBuilder()
              .setCustomId(`thdel-${t.id}`)
              .setLabel(t.name?.slice(0, 20) || '삭제')
              .setStyle(ButtonStyle.Danger)
          );
        });

        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('th-prev').setLabel('이전').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId('th-refresh').setLabel('새로고침').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('th-next').setLabel('다음').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages() - 1),
          new ButtonBuilder().setCustomId('th-bulk').setLabel('이 페이지 5개 일괄 삭제').setStyle(ButtonStyle.Danger).setDisabled(cur.length === 0)
        );

        const rows = [];
        if (row1.components.length) rows.push(row1);
        rows.push(row2);
        return rows;
      };

      const msg = await interaction.editReply({
        embeds: [buildEmbed()],
        components: buildComponents(),
        ephemeral: true
      });

      const filter = i => i.user.id === interaction.user.id && i.message.id === msg.id;
      const collector = msg.createMessageComponentCollector({ filter, time: 120000 });

      collector.on('collect', async i => {
        try {
          if (i.customId === 'th-prev') {
            page = Math.max(0, page - 1);
            await i.update({ embeds: [buildEmbed()], components: buildComponents(), ephemeral: true });
          } else if (i.customId === 'th-next') {
            page = Math.min(totalPages() - 1, page + 1);
            await i.update({ embeds: [buildEmbed()], components: buildComponents(), ephemeral: true });
          } else if (i.customId === 'th-refresh') {
            threads = await fetchInactiveThreads(guild, INACTIVE_THREAD_DAYS);
            if (page >= totalPages()) page = Math.max(0, totalPages() - 1);
            await i.update({ embeds: [buildEmbed()], components: buildComponents(), ephemeral: true });
          } else if (i.customId === 'th-bulk') {
  await i.deferUpdate();

  const cur = pageSlice();
  const loading = await interaction.followUp({
    embeds: [progressEmbed('비활동 스레드 일괄 삭제 진행중', cur.length, 0, 0)],
    ephemeral: true,
    fetchReply: true
  });
  const editLoading = async (embed) => {
    try {
      await interaction.webhook.editMessage(loading.id, { embeds: [embed] });
    } catch (_) {}
  };

  let success = 0, failed = 0;
  const deletedList = [];

  for (const t of cur) {
    try {
      const th = await guild.channels.fetch(t.id).catch(() => null);
      if (!th) { failed++; await editLoading(progressEmbed('비활동 스레드 일괄 삭제 진행중', cur.length, success, failed)); continue; }
      await th.delete(`고급관리 - 비활동 스레드 제거(일괄)`);
      deletedList.push(t);
      success++;
    } catch {
      failed++;
    }
    await editLoading(progressEmbed('비활동 스레드 일괄 삭제 진행중', cur.length, success, failed));
  }
  const deletedIds = new Set(cur.map(t => t.id));
  threads = threads.filter(t => !deletedIds.has(t.id));
  if (page >= totalPages()) page = Math.max(0, totalPages() - 1);
  const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (logChannel) {
    const logEmbed = new EmbedBuilder()
      .setTitle('비활동 스레드 일괄 삭제')
      .setDescription(
        `관리자: <@${interaction.user.id}>\n` +
        `대상 스레드: ${cur.length}개\n` +
        `삭제 성공: ${success}개 / 실패: ${failed}개`
      )
      .setColor('#c0392b')
      .setTimestamp();

    if (deletedList.length) {
      const lines = deletedList
        .slice(0, 30)
        .map(t => `#${t.parentName} • ${t.name} (\`${t.id}\`) • 마지막 활동 ${t.diffDays}일 전`)
        .join('\n');
      logEmbed.addFields({ name: `삭제된 스레드 [${deletedList.length}개]`, value: lines + (deletedList.length > 30 ? `\n...외 ${deletedList.length - 30}개` : '') });
    }
    logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  }
  await editLoading(
    new EmbedBuilder()
      .setTitle('비활동 스레드 일괄 삭제 완료')
      .setDescription(`성공 ${success} | 실패 ${failed} | 총 ${cur.length}`)
      .setColor('#2ecc71')
      .setTimestamp()
  );
  await msg.edit({ embeds: [buildEmbed()], components: buildComponents() });
} else if (i.customId.startsWith('thdel-')) {
  const threadId = i.customId.slice('thdel-'.length);
  await i.deferUpdate();

  const meta = pageSlice().find(t => t.id === threadId) || threads.find(t => t.id === threadId);

  const loading = await interaction.followUp({
    embeds: [progressEmbed('스레드 삭제 진행중', 1, 0, 0)],
    ephemeral: true,
    fetchReply: true
  });
  const editLoading = async (embed) => {
    try {
      await interaction.webhook.editMessage(loading.id, { embeds: [embed] });
    } catch (_) {}
  };
  let ok = false;
  try {
    const th = await guild.channels.fetch(threadId).catch(() => null);
    if (th) {
      await th.delete(`고급관리 - 비활동 스레드 제거(개별)`);
      ok = true;
    }
  } catch { }
  if (ok) {
    await editLoading(progressEmbed('스레드 삭제 진행중', 1, 1, 0));
    threads = threads.filter(t => t.id !== threadId);
    if (page >= totalPages()) page = Math.max(0, totalPages() - 1);
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle('비활동 스레드 개별 삭제')
        .setDescription(
          `관리자: <@${interaction.user.id}>\n` +
          `스레드: ${meta ? `${meta.name} (\`${threadId}\`)` : `\`${threadId}\``}\n` +
          (meta ? `부모채널: #${meta.parentName}\n마지막 활동: ${meta.diffDays}일 전` : ``)
        )
        .setColor('#c0392b')
        .setTimestamp();
      logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }
    await interaction.followUp({ content: `🗑️ 스레드 \`${threadId}\` 삭제됨`, ephemeral: true });
  } else {
    await editLoading(progressEmbed('스레드 삭제 진행중', 1, 0, 1));
    await interaction.followUp({ content: `❌ 스레드 \`${threadId}\` 삭제 실패 (권한/존재 여부 확인)`, ephemeral: true });
  }
  await msg.edit({ embeds: [buildEmbed()], components: buildComponents() });
}
          collector.resetTimer();
        } catch { }
      });
      collector.on('end', async () => {
        try {
          await msg.edit({
            components: buildComponents().map(row => {
              row.components.forEach(btn => btn.setDisabled(true));
              return row;
            })
          });
        } catch { }
      });
      return;
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

    function makeProgressEditor(interactionObj, messageObj) {
      const id = messageObj.id;
      return async (embed) => {
        try {
          await interactionObj.webhook.editMessage(id, { embeds: [embed] });
        } catch (e) {}
      };
    }

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
          const targets = userList.filter(u => u.warned);
          const loading = await interaction.followUp({
            embeds: [progressEmbed('전체 추방 진행중', targets.length, 0, 0)],
            ephemeral: true,
            fetchReply: true
          });
          const editLoading = makeProgressEditor(interaction, loading);
          let success = 0;
          let failed = 0;
          let kickedList = [];
          await runWithConcurrency(targets, 3, async (u) => {
            try {
              const m = await guild.members.fetch(u.id).catch(() => null);
              if (!m) throw new Error('notfound');
              await m.kick(`고급관리 - ${title} 일괄 추방`);
              kickedList.push({ nickname: u.nickname, id: u.id });
              success++;
            } catch {
              failed++;
            }
            await editLoading(progressEmbed('전체 추방 진행중', targets.length, success, failed));
          });
          const kickTitle = option === 'long' ? '장기 미접속 유저 일괄 추방' : '비활동 신규 유저 일괄 추방';
          const kickDesc =
            `관리자: <@${interaction.user.id}>\n` +
            `기준: ${option === 'long' ? '장기 미접속 유저' : '비활동 신규 유저'}\n` +
            `비활동 일수: ${selectedDays}일\n` +
            `전체 대상: ${targets.length}명\n` +
            `추방 성공: ${success}명\n실패: ${failed}명`;
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
          await editLoading(
            new EmbedBuilder()
              .setTitle('전체 추방 완료')
              .setDescription(`성공 ${success} | 실패 ${failed} | 총 ${targets.length}`)
              .setColor('#2ecc71')
              .setTimestamp()
          );
        } else if (i.customId === 'warn') {
          await i.deferUpdate();
          let warned = 0, failed = 0;
          let warnedList = [];
          warnedObj = readWarnHistory();
          const targets = userList.filter(u => !warnedObj[u.id]);
          const loading = await interaction.followUp({
            embeds: [progressEmbed('전체 경고 DM 진행중', targets.length, 0, 0)],
            ephemeral: true,
            fetchReply: true
          });
          const editLoading = makeProgressEditor(interaction, loading);
          await runWithConcurrency(targets, 5, async (u) => {
            try {
              const m = await guild.members.fetch(u.id).catch(() => null);
              if (!m) throw new Error('notfound');
              await m.send(`⚠️ [${guild.name}] 장기 미접속/비활동 상태로 추방될 수 있어 활동이 필요합니다. 서버내 단 한 번의 채팅만으로도 활동 집계가 진행됩니다.`).catch(() => { failed++; return; });
              warnedObj[u.id] = { ts: Date.now() };
              warnedList.push({ nickname: u.nickname, id: u.id });
              warned++;
            } catch {
              failed++;
            }
            await editLoading(progressEmbed('전체 경고 DM 진행중', targets.length, warned, failed));
          });
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
            `전체 대상: ${targets.length}명\n` +
            `DM 성공: ${warned}명 / 실패: ${failed}명`;
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
            if (failed > 0)
              logEmbed.addFields({
                name: `DM 실패 수`,
                value: String(failed)
              });
            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
          }
          await editLoading(
            new EmbedBuilder()
              .setTitle('전체 경고 DM 완료')
              .setDescription(`성공 ${warned} | 실패 ${failed} | 총 ${targets.length}`)
              .setColor('#2ecc71')
              .setTimestamp()
          );
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
