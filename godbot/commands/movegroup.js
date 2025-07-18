const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');

function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function moveMembersInChunks(members, targetChannel, chunkSize = 5, waitMs = 500) {
  let moved = [];
  const chunks = chunkArray(members, chunkSize);

  for (const chunk of chunks) {
    for (const member of chunk) {
      try {
        await member.voice.setChannel(targetChannel);
        moved.push(member.user.tag);
      } catch (e) {}
    }
    await delay(waitMs);
  }

  return moved;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('단체이동')
    .setDescription('선택한 음성채널의 모든 유저를 다른 음성채널로 이동시킵니다.')
    .addChannelOption(option =>
      option
        .setName('대상채널')
        .setDescription('현재 있는 음성 채널')
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(true),
    )
    .addChannelOption(option =>
      option
        .setName('이주할채널')
        .setDescription('이동할 음성 채널')
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(true),
    )
    .addUserOption(option =>
      option
        .setName('예외유저')
        .setDescription('이동하지 않을 예외 유저 (선택사항)')
        .setRequired(false),
    ),

  async execute(interaction) {
    const sourceChannel = interaction.options.getChannel('대상채널');
    const targetChannel = interaction.options.getChannel('이주할채널');
    const exceptUser = interaction.options.getUser('예외유저');

    if (!sourceChannel || !targetChannel) {
      return await interaction.reply({
        content: '⚠️ 채널 정보를 정확히 가져올 수 없습니다.',
        ephemeral: true,
      });
    }

    if (sourceChannel.id === targetChannel.id) {
      return await interaction.reply({
        content: '⚠️ 같은 채널로는 이동할 수 없습니다.',
        ephemeral: true,
      });
    }

    if (targetChannel.type !== ChannelType.GuildVoice) {
      return await interaction.reply({
        content: '❌ 이동할 채널은 일반 음성 채널만 가능합니다.',
        ephemeral: true,
      });
    }

    const members = [...sourceChannel.members.values()].filter(
      m => !m.user.bot && (!exceptUser || m.id !== exceptUser.id),
    );

    if (members.length === 0) {
      return await interaction.reply({
        content: '⚠️ 이동시킬 유저가 없습니다.',
        ephemeral: true,
      });
    }

    const errors = [];

    for (const member of members) {
      if (
        targetChannel.userLimit > 0 &&
        targetChannel.members.size + 1 > targetChannel.userLimit
      ) {
        errors.push(`${member.user.tag} ➜ 인원 제한 초과`);
        break;
      }

      if (!targetChannel.permissionsFor(member).has(PermissionFlagsBits.Connect)) {
        errors.push(`${member.user.tag} ➜ 채널 입장 권한 없음`);
        break;
      }
    }

    if (errors.length > 0) {
      return await interaction.reply({
        content: `❌ 단체 이동 불가: \n${errors.join('\n')}`,
        ephemeral: true,
      });
    }

    const moved = await moveMembersInChunks(members, targetChannel, 5, 500);

    return await interaction.reply({
      content: `✅ ${moved.length}명 이동 완료: \n${moved.join('\n')}`,
      ephemeral: true,
    });
  },
};
