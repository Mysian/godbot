const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const profilesPath = path.join(__dirname, '../data/profiles.json');

function readProfiles() {
  if (!fs.existsSync(profilesPath)) return {};
  return JSON.parse(fs.readFileSync(profilesPath));
}
function saveProfiles(data) {
  fs.writeFileSync(profilesPath, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('프로필등록')
    .setDescription('프로필 정보를 등록합니다.'),
  async execute(interaction) {
    const userId = interaction.user.id;
    const profiles = readProfiles();
    if (profiles[userId]) {
      return interaction.reply({ content: '이미 프로필이 등록되어 있습니다. `/프로필수정`을 사용해주세요!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('프로필 등록')
      .setDescription('버튼을 눌러 각 정보를 입력하세요!\n아래 버튼을 클릭해 정보를 입력하거나 수정할 수 있습니다.')
      .setColor(0x0099ff)
      .setFooter({ text: '최초 등록 완료 전까지는 프로필이 저장되지 않습니다.' });

    const buttons = [
      new ButtonBuilder().setCustomId('statusMsg').setLabel('상태 메시지').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('favGames').setLabel('선호 게임(3개)').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('owTier').setLabel('오버워치 티어/포지션').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('lolTier').setLabel('롤 티어/포지션').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('steamNick').setLabel('스팀 닉네임').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('lolNick').setLabel('롤 닉네임#태그').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('bnetNick').setLabel('배틀넷 닉네임').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('submitProfile').setLabel('프로필 등록 완료').setStyle(ButtonStyle.Success),
    ];
    const row = new ActionRowBuilder().addComponents(buttons);

    let profile = {
      statusMsg: '',
      favGames: [],
      owTier: '',
      lolTier: '',
      steamNick: '',
      lolNick: '',
      bnetNick: '',
    };

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === userId,
      time: 10 * 60 * 1000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'submitProfile') {
        profiles[userId] = profile;
        saveProfiles(profiles);
        await i.update({ content: '✅ 프로필 등록이 완료되었습니다!', embeds: [], components: [], ephemeral: true });
        collector.stop();
        return;
      }
      // 버튼별 모달 처리
      let modal;
      if (i.customId === 'statusMsg') {
        modal = new ModalBuilder()
          .setCustomId('modalStatusMsg')
          .setTitle('상태 메시지 입력')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('statusMsgInput')
                .setLabel('상태 메시지')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30)
                .setPlaceholder('한마디를 입력하세요!')
                .setRequired(true)
            )
          );
      }
      if (i.customId === 'favGames') {
        modal = new ModalBuilder()
          .setCustomId('modalFavGames')
          .setTitle('선호 게임 입력 (최대 3개)')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('favGamesInput')
                .setLabel('게임명을 콤마(,)로 구분하여 입력')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(50)
                .setPlaceholder('예: 롤, 오버워치, 발로란트')
                .setRequired(true)
            )
          );
      }
      if (i.customId === 'owTier') {
        modal = new ModalBuilder()
          .setCustomId('modalOwTier')
          .setTitle('오버워치 티어/포지션 입력')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('owTierInput')
                .setLabel('예: 마스터/힐러')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30)
                .setPlaceholder('티어/포지션')
                .setRequired(true)
            )
          );
      }
      if (i.customId === 'lolTier') {
        modal = new ModalBuilder()
          .setCustomId('modalLolTier')
          .setTitle('롤 티어/포지션 입력')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('lolTierInput')
                .setLabel('예: 플래티넘/정글')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30)
                .setPlaceholder('티어/포지션')
                .setRequired(true)
            )
          );
      }
      if (i.customId === 'steamNick') {
        modal = new ModalBuilder()
          .setCustomId('modalSteamNick')
          .setTitle('스팀 닉네임 입력')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('steamNickInput')
                .setLabel('스팀 닉네임')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30)
                .setRequired(true)
            )
          );
      }
      if (i.customId === 'lolNick') {
        modal = new ModalBuilder()
          .setCustomId('modalLolNick')
          .setTitle('롤 닉네임#태그 입력')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('lolNickInput')
                .setLabel('롤 닉네임#태그')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30)
                .setPlaceholder('예: 나무늘보#KR1')
                .setRequired(true)
            )
          );
      }
      if (i.customId === 'bnetNick') {
        modal = new ModalBuilder()
          .setCustomId('modalBnetNick')
          .setTitle('배틀넷 닉네임 입력')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('bnetNickInput')
                .setLabel('배틀넷 닉네임')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30)
                .setRequired(true)
            )
          );
      }
      if (modal) {
        await i.showModal(modal);
        const modalSubmit = await i.awaitModalSubmit({ time: 60_000 });
        // 입력값 저장
        if (modalSubmit.customId === 'modalStatusMsg')
          profile.statusMsg = modalSubmit.fields.getTextInputValue('statusMsgInput');
        if (modalSubmit.customId === 'modalFavGames') {
          profile.favGames = modalSubmit.fields.getTextInputValue('favGamesInput').split(',').map(s => s.trim()).slice(0, 3);
        }
        if (modalSubmit.customId === 'modalOwTier')
          profile.owTier = modalSubmit.fields.getTextInputValue('owTierInput');
        if (modalSubmit.customId === 'modalLolTier')
          profile.lolTier = modalSubmit.fields.getTextInputValue('lolTierInput');
        if (modalSubmit.customId === 'modalSteamNick')
          profile.steamNick = modalSubmit.fields.getTextInputValue('steamNickInput');
        if (modalSubmit.customId === 'modalLolNick')
          profile.lolNick = modalSubmit.fields.getTextInputValue('lolNickInput');
        if (modalSubmit.customId === 'modalBnetNick')
          profile.bnetNick = modalSubmit.fields.getTextInputValue('bnetNickInput');
        await modalSubmit.reply({ content: '저장 완료! 다른 항목도 입력하려면 버튼을 계속 눌러주세요.', ephemeral: true });
      }
    });
  },
};
