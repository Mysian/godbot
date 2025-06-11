// commands/report.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// 로그 채널 설정 불러오기
const configPath = path.join(__dirname, '..', 'logchannel.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('신고')
    .setDescription('유저를 신고합니다.')
    .addUserOption(option =>
      option.setName('대상')
        .setDescription('신고할 유저를 선택하세요.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('사유')
        .setDescription('신고 사유를 입력하세요.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('익명여부')
        .setDescription('신고자를 숨기시겠습니까? (Y/N)')
        .setRequired(true)
        .addChoices(
          { name: '예', value: 'Y' },
          { name: '아니오', value: 'N' }
        )
    ),

  async execute(interaction) {
    const 대상 = interaction.options.getUser('대상');
    const 사유 = interaction.options.getString('사유');
    const 익명 = interaction.options.getString('익명여부');

    // 로그 채널 정보 불러오기
    if (!fs.existsSync(configPath)) {
      return interaction.reply({ content: '❗ 로그 채널이 아직 등록되지 않았습니다. `/로그채널등록` 명령어를 먼저 사용해주세요.', ephemeral: true });
    }

    const config = JSON.parse(fs.readFileSync(configPath));
    const logChannel = await interaction.guild.channels.fetch(config.channelId);

    if (!logChannel) {
      return interaction.reply({ content: '❗ 로그 채널을 찾을 수 없습니다.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🚨 유저 신고 접수')
      .addFields(
        { name: '대상', value: `<@${대상.id}>`, inline: true },
        { name: '사유', value: 사유, inline: true },
        { name: '익명 여부', value: 익명 === 'Y' ? '예 (익명)' : '아니오 (신고자 공개)', inline: false },
        ...(익명 === 'N' ? [{ name: '신고자', value: `<@${interaction.user.id}>`, inline: false }] : [])
      )
      .setColor(0xff5555)
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });

    await interaction.reply({
      content: `✅ <@${대상.id}> 님에 대한 신고가 접수되었습니다.`,
      ephemeral: true
    });
  }
};
