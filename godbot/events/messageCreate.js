module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.content === '!채널id') {
      await message.reply(`이 채팅채널 ID는: \`${message.channel.id}\``);
    }
  }
};
