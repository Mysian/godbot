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

// 시간(분) 파싱
function parseInterval(text) {
  if (!text) return null;
  // "30분" or "120분"
  const minMatch = text.match(/^(\d+)\s*분$/);
  if (minMatch) {
    const mins = Number(minMatch[1]);
    if (isNaN(mins) || mins < 1) return null;
    return mins * 60000;
  }
  // "2시간" 등은 예전 지원, "120분" 권장
  const hourMatch = text.match(/^(\d+)\s*시간$/);
  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    if (isNaN(hours) || hours < 1) return null;
    return hours * 3600000;
  }
  // 숫자만 썼으면 분 단위로 간주
  if (/^\d+$/.test(text)) {
    const mins = Number(text);
    if (isNaN(mins) || mins < 1) return null;
    return mins * 60000;
  }
  return null;
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
    msg += `\n#${start + i + 1} ${tip}`;
  });

  // 버튼: 이전, 다음, 수정, 삭제
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`prev_page_${page}`)
      .setLabel('⬅ 이전')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`next_page_${page}`)
      .setLabel('다음 ➡')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= maxPage),
    new ButtonBuilder()
      .setCustomId(`edit_tip_modal_page_${page}`)
      .setLabel('공지 수정')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`delete_tip_modal_page_${page}`)
      .setLabel('공지 삭제')
      .setStyle(ButtonStyle.Danger)
  );

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ content: msg, components: [navRow], ephemeral: true });
  } else {
    await interaction.reply({ content: msg, components: [navRow], ephemeral: true });
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

    // 공지 주기 선택 모달 (분 단위)
    if (option === 'set_interval') {
      const modal = new ModalBuilder()
        .setCustomId('set_interval_modal')
        .setTitle('공지 주기 선택')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('interval_input')
              .setLabel('"30분", "120분" 등 분 단위로 입력 (1~10080분)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder('예: 30분, 120분')
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

        // 공지 수정
        if (btnInt.customId.startsWith('edit_tip_modal_page_')) {
          const modal = new ModalBuilder()
            .setCustomId(`edit_tip_number_modal_page`)
            .setTitle('공지 수정')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('edit_tip_number_input')
                  .setLabel('수정할 공지 번호를 입력하세요 (#숫자)')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setPlaceholder('예: 1')
              )
            );
          await btnInt.showModal(modal);
          return;
        }

        // 공지 삭제
        if (btnInt.customId.startsWith('delete_tip_modal_page_')) {
          const modal = new ModalBuilder()
            .setCustomId(`delete_tip_number_modal_page`)
            .setTitle('공지 삭제')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('delete_tip_number_input')
                  .setLabel('삭제할 공지 번호를 입력하세요 (#숫자)')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setPlaceholder('예: 1')
              )
            );
          await btnInt.showModal(modal);
          return;
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
      startTimer(guildId, channelId, interval, tips);
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

    // 공지 주기 선택 (분 단위 자유 입력)
    if (interaction.customId === 'set_interval_modal') {
      const intervalText = interaction.fields.getTextInputValue('interval_input').replace(/\s/g, "");
      const interval = parseInterval(intervalText);
      if (!interval || interval < 60000 || interval > 10080 * 60000) {
        return interaction.reply({ content: '공지 주기는 1분 ~ 10080분(7일) 사이로 "30분" 또는 "120분" 등으로 입력해주세요.', ephemeral: true });
      }
      data[guildId].interval = interval;
      saveData(data);
      if (data[guildId].enabled && data[guildId].channelId && data[guildId].tips.length > 0) {
        startTimer(guildId, data[guildId].channelId, interval, data[guildId].tips);
      }
      return interaction.reply({ content: `공지 주기가 ${Math.floor(interval/60000)}분으로 설정되었습니다.`, ephemeral: true });
    }

    // 공지 수정 번호 입력 모달
    if (interaction.customId === 'edit_tip_number_modal_page') {
      const idxText = interaction.fields.getTextInputValue('edit_tip_number_input');
      let idx = parseInt(idxText.replace(/[#\s]/g, '')) - 1;
      if (isNaN(idx) || idx < 0 || idx >= data[guildId].tips.length) {
        return interaction.reply({ content: '잘못된 번호입니다.', ephemeral: true });
      }
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
      await interaction.showModal(modal);
      return;
    }

    // 실제 공지 수정
    if (interaction.customId.startsWith('edit_tip_modal_')) {
      const match = interaction.customId.match(/^edit_tip_modal_(\d+)$/);
      const idx = Number(match[1]);
      const newContent = interaction.fields.getTextInputValue('edit_tip_input');
      data[guildId].tips[idx] = newContent;
      saveData(data);
      return interaction.reply({ content: `공지 #${idx+1}번이 수정되었습니다.`, ephemeral: true });
    }

    // 공지 삭제 번호 입력 모달
    if (interaction.customId === 'delete_tip_number_modal_page') {
      const idxText = interaction.fields.getTextInputValue('delete_tip_number_input');
      let idx = parseInt(idxText.replace(/[#\s]/g, '')) - 1;
      if (isNaN(idx) || idx < 0 || idx >= data[guildId].tips.length) {
        return interaction.reply({ content: '잘못된 번호입니다.', ephemeral: true });
      }
      const del = data[guildId].tips.splice(idx, 1);
      saveData(data);
      return interaction.reply({ content: `공지 #${idx+1}번이 삭제되었습니다.`, ephemeral: true });
    }
  }
};
