const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = './data/voice-channels.json';

function loadChannels() {
    if (!fs.existsSync(path)) return {};
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('이동')
        .setDescription('등록된 음성채널로 이동합니다')
        .addStringOption(option =>
            option
                .setName('채널명')
                .setDescription('이동할 음성채널명을 입력하세요')
                .setRequired(true)
        ),
    async execute(interaction) {
        const channels = loadChannels();
        const name = interaction.options.getString('채널명');
        const channelId = channels[name];
        if (!channelId) {
            return interaction.reply({ content: '존재하지 않는 채널명입니다.', ephemeral: true });
        }
        const voiceChannel = interaction.guild.channels.cache.get(channelId);
        if (!voiceChannel || voiceChannel.type !== 2) {
            return interaction.reply({ content: '음성채널을 찾을 수 없습니다.', ephemeral: true });
        }
        // 정원 체크 (userLimit === 0 은 무제한)
        if (voiceChannel.userLimit !== 0 && voiceChannel.members.size >= voiceChannel.userLimit) {
            return interaction.reply({ content: '채널 정원이 꽉 차있어서 이동할 수 없습니다.', ephemeral: true });
        }
        // 음성 연결
        if (!interaction.member.voice.channel) {
            // 현재 음성채널 미접속 시 바로 이동
            await interaction.member.voice.setChannel(voiceChannel);
            return interaction.reply({ content: `\`${name}\` 채널로 이동했습니다!`, ephemeral: true });
        } else {
            // 다른 채널 접속중이면 강제 이동
            await interaction.member.voice.setChannel(voiceChannel);
            return interaction.reply({ content: `\`${name}\` 채널로 이동했습니다!`, ephemeral: true });
        }
    },
};
