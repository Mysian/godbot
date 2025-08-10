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
  try {
    const data = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
    return data;
  } finally {
    await release();
  }
}
async function saveProfiles(data) {
  const release = await lockfile.lock(profilesPath, { retries: 3 });
  try {
    fs.writeFileSync(profilesPath, JSON.stringify(data, null, 2));
  } finally {
    await release();
  }
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
    new ButtonBuilder().setCustomId('submitProfile').setLabel('프로필 등록 완료').setStyle(ButtonStyle.Success),
  ];
  return [new ActionRowBuilder().addComponents(buttons1), new ActionRowBuilder().addComponents(buttons2)];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('프로필등록')
    .setDescription('프로필 정보를 등록합니다.'),
  async execute(interaction) {
    const userId = interaction.user.id;
    const profiles = await readProfiles();
    if (profiles[userId]) {
      return interaction.reply({ content: '이미 프로필이 등록되어 있습니다. `/프로필수정`을 사용해주세요!', ephemeral: true });
    }

    let profile = {
      statusMsg: '',
      favGames: [],
      owTier: '',
      lolTier: '',
      steamNick: '',
      lolNick: '',
      bnetNick: '',
      isPrivate: false,
    };

    const embed = new EmbedBuilder()
      .setTitle('프로필 등록')
      .setDescription('버튼을 눌러 각 정보를 입력하세요!\n모든 항목은 나중에 `/프로필수정`으로 변경할 수 있어요.')
      .setColor(0x0099ff)
      .setFooter({ text: '최초 등록 완료 전까지는 프로필이 저장되지 않습니다.' });

    const [row1, row2] = buildRows(profile);

    await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
    const msg = await interaction.fetchReply();

    const validIds = new Set([
      'statusMsg','favGames','owTier','lolTier','steamNick','lolNick','bnetNick',
      'togglePrivacy','submitProfile'
    ]);

    // 🔒 이 메시지 한정 콜렉터
    const collector = msg.createMessageComponentCollector({
      filter: (i) => i.user.id === userId && i.message.id === msg.id,
      time: 10 * 60 * 1000,
    });

    collector.on('collect', async i => {
      if (i.message.id !== msg.id || !validIds.has(i.customId)) {
        try { await i.deferUpdate(); } catch {}
        return;
      }

      if (i.customId === 'submitProfile') {
        profiles[userId] = profile;
        await saveProfiles(profiles);
        try {
          await i.update({ content: '✅ 프로필 등록이 완료되었습니다!', embeds: [], components: [], ephemeral: true });
        } catch {}
        collector.stop('submitted');
        return;
      }

      if (i.customId === 'togglePrivacy') {
        profile.isPrivate = !profile.isPrivate;
        const [nr1, nr2] = buildRows(profile);
        await i.update({
          embeds: [embed],
          components: [nr1, nr2],
          ephemeral: true
        });
        await i.followUp({ content: `현재 상태: **${profile.isPrivate ? '비공개' : '공개'}**`, ephemeral: true });
        return;
      }

      // ===== 모달 입력 처리 =====
      let modal = null;

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

      if (!modal) {
        try { await i.deferUpdate(); } catch {}
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

        await modalSubmit.reply({ content: '저장 완료! 다른 항목도 입력하려면 버튼을 계속 눌러주세요.', ephemeral: true });
      } catch (err) {
        try {
          await i.followUp({ content: '⏳ 입력 시간이 초과되었습니다. 다시 시도해 주세요.', ephemeral: true });
        } catch {}
      }
    });

    collector.on('end', async () => {
      const disabledRows = msg.components.map(row => {
        const r = ActionRowBuilder.from(row);
        r.components = r.components.map(c => ButtonBuilder.from(c).setDisabled(true));
        return r;
      });
      try { await msg.edit({ components: disabledRows }); } catch {}
    });
  },
};
