const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { loadConfig, saveConfig } = require('./be-util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수관리')
    .setDescription('정수 송금 수수료율(%)을 설정합니다. (관리자만)')
    .addIntegerOption(opt => opt.setName('수수료').setDescription('송금 수수료율(%)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '이 명령어는 관리자만 사용할 수 있습니다.', ephemeral: true });
    }
    const fee = interaction.options.getInteger('수수료');
    if (fee < 0 || fee > 100) return interaction.reply({ content: '수수료는 0~100% 범위로 입력해 주세요.', ephemeral: true });
    const config = loadConfig();
    config.fee = fee;
    saveConfig(config);
    return interaction.reply({ content: `정수 송금 수수료를 **${fee}%**로 설정 완료!`, ephemeral: false });
  }
};
