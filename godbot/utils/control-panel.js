const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, ChannelType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const PANEL_CHANNEL_ID = '1425772175691878471';
const LOG_CHANNEL_ID = '1380874052855529605';
const PANEL_TAG = 'godbot-control-panel-v1';

const APPROVAL_SETTINGS_PATH = path.join(__dirname, '../data/approval-settings.json');
const VOICE_NOTIFY_PATH = path.join(__dirname, '../data/voice-notify.json');
const VOICE_AUTO_PATH = path.join(__dirname, '../data/voice-auto.json');
const GLOBAL_TOGGLE_PATH = path.join(__dirname, '../data/bot-global.json');
const ADMINPW_PATH = path.join(__dirname, '../data/adminpw.json');

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

function loadGlobal() { return loadJson(GLOBAL_TOGGLE_PATH, { enabled: true }); }
function saveGlobal(obj) { saveJson(GLOBAL_TOGGLE_PATH, obj); }
function isBotEnabled() { const s = loadGlobal(); return !!s.enabled; }

function loadAdminPw() {
  try {
    if (!fs.existsSync(ADMINPW_PATH)) return null;
    const p = JSON.parse(fs.readFileSync(ADMINPW_PATH, 'utf8'));
    return p && p.pw ? String(p.pw) : null;
  } catch (_) { return null; }
}

function resetVoiceAutoTimer(member, channel) {
  if (voiceAutoTimers.has(member.id)) { clearTimeout(voiceAutoTimers.get(member.id)); voiceAutoTimers.delete(member.id); }
  if (!isBotEnabled()) return;
  if (channel && VOICE_AUTO_CATEGORY_IDS.includes(channel.parentId) && channel.members.filter(m => !m.user.bot).size === 1) {
    voiceAutoTimers.set(member.id, setTimeout(async () => {
      if (!isBotEnabled()) { voiceAutoTimers.delete(member.id); return; }
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
    if (!isBotEnabled()) return;
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
    if (!isBotEnabled()) return;
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
    if (!isBotEnabled()) return;
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
  const g = loadGlobal();
  const notifyOn = !!vn[guildId];
  return {
    global: g.enabled ? 'ON' : 'OFF',
    approval: appr.enabled ? 'ON' : 'OFF',
    voiceNotify: notifyOn ? 'ON' : 'OFF',
    voiceAuto: va.enabled ? 'ON' : 'OFF'
  };
}

function buildEmbed(guild) {
  const s = statusStrings(guild.id);
  const desc = [
    `봇 기능 전체: **${s.global}**`,
    `서버 입장 절차: **${s.approval}**`,
    `음성채널 입퇴장 알림: **${s.voiceNotify}**`,
    `음성채널 자동이동(장시간 1인): **${s.voiceAuto}**`
  ].join('\n');
  return new EmbedBuilder()
    .setTitle('봇 제어 패널')
    .setDescription(desc + `\n\n- 봇 기능 전체가 OFF이면 이 패널의 [봇 기능 전체 ON/OFF]만 동작하며 그 외 모든 기능은 비활성화됨`)
    .setColor(s.global === 'ON' ? '#5865F2' : '#ED4245')
    .setFooter({ text: PANEL_TAG })
    .setTimestamp();
}

function buildComponents(guild) {
  const s = statusStrings(guild.id);
  const disabledWhenGlobalOff = s.global === 'OFF';
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ctrl_approval_on').setLabel('입장 절차 ON').setStyle(ButtonStyle.Success).setDisabled(disabledWhenGlobalOff || s.approval === 'ON'),
      new ButtonBuilder().setCustomId('ctrl_approval_off').setLabel('입장 절차 OFF').setStyle(ButtonStyle.Danger).setDisabled(disabledWhenGlobalOff || s.approval === 'OFF')
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ctrl_vn_on').setLabel('음성 알림 ON').setStyle(ButtonStyle.Success).setDisabled(disabledWhenGlobalOff || s.voiceNotify === 'ON'),
      new ButtonBuilder().setCustomId('ctrl_vn_off').setLabel('음성 알림 OFF').setStyle(ButtonStyle.Danger).setDisabled(disabledWhenGlobalOff || s.voiceNotify === 'OFF')
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ctrl_va_on').setLabel('자동이동 ON').setStyle(ButtonStyle.Success).setDisabled(disabledWhenGlobalOff || s.voiceAuto === 'ON'),
      new ButtonBuilder().setCustomId('ctrl_va_off').setLabel('자동이동 OFF').setStyle(ButtonStyle.Danger).setDisabled(disabledWhenGlobalOff || s.voiceAuto === 'OFF')
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ctrl_global_toggle').setLabel('봇 기능 전체 ON/OFF').setStyle(ButtonStyle.Secondary)
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
  const ALLOWED_ROLE_IDS = ['786128824365482025','1201856430580432906'];
  const canUse = i.member.permissions.has(PermissionsBitField.Flags.ManageGuild) || i.member.roles.cache.some(r => ALLOWED_ROLE_IDS.includes(r.id));
  if (!canUse) return i.reply({ content: '권한이 없습니다.', ephemeral: true });
  if (!['ctrl_approval_on','ctrl_approval_off','ctrl_vn_on','ctrl_vn_off','ctrl_va_on','ctrl_va_off','ctrl_global_toggle'].includes(i.customId)) return;
  const gid = i.guildId;
  if (i.customId === 'ctrl_global_toggle') {
    const modal = new ModalBuilder().setCustomId('ctrl_global_toggle_modal').setTitle('관리자 비밀번호 확인').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('adminpw').setLabel('비밀번호 (4자리)').setStyle(TextInputStyle.Short).setMinLength(4).setMaxLength(4).setRequired(true))
    );
    return i.showModal(modal);
  }
  if (!isBotEnabled()) return i.reply({ content: '현재 봇 기능 전체 OFF 상태입니다. [봇 기능 전체 ON/OFF]만 사용 가능합니다.', ephemeral: true });
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

async function handleModal(i) {
  if (i.customId !== 'ctrl_global_toggle_modal') return;
  const saved = loadAdminPw();
  const input = i.fields.getTextInputValue('adminpw');
  if (!saved) return i.reply({ content: '비밀번호가 설정되어 있지 않습니다. /비밀번호설정 으로 먼저 등록하세요.', ephemeral: true });
  if (String(input) !== String(saved)) return i.reply({ content: '비밀번호가 올바르지 않습니다.', ephemeral: true });
  const current = loadGlobal();
  const next = { enabled: !current.enabled };
  saveGlobal(next);
  if (!next.enabled) { for (const t of voiceAutoTimers.values()) clearTimeout(t); voiceAutoTimers.clear(); }
  const log = i.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (log) log.send({ content: `[제어패널] 봇 기능 전체 ${next.enabled ? 'ON' : 'OFF'} by <@${i.user.id}>` }).catch(() => {});
  await i.reply({ content: `봇 기능 전체가 ${next.enabled ? 'ON' : 'OFF'} 상태로 전환되었습니다.`, ephemeral: true }).catch(() => {});
  const panelMsg = await findExistingPanel(i.channel).catch(() => null);
  if (panelMsg) await panelMsg.edit({ embeds: [buildEmbed(i.guild)], components: buildComponents(i.guild) }).catch(() => {});
}

function registerGlobalGuard(client) {
  client.on(Events.InteractionCreate, async (i) => {
    if (i.channelId === PANEL_CHANNEL_ID) {
      if (i.isButton() && i.customId === 'ctrl_global_toggle') return;
      if (i.isModalSubmit() && i.customId === 'ctrl_global_toggle_modal') return;
    }
    if (!isBotEnabled()) {
      if (i.isRepliable()) {
        const already = i.replied || i.deferred;
        if (!already) await i.reply({ content: '현재 봇 기능 전체 OFF 상태입니다.', ephemeral: true }).catch(() => {});
      }
      return;
    }
  });
  client.on('messageCreate', async (m) => {
    if (!isBotEnabled()) return;
  });
  client.on('messageReactionAdd', async () => {
    if (!isBotEnabled()) return;
  });
}

async function register(client) {
  setupVoiceAutoListener(client);
  registerGlobalGuard(client);
  client.on(Events.InteractionCreate, async (i) => { if (!i.isButton()) return; if (i.channelId !== PANEL_CHANNEL_ID) return; await handlePress(i); });
  client.on(Events.InteractionCreate, async (i) => { if (!i.isModalSubmit()) return; if (i.channelId !== PANEL_CHANNEL_ID) return; await handleModal(i); });
}

async function publish(client) { return await ensurePanel(client); }

module.exports = { register, publish, isBotEnabled };

