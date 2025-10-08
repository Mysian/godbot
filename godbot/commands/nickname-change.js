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

async function loadPending() { return await readJSONSafe(pendingPath); }
async function savePending(map) { await writeJSONSafe(pendingPath, map || {}); }

async function handleApprove(i, requestId) {
  // 즉시 응답(3초 타임아웃 방지)
  const alreadyDeferred = i.deferred || i.replied;
  if (!alreadyDeferred) { try { await i.deferReply({ ephemeral: true }); } catch {} }

  const pending = await loadPending();
  const item = pending[requestId];
  if (!item) { if (i.editReply) await i.editReply('요청을 찾을 수 없어. 이미 처리됐을 수도 있어.'); return; }
  if (item.status !== 'pending') { if (i.editReply) await i.editReply(`이미 처리된 요청이야. 상태: ${item.status}`); return; }

  const hasPerm = i.member.permissions.has(PermissionsBitField.Flags.ManageNicknames) || i.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (!hasPerm) { if (i.editReply) await i.editReply('닉네임 변경을 승인할 권한이 없어.'); return; }

  const guild = i.guild;
  let member = null;
  try { member = await guild.members.fetch(item.userId); } catch {}
  if (!member) { if (i.editReply) await i.editReply('길드에서 해당 유저를 찾을 수 없어.'); return; }

  const exists = guild.members.cache.some(m => (m.nickname === item.newNick) || (m.user && m.user.username === item.newNick));
  if (exists) { if (i.editReply) await i.editReply('이미 사용 중인 닉네임이야. 거절 사유로 안내해줘.'); return; }

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
    updated.addFields({ name: '처리 결과', value: changed ? `승인됨 • <@${i.user.id}>` : '실패(봇 권한/위계 문제로 닉변 불가)', inline: false });
    await msg.edit({ embeds: [updated], components: [] }).catch(() => {});
  }

  if (changed) {
    try { await (await member.createDM()).send(`닉네임 변경 요청이 승인되어 \`${item.newNick}\`(으)로 변경됐어.`); } catch {}
    if (i.editReply) await i.editReply('요청 승인 완료. 닉네임도 변경했어.');
  } else {
    if (i.editReply) await i.editReply('승인은 했는데 닉네임 변경에 실패했어. 봇 권한/역할 위치 확인 필요.');
  }
}

async function handleReject(i, requestId) {
  // 버튼 누르면 바로 모달(3초 내 처리)
  const pending = await loadPending();
  const item = pending[requestId];
  if (!item) { await i.reply({ content: '요청을 찾을 수 없어. 이미 처리됐을 수도 있어.', ephemeral: true }); return; }
  if (item.status !== 'pending') { await i.reply({ content: `이미 처리된 요청이야. 상태: ${item.status}`, ephemeral: true }); return; }
  const hasPerm = i.member.permissions.has(PermissionsBitField.Flags.ManageNicknames) || i.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (!hasPerm) { await i.reply({ content: '거절 권한이 없어.', ephemeral: true }); return; }

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
  // 모달 제출은 자동으로 응답 타임아웃 관리됨 → 제출 후 답변
  const pending = await loadPending();
  const item = pending[requestId];
  if (!item) { await i.reply({ content: '요청을 찾을 수 없어. 이미 처리됐을 수도 있어.', ephemeral: true }); return; }
  if (item.status !== 'pending') { await i.reply({ content: `이미 처리된 요청이야. 상태: ${item.status}`, ephemeral: true }); return; }

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
    await user.send(`닉네임 변경 요청이 거절되었어.\n사유: ${rejectReason}\n요청 닉네임: \`${item.newNick}\``);
    dmSent = true;
  } catch { dmSent = false; }

  await i.reply({ content: dmSent ? '거절 완료 + 유저 DM 발송.' : '거절 완료. (유저 DM 실패)', ephemeral: true });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('닉네임변경')
    .setDescription('닉네임 변경을 요청합니다. 관리자의 승인 후 적용됩니다.')
    .addStringOption(o => o.setName('닉네임').setDescription('변경할 닉네임').setRequired(true))
    .addStringOption(o => o.setName('변경_사유').setDescription('변경 사유를 입력하세요').setRequired(true)),
  async execute(interaction) {
    // 슬래시 입력 즉시 응답 예약
    await interaction.deferReply({ ephemeral: true });

    const newNick = (interaction.options.getString('닉네임') || '').trim();
    const userReason = (interaction.options.getString('변경_사유') || '').trim();
    const member = interaction.member;
    const oldNick = member.nickname || member.user.username;

    if (!isValidNickname(newNick)) {
      await interaction.editReply('닉네임에는 한글/영문/숫자만 허용, 초성/모음만의 조합·특수문자 불가.');
      return;
    }

    await interaction.guild.members.fetch().catch(() => {});
    const exists = interaction.guild.members.cache.some(m => (m.nickname === newNick) || (m.user && m.user.username === newNick));
    if (exists) {
      await interaction.editReply('이미 해당 닉네임을 사용하는 유저가 있어. 다른 닉네임으로 해줘.');
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
    catch (e) { await interaction.editReply('승인 채널을 찾지 못했어. 관리자에게 문의해줘.'); return; }

    payload.messageId = sent.id;
    const pending = await loadPending();
    pending[requestId] = payload;
    await savePending(pending);

    await interaction.editReply([
      '닉네임 변경 요청 접수 완료.',
      `요청 닉네임: \`${newNick}\``,
      '관리자 승인 후 적용돼. 거절돼도 정수 차감은 없어.'
    ].join('\n'));
  },
  register(client) {
    client.on('interactionCreate', async (i) => {
      try {
        if (i.isButton()) {
          if (i.customId.startsWith('nc_approve_')) {
            const requestId = i.customId.slice('nc_approve_'.length);
            await handleApprove(i, requestId);
          } else if (i.customId.startsWith('nc_reject_')) {
            const requestId = i.customId.slice('nc_reject_'.length);
            await handleReject(i, requestId);
          }
        } else if (i.isModalSubmit()) {
          if (i.customId.startsWith('nc_reject_modal_')) {
            const requestId = i.customId.slice('nc_reject_modal_'.length);
            await handleRejectModal(i, requestId);
          }
        }
      } catch (e) {
        try {
          if (!i.deferred && !i.replied) await i.reply({ content: '처리 중 오류가 발생했어.', ephemeral: true });
        } catch {}
      }
    });
  },
};
