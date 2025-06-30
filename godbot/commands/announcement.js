const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../data/announcements.json');
const ANNOUNCE_INTERVAL = 3 * 60 * 60 * 1000; // 3시간
const PAGE_SIZE = 5;
const EMOJIS = ['💜', '💙', '💚', '💛', '🧡', '❤', '🖤', '🤎', '💗'];

/* ────────────── 공용 함수 ────────────── */
function loadData() {
  if (!fs.existsSync(dataPath)) return {};
  return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}
function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}
function getRandomEmoji() {
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}

const timers = new Map();

function nextScheduleTime(intervalMs) {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const base = new Date(kstNow);
  base.setUTCHours(0, 0, 0, 0); // KST 00:00 기준

  let elapsed = kstNow - base;
  let next = Math.ceil(elapsed / intervalMs) * intervalMs;
  let nextTime = new Date(base.getTime() + next);
  return new Date(nextTime.getTime() - 9 * 60 * 60 * 1000);
}

function startTimer(guildId, channelId, tips) {
  stopTimer(guildId); // 중복 방지
  const sendTip = async () => {
    if (!tips?.length) return;
    const tip = tips[Math.floor(Math.random() * tips.length)];
    const emoji = getRandomEmoji();
    try {
      const channel = await global.client.channels.fetch(channelId).catch(() => null);
      if (channel) await channel.send(`-# ${emoji}: ${tip}`);
    } catch (err) {
      console.error('공지 발송 오류:', err);
    }
  };

  let now = Date.now();
  let nextTime = nextScheduleTime(ANNOUNCE_INTERVAL).getTime();
  if (nextTime <= now) nextTime += ANNOUNCE_INTERVAL;
  let firstWait = nextTime - now;

  const timeout = setTimeout(() => {
    sendTip();
    const interval = setInterval(sendTip, ANNOUNCE_INTERVAL);
    timers.set(guildId, { timeout: null, interval });
  }, firstWait);
  timers.set(guildId, { timeout, interval: null });
}

function stopTimer(guildId) {
  const t = timers.get(guildId);
  if (t) {
    if (t.timeout) clearTimeout(t.timeout);
    if (t.interval) clearInterval(t.interval);
    timers.delete(guildId);
  }
}

function getTipsEmbed(tips, page) {
  const maxPage = Math.ceil(tips.length / PAGE_SIZE) || 1;
  page = Math.min(Math.max(page, 1), maxPage);
  const start = (page - 1) * PAGE_SIZE;
  const pageTips = tips.slice(start, start + PAGE_SIZE);
  return new EmbedBuilder()
    .setTitle(`📋 현재 등록된 공지 (${tips.length}개) [${page}/${maxPage}]`)
    .setColor(0x70a1ff)
    .setDescription(
      pageTips.map((tip, i) => `**#${start + i + 1}**  ${tip}`).join('\n') || '등록된 공지가 없습니다.'
    )
    .setFooter({ text: '수정·삭제할 공지는 번호를 확인해서 진행해주세요.' });
}
function getNavRow(page, maxPage, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`prev_page_${page}`)
      .setLabel('⬅ 이전')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page <= 1),
    new ButtonBuilder()
      .setCustomId(`next_page_${page}`)
      .setLabel('다음 ➡')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page >= maxPage),
    new ButtonBuilder()
      .setCustomId(`edit_tip_modal_page_${page}`)
      .setLabel('공지 수정')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`delete_tip_modal_page_${page}`)
      .setLabel('공지 삭제')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

function restoreTimersOnBoot() {
  const data = loadData();
  for (const guildId in data) {
    const conf = data[guildId];
    if (conf.enabled && conf.channelId && conf.tips?.length) {
      startTimer(guildId, conf.channelId, conf.tips);
    }
  }
}
restoreTimersOnBoot();

/* ────────────── 커맨드 ────────────── */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('공지하기')
    .setDescription('공지 관련 명령어')
    .addStringOption(opt =>
      opt.setName('옵션')
        .setDescription('공지채널 설정/공지 글 추가/공지 리스트/공지기능 켜기/끄기/공지 상태')
        .setRequired(true)
        .addChoices(
          { name: '공지채널 설정', value: 'set_channel' },
          { name: '공지 글 추가', value: 'add_tip' },
          { name: '공지 리스트', value: 'list_tips' },
          { name: '공지기능 켜기', value: 'enable' },
          { name: '공지기능 끄기', value: 'disable' },
          { name: '공지 상태', value: 'status' },
        )
    ),

  /* ───── 슬래시 커맨드 실행 ───── */
  async execute(interaction) {
    const option   = interaction.options.getString('옵션');
    const guildId  = interaction.guild.id;
    const data     = loadData();
    if (!data[guildId]) data[guildId] = { channelId: null, tips: [], enabled: false };

    /* ── 1. 공지 채널 설정 ── */
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

    /* ── 2. 공지 추가 ── */
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

    /* ── 3. 공지 리스트 ── */
    if (option === 'list_tips') {
      if (!data[guildId].tips.length)
        return interaction.reply({ content: '등록된 공지가 없습니다.', ephemeral: true });

      const tips        = data[guildId].tips;
      let currentPage   = 1;
      const maxPage     = Math.ceil(tips.length / PAGE_SIZE) || 1;

      const getPageEmbedAndRow = page => ({
        embed : getTipsEmbed(tips, page),
        navRow: getNavRow(page, maxPage),
      });

      /* 최초 메시지 */
      const { embed, navRow } = getPageEmbedAndRow(currentPage);
      const msg = await interaction.reply({
        embeds: [embed],
        components: [navRow],
        fetchReply: true,
      });

      /* 페이지·수정·삭제 버튼 콜렉터 */
      const filter    = i => i.user.id === interaction.user.id;
      const collector = msg.createMessageComponentCollector({ filter, time: 300_000 });

      collector.on('collect', async i => {
        const id = i.customId;

        /* ← / → 페이지 이동 */
        if (id.startsWith('prev_page_') || id.startsWith('next_page_')) {
          await i.deferUpdate();
          if (id.startsWith('prev_page_') && currentPage > 1) currentPage--;
          if (id.startsWith('next_page_') && currentPage < maxPage) currentPage++;
          const { embed, navRow } = getPageEmbedAndRow(currentPage);
          await msg.edit({ embeds: [embed], components: [navRow] });
          return;
        }

        /* 공지 수정 모달 (index + 내용 한 번에) */
        if (id.startsWith('edit_tip_modal_page_')) {
          const modal = new ModalBuilder()
            .setCustomId(`edit_tip_modal_${currentPage}`)
            .setTitle('공지 수정')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('edit_tip_index')
                  .setLabel('수정할 공지 번호 (#)')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setPlaceholder(`예: ${(currentPage - 1) * PAGE_SIZE + 1}`)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('edit_tip_content')
                  .setLabel('새 공지 내용')
                  .setStyle(TextInputStyle.Paragraph)
                  .setRequired(true)
              ),
            );
          await i.showModal(modal);
          return;
        }

        /* 공지 삭제 모달 */
        if (id.startsWith('delete_tip_modal_page_')) {
          const modal = new ModalBuilder()
            .setCustomId(`delete_tip_modal_${currentPage}`)
            .setTitle('공지 삭제')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('delete_tip_index')
                  .setLabel('삭제할 공지 번호 (#)')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
                  .setPlaceholder(`예: ${(currentPage - 1) * PAGE_SIZE + 1}`)
              ),
            );
          await i.showModal(modal);
          return;
        }
      });

      /* 모달 제출 핸들러 (수정·삭제) */
      const { client } = require('../index.js');
      const modalHandler = async submission => {
        if (!submission.isModalSubmit()) return;

        /* ─ 수정 ─ */
        if (submission.customId.startsWith('edit_tip_modal_')) {
          const idx = Number(submission.fields.getTextInputValue('edit_tip_index')) - 1;
          const content = submission.fields.getTextInputValue('edit_tip_content');
          if (isNaN(idx) || idx < 0 || idx >= tips.length) {
            return submission.reply({ content: '잘못된 번호입니다.', ephemeral: true });
          }
          tips[idx] = content;
          saveData(data);
          await submission.reply({ content: `공지 #${idx + 1}번이 수정되었습니다.`, ephemeral: true });

          /* 리스트 새로고침 */
          const { embed, navRow } = getPageEmbedAndRow(currentPage);
          await msg.edit({ embeds: [embed], components: [navRow] });
          return;
        }

        /* ─ 삭제 ─ */
        if (submission.customId.startsWith('delete_tip_modal_')) {
          const idx = Number(submission.fields.getTextInputValue('delete_tip_index')) - 1;
          if (isNaN(idx) || idx < 0 || idx >= tips.length) {
            return submission.reply({ content: '잘못된 번호입니다.', ephemeral: true });
          }
          tips.splice(idx, 1);
          saveData(data);
          await submission.reply({ content: `공지 #${idx + 1}번이 삭제되었습니다.`, ephemeral: true });

          /* 페이지 계산 후 새로고침 */
          const maxPageNew = Math.ceil(tips.length / PAGE_SIZE) || 1;
          if (currentPage > maxPageNew) currentPage = maxPageNew;
          const { embed, navRow } = getPageEmbedAndRow(currentPage);
          await msg.edit({ embeds: [embed], components: [navRow] });
          return;
        }
      };

      client.on('interactionCreate', modalHandler);
      collector.on('end', () => client.off('interactionCreate', modalHandler));
      return;
    }

    /* ── 4. 상태 출력 ── */
    if (option === 'status') {
      const { channelId, tips, enabled } = data[guildId];
      let status = `**공지 상태**\n`;
      status += `상태: ${enabled ? '켜짐 🟢' : '꺼짐 🔴'}\n`;
      status += `공지 채널: ${channelId ? `<#${channelId}> (${channelId})` : '-'}\n`;
      status += `공지 주기: 3시간 (고정)\n`;
      status += `등록된 공지: ${tips.length}개\n`;
      if (enabled && channelId && tips.length) {
        const nextT = nextScheduleTime(ANNOUNCE_INTERVAL);
        nextT.setHours(nextT.getHours() + 9); // KST
        status += `다음 공지 예정: ${nextT.toISOString().replace('T', ' ').slice(0, 16)} (KST)\n`;
      }
      return interaction.reply({ content: status, ephemeral: true });
    }

    /* ── 5. 켜기/끄기 ── */
    if (option === 'enable') {
      const { channelId, tips } = data[guildId];
      if (!channelId || !tips.length) {
        return interaction.reply({ content: '공지 채널과 공지 글이 모두 등록되어야 합니다.', ephemeral: true });
      }
      data[guildId].enabled = true;
      saveData(data);
      startTimer(guildId, channelId, tips);
      return interaction.reply({ content: '공지 기능이 켜졌습니다.', ephemeral: true });
    }

    if (option === 'disable') {
      data[guildId].enabled = false;
      saveData(data);
      stopTimer(guildId);
      return interaction.reply({ content: '공지 기능이 꺼졌습니다.', ephemeral: true });
    }
  },

  /* ───── 모달 제출 핸들러 (채널 설정/공지 추가) ───── */
  async modal(interaction) {
    const guildId = interaction.guild.id;
    const data    = loadData();
    if (!data[guildId]) data[guildId] = { channelId: null, tips: [], enabled: false };

    /* 채널 설정 */
    if (interaction.customId === 'set_channel_modal') {
      const channelId = interaction.fields.getTextInputValue('channel_id_input');
      data[guildId].channelId = channelId;
      saveData(data);
      return interaction.reply({ content: `공지 채널이 <#${channelId}> 로 설정되었습니다.`, ephemeral: true });
    }

    /* 공지 추가 */
    if (interaction.customId === 'add_tip_modal') {
      const tip = interaction.fields.getTextInputValue('tip_content_input');
      data[guildId].tips.push(tip);
      saveData(data);
      if (data[guildId].enabled && data[guildId].channelId && data[guildId].tips.length) {
        startTimer(guildId, data[guildId].channelId, data[guildId].tips);
      }
      return interaction.reply({ content: '공지 내용이 추가되었습니다.', ephemeral: true });
    }
  },
};
