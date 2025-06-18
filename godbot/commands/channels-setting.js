const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = './data/voice-channels.json';

function loadChannels() {
    if (!fs.existsSync(path)) return {};
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}
function saveChannels(channels) {
    fs.writeFileSync(path, JSON.stringify(channels, null, 2), 'utf8');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('채널관리')
        .setDescription('음성채널 등록/삭제/목록 관리 (관리자)')
        .addStringOption(option =>
            option
                .setName('작업')
                .setDescription('원하는 작업을 선택하세요')
                .setRequired(true)
                .addChoices(
                    { name: '채널등록', value: 'add' },
                    { name: '채널삭제', value: 'remove' },
                    { name: '채널목록', value: 'list' }
                )
        )
        .addStringOption(option =>
            option
                .setName('채널명')
                .setDescription('음성채널명 (등록/삭제시에 입력)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('채널id')
                .setDescription('음성채널ID (등록시에만 입력)')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const action = interaction.options.getString('작업');
        const name = interaction.options.getString('채널명');
        const id = interaction.options.getString('채널id');
        let channels = loadChannels();

        // 등록
        if (action === 'add') {
            if (!name || !id) {
                return interaction.reply({ content: '채널명과 채널ID 모두 입력해 주세요.', ephemeral: true });
            }
            if (channels[name]) {
                return interaction.reply({ content: '이미 등록된 채널명입니다.', ephemeral: true });
            }
            channels[name] = id;
            saveChannels(channels);
            return interaction.reply({ content: `\`${name}\` 채널이 등록되었습니다.`, ephemeral: true });
        }

        // 삭제
        if (action === 'remove') {
            if (!name) {
                return interaction.reply({ content: '삭제할 채널명을 입력해 주세요.', ephemeral: true });
            }
            if (!channels[name]) {
                return interaction.reply({ content: '존재하지 않는 채널명입니다.', ephemeral: true });
            }
            delete channels[name];
            saveChannels(channels);
            return interaction.reply({ content: `\`${name}\` 채널이 삭제되었습니다.`, ephemeral: true });
        }

        // 목록
        if (action === 'list') {
            if (Object.keys(channels).length === 0) {
                return interaction.reply({ content: '등록된 채널이 없습니다.', ephemeral: true });
            }
            let msg = Object.entries(channels).map(([n, id]) => `• ${n} \`(${id})\``).join('\n');
            return interaction.reply({ content: `**등록된 음성채널 목록**\n${msg}`, ephemeral: true });
        }
    },
};
