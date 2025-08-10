const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');

const profilesPath = path.join(__dirname, '../data/profiles.json');

async function readProfiles() {
  if (!fs.existsSync(profilesPath)) return {};
  const release = await lockfile.lock(profilesPath, { retries: 3 });
  const data = JSON.parse(fs.readFileSync(profilesPath));
  await release();
  return data;
}
async function saveProfiles(data) {
  const release = await lockfile.lock(profilesPath, { retries: 3 });
  fs.writeFileSync(profilesPath, JSON.stringify(data, null, 2));
  await release();
}

function buildRows(profile) {
  const buttons1 = [
    new ButtonBuilder().setCustomId('statusMsg').setLabel('상태 메시지').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('favGames').setLabel('선호 게임(3개)').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('owTier').setLabel('오버워치 티어/포지션').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('lolTier').setLabel('롤 티어/포지션').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('steamNick').setLabel('스팀 닉네임').setStyle(ButtonStyle.Secondary),
  ];
  const privacyLabel = profile.isPrivate ? '프로필 공개' : '프로필 비공개';
  const buttons2 = [
    new ButtonBuilder().setCustomId('lolNick').setLabel('롤 닉네임#태그').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bnetNick').setLabel('배틀넷 닉네임').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('togglePrivacy').setLabel(privacyLabel).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('submitProfile').setLabel('수정 완료').setStyle(ButtonStyle.Success),
  ];
  return [new ActionRowBuilder().addComponents(buttons1), new ActionRowBuilder().addComponents(buttons2)];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('프로필수정')
    .setDescription('등록된 프로필을 수정합니다.'),
  async execute(interaction) {
    const userId = interaction.user.id;
    const profiles = await readProfiles();
    if (!profiles[userId]) {
      return interaction.reply({ content: '먼저 `/프로필등록` 명령어로 프로필을 등록해주세요.', ephemeral: true });
    }

    let profile = profiles[userId];
    if (typeof profile.isPrivate !== 'boolean') profile.isPrivate = false;

    const embed = new EmbedBuilder()
      .setTitle('프로필 수정')
      .setDescription('수정할 정보를 버튼을 통해 변경할 수 있습니다.\n변경할 항목만 골라서 수정하세요.')
      .setColor(0x00bb77);

    const [row1, row2] = buildRows(profile);

    await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === userId,
      time: 10 * 60 * 1000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'submitProfile') {
        profiles[userId] = profile;
        await saveProfiles(profiles);
        await i.update({ content: '✅ 프로필 수정이 완료되었습니다!', embeds: [], components: [], ephemeral: true });
        collector.stop();
        return;
      }

      if (i.customId === 'togglePrivacy') {
        profile.isPrivate = !profile.isPrivate;
        profiles[userId] = profile;
        await saveProfiles(profiles);
        const [nr1, nr2] = buildRows(profile);
        await i.update({
          embeds: [embed],
          components: [nr1, nr2],
          ephemeral: true
        });
        await i.followUp({ content: `설정 저장됨: 현재 상태는 **${profile.isPrivate ? '비공개' : '공개'}** 입니다.`, ephemeral: true });
        return;
      }

      let modal = null;
      if (i.customId === 'statusMsg') {
        modal = new ModalBuilder()
          .setCustomId('modalStatusMsg')
          .setTitle('상태 메시지 수정')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('statusMsgInput')
                .setLabel('상태 메시지')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30)
                .setValue(profile.statusMsg || '')
                .setRequired(true)
            )
          );
      }
      if (i.customId === 'favGames') {
        modal = new ModalBuilder()
          .setCustomId('modalFavGames')
          .setTitle('선호 게임 수정 (최대 3개)')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('favGamesInput')
                .setLabel('게임명 (콤마로 구분)')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(50)
                .setValue((profile.favGames || []).join(', '))
                .setRequired(true)
            )
          );
      }
      if (i.customId === 'owTier') {
        modal = new ModalBuilder()
          .setCustomId('modalOwTier')
          .setTitle('오버워치 티어/포지션 수정')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('owTierInput')
                .setLabel('티어/포지션')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30)
                .setValue(profile.owTier || '')
                .setRequired(true)
            )
          );
      }
      if (i.customId === 'lolTier') {
        modal = new ModalBuilder()
          .setCustomId('modalLolTier')
          .setTitle('롤 티어/포지션 수정')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('lolTierInput')
                .setLabel('티어/포지션')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30)
                .setValue(profile.lolTier || '')
                .setRequired(true)
            )
          );
      }
      if (i.customId === 'steamNick') {
        modal = new ModalBuilder()
          .setCustomId('modalSteamNick')
          .setTitle('스팀 닉네임 수정')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('steamNickInput')
                .setLabel('스팀 닉네임')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30)
                .setValue(profile.steamNick || '')
                .setRequired(true)
            )
          );
      }
      if (i.customId === 'lolNick') {
        modal = new ModalBuilder()
          .setCustomId('modalLolNick')
          .setTitle('롤 닉네임#태그 수정')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('lolNickInput')
                .setLabel('롤 닉네임#태그')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30)
                .setValue(profile.lolNick || '')
                .setRequired(true)
            )
          );
      }
      if (i.customId === 'bnetNick') {
        modal = new ModalBuilder()
          .setCustomId('modalBnetNick')
          .setTitle('배틀넷 닉네임 수정')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('bnetNickInput')
                .setLabel('배틀넷 닉네임')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30)
                .setValue(profile.bnetNick || '')
                .setRequired(true)
            )
          );
      }

      if (!modal) {
        await i.reply({ content: '잘못된 버튼입니다.', ephemeral: true });
        return;
      }

      try {
        await i.showModal(modal);
        const modalSubmit = await i.awaitModalSubmit({ time: 60_000, filter: (m) => m.user.id === userId });

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

        await modalSubmit.reply({ content: '수정 완료! 다른 항목도 계속 수정하려면 버튼을 눌러주세요.', ephemeral: true });
      } catch (err) {
        await i.followUp({ content: '⏳ 입력 시간이 초과되었습니다. 다시 시도해 주세요.', ephemeral: true });
      }
    });
  },
};
