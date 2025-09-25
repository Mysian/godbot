// godbot/commands/movegroup.js
const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
const delay = ms => new Promise(r => setTimeout(r, ms));

async function moveMembersInChunks(members, targetChannel, chunkSize = 5, waitMs = 500) {
  const moved = [];
  const chunks = chunkArray(members, chunkSize);
  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async m => {
        try {
          await m.voice.setChannel(targetChannel);
          moved.push(m.user.tag);
        } catch (_) {}
      }),
    );
    await delay(waitMs);
  }
  return moved;
}

const groupFile = path.join(__dirname, '../data/group-moves.json');
function loadGroupMoves() {
  if (!fs.existsSync(groupFile)) fs.writeFileSync(groupFile, '{}');
  try { return JSON.parse(fs.readFileSync(groupFile, 'utf8')); } catch { return {}; }
}
function saveGroupMoves(obj) {
  fs.writeFileSync(groupFile, JSON.stringify(obj));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('단체이동')
    .setDescription('선택한 음성채널의 모든 유저를 다른 음성채널로 이동시킵니다.')
    .addChannelOption(o =>
      o.setName('대상채널').setDescription('현재 있는 음성 채널').addChannelTypes(ChannelType.GuildVoice).setRequired(true),
    )
    .addChannelOption(o =>
      o.setName('이주할채널').setDescription('이동할 음성 채널').addChannelTypes(ChannelType.GuildVoice).setRequired(true),
    )
    .addUserOption(o =>
      o.setName('예외유저').setDescription('이동하지 않을 예외 유저 (선택사항)').setRequired(false),
    ),

  async execute(interaction) {
    const sourceChannel = interaction.options.getChannel('대상채널');
    const targetChannel = interaction.options.getChannel('이주할채널');
    const exceptUser = interaction.options.getUser('예외유저');

    if (!sourceChannel || !targetChannel) {
      return interaction.reply({ content: '⚠️ 채널 정보를 정확히 가져올 수 없습니다.', ephemeral: true });
    }
    if (sourceChannel.id === targetChannel.id) {
      return interaction.reply({ content: '⚠️ 같은 채널로는 이동할 수 없습니다.', ephemeral: true });
    }
    if (targetChannel.type !== ChannelType.GuildVoice) {
      return interaction.reply({ content: '❌ 이동할 채널은 일반 음성 채널만 가능합니다.', ephemeral: true });
    }

    const members = [...sourceChannel.members.values()].filter(m => !m.user.bot && (!exceptUser || m.id !== exceptUser.id));
    if (members.length === 0) {
      return interaction.reply({ content: '⚠️ 이동시킬 유저가 없습니다.', ephemeral: true });
    }

    const errors = [];
    for (const m of members) {
      if (targetChannel.userLimit > 0 && targetChannel.members.size + 1 > targetChannel.userLimit) {
        errors.push(`${m.user.tag} ➜ 인원 제한 초과`); break;
      }
      if (!targetChannel.permissionsFor(m).has(PermissionFlagsBits.Connect)) {
        errors.push(`${m.user.tag} ➜ 채널 입장 권한 없음`); break;
      }
    }
    if (errors.length > 0) {
      return interaction.reply({ content: `❌ 단체 이동 불가:\n${errors.join('\n')}`, ephemeral: true });
    }

    // ★ 단체이동 플래그 기록 (TTL 15초)
    const gm = loadGroupMoves();
    gm[interaction.guildId] = {
      from: sourceChannel.id,
      to: targetChannel.id,
      users: members.map(m => m.id),
      expiresAt: Date.now() + 15000,
    };
    saveGroupMoves(gm);

    const moved = await moveMembersInChunks(members, targetChannel, 5, 400);

    return interaction.reply({
      content: `✅ ${moved.length}명 이동 완료:\n${moved.join('\n')}`,
      ephemeral: true,
    });
  },
};
