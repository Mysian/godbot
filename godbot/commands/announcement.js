const { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../data/announcements.json');

function loadData() {
  if (!fs.existsSync(dataPath)) return {};
  return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}
function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

const EMOJIS = ['💜','💙','💚','💛','🧡','❤','🖤','🤎','💗'];
const INTERVALS = {
  '1시간': 3600000,
  '3시간': 10800000,
  '6시간': 21600000,
  '12시간': 43200000,
  '24시간': 86400000
};

function getRandomEmoji() {
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}

const timers = new Map();

function startTimer(guildId, channelId, interval, tips) {
  if (timers.has(guildId)) clearInterval(timers.get(guildId));
  const sendTip = async () => {
    const tip = tips[Math.floor(Math.random() * tips.length)];
    const emoji = getRandomEmoji();
    const channel = await global.client.channels.fetch(channelId).catch(() => null);
    if (channel) channel.send(`-# ${emoji}: ${tip}`);
  };
  sendTip();
  timers.set(guildId, setInterval(sendTip, interval));
}

function stopTimer(guildId) {
  if (timers.has(guildId)) {
    clearInterval(timers.get(guildId));
    timers.delete(guildId);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('공지하기')
    .setDescription('공지 관련 명령어')
    .addStringOption(option =>
      option.setName('옵션')
        .setDescription('공지채널 설정/공지 글 추가/공지 리스트/공지 주기 선택/공지기능 켜기/끄기')
        .setRequired(true)
        .addChoices(
          { name: '공지채널 설정', value: 'set_channel' },
          { name: '공지 글 추가', value: 'add_tip' },
          { name: '공지 리스트', value: 'list_tips' },
          { name: '공지 주기 선택', value: 'set_interval' },
          { name: '공지기능 켜기', value: 'enable' },
          { name: '공지기능 끄기', value: 'disable' }
        )
    ),

  async execute(interaction) {
    const option = interaction.options.getString('옵션');
    const guildId = interaction.guild.id;
    const data = loadData();
    if (!data[guildId]) data[guildId] = { channelId: null, interval: null, tips: [], enabled: false };

    // 공지채널 설정 모달
    if (option === 'set_channel') {
      const modal = new ModalBuilder()
        .setCustomId('set_channel_modal')
        .setTitle('공지 채널 설정')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('channel_id_input')
              .setLabel('공지 채널의 ID를 입력하세요')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder('예: 123456789012345678')
          )
        );
      await interaction.showModal(modal);
      return;
    }

    // 공지 글 추가 모달
    if (option === 'add_tip') {
      const modal = new ModalBuilder()
        .setCustomId('add_tip_modal')
        .setTitle('공지 글 추가')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('tip_content_input')
              .setLabel('추가할 공지 내용을 입력하세요')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    // 공지 주기 선택 모달
    if (option === 'set_interval') {
      const modal = new ModalBuilder()
        .setCustomId('set_interval_modal')
        .setTitle('공지 주기 선택')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('interval_input')
              .setLabel('"1시간", "3시간", "6시간", "12시간", "24시간" 중 하나로 입력')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      await interaction.showModal(modal);
      return;
    }

    // 공지 글 리스트 (수정/삭제)
    if (option === 'list_tips') {
      if (data[guildId].tips.length === 0) return interaction.reply({ content: '등록된 공지가 없습니다.', ephemeral: true });
      const rows = [];
      for (let i = 0; i < data[guildId].tips.length; i++) {
        const tip = data[guildId].tips[i];
        rows.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`edit_tip_${i}`)
              .setLabel('수정')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`delete_tip_${i}`)
              .setLabel('삭제')
              .setStyle(ButtonStyle.Danger)
          )
        );
      }
      let msg = `현재 등록된 공지 (${data[guildId].tips.length}개):\n`;
      data[guildId].tips.forEach((tip, i) => {
        msg += `\n${i + 1}. ${tip}`;
      });
      await interaction.reply({ content: msg, ephemeral: true, components: rows });

      // 버튼 핸들러
      const filter = btnInt => btnInt.user.id === interaction.user.id;
      const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60_000 });

      collector.on('collect', async btnInt => {
        const matchEdit = btnInt.customId.match(/^edit_tip_(\d+)$/);
        const matchDel = btnInt.customId.match(/^delete_tip_(\d+)$/);

        // 수정 모달
        if (matchEdit) {
          const idx = Number(matchEdit[1]);
          const modal = new ModalBuilder()
            .setCustomId(`edit_tip_modal_${idx}`)
            .setTitle('공지 글 수정')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('edit_tip_input')
                  .setLabel('수정할 공지 내용을 입력하세요.')
                  .setStyle(TextInputStyle.Paragraph)
                  .setRequired(true)
                  .setValue(data[guildId].tips[idx] || "")
              )
            );
          await btnInt.showModal(modal);
        }

        // 삭제 처리
        if (matchDel) {
          const idx = Number(matchDel[1]);
          data[guildId].tips.splice(idx, 1);
          saveData(data);
          await btnInt.update({ content: `공지 ${idx+1}번이 삭제되었습니다.`, components: [], ephemeral: true });
        }
      });

      return;
    }

    // 공지 기능 켜기/끄기 기존대로(모달 필요없음)
    if (option === 'enable') {
      const { channelId, tips, interval } = data[guildId];
      if (!channelId || !interval || tips.length === 0) {
        return interaction.reply({ content: '공지 채널, 주기, 공지 글이 모두 등록되어야 합니다.', ephemeral: true });
      }
      data[guildId].enabled = true;
      saveData(data);
      startTimer(guildId, channelId, INTERVALS[interval], tips);
      return interaction.reply({ content: '공지 기능이 켜졌습니다.', ephemeral: true });

    } else if (option === 'disable') {
      data[guildId].enabled = false;
      saveData(data);
      stopTimer(guildId);
      return interaction.reply({ content: '공지 기능이 꺼졌습니다.', ephemeral: true });
    }
  },

  // 모달 제출 핸들러
  async modal(interaction) {
    const guildId = interaction.guild.id;
    const data = loadData();
    if (!data[guildId]) data[guildId] = { channelId: null, interval: null, tips: [], enabled: false };

    // 공지채널 설정
    if (interaction.customId === 'set_channel_modal') {
      const channelId = interaction.fields.getTextInputValue('channel_id_input');
      data[guildId].channelId = channelId;
      saveData(data);
      return interaction.reply({ content: `공지 채널이 <#${channelId}> 로 설정되었습니다.`, ephemeral: true });
    }

    // 공지 글 추가
    if (interaction.customId === 'add_tip_modal') {
      const tip = interaction.fields.getTextInputValue('tip_content_input');
      data[guildId].tips.push(tip);
      saveData(data);
      return interaction.reply({ content: '공지 내용이 추가되었습니다.', ephemeral: true });
    }

    // 공지 주기 선택
    if (interaction.customId === 'set_interval_modal') {
      const interval = interaction.fields.getTextInputValue('interval_input');
      if (!INTERVALS[interval]) {
        return interaction.reply({ content: '공지 주기를 "1시간", "3시간", "6시간", "12시간", "24시간" 중 하나로 입력해주세요.', ephemeral: true });
      }
      const { channelId, tips, enabled } = data[guildId];
      if (!channelId || tips.length === 0) {
        return interaction.reply({ content: '공지 채널 또는 공지 글이 먼저 등록되어야 합니다.', ephemeral: true });
      }
      data[guildId].interval = interval;
      saveData(data);
      if (enabled) startTimer(guildId, channelId, INTERVALS[interval], tips);
      return interaction.reply({ content: `${interval} 간격으로 공지가 전송되도록 설정되었습니다.`, ephemeral: true });
    }

    // 공지 글 수정
    if (interaction.customId.startsWith('edit_tip_modal_')) {
      const idx = Number(interaction.customId.replace('edit_tip_modal_', ''));
      const newContent = interaction.fields.getTextInputValue('edit_tip_input');
      data[guildId].tips[idx] = newContent;
      saveData(data);
      return interaction.reply({ content: `공지 ${idx+1}번이 수정되었습니다.`, ephemeral: true });
    }
  }
};
