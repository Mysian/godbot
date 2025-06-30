const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("할말")
    .setDescription("갓봇이 대신 말하거나, 메시지에 답변/이모지 반응을 해요.")
    .addStringOption(option =>
      option.setName("내용")
        .setDescription("갓봇이 대신 말할 내용")
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName("메시지id")
        .setDescription("대상 메시지의 ID (또는 링크에서 복사)")
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName("이모지")
        .setDescription("달고싶은 이모지 (예: 😂 또는 :joy:)")
        .setRequired(false)
    ),
  async execute(interaction) {
    const content = interaction.options.getString("내용");
    const messageId = interaction.options.getString("메시지id");
    const emojiInput = interaction.options.getString("이모지");
    const channel = interaction.channel;

    // 입력 없을 때 안내
    if (!content && !messageId && !emojiInput) {
      await interaction.reply({ content: "❌ 최소 하나의 옵션(내용, 메시지ID, 이모지)을 입력해야 해!", ephemeral: true });
      return;
    }

    // 메시지ID가 있으면 타깃 메시지 fetch
    if (messageId) {
      try {
        const targetMsg = await channel.messages.fetch(messageId);

        // 내용 있으면 답글
        if (content) {
          await targetMsg.reply(content);
        }
        // 이모지 있으면 반응
        if (emojiInput) {
          await targetMsg.react(emojiInput);
        }

        await interaction.reply({ content: "✅ 처리 완료!", ephemeral: true });
        return;
      } catch (err) {
        await interaction.reply({ content: "❌ 메시지를 찾을 수 없거나 오류가 발생했어!", ephemeral: true });
        return;
      }
    }

    // 메시지ID 없이, 내용 있으면 일반 메시지
    if (content) {
      const sent = await channel.send(content);
      // 이모지 있으면 반응
      if (emojiInput) {
        await sent.react(emojiInput);
      }
      await interaction.reply({ content: "✅ 전송 완료!", ephemeral: true });
      return;
    }

    // 내용 없이, 메시지ID도 없이 이모지만 입력한 경우
    await interaction.reply({ content: "❌ 이모지 단독 사용 시엔 메시지ID도 필요해!", ephemeral: true });
  },
};
