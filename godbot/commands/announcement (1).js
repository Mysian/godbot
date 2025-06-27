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

const PAGE_SIZE = 5;

async function showTipsPage(interaction, data, guildId, page) {
  const tips = data[guildId].tips;
  const maxPage = Math.ceil(tips.length / PAGE_SIZE) || 1;
  if (page < 1) page = 1;
  if (page > maxPage) page = maxPage;

  const start = (page - 1) * PAGE_SIZE;
  const pageTips = tips.slice(start, start + PAGE_SIZE);

  let msg = `현재 등록된 공지 (${tips.length}개) [${page}/${maxPage}]:\n`;
  pageTips.forEach((tip, i) => {
    msg += `\n${start + i + 1}. ${tip}`;
  });

  const rows = [];
  for (let i = 0; i < pageTips.length; i++) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`edit_tip_${start + i}_page_${page}`)
          .setLabel('수정')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`delete_tip_${start + i}_page_${page}`)
          .setLabel('삭제')
          .setStyle(ButtonStyle.Danger)
      )
    );
  }

  // 페이지 이동 버튼
  const navRow = new ActionRowBuilder();
  navRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`prev_page_${page}`)
      .setLabel('⬅ 이전')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`next_page_${page}`)
      .setLabel('다음 ➡')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= maxPage)
  );
  rows.push(navRow);

  // 처음만 reply, 이후는 update
  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ content: msg, components: rows, ephemeral: true });
  } else {
    await interaction.reply({ content: msg, components: rows, ephemeral: true });
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

    // 공지 글 리스트 (수정/삭제/페이지 이동)
    if (option === 'list_tips') {
      if (data[guildId].tips.length === 0) return interaction.reply({ content: '등록된 공지가 없습니다.', ephemeral: true });
      await showTipsPage(interaction, data, guildId, 1);

      // 버튼 핸들러
      const filter = btnInt => btnInt.user.id === interaction.user.id;
      const collector = interaction.channel.createMessageComponentCollector({ filter, time: 120_000 });

      collector.on('collect', async btnInt => {
        // 페이지 이동
        if (btnInt.customId.startsWith('prev_page_') || btnInt.customId.startsWith('next_page_')) {
          let curPage = parseInt(btnInt.customId.split('_').pop());
          let newPage = btnInt.customId.startsWith('prev') ? curPage - 1 : curPage + 1;
          await showTipsPage(btnInt, data, guildId, newPage);
          return;
        }
        // 수정/삭제
        const editMatch = btnInt.customId.match(/^edit_tip_(\d+)_page_(\d+)$/);
        const delMatch = btnInt.customId.match(/^delete_tip_(\d+)_page_(\d+)$/);

        if (editMatch) {
          const idx = Number(editMatch[1]);
          const page = Number(editMatch[2]);
          const modal = new ModalBuilder()
            .setCustomId(`edit_tip_modal_${idx}_page_${page}`)
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
        if (delMatch) {
          const idx = Number(delMatch[1]);
          const page = Number(delMatch[2]);
          data[guildId].tips.splice(idx, 1);
          saveData(data);
          await showTipsPage(btnInt, data, guildId, page);
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

    // 공지 글 수정 (페이지 정보 포함)
    if (interaction.customId.startsWith('edit_tip_modal_')) {
      const match = interaction.customId.match(/^edit_tip_modal_(\d+)(?:_page_(\d+))?$/);
      const idx = Number(match[1]);
      const page = match[2] ? Number(match[2]) : 1;
      const newContent = interaction.fields.getTextInputValue('edit_tip_input');
      data[guildId].tips[idx] = newContent;
      saveData(data);

      // showTipsPage를 직접 쓸 수 없으므로, 간단한 메시지로 대체(필요시 직접 갱신해도 됨)
      return interaction.reply({ content: `공지 ${idx+1}번이 수정되었습니다.`, ephemeral: true });
    }
  }
};
