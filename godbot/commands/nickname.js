// commands/nickname.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const ROLE_ID        = '1273055963535904840'; // 별명 변경권
const LOG_CHANNEL_ID = '1380874052855529605';

const FORBIDDEN_REGEX =
  /(:[a-zA-Z0-9_]+:)|\p{Extended_Pictographic}|[^가-힣A-Za-z0-9 ]/u;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('별명변경')
    .setDescription('별명 변경권으로 내 별명을 바꿉니다.')
    .addStringOption(option =>
      option.setName('새별명')
        .setDescription('설정할 새 별명을 입력하세요 │ 이모지·특수문자·비속어 등 절대 금지')
        .setMinLength(2)
        .setMaxLength(24)
        .setRequired(true)
    ),
  async execute(interaction) {
    const member = interaction.member;

    // 역할 확인
    if (!member.roles.cache.has(ROLE_ID)) {
      await interaction.reply({
        content: '❌ 별명 변경권 역할이 있어야 이 명령어를 사용하실 수 있습니다.',
        ephemeral: true,
      });
      return;
    }

    // 새 별명
    const newNick = interaction.options.getString('새별명').trim();

    // 특수문자/이모지 필터
    if (FORBIDDEN_REGEX.test(newNick)) {
      await interaction.reply({
        content: '❌ 이모지나 특수문자는 별명에 사용할 수 없습니다.',
        ephemeral: true,
      });
      return;
    }

    // 기존 닉 동일?
    const oldNick = member.nickname || member.user.username;
    if (newNick === oldNick) {
      await interaction.reply({
        content: '❌ 현재 사용 중인 별명과 동일합니다. 다른 별명으로 설정해 주세요.',
        ephemeral: true,
      });
      return;
    }

    try {
      // 별명 변경
      await member.setNickname(newNick, '[별명 변경권 사용]');
      // 역할 소모
      await member.roles.remove(ROLE_ID);

      await interaction.reply({
        content: `✅ \`${oldNick}\` → \`${newNick}\` 으로 별명이 변경되었습니다.\n별명 변경권이 소모되었습니다.`,
        ephemeral: true,
      });

      // 로그
      const logEmbed = new EmbedBuilder()
        .setColor(0x76C7F4)
        .setTitle('별명 변경 로그')
        .setDescription(`> **유저:** <@${member.id}> (${member.user.tag})\n> **별명:** \`${oldNick}\` → \`${newNick}\`\n> **사용 아이템:** <@&${ROLE_ID}>`)
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

      const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID);
      if (logChannel?.isTextBased()) await logChannel.send({ embeds: [logEmbed] });
    } catch (e) {
      console.error(e);
      await interaction.reply({
        content: '❌ 별명 변경에 실패했습니다. 관리자에게 문의해 주세요.',
        ephemeral: true,
      });
    }
  },
};
