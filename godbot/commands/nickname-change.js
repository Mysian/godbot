const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');

const APPROVAL_CHANNEL_ID = '1276751288117235755';
const dataDir = path.join(__dirname, '../data');
const pendingPath = path.join(dataDir, 'pending-nickname-changes.json');

async function ensureDir() { if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true }); }
async function readJSONSafe(file) {
  await ensureDir();
  if (!fs.existsSync(file)) return {};
  const release = await lockfile.lock(file, { retries: 3 });
  let parsed = {};
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8') || '{}'); } finally { await release(); }
  return parsed;
}
async function writeJSONSafe(file, obj) {
  await ensureDir();
  const release = await lockfile.lock(file, { retries: 3 });
  try { fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8'); } finally { await release(); }
}
function isValidNickname(nickname) {
  const cho = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const jung = 'ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ';
  if (!nickname) return false;
  if (!/^[\w가-힣]+$/.test(nickname)) return false;
  if ([...nickname].every(ch => cho.includes(ch) || jung.includes(ch))) return false;
  if ([...nickname].some(ch => cho.includes(ch) || jung.includes(ch))) {
    for (let i = 0; i < nickname.length; i++) {
      const ch = nickname[i];
      if (!(/[가-힣]/.test(ch) || /[a-zA-Z0-9]/.test(ch))) return false;
    }
  }
  return true;
}
function rid() { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

async function createApprovalEmbed(guild, payload) {
  const ch = await guild.channels.fetch(APPROVAL_CHANNEL_ID).catch(() => null);
  if (!ch) throw new Error('APPROVAL_CHANNEL_NOT_FOUND');
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('닉네임 변경 요청')
    .setDescription('아래 요청을 승인하거나 거절하세요.')
    .addFields(
      { name: '요청자', value: `<@${payload.userId}> (\`${payload.userId}\`)`, inline: false },
      { name: '현재 닉네임', value: `\`${payload.oldNick}\``, inline: true },
      { name: '변경 요청 닉네임', value: `\`${payload.newNick}\``, inline: true },
      { name: '사용자 사유', value: payload.userReason || '-', inline: false },
      { name: '요청 ID', value: payload.requestId, inline: false },
    )
    .setFooter({ text: `요청 시각 • ${new Date(payload.createdAt).toLocaleString('ko-KR')}` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`nc_approve_${payload.requestId}`).setLabel('승인').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`nc_reject_${payload.requestId}`).setLabel('거절').setStyle(ButtonStyle.Danger),
  );
  const msg = await ch.send({ embeds: [embed], components: [row] });
  return msg;
}

async function loadPending() {
  const data = await readJSONSafe(pendingPath);
  if (!data || typeof data !== 'object') return {};
  return data;
}
async function savePending(map) {
  await writeJSONSafe(pendingPath, map || {});
}

async function handleApprove(i, requestId) {
  const pending = await loadPending();
  const item = pending[requestId];
  if (!item) { await i.reply({ content: '요청을 찾을 수 없습니다. 이미 처리되었을 수 있습니다.', ephemeral: true }); return; }
  if (item.status !== 'pending') { await i.reply({ content: `이미 처리된 요청입니다. 상태: ${item.status}`, ephemeral: true }); return; }
  const hasPerm = i.member.permissions.has(PermissionsBitField.Flags.ManageNicknames) || i.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (!hasPerm) { await i.reply({ content: '닉네임 변경을 승인할 권한이 없습니다.', ephemeral: true }); return; }

  const guild = i.guild;
  let member = null;
  try { member = await guild.members.fetch(item.userId); } catch {}
  if (!member) { await i.reply({ content: '길드에서 해당 유저를 찾을 수 없습니다.', ephemeral: true }); return; }

  const exists = guild.members.cache.some(m => (m.nickname === item.newNick) || (m.user && m.user.username === item.newNick));
  if (exists) {
    await i.reply({ content: '해당 닉네임은 이미 사용 중입니다. 거절 사유로 안내해주세요.', ephemeral: true });
    return;
  }

  let changed = false;
  try { await member.setNickname(item.newNick, `승인자: ${i.user.tag}`); changed = true; } catch { changed = false; }

  item.status = changed ? 'approved' : 'failed';
  item.processedAt = Date.now();
  item.processorId = i.user.id;
  await savePending(pending);

  const msg = await i.channel.messages.fetch(item.messageId).catch(() => null);
  if (msg) {
    const updated = EmbedBuilder.from(msg.embeds[0] || new EmbedBuilder());
    updated.setColor(changed ? 0x2ECC71 : 0xE67E22);
    updated.addFields({ name: '처리 결과', value: changed ? `승인됨 • <@${i.user.id}>` : '실패(권한 또는 위계 문제로 닉네임 변경 불가)', inline: false });
    await msg.edit({ embeds: [updated], components: [] }).catch(() => {});
  }

  if (changed) {
    const dmText = `닉네임 변경 요청이 승인되어 닉네임이 \`${item.newNick}\`(으)로 변경되었습니다.`;
    await i.deferReply({ ephemeral: true }).catch(() => {});
    try { await (await member.createDM()).send(dmText); } catch {}
    await i.editReply({ content: '요청을 승인하고 닉네임을 변경했습니다.' }).catch(() => {});
  } else {
    await i.reply({ content: '승인 처리 중 닉네임 변경에 실패했습니다. 봇 권한/위치 확인이 필요합니다.', ephemeral: true });
  }
}

async function handleReject(i, requestId) {
  const pending = await loadPending();
  const item = pending[requestId];
  if (!item) { await i.reply({ content: '요청을 찾을 수 없습니다. 이미 처리되었을 수 있습니다.', ephemeral: true }); return; }
  if (item.status !== 'pending') { await i.reply({ content: `이미 처리된 요청입니다. 상태: ${item.status}`, ephemeral: true }); return; }
  const hasPerm = i.member.permissions.has(PermissionsBitField.Flags.ManageNicknames) || i.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (!hasPerm) { await i.reply({ content: '거절할 권한이 없습니다.', ephemeral: true }); return; }

  const modal = new ModalBuilder()
    .setCustomId(`nc_reject_modal_${requestId}`)
    .setTitle('닉네임 변경 거절 사유 입력');
  const reason = new TextInputBuilder()
    .setCustomId('nc_reject_reason')
    .setLabel('거절 사유 (유저 DM으로 전송)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);
  modal.addComponents(new ActionRowBuilder().addComponents(reason));
  await i.showModal(modal);
}

async function handleRejectModal(i, requestId) {
  const pending = await loadPending();
  const item = pending[requestId];
  if (!item) { await i.reply({ content: '요청을 찾을 수 없습니다. 이미 처리되었을 수 있습니다.', ephemeral: true }); return; }
  if (item.status !== 'pending') { await i.reply({ content: `이미 처리된 요청입니다. 상태: ${item.status}`, ephemeral: true }); return; }

  const rejectReason = (i.fields.getTextInputValue('nc_reject_reason') || '').trim() || '사유 미입력';
  item.status = 'rejected';
  item.processedAt = Date.now();
  item.processorId = i.user.id;
  item.rejectReason = rejectReason;
  await savePending(pending);

  const msg = await i.guild.channels.fetch(APPROVAL_CHANNEL_ID).then(c => c.messages.fetch(item.messageId)).catch(() => null);
  if (msg) {
    const updated = EmbedBuilder.from(msg.embeds[0] || new EmbedBuilder());
    updated.setColor(0xE74C3C);
    updated.addFields({ name: '처리 결과', value: `거절됨 • <@${i.user.id}>`, inline: false }, { name: '거절 사유', value: rejectReason, inline: false });
    await msg.edit({ embeds: [updated], components: [] }).catch(() => {});
  }

  let dmSent = false;
  try {
    const user = await i.client.users.fetch(item.userId);
    await user.send(`닉네임 변경 요청이 거절되었습니다.\n사유: ${rejectReason}\n요청 닉네임: \`${item.newNick}\``);
    dmSent = true;
  } catch { dmSent = false; }

  await i.reply({ content: dmSent ? '거절 처리 및 유저 DM 발송 완료.' : '거절 처리 완료. DM 발송 실패(유저 DM 차단/오류).', ephemeral: true });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('닉네임변경')
    .setDescription('닉네임 변경을 요청합니다. 관리자의 승인 후 적용됩니다.')
    .addStringOption(o => o.setName('닉네임').setDescription('변경할 닉네임').setRequired(true))
    .addStringOption(o => o.setName('변경_사유').setDescription('변경 사유를 입력하세요').setRequired(true)),
  async execute(interaction) {
    const newNick = (interaction.options.getString('닉네임') || '').trim();
    const userReason = (interaction.options.getString('변경_사유') || '').trim();
    const member = interaction.member;
    const oldNick = member.nickname || member.user.username;

    if (!isValidNickname(newNick)) {
      await interaction.reply({ content: '닉네임에는 한글/영문/숫자만 허용되며, 초성/모음만의 조합이나 특수문자는 불가합니다.', ephemeral: true });
      return;
    }

    await interaction.guild.members.fetch();
    const exists = interaction.guild.members.cache.some(m => (m.nickname === newNick) || (m.user && m.user.username === newNick));
    if (exists) {
      await interaction.reply({ content: '이미 해당 닉네임을 사용하는 유저가 있습니다. 다른 닉네임을 입력해주세요.', ephemeral: true });
      return;
    }

    const requestId = rid();
    const payload = {
      requestId,
      guildId: interaction.guildId,
      channelId: APPROVAL_CHANNEL_ID,
      messageId: null,
      userId: interaction.user.id,
      oldNick,
      newNick,
      userReason,
      status: 'pending',
      createdAt: Date.now(),
    };

    let sent = null;
    try { sent = await createApprovalEmbed(interaction.guild, payload); }
    catch (e) {
      await interaction.reply({ content: '승인 채널을 찾지 못했습니다. 관리자에게 문의하세요.', ephemeral: true });
      return;
    }

    payload.messageId = sent.id;
    const pending = await loadPending();
    pending[requestId] = payload;
    await savePending(pending);

    await interaction.reply({
      content: [
        '닉네임 변경 요청이 접수되었습니다.',
        `요청 닉네임: \`${newNick}\``,
        '관리자 승인 후 적용되며, 거절되는 경우 정수 차감은 없습니다.'
      ].join('\n'),
      ephemeral: true
    });
  },
  register(client) {
    client.on('interactionCreate', async (i) => {
      try {
        if (i.isButton()) {
          if (i.customId.startsWith('nc_approve_')) {
            const requestId = i.customId.replace('nc_approve_', '');
            await handleApprove(i, requestId);
          } else if (i.customId.startsWith('nc_reject_')) {
            const requestId = i.customId.replace('nc_reject_', '');
            await handleReject(i, requestId);
          }
        } else if (i.isModalSubmit()) {
          if (i.customId.startsWith('nc_reject_modal_')) {
            const requestId = i.customId.replace('nc_reject_modal_', '');
            await handleRejectModal(i, requestId);
          }
        }
      } catch {}
    });
  },
};
