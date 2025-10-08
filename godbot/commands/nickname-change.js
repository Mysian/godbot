const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const APPROVAL_CHANNEL_ID = '1276751288117235755';
const LOG_CHANNEL_ID = '1380874052855529605';
const STORE_PATH = path.join(__dirname, '..', 'data', 'nickname-requests.json');

function ensureStore() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) fs.writeFileSync(STORE_PATH, JSON.stringify({ seq: 1, items: {} }, null, 2));
}

function loadStore() {
  ensureStore();
  try { return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')); } catch { return { seq: 1, items: {} }; }
}

function saveStore(data) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function isValidNickname(n) {
  if (!n) return false;
  if (n.length < 2 || n.length > 32) return false;
  if (!/^[\p{L}\p{N}\s._-]+$/u.test(n)) return false;
  if (/^[\u3131-\u318E]+$/u.test(n)) return false;
  if (/^[._\-\s]+$/.test(n)) return false;
  return true;
}

async function postApprovalEmbed(guild, requester, newNick, reason) {
  const ch = await guild.channels.fetch(APPROVAL_CHANNEL_ID).catch(() => null);
  if (!ch) return null;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const embed = new EmbedBuilder()
    .setTitle('닉네임 변경 요청')
    .setDescription(['요청자가 닉네임 변경을 요청했습니다.', `유저: <@${requester.id}> (${requester.user.tag})`, `현재 닉네임: ${requester.displayName}`, `요청 닉네임: ${newNick}`, `사유: ${reason || '-'}`].join('\n'))
    .setColor(0x5865F2)
    .setTimestamp(new Date());
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`nc_approve_${id}`).setLabel('승인').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`nc_reject_${id}`).setLabel('거절').setStyle(ButtonStyle.Danger)
  );
  const msg = await ch.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (!msg) return null;
  return { requestId: id, messageId: msg.id, channelId: msg.channel.id };
}

async function applyNickname(member, newNick) {
  if (!member.manageable) throw new Error('not_manageable');
  await member.setNickname(newNick).catch(e => { throw e; });
}

function upsertRequest(guildId, userId, payload) {
  const store = loadStore();
  const id = payload.requestId;
  store.items[id] = {
    id,
    guildId,
    userId,
    newNick: payload.newNick,
    reason: payload.reason || '',
    messageId: payload.messageId,
    channelId: payload.channelId,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now()
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

async function disableApprovalComponents(guild, item) {
  const ch = await guild.channels.fetch(item.channelId).catch(() => null);
  if (!ch) return;
  const msg = await ch.messages.fetch(item.messageId).catch(() => null);
  if (!msg) return;
  await msg.edit({ components: [] }).catch(() => {});
}

async function postResultLog(guild, item, statusText, processorUserId, usedReason) {
  const ch = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (!ch) return;
  const embed = new EmbedBuilder()
    .setTitle('닉네임 변경 처리 결과')
    .setColor(statusText === '승인 완료' ? 0x57F287 : 0xED4245)
    .addFields(
      { name: '요청 유저', value: `<@${item.userId}>`, inline: true },
      { name: '요청 닉네임', value: item.newNick, inline: true },
      { name: '사유', value: usedReason || '-', inline: false },
      { name: '처리 상태', value: statusText, inline: true },
      { name: '처리자', value: processorUserId ? `<@${processorUserId}>` : '-', inline: true }
    )
    .setTimestamp(new Date());
  await ch.send({ embeds: [embed] }).catch(() => {});
}

module.exports.data = new SlashCommandBuilder()
  .setName('닉네임변경')
  .setDescription('닉네임 변경 요청을 등록합니다.')
  .addStringOption(o =>
    o.setName('nickname')
     .setNameLocalizations({ ko: '닉네임' })
     .setDescription('변경할 닉네임')
     .setDescriptionLocalizations({ ko: '변경할 닉네임' })
     .setRequired(true)
  )
  .addStringOption(o =>
    o.setName('reason')
     .setNameLocalizations({ ko: '사유' })
     .setDescription('변경 사유')
     .setDescriptionLocalizations({ ko: '변경 사유' })
     .setRequired(false)
  );

module.exports.execute = async (interaction) => {
  await interaction.deferReply({ ephemeral: true });
  const newNick = (interaction.options.getString('nickname') || interaction.options.getString('닉네임') || '').trim();
  const reason = (interaction.options.getString('reason') || interaction.options.getString('사유') || '').trim();
  if (!isValidNickname(newNick)) {
    await interaction.editReply('닉네임에는 한글/영문/숫자 및 공백, . _ - 만 허용되며 2~32자여야 합니다.');
    return;
  }
  const dup = interaction.guild.members.cache.find(m => (m.displayName || m.user.username) === newNick && m.id !== interaction.user.id);
  if (dup) {
    await interaction.editReply('이미 해당 닉네임을 사용하는 유저가 있습니다. 다른 닉네임을 입력해주세요.');
    return;
  }
  const posted = await postApprovalEmbed(interaction.guild, interaction.member, newNick, reason);
  if (!posted) {
    await interaction.editReply('승인 채널을 찾지 못했습니다. 관리자에게 문의하세요.');
    return;
  }
  upsertRequest(interaction.guild.id, interaction.user.id, { requestId: posted.requestId, newNick, reason, messageId: posted.messageId, channelId: posted.channelId });
  await interaction.editReply(['닉네임 변경 요청이 접수되었습니다.', `요청 닉네임: \`${newNick}\``, '관리자 승인 후 적용되며, 거절되는 경우 정수 차감은 없습니다.'].join('\n'));
};

async function handleApprove(i, requestId) {
  try { await i.deferUpdate(); } catch {}
  const item = getRequest(requestId);
  if (!item) {
    try { await i.followUp({ content: '요청을 찾을 수 없습니다.', ephemeral: true }); } catch {}
    return;
  }
  if (item.status === 'approved') {
    try { await i.followUp({ content: '이미 승인 처리된 요청입니다.', ephemeral: true }); } catch {}
    return;
  }
  if (item.status === 'rejected') {
    try { await i.followUp({ content: '이미 거절 처리된 요청입니다.', ephemeral: true }); } catch {}
    return;
  }
  const guild = i.guild;
  const member = await guild.members.fetch(item.userId).catch(() => null);
  if (!member) {
    try { await i.followUp({ content: '대상 유저를 찾을 수 없습니다.', ephemeral: true }); } catch {}
    return;
  }
  try {
    await applyNickname(member, item.newNick);
    setRequestStatus(requestId, 'approved');
    await disableApprovalComponents(guild, item);
    try { await member.send(['닉네임 변경 요청이 승인되었습니다.', `적용 닉네임: \`${item.newNick}\``].join('\n')); } catch {}
    await postResultLog(guild, item, '승인 완료', i.user?.id || null, item.reason || '');
    try { await i.followUp({ content: '요청을 승인하고 닉네임을 변경했습니다.', ephemeral: true }); } catch {}
  } catch {
    try { await i.followUp({ content: '승인 처리 중 닉네임 변경에 실패했습니다. 봇 권한/역할 위치를 확인하세요.', ephemeral: true }); } catch {}
  }
}

async function handleReject(i, requestId) {
  const item = getRequest(requestId);
  if (!item) {
    try { await i.reply({ content: '요청을 찾을 수 없습니다.', ephemeral: true }); } catch {}
    return;
  }
  if (item.status !== 'pending') {
    try { await i.reply({ content: '이미 처리된 요청입니다.', ephemeral: true }); } catch {}
    return;
  }
  const modal = new ModalBuilder()
    .setCustomId(`nc_reject_modal_${requestId}`)
    .setTitle('거절 사유 입력');
  const inp = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('거절 사유')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder('사유를 입력하지 않으면 기본 안내만 전송됩니다.');
  modal.addComponents(new ActionRowBuilder().addComponents(inp));
  await i.showModal(modal).catch(() => {});
}

async function handleRejectModal(i, requestId) {
  try { await i.deferReply({ ephemeral: true }); } catch {}
  const item = getRequest(requestId);
  if (!item) {
    await i.editReply('요청을 찾을 수 없습니다.');
    return;
  }
  if (item.status !== 'pending') {
    await i.editReply('이미 처리된 요청입니다.');
    return;
  }
  const modalReason = (i.fields.getTextInputValue('reason') || '').trim();
  setRequestStatus(requestId, 'rejected');
  await disableApprovalComponents(i.guild, item);
  let dmSent = false;
  try {
    const m = await i.guild.members.fetch(item.userId).catch(() => null);
    if (m) {
      await m.send(['닉네임 변경 요청이 거절되었습니다.', modalReason ? `사유: ${modalReason}` : '사유: -'].join('\n'));
      dmSent = true;
    }
  } catch {}
  await postResultLog(i.guild, item, '거절 완료', i.user?.id || null, modalReason || '');
  await i.editReply(dmSent ? '거절 처리 및 유저 DM 발송 완료.' : '거절 처리 완료. DM 발송 실패(유저 DM 차단/오류).');
}

module.exports.register = (client) => {
  client.on('interactionCreate', async (i) => {
    if (i.isButton()) {
      if (i.customId.startsWith('nc_approve_')) {
        const id = i.customId.replace('nc_approve_', '');
        await handleApprove(i, id);
        return;
      }
      if (i.customId.startsWith('nc_reject_')) {
        const id = i.customId.replace('nc_reject_', '');
        await handleReject(i, id);
        return;
      }
    }
    if (i.isModalSubmit()) {
      if (i.customId.startsWith('nc_reject_modal_')) {
        const id = i.customId.replace('nc_reject_modal_', '');
        await handleRejectModal(i, id);
        return;
      }
    }
  });
};
