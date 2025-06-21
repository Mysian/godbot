// commands/announcement.js
const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('공지하기')
    .setDescription('공지 관련 명령어')
    .addStringOption(option =>
      option.setName('옵션')
        .setDescription('공지채널 설정/공지 글 추가/공지 리스트/공지 주기 선택')
        .setRequired(true)
        .addChoices(
          { name: '공지채널 설정', value: 'set_channel' },
          { name: '공지 글 추가', value: 'add_tip' },
          { name: '공지 리스트', value: 'list_tips' },
          { name: '공지 주기 선택', value: 'set_interval' }
        )
    )
    .addStringOption(option =>
      option.setName('입력')
        .setDescription('채널ID 또는 공지내용 또는 주기 선택')
        .setRequired(false)
    ),

  async execute(interaction) {
    const option = interaction.options.getString('옵션');
    const input = interaction.options.getString('입력');
    const guildId = interaction.guild.id;
    const data = loadData();
    if (!data[guildId]) data[guildId] = { channelId: null, interval: null, tips: [] };

    if (option === 'set_channel') {
      if (!input) return interaction.reply({ content: '채널 ID를 입력해주세요.', ephemeral: true });
      data[guildId].channelId = input;
      saveData(data);
      return interaction.reply({ content: `공지 채널이 <#${input}> 로 설정되었습니다.`, ephemeral: true });

    } else if (option === 'add_tip') {
      if (!input) return interaction.reply({ content: '추가할 공지 내용을 입력해주세요.', ephemeral: true });
      data[guildId].tips.push(input);
      saveData(data);
      return interaction.reply({ content: '공지 내용이 추가되었습니다.', ephemeral: true });

    } else if (option === 'list_tips') {
      if (data[guildId].tips.length === 0) return interaction.reply({ content: '등록된 공지가 없습니다.', ephemeral: true });
      let msg = `현재 등록된 공지 (${data[guildId].tips.length}개):\n`;
      data[guildId].tips.forEach((tip, i) => {
        msg += `\n${i + 1}. ${tip}`;
      });
      return interaction.reply({ content: msg, ephemeral: true });

    } else if (option === 'set_interval') {
      if (!INTERVALS[input]) {
        return interaction.reply({ content: '공지 주기를 "1시간", "3시간", "6시간", "12시간", "24시간" 중 하나로 입력해주세요.', ephemeral: true });
      }
      const { channelId, tips } = data[guildId];
      if (!channelId || tips.length === 0) {
        return interaction.reply({ content: '공지 채널 또는 공지 글이 먼저 등록되어야 합니다.', ephemeral: true });
      }
      data[guildId].interval = input;
      saveData(data);
      startTimer(guildId, channelId, INTERVALS[input], tips);
      return interaction.reply({ content: `${input} 간격으로 공지가 자동 전송됩니다.`, ephemeral: true });
    }
  }
};
