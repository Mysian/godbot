const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getBE, addBE } = require('./be-util');

const APPROVAL_CHANNEL_ID = '1276751288117235755';
const LOG_CHANNEL_ID = '1380874052855529605';
const STORE_PATH = path.join(__dirname, '..', 'data', 'nickname-requests.json');
const COST_BE = 500000;

function ensureStore() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) fs.writeFileSync(STORE_PATH, JSON.stringify({ items: {} }, null, 2));
}

function loadStore() {
  ensureStore();
  try { return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')); } catch { return { items: {} }; }
}

function saveStore(data) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function isValidNickname(n) {
  if (!n) return false;
  if (n.length < 2 || n.length > 32) return false;
  if (!/^[\p{L}\p{N}\s._-]+$/u.test(n)) return false;
  if (/^[._\-\s]+$/.test(n)) return false;
  return true;
}

function isValidReason(r) {
  if (typeof r !== 'string') return false;
  const t = r.trim();
  if (t.length < 1) return false;
  if (t.length > 500) return false;
  return true;
}

async function postApprovalEmbed(guild, requester, requestId) {
  const store = loadStore();
  const item = store.items[requestId];
  if (!item) return null;
  const ch = await guild.channels.fetch(APPROVAL_CHANNEL_ID).catch(() => null);
  if (!ch) return null;
  const embed = new EmbedBuilder()
  .setTitle('닉네임 변경 요청')
  .setDescription([
    '요청자가 닉네임 변경을 요청했습니다.',
    `유저: <@${item.userId}> (${requester.user.tag})`,
    `현재 닉네임: ${requester.displayName}`,
    `요청 닉네임: ${item.newNick}`,
    `사유: ${item.reason && item.reason.trim().length ? item.reason : '-'}`,
    `처리 시 차감: ${COST_BE.toLocaleString()} BE`
  ].join('\n'))
  .setColor(0x5865F2)
  .setTimestamp(new Date())
  .setThumbnail(requester.user.displayAvatarURL({ size: 128 }));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`nc_approve_${requestId}`).setLabel('승인').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`nc_reject_${requestId}`).setLabel('거절').setStyle(ButtonStyle.Danger)
  );
  const msg = await ch.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (!msg) return null;
  item.channelId = msg.channel.id;
  item.messageId = msg.id;
  saveStore(store);
  return { messageId: msg.id, channelId: msg.channel.id };
}

function createRequest(guildId, userId, newNick, reason, oldNick) {
  const store = loadStore();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  store.items[id] = {
    id,
    guildId,
    userId,
    newNick,
    reason: typeof reason === 'string' ? reason : '',
    oldNick: typeof oldNick === 'string' ? oldNick : '',
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    channelId: null,
    messageId: null
  };
  saveStore(store);
  return id;
}

function getRequest(id) {
  const store = loadStore();
  return store.items[id] || null;
}

function setRequestStatus(id, status) {
  const store = loadStore();
  if (!store.items[id]) return;
  store.items[id].status = status;
  store.items[id].updatedAt = Date.now();
  saveStore(store);
}

async function deleteApprovalMessage(guild, item) {
  if (!item.channelId || !item.messageId) return;
  const ch = await guild.channels.fetch(item.channelId).catch(() => null);
  if (!ch) return;
  const msg = await ch.messages.fetch(item.messageId).catch(() => null);
  if (!msg) return;
  await msg.delete().catch(() => {});
  const store = loadStore();
  if (store.items[item.id]) {
    store.items[item.id].channelId = null;
    store.items[item.id].messageId = null;
    saveStore(store);
  }
}

async function postResultLog(guild, item, statusText, processorUserId, usedReason, beUsed, processedAt) {
  const ch = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (!ch) return;
  const ts = typeof processedAt === 'number' ? processedAt : Date.now();
  const oldNickResolved = (item.oldNickNow && item.oldNickNow.trim().length ? item.oldNickNow : (item.oldNick || '')) || '-';
  const embed = new EmbedBuilder()
    .setTitle('닉네임 변경 처리 결과')
    .setColor(statusText === '승인 완료' ? 0x57F287 : 0xED4245)
    .addFields(
      { name: '요청 유저', value: `<@${item.userId}>`, inline: true },
      { name: '처리 상태', value: statusText, inline: true },
      { name: '처리자', value: processorUserId ? `<@${processorUserId}>` : '-', inline: true },
      { name: '변경 전', value: oldNickResolved, inline: true },
      { name: '변경 후', value: item.newNick, inline: true },
      { name: '변경 일시', value: `<t:${Math.floor(ts / 1000)}:f>`, inline: true },
      { name: '사유', value: usedReason && usedReason.trim().length ? usedReason : (item.reason && item.reason.trim().length ? item.reason : '-'), inline: false },
      { name: 'BE', value: beUsed ? `-${COST_BE.toLocaleString()} BE` : '차감 없음', inline: true }
    )
    .setTimestamp(new Date(ts))
    .setThumbnail((await guild.members.fetch(item.userId).catch(() => null))?.user?.displayAvatarURL({ size: 128 }) || null);
  await ch.send({ embeds: [embed] }).catch(() => {});
}

module.exports.data = new SlashCommandBuilder()
  .setName('nickname')
  .setNameLocalizations({ ko: '닉네임변경' })
  .setDescription('닉네임 변경 요청을 등록합니다.')
  .setDescriptionLocalizations({ ko: '닉네임 변경 요청을 등록합니다.' })
  .addStringOption(o =>
    o.setName('nickname')
     .setNameLocalizations({ ko: '닉네임' })
     .setDescription('변경할 닉네임')
     .setDescriptionLocalizations({ ko: '변경할 닉네임' })
     .setRequired(true)
     .setMinLength(2)
     .setMaxLength(32)
  )
  .addStringOption(o =>
    o.setName('reason')
     .setNameLocalizations({ ko: '사유' })
     .setDescription('변경 사유')
     .setDescriptionLocalizations({ ko: '변경 사유' })
     .setRequired(true)
     .setMinLength(1)
     .setMaxLength(500)
  );

module.exports.execute = async (interaction) => {
  await interaction.deferReply({ ephemeral: true });
  const newNick = (interaction.options.getString('nickname') || '').trim();
  const reasonRaw = interaction.options.getString('reason');
  const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : '';
  if (!isValidNickname(newNick)) {
    await interaction.editReply('닉네임에는 한글/영문/숫자 및 공백, . _ - 만 허용되며 2~32자여야 합니다.');
    return;
  }
  if (!isValidReason(reason)) {
    await interaction.editReply('사유는 1~500자 사이여야 합니다.');
    return;
  }
  const dup = interaction.guild.members.cache.find(m => (m.displayName || m.user.username) === newNick && m.id !== interaction.user.id);
  if (dup) {
    await interaction.editReply('이미 해당 닉네임을 사용하는 유저가 있습니다. 다른 닉네임을 입력해주세요.');
    return;
  }
  const balance = getBE(interaction.user.id);
  if (balance < COST_BE) {
    await interaction.editReply(`정수가 부족합니다. 필요한 정수: ${COST_BE.toLocaleString()} BE, 보유 정수: ${balance.toLocaleString()} BE`);
    return;
  }
  const reqId = createRequest(
  interaction.guild.id,
  interaction.user.id,
  newNick,
  reason,
  (interaction.member?.displayName || interaction.user.username || '')
);
  const posted = await postApprovalEmbed(interaction.guild, interaction.member, reqId);
  if (!posted) {
    await interaction.editReply('승인 채널을 찾지 못했습니다. 관리자에게 문의하세요.');
    return;
  }
  await interaction.editReply([
    '닉네임 변경 요청이 접수되었습니다.',
    `요청 닉네임: \`${newNick}\``,
    `사유: ${reason}`,
    `관리자 승인 시 ${COST_BE.toLocaleString()} BE가 차감됩니다.`,
    '거절 또는 변경 실패 시 정수 차감은 없습니다.'
  ].join('\n'));
};

async function handleApprove(i, requestId) {
  try { await i.deferUpdate(); } catch {}
  const item = getRequest(requestId);
  if (!item) { try { await i.followUp({ content: '요청을 찾을 수 없습니다.', ephemeral: true }); } catch {} return; }
  if (item.status !== 'pending') { try { await i.followUp({ content: '이미 처리된 요청입니다.', ephemeral: true }); } catch {} return; }
  const guild = i.guild;
  const member = await guild.members.fetch(item.userId).catch(() => null);
  if (!member) { try { await i.followUp({ content: '대상 유저를 찾을 수 없습니다.', ephemeral: true }); } catch {} return; }
  const balance = getBE(item.userId);
  if (balance < COST_BE) {
    try { await i.followUp({ content: `유저 정수 부족으로 승인할 수 없습니다. 필요: ${COST_BE.toLocaleString()} BE, 보유: ${balance.toLocaleString()} BE`, ephemeral: true }); } catch {}
    return;
  }
  try {
  const beforeNick = member.displayName || member.user.username || '';
  await member.setNickname(item.newNick);
  await addBE(item.userId, -COST_BE, '닉네임 변경 수수료');
  setRequestStatus(requestId, 'approved');
  await deleteApprovalMessage(guild, item);
  try { await member.send(['닉네임 변경 요청이 승인되었습니다.', `적용 닉네임: \`${item.newNick}\``, `차감: ${COST_BE.toLocaleString()} BE`].join('\n')); } catch {}
  const processedAt = Date.now();
  await postResultLog(guild, { ...item, oldNickNow: beforeNick }, '승인 완료', i.user?.id || null, '', true, processedAt);
  try { await i.followUp({ content: '요청을 승인하고 닉네임을 변경했으며 정수를 차감했습니다.', ephemeral: true }); } catch {}
} catch {
  try { await i.followUp({ content: '승인 처리 중 닉네임 변경에 실패했습니다. 봇 권한/역할 위치를 확인하세요.', ephemeral: true }); } catch {}
  }
}

async function handleReject(i, requestId) {
  const item = getRequest(requestId);
  if (!item) { try { await i.reply({ content: '요청을 찾을 수 없습니다.', ephemeral: true }); } catch {} return; }
  if (item.status !== 'pending') { try { await i.reply({ content: '이미 처리된 요청입니다.', ephemeral: true }); } catch {} return; }
  const modal = new ModalBuilder().setCustomId(`nc_reject_modal_${requestId}`).setTitle('거절 사유 입력');
  const inp = new TextInputBuilder().setCustomId('reason').setLabel('거절 사유').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder('사유를 입력하지 않으면 해당 유저가 작성한 변경 희망 사유가 그대로 전송됩니다.');
  modal.addComponents(new ActionRowBuilder().addComponents(inp));
  await i.showModal(modal).catch(() => {});
}

async function handleRejectModal(i, requestId) {
  try { await i.deferReply({ ephemeral: true }); } catch {}
  const item = getRequest(requestId);
  if (!item) { await i.editReply('요청을 찾을 수 없습니다.'); return; }
  if (item.status !== 'pending') { await i.editReply('이미 처리된 요청입니다.'); return; }
  const modalReasonRaw = i.fields.getTextInputValue('reason');
  const modalReason = typeof modalReasonRaw === 'string' ? modalReasonRaw.trim() : '';
  setRequestStatus(requestId, 'rejected');
  await deleteApprovalMessage(i.guild, item);
  let dmSent = false;
  try {
    const m = await i.guild.members.fetch(item.userId).catch(() => null);
    if (m) {
      await m.send(['닉네임 변경 요청이 거절되었습니다.', modalReason && modalReason.length ? `사유: ${modalReason}` : (item.reason && item.reason.length ? `사유: ${item.reason}` : '사유: -'), '정수 차감은 없습니다.'].join('\n'));
      dmSent = true;
    }
  } catch {}
  await postResultLog(i.guild, item, '거절 완료', i.user?.id || null, modalReason, false, Date.now());
  await i.editReply(dmSent ? '거절 처리 및 유저 DM 발송 완료.' : '거절 처리 완료. DM 발송 실패(유저 DM 차단/오류).');
}

module.exports.register = (client) => {
  client.on('interactionCreate', async (i) => {
    if (i.isButton()) {
      if (i.customId.startsWith('nc_approve_')) { const id = i.customId.substring('nc_approve_'.length); await handleApprove(i, id); return; }
      if (i.customId.startsWith('nc_reject_')) { const id = i.customId.substring('nc_reject_'.length); await handleReject(i, id); return; }
    }
    if (i.isModalSubmit()) {
      if (i.customId.startsWith('nc_reject_modal_')) { const id = i.customId.substring('nc_reject_modal_'.length); await handleRejectModal(i, id); return; }
    }
  });
};
