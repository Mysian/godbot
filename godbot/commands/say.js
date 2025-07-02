// commands/say.js

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('할말')
    .setDescription('지정한 채널에 메시지(텍스트/이미지/이모지/답글)를 전송')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('채널')
        .setDescription('메시지를 보낼 채널')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('내용')
        .setDescription('전송할 메시지 내용')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option.setName('이미지')
        .setDescription('첨부할 이미지 파일')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('이모지')
        .setDescription('추가로 반응할 이모지(옵션)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('답글')
        .setDescription('답글로 보낼 메시지 ID(옵션)')
        .setRequired(false)
    ),
  async execute(interaction) {
    const channel = interaction.options.getChannel('채널');
    const content = interaction.options.getString('내용');
    const image = interaction.options.getAttachment('이미지');
    const emoji = interaction.options.getString('이모지');
    const replyTo = interaction.options.getString('답글');

    if (!content && !image && !emoji) {
      return interaction.reply({ content: '전송할 내용 또는 이미지를 입력해 주세요.', ephemeral: true });
    }

    // 전송 옵션 세팅
    const sendOptions = {};
    if (content) sendOptions.content = content;
    if (image) sendOptions.files = [image.url];

    // 답글로 보낼 경우
    if (replyTo) {
      try {
        const msg = await channel.messages.fetch(replyTo);
        sendOptions.reply = { messageReference: msg.id };
      } catch {
        return interaction.reply({ content: '❌ 답글 대상 메시지를 찾을 수 없습니다.', ephemeral: true });
      }
    }

    // 메시지 전송
    let sent;
    try {
      sent = await channel.send(sendOptions);
    } catch (e) {
      return interaction.reply({ content: '❌ 메시지 전송에 실패했습니다.', ephemeral: true });
    }

    // 이모지 리액션 추가
    if (emoji) {
      try {
        await sent.react(emoji);
      } catch {
        // 이모지가 잘못되었거나 지원 안하면 무시
      }
    }

    return interaction.reply({ content: '✅ 메시지 전송 완료!', ephemeral: true });
  }
}
