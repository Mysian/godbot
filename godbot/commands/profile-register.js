const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require(\'discord.js\');
const fs = require(\'fs\');
const path = require(\'path\');
const lockfile = require(\'proper-lockfile\'); // proper-lockfile import

const profilesPath = path.join(__dirname, \'../data/profiles.json\');

// Promise Queue for serializing file operations
class PromiseQueue {
  constructor() {
    this.queue = Promise.resolve();
  }

  add(task) {
    this.queue = this.queue.then(task).catch(err => {
      console.error(\'PromiseQueue error:\', err);
      return Promise.reject(err); // Propagate the error
    });
    return this.queue;
  }
}

const fileQueue = new PromiseQueue();

async function readProfiles() {
  return fileQueue.add(async () => {
    let release; // Declare release outside try-catch for finally block
    try {
      release = await lockfile.lock(profilesPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
      if (!fs.existsSync(profilesPath)) {
        fs.writeFileSync(profilesPath, \'{}\');
      }
      const data = JSON.parse(fs.readFileSync(profilesPath, \'utf8\'));
      await release(); // Release the lock after reading
      return data;
    } catch (err) {
      if (release) { // Ensure release is defined before trying to call it
        try { await release(); } catch (releaseErr) { console.error(\'Error releasing lock:\', releaseErr); }
      }
      console.error(\'Error reading profiles:\', err);
      throw err; // Re-throw the error to propagate it
    }
  });
}

async function saveProfiles(data) {
  return fileQueue.add(async () => {
    let release;
    try {
      release = await lockfile.lock(profilesPath, { retries: { retries: 10, minTimeout: 30, maxTimeout: 100 } });
      fs.writeFileSync(profilesPath, JSON.stringify(data, null, 2));
      await release(); // Release the lock after writing
    } catch (err) {
      if (release) {
        try { await release(); } catch (releaseErr) { console.error(\'Error releasing lock:\', releaseErr); }
      }
      console.error(\'Error saving profiles:\', err);
      throw err; // Re-throw the error
    }
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName(\'프로필등록\')
    .setDescription(\'프로필 정보를 등록합니다.\'),
  async execute(interaction) {
    const userId = interaction.user.id;
    let profiles;
    try {
      profiles = await readProfiles();
    } catch (err) {
      console.error(\'Failed to read profiles in execute:\', err);
      return interaction.reply({ content: \'❌ 프로필 정보를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.\', ephemeral: true });
    }

    if (profiles[userId]) {
      return interaction.reply({ content: \'이미 프로필이 등록되어 있습니다. `/프로필수정`을 사용해주세요!\', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(\'프로필 등록\')
      .setDescription(\'버튼을 눌러 각 정보를 입력하세요!\\n아래 버튼을 클릭해 정보를 입력하거나 수정할 수 있습니다.\')
      .setColor(0x0099ff)
      .setFooter({ text: \'최초 등록 완료 전까지는 프로필이 저장되지 않습니다.\' });

    // 버튼 나누기 (한 줄에 5개까지 제한)
    const buttons1 = [
      new ButtonBuilder().setCustomId(\'statusMsg\').setLabel(\'상태 메시지\').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(\'favGames\').setLabel(\'선호 게임(3개)\').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(\'owTier\').setLabel(\'오버워치 티어/포지션\').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(\'lolTier\').setLabel(\'롤 티어/포지션\').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(\'steamNick\').setLabel(\'스팀 닉네임\').setStyle(ButtonStyle.Secondary),
    ];
    const buttons2 = [
      new ButtonBuilder().setCustomId(\'lolNick\').setLabel(\'롤 닉네임#태그\').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(\'bnetNick\').setLabel(\'배틀넷 닉네임\').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(\'submitProfile\').setLabel(\'프로필 등록 완료\').setStyle(ButtonStyle.Success),
    ];
    const row1 = new ActionRowBuilder().addComponents(buttons1);
    const row2 = new ActionRowBuilder().addComponents(buttons2);

    let profile = {
      statusMsg: \'\',
      favGames: [],
      owTier: \'\',
      lolTier: \'\',
      steamNick: \'\',
      lolNick: \'\',
      bnetNick: \'\',
    };

    await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === userId,
      time: 10 * 60 * 1000,
    });

    collector.on(\'collect\', async i => {
      if (i.customId === \'submitProfile\') {
        try {
          profiles[userId] = profile;
          await saveProfiles(profiles); // Use async saveProfiles
          await i.update({ content: \'✅ 프로필 등록이 완료되었습니다!\', embeds: [], components: [], ephemeral: true });
          collector.stop();
        } catch (err) {
          console.error(\'Failed to save profile on submit:\', err);
          await i.update({ content: \'❌ 프로필 저장 중 오류가 발생했습니다. 다시 시도해주세요.\', embeds: [], components: [], ephemeral: true });
        }
        return;
      }
      // 버튼별 모달 처리
      let modal = null;
      if (i.customId === \'statusMsg\') {
        modal = new ModalBuilder()
          .setCustomId(\'modalStatusMsg\')
          .setTitle(\'상태 메시지 입력\')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(\'statusMsgInput\')
                .setLabel(\'상태 메시지\')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30)
                .setPlaceholder(\'한마디를 입력하세요!\')
                .setRequired(true)
            )
          );
      }
      if (i.customId === \'favGames\') {
        modal = new ModalBuilder()
          .setCustomId(\'modalFavGames\')
          .setTitle(\'선호 게임 입력 (최대 3개)\')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(\'favGamesInput\')
                .setLabel(\'게임명을 콤마(,)로 구분하여 입력\')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(50)
                .setPlaceholder(\'예: 롤, 오버워치, 발로란트\')
                .setRequired(true)
            )
          );
      }
      if (i.customId === \'owTier\') {
        modal = new ModalBuilder()
          .setCustomId(\'modalOwTier\')
          .setTitle(\'오버워치 티어/포지션 입력\')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(\'owTierInput\')
                .setLabel(\'예: 마스터/힐러\')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30)
                .setPlaceholder(\'티어/포지션\')
                .setRequired(true)
            )
          );
      }
      if (i.customId === \'lolTier\') {
        modal = new ModalBuilder()
          .setCustomId(\'modalLolTier\')
          .setTitle(\'롤 티어/포지션 입력\')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(\'lolTierInput\')
                .setLabel(\'예: 플래티넘/정글\')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30)
                .setPlaceholder(\'티어/포지션\')
                .setRequired(true)
            )
          );
      }
      if (i.customId === \'steamNick\') {
        modal = new ModalBuilder()
          .setCustomId(\'modalSteamNick\')
          .setTitle(\'스팀 닉네임 입력\')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(\'steamNickInput\')
                .setLabel(\'스팀 닉네임\')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30)
                .setRequired(true)
            )
          );
      }
      if (i.customId === \'lolNick\') {
        modal = new ModalBuilder()
          .setCustomId(\'modalLolNick\')
          .setTitle(\'롤 닉네임#태그 입력\')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(\'lolNickInput\')
                .setLabel(\'롤 닉네임#태그\')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30)
                .setPlaceholder(\'예: 나무늘보#KR1\')
                .setRequired(true)
            )
          );
      }
      if (i.customId === \'bnetNick\') {
        modal = new ModalBuilder()
          .setCustomId(\'modalBnetNick\')
          .setTitle(\'배틀넷 닉네임 입력\')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(\'bnetNickInput\')
                .setLabel(\'배틀넷 닉네임\')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(30)
                .setRequired(true)
            )
          );
      }

      // 안전 처리: 모달 없는 경우는 무시
      if (!modal) {
        await i.reply({ content: \'잘못된 버튼입니다.\', ephemeral: true });
        return;
      }

      try {
        await i.showModal(modal);
        // 모달 제출 대기 (개별 interaction 기반으로 awaitModalSubmit)
        const modalSubmit = await i.awaitModalSubmit({ time: 60_000, filter: (m) => m.user.id === userId });

        if (modalSubmit.customId === \'modalStatusMsg\')
          profile.statusMsg = modalSubmit.fields.getTextInputValue(\'statusMsgInput\');
        if (modalSubmit.customId === \'modalFavGames\') {
          profile.favGames = modalSubmit.fields.getTextInputValue(\'favGamesInput\').split(\'\\,\').map(s => s.trim()).slice(0, 3);
        }
        if (modalSubmit.customId === \'modalOwTier\')
          profile.owTier = modalSubmit.fields.getTextInputValue(\'owTierInput\');
        if (modalSubmit.customId === \'modalLolTier\')
          profile.lolTier = modalSubmit.fields.getTextInputValue(\'lolTierInput\');
        if (modalSubmit.customId === \'steamNick\')
          profile.steamNick = modalSubmit.fields.getTextInputValue(\'steamNickInput\');
        if (modalSubmit.customId === \'lolNick\')
          profile.lolNick = modalSubmit.fields.getTextInputValue(\'lolNickInput\');
        if (modalSubmit.customId === \'bnetNick\')
          profile.bnetNick = modalSubmit.fields.getTextInputValue(\'bnetNickInput\');
        await modalSubmit.reply({ content: \'저장 완료! 다른 항목도 입력하려면 버튼을 계속 눌러주세요.\', ephemeral: true });
      } catch (err) {
        // 모달 대기 timeout 등
        console.error(\'Error during modal interaction:\', err);
        await i.followUp({ content: \'⏳ 입력 시간이 초과되었습니다. 다시 시도해 주세요.\', ephemeral: true });
      }
    });

    collector.on(\'end\', collected => {
      if (collected.size === 0) {
        interaction.editReply({ content: \'프로필 등록 시간이 초과되었습니다.\', embeds: [], components: [] }).catch(console.error);
      }
    });
  },
};


