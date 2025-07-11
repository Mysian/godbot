const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
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
        )
        .addBooleanOption(option =>
            option
                .setName('리모콘')
                .setDescription('리모콘(이동 버튼) 생성 (선택)')
                .setRequired(false)
        ),
    async execute(interaction) {
        const channels = loadChannels();
        const name = interaction.options.getString('채널명');
        const remote = interaction.options.getBoolean('리모콘') || false;
        const channelId = channels[name];

        if (!channelId) {
            return interaction.reply({ content: '존재하지 않는 채널명입니다.', ephemeral: true });
        }
        const voiceChannel = interaction.guild.channels.cache.get(channelId);
        if (!voiceChannel || voiceChannel.type !== 2) {
            return interaction.reply({ content: '음성채널을 찾을 수 없습니다.', ephemeral: true });
        }
        // 정원 체크
        if (voiceChannel.userLimit !== 0 && voiceChannel.members.size >= voiceChannel.userLimit) {
            return interaction.reply({ content: '채널 정원이 꽉 차있어서 이동할 수 없습니다.', ephemeral: true });
        }

        // 리모콘 기능
        if (remote) {
            // 60초 동안 이동 버튼 생성
            let timeLeft = 60;
            const embed = new EmbedBuilder()
                .setTitle(`음성채널 리모콘`)
                .setDescription(`\`${name}\` 채널로 이동할 수 있는 버튼입니다.\n아래 버튼을 누르면 즉시 이동됩니다.\n\n※ 60초 후 만료`)
                .setColor(0x00bfff);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`move_${channelId}`)
                    .setLabel(`${name} 채널로 이동`)
                    .setStyle(ButtonStyle.Primary)
            );

            // 남은 시간 안내(임베드 위 메시지)
            const message = await interaction.reply({
                content: `⏳ 남은 시간: **${timeLeft}초**`,
                embeds: [embed],
                components: [row],
                fetchReply: true,
            });

            // 타이머(남은 시간 실시간 업데이트)
            const interval = setInterval(async () => {
                timeLeft -= 1;
                if (timeLeft <= 0) {
                    clearInterval(interval);
                    try {
                        await message.delete();
                    } catch (e) {}
                    return;
                }
                try {
                    await message.edit({
                        content: `⏳ 남은 시간: **${timeLeft}초**`,
                        embeds: [embed],
                        components: [row],
                    });
                } catch (e) {}
            }, 1000);

            // 버튼 클릭 이벤트 처리
            const collector = message.createMessageComponentCollector({
                componentType: 2, // Button
                time: 60_000
            });
            collector.on('collect', async btnInteraction => {
                // 정원 체크 (리얼타임)
                if (voiceChannel.userLimit !== 0 && voiceChannel.members.size >= voiceChannel.userLimit) {
                    await btnInteraction.reply({ content: '채널 정원이 꽉 차있어서 이동할 수 없습니다.', ephemeral: true });
                    return;
                }
                // 음성 접속 상태 확인
                const member = await interaction.guild.members.fetch(btnInteraction.user.id);
                if (!member.voice.channel) {
                    await member.voice.setChannel(voiceChannel);
                    await btnInteraction.reply({ content: `\`${name}\` 채널로 이동했습니다!`, ephemeral: true });
                } else {
                    await member.voice.setChannel(voiceChannel);
                    await btnInteraction.reply({ content: `\`${name}\` 채널로 이동했습니다!`, ephemeral: true });
                }
            });

            // 만료 처리(자동 삭제)
            collector.on('end', async () => {
                clearInterval(interval);
                try {
                    await message.delete();
                } catch (e) {}
            });
            return;
        }

        // 기본(리모콘 X, 바로 이동)
        const member = interaction.member;
        if (!member.voice.channel) {
            await member.voice.setChannel(voiceChannel);
            return interaction.reply({ content: `\`${name}\` 채널로 이동했습니다!`, ephemeral: true });
        } else {
            await member.voice.setChannel(voiceChannel);
            return interaction.reply({ content: `\`${name}\` 채널로 이동했습니다!`, ephemeral: true });
        }
    },
};
