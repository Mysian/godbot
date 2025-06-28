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

// 공지 주기(3시간) 고정
const ANNOUNCE_INTERVAL = 3 * 60 * 60 * 1000;

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

function nextScheduleTime(intervalMs) {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const base = new Date(kstNow);
  base.setUTCHours(0,0,0,0); // KST 00:00 기준

  let elapsed = kstNow - base;
  let next = Math.ceil(elapsed / intervalMs) * intervalMs;
  let nextTime = new Date(base.getTime() + next);
  return new Date(nextTime.getTime() - 9 * 60 * 60 * 1000);
}

function startTimer(guildId, channelId, tips) {
  if (timers.has(guildId)) clearInterval(timers.get(guildId));
  let now = Date.now();
  let nextTime = nextScheduleTime(ANNOUNCE_INTERVAL).getTime();
  if (nextTime <= now) nextTime += ANNOUNCE_INTERVAL;
  let firstWait = nextTime - now;

  const sendTip = async () => {
    const tip = tips[Math.floor(Math.random() * tips.length)];
    const emoji = getRandomEmoji();
    const channel = await global.client.channels.fetch(channelId).catch(() => null);
    if (channel) channel.send(`-# ${emoji}: ${tip}`);
  };

  const timeout = setTimeout(() => {
    sendTip();
    timers.set(guildId, setInterval(sendTip, ANNOUNCE_INTERVAL));
  }, firstWait);

  timers.set(guildId, timeout);
}

function stopTimer(guildId) {
  if (timers.has(guildId)) {
    clearInterval(timers.get(guildId));
    clearTimeout(timers.get(guildId));
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
    msg += `\n#${start + i + 1} ${tip}`;
  });

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

function intervalToText(ms) {
  if (!ms) return '-';
  const hour = 60 * 60 * 1000;
  if (ms % hour === 0) return `${ms/hour}시간`;
  return `${(ms/60000).toFixed(0)}분`;
}

// 봇이 실행될 때 자동 복원
function restoreTimersOnBoot() {
  const data = loadData();
  for (const guildId in data) {
    const conf = data[guildId];
    if (conf.enabled && conf.channelId && conf.tips && conf.tips.length > 0) {
      startTimer(guildId, conf.channelId, conf.tips);
    }
  }
}

// 최초 로드 시 바로 복원
restoreTimersOnBoot();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('공지하기')
    .setDescription('공지 관련 명령어')
    .addStringOption(option =>
      option.setName('옵션')
        .setDescription('공지채널 설정/공지 글 추가/공지 리스트/공지기능 켜기/끄기/공지 상태')
        .setRequired(true)
        .addChoices(
          { name: '공지채널 설정', value: 'set_channel' },
          { name: '공지 글 추가', value: 'add_tip' },
          { name: '공지 리스트', value: 'list_tips' },
          { name: '공지기능 켜기', value: 'enable' },
          { name: '공지기능 끄기', value: 'disable' },
          { name: '공지 상태', value: 'status' }
        )
    ),

  async execute(interaction) {
    const option = interaction.options.getString('옵션');
    const guildId = interaction.guild.id;
    const data = loadData();
    if (!data[guildId]) data[guildId] = { channelId: null, tips: [], enabled: false };

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

    // 공지 글 리스트 (수정/삭제/페이지 이동)
    if (option === 'list_tips') {
      if (data[guildId].tips.length === 0) return interaction.reply({ content: '등록된 공지가 없습니다.', ephemeral: true });
      await showTipsPage(interaction, data, guildId, 1);

      const filter = btnInt => btnInt.user.id === interaction.user.id;
      const collector = interaction.channel.createMessageComponentCollector({ filter, time: 120_000 });

      collector.on('collect', async btnInt => {
        if (btnInt.customId.startsWith('prev_page_') || btnInt.customId.startsWith('next_page_')) {
          let curPage = parseInt(btnInt.customId.split('_').pop());
          let newPage = btnInt.customId.startsWith('prev') ? curPage - 1 : curPage + 1;
          await showTipsPage(btnInt, data, guildId, newPage);
          return;
        }
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

    // 공지 상태
    if (option === 'status') {
      const { channelId, tips, enabled } = data[guildId];
      let status = `**공지 상태**\n`;
      status += `상태: ${enabled ? '켜짐 🟢' : '꺼짐 🔴'}\n`;
      status += `공지 채널: ${channelId ? `<#${channelId}> (${channelId})` : '-'}\n`;
      status += `공지 주기: 3시간 (고정)\n`;
      status += `등록된 공지: ${tips.length}개\n`;
      if (enabled && channelId && tips.length > 0) {
        const nextT = nextScheduleTime(ANNOUNCE_INTERVAL);
        nextT.setHours(nextT.getHours() + 9); // KST 표시
        status += `다음 공지 예정: ${nextT.toISOString().replace('T', ' ').slice(0, 16)} (KST)\n`;
      }
      await interaction.reply({ content: status, ephemeral: true });
      return;
    }

    // 공지 기능 켜기/끄기
    if (option === 'enable') {
      const { channelId, tips } = data[guildId];
      if (!channelId || tips.length === 0) {
        return interaction.reply({ content: '공지 채널과 공지 글이 모두 등록되어야 합니다.', ephemeral: true });
      }
      data[guildId].enabled = true;
      saveData(data);
      startTimer(guildId, channelId, tips);
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
    if (!data[guildId]) data[guildId] = { channelId: null, tips: [], enabled: false };

    if (interaction.customId === 'set_channel_modal') {
      const channelId = interaction.fields.getTextInputValue('channel_id_input');
      data[guildId].channelId = channelId;
      saveData(data);
      return interaction.reply({ content: `공지 채널이 <#${channelId}> 로 설정되었습니다.`, ephemeral: true });
    }
    if (interaction.customId === 'add_tip_modal') {
      const tip = interaction.fields.getTextInputValue('tip_content_input');
      data[guildId].tips.push(tip);
      saveData(data);
      return interaction.reply({ content: '공지 내용이 추가되었습니다.', ephemeral: true });
    }
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
    if (interaction.customId.startsWith('edit_tip_modal_')) {
      const match = interaction.customId.match(/^edit_tip_modal_(\d+)$/);
      const idx = Number(match[1]);
      const newContent = interaction.fields.getTextInputValue('edit_tip_input');
      data[guildId].tips[idx] = newContent;
      saveData(data);
      return interaction.reply({ content: `공지 #${idx+1}번이 수정되었습니다.`, ephemeral: true });
    }
    if (interaction.customId === 'delete_tip_number_modal_page') {
      const idxText = interaction.fields.getTextInputValue('delete_tip_number_input');
      let idx = parseInt(idxText.replace(/[#\s]/g, '')) - 1;
      if (isNaN(idx) || idx < 0 || idx >= data[guildId].tips.length) {
        return interaction.reply({ content: '잘못된 번호입니다.', ephemeral: true });
      }
      data[guildId].tips.splice(idx, 1);
      saveData(data);
      return interaction.reply({ content: `공지 #${idx+1}번이 삭제되었습니다.`, ephemeral: true });
    }
  }
};
