// commands/logchannel.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

// 로그 저장용 파일 경로
const configPath = path.join(__dirname, '..', 'logchannel.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('로그채널등록')
    .setDescription('관리 로그를 저장할 채널과 열람 역할을 등록합니다.')
    .addChannelOption(option =>
      option.setName('채널')
        .setDescription('로그를 저장할 텍스트 채널')
        .setRequired(true)
    )
    .addRoleOption(option =>
      option.setName('열람가능역할')
        .setDescription('로그 열람을 허용할 역할')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const channel = interaction.options.getChannel('채널');
    const role = interaction.options.getRole('열람가능역할');

    const config = {
      guildId: interaction.guildId,
      channelId: channel.id,
      roleId: role.id
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    await interaction.reply({
      content: `✅ 로그 채널이 <#${channel.id}>로 설정되었고, <@&${role.id}> 역할에게 열람 권한을 부여했어요.`,
      ephemeral: true
    });
  }
};
