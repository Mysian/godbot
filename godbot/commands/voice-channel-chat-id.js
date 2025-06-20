// godbot/commands/voice-channel-chat-id.js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('음성채팅id')
    .setDescription('서버의 모든 음성채널 및 음성채널 채팅채널 ID를 출력합니다.'),
  async execute(interaction) {
    const channels = interaction.guild.channels.cache;
    let result = '';

    channels.filter(c => c.type === 2).forEach(voice => { // type: 2 => 음성채널
      // discord.js v14 이상이면 ChannelType.GuildVoice 대신 2
      const voiceChat = channels.find(c =>
        c.type === 15 && c.parentId === voice.id // type: 15 => GuildVoiceChannelChat
      );
      result += `\n[${voice.name}] (음성ID: ${voice.id})`;
      if (voiceChat)
        result += ` → 채팅채널: (${voiceChat.id})`;
      else
        result += ` → 채팅채널: 없음`;
    });

    if (!result) result = '음성채널이 없음!';
    await interaction.reply({ content: '```' + result + '```', ephemeral: true });
  }
};
