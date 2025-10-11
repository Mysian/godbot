const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, ChannelType, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

const PANEL_CHANNEL_ID = '1425772175691878471';
const LOG_CHANNEL_ID = '1380874052855529605';
const PANEL_TAG = 'godbot-control-panel-v1';

const APPROVAL_SETTINGS_PATH = path.join(__dirname, '../data/approval-settings.json');
const VOICE_NOTIFY_PATH = path.join(__dirname, '../data/voice-notify.json');
const VOICE_AUTO_PATH = path.join(__dirname, '../data/voice-auto.json');

const VOICE_AUTO_CATEGORY_IDS = [
  '1207980297854124032',
  '1273762376889532426',
  '1369008627045765173'
];
const VOICE_AUTO_MOVE_CHANNEL_ID = '1202971727915651092';
const VOICE_AUTO_NOTICE_CHANNEL_ID = '1202971727915651092';
const VOICE_AUTO_MINUTES = 120;

let voiceAutoListenerRegistered = false;
const voiceAutoTimers = new Map();

function loadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) { return fallback; }
}
function saveJson(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }

function loadApproval() { return loadJson(APPROVAL_SETTINGS_PATH, { enabled: true }); }
function saveApproval(obj) { saveJson(APPROVAL_SETTINGS_PATH, obj); }

function loadVoiceNotify() { return loadJson(VOICE_NOTIFY_PATH, {}); }
function saveVoiceNotify(obj) { saveJson(VOICE_NOTIFY_PATH, obj); }

function loadVoiceAuto() { return loadJson(VOICE_AUTO_PATH, { enabled: false }); }
function saveVoiceAuto(obj) { saveJson(VOICE_AUTO_PATH, obj); }

function resetVoiceAutoTimer(member, channel) {
  if (voiceAutoTimers.has(member.id)) { clearTimeout(voiceAutoTimers.get(member.id)); voiceAutoTimers.delete(member.id); }
  if (channel && VOICE_AUTO_CATEGORY_IDS.includes(channel.parentId) && channel.members.filter(m => !m.user.bot).size === 1) {
    voiceAutoTimers.set(member.id, setTimeout(async () => {
      if (channel.members.filter(m => !m.user.bot).size === 1) {
        try {
          await member.voice.setChannel(VOICE_AUTO_MOVE_CHANNEL_ID, '장시간 혼자 대기 자동 이동');
          const g = member.guild;
          const noticeChannel = g.channels.cache.get(VOICE_AUTO_NOTICE_CHANNEL_ID) || g.systemChannel;
          if (noticeChannel) noticeChannel.send({ content: `\`${member.displayName}\`님, 음성채널에 장시간 혼자 머물러 계셔서 자동으로 이동되었습니다.` }).catch(() => {});
        } catch (_) {}
      }
      voiceAutoTimers.delete(member.id);
    }, VOICE_AUTO_MINUTES * 60 * 1000));
  }
}

function setupVoiceAutoListener(client) {
  if (voiceAutoListenerRegistered) return;
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const s = loadVoiceAuto();
    if (!s.enabled) return;
    const member = newState.member || oldState.member;
    const channel = newState.channel || oldState.channel;
    if (!channel || !VOICE_AUTO_CATEGORY_IDS.includes(channel.parentId)) { if (voiceAutoTimers.has(member.id)) voiceAutoTimers.delete(member.id); return; }
    const members = channel.members.filter(m => !m.user.bot);
    if (members.size === 1) { if (!voiceAutoTimers.has(member.id)) resetVoiceAutoTimer(member, channel); }
    else { if (voiceAutoTimers.has(member.id)) { clearTimeout(voiceAutoTimers.get(member.id)); voiceAutoTimers.delete(member.id); } }
  });
  const activityHandler = async (payload) => {
    const s = loadVoiceAuto();
    if (!s.enabled) return;
    let member = null, voiceChannel = null, guild = null, userId = null;
    if (payload.member && payload.member.voice && payload.member.voice.channel) { userId = payload.member.id; member = payload.member; voiceChannel = payload.member.voice.channel; guild = payload.guild; }
    else if (payload.user && payload.guild && payload.guild.members) { userId = payload.user.id; guild = payload.guild; member = await guild.members.fetch(userId).catch(() => null); if (member && member.voice && member.voice.channel) voiceChannel = member.voice.channel; }
    else if (payload.author && payload.guild && payload.guild.members) { userId = payload.author.id; guild = payload.guild; member = await guild.members.fetch(userId).catch(() => null); if (member && member.voice && member.voice.channel) voiceChannel = member.voice.channel; }
    if (member && voiceChannel && VOICE_AUTO_CATEGORY_IDS.includes(voiceChannel.parentId)) { if (voiceChannel.members.filter(m => !m.user.bot).size === 1) resetVoiceAutoTimer(member, voiceChannel); }
  };
  client.on('messageCreate', activityHandler);
  client.on('interactionCreate', activityHandler);
  client.on('messageReactionAdd', (reaction, user) => {
    if (user.bot) return;
    if (!reaction.message.guild) return;
    reaction.message.guild.members.fetch(user.id).then(member => {
      if (member && member.voice && member.voice.channel && VOICE_AUTO_CATEGORY_IDS.includes(member.voice.channel.parentId)) {
        if (member.voice.channel.members.filter(m => !m.user.bot).size === 1) resetVoiceAutoTimer(member, member.voice.channel);
      }
    }).catch(() => {});
  });
  voiceAutoListenerRegistered = true;
}

function statusStrings(guildId) {
  const appr = loadApproval();
  const vn = loadVoiceNotify();
  const va = loadVoiceAuto();
  const notifyOn = !!vn[guildId];
  return {
    approval: appr.enabled ? 'ON' : 'OFF',
    voiceNotify: notifyOn ? 'ON' : 'OFF',
    voiceAuto: va.enabled ? 'ON' : 'OFF'
  };
}

function buildEmbed(guild) {
  const s = statusStrings(guild.id);
  const desc = [
    `서버 입장 절차: **${s.approval}**`,
    `음성채널 입퇴장 알림: **${s.voiceNotify}**`,
    `음성채널 자동이동(장시간 1인): **${s.voiceAuto}**`
  ].join('\n');
  return new EmbedBuilder()
    .setTitle('봇 제어 패널')
    .setDescription(desc + `\n\n- 서버 입장 절차: 새로 들어오는 유저의 온보딩 절차 진행 여부를 제어\n- 음성 입퇴장 알림: 음성 접속/이탈을 텍스트로 안내\n- 자동이동: 지정 카테고리에서 ${VOICE_AUTO_MINUTES}분 이상 혼자면 이동`)
    .setColor('#5865F2')
    .setFooter({ text: PANEL_TAG })
    .setTimestamp();
}

function buildComponents(guild) {
  const s = statusStrings(guild.id);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ctrl_approval_on').setLabel('입장 절차 ON').setStyle(ButtonStyle.Success).setDisabled(s.approval === 'ON'),
      new ButtonBuilder().setCustomId('ctrl_approval_off').setLabel('입장 절차 OFF').setStyle(ButtonStyle.Danger).setDisabled(s.approval === 'OFF')
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ctrl_vn_on').setLabel('음성 알림 ON').setStyle(ButtonStyle.Success).setDisabled(s.voiceNotify === 'ON'),
      new ButtonBuilder().setCustomId('ctrl_vn_off').setLabel('음성 알림 OFF').setStyle(ButtonStyle.Danger).setDisabled(s.voiceNotify === 'OFF')
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ctrl_va_on').setLabel('자동이동 ON').setStyle(ButtonStyle.Success).setDisabled(s.voiceAuto === 'ON'),
      new ButtonBuilder().setCustomId('ctrl_va_off').setLabel('자동이동 OFF').setStyle(ButtonStyle.Danger).setDisabled(s.voiceAuto === 'OFF'),
      new ButtonBuilder().setCustomId('ctrl_refresh').setLabel('새로고침').setStyle(ButtonStyle.Primary)
    )
  ];
}

async function findExistingPanel(channel) {
  const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!msgs) return null;
  const found = msgs.find(m => m.author.id === channel.client.user.id && m.embeds?.[0]?.footer?.text === PANEL_TAG);
  return found || null;
}

async function ensurePanel(client) {
  const channel = await client.channels.fetch(PANEL_CHANNEL_ID).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  const exists = await findExistingPanel(channel);
  const embed = buildEmbed(channel.guild);
  const components = buildComponents(channel.guild);
  if (exists) return exists.edit({ embeds: [embed], components }).catch(() => null);
  else return channel.send({ embeds: [embed], components }).catch(() => null);
}

async function handlePress(i) {
  if (!i.inGuild()) return;
  if (!i.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return i.reply({ content: '권한이 없습니다.', ephemeral: true });
  if (!['ctrl_approval_on','ctrl_approval_off','ctrl_vn_on','ctrl_vn_off','ctrl_va_on','ctrl_va_off','ctrl_refresh'].includes(i.customId)) return;
  const gid = i.guildId;
  if (i.customId === 'ctrl_approval_on' || i.customId === 'ctrl_approval_off') {
    const on = i.customId.endsWith('_on');
    saveApproval({ enabled: on });
    const log = i.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (log) log.send({ content: `[제어패널] 입장 절차 ${on ? 'ON' : 'OFF'} by <@${i.user.id}>` }).catch(() => {});
  } else if (i.customId === 'ctrl_vn_on' || i.customId === 'ctrl_vn_off') {
    const on = i.customId.endsWith('_on');
    const vn = loadVoiceNotify();
    vn[gid] = on;
    saveVoiceNotify(vn);
    const log = i.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (log) log.send({ content: `[제어패널] 음성 입퇴장 알림 ${on ? 'ON' : 'OFF'} by <@${i.user.id}>` }).catch(() => {});
  } else if (i.customId === 'ctrl_va_on' || i.customId === 'ctrl_va_off') {
    const on = i.customId.endsWith('_on');
    saveVoiceAuto({ enabled: on });
    setupVoiceAutoListener(i.client);
    if (!on) { for (const t of voiceAutoTimers.values()) clearTimeout(t); voiceAutoTimers.clear(); }
    const log = i.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (log) log.send({ content: `[제어패널] 음성 자동이동 ${on ? 'ON' : 'OFF'} by <@${i.user.id}>` }).catch(() => {});
  }
  const msg = i.message;
  await msg.edit({ embeds: [buildEmbed(i.guild)], components: buildComponents(i.guild) }).catch(() => {});
  await i.deferUpdate().catch(() => {});
}

function register(client) {
  setupVoiceAutoListener(client);
  client.on(Events.InteractionCreate, async (i) => { if (!i.isButton()) return; if (i.channelId !== PANEL_CHANNEL_ID) return; await handlePress(i); });
}

async function publish(client) { return await ensurePanel(client); }

module.exports = { register, publish };
