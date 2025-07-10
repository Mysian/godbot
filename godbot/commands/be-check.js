const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const bePath = path.join(__dirname, '../data/BE.json');

function loadBE() {
  if (!fs.existsSync(bePath)) fs.writeFileSync(bePath, '{}');
  return JSON.parse(fs.readFileSync(bePath, 'utf8'));
}
const formatAmount = n => Number(n).toLocaleString('ko-KR');
const EMBED_IMAGE = 'https://media.discordapp.net/attachments/1388728993787940914/1392698206189523113/Image_fx.jpg?ex=68707ac7&is=686f2947&hm=cf727fd173aaf411d649eec368a03b3715b7518075715dde84f97a9976a6b7a8&=&format=webp';

const PAGE_SIZE = 10;

function buildEmbed(targetUser, data, page, maxPage, filter) {
  let historyList = data.history || [];
  if (filter === 'earn') historyList = historyList.filter(h => h.type === 'earn');
  if (filter === 'spend') historyList = historyList.filter(h => h.type === 'spend');

  const total = historyList.length;
  const offset = (page - 1) * PAGE_SIZE;
  const history = historyList
    .slice()
    .reverse()
    .slice(offset, offset + PAGE_SIZE)
    .map(h =>
      `${h.type === "earn" ? "🔷" : "🔻"} ${formatAmount(h.amount)} BE | ${h.reason || "사유 없음"} | <t:${Math.floor(h.timestamp / 1000)}:R>`
    ).join('\n') || "내역 없음";

  const embed = new EmbedBuilder()
    .setTitle(`💙 ${targetUser.tag}`)
    .setDescription(`<@${targetUser.id}>님의 🔷파랑 정수(BE) 잔액: **${formatAmount(data.amount)} BE**`)
    .addFields(
      { name: `📜 최근 거래 내역 (${page}/${maxPage}) [총 ${total}개]`, value: history }
    )
    .setColor(0x3399ff)
    .setImage(EMBED_IMAGE);

  if (filter === 'earn') embed.setFooter({ text: '이익(earn)만 표시중' });
  else if (filter === 'spend') embed.setFooter({ text: '손해(spend)만 표시중' });

  return embed;
}

function buildRow(page, maxPage, filter) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('prev')
      .setLabel('◀ 이전')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId('next')
      .setLabel('다음 ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= maxPage),
    new ButtonBuilder()
      .setCustomId('earnonly')
      .setLabel('🟦 이익만')
      .setStyle(filter === 'earn' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('spendonly')
      .setLabel('🔻 손해만')
      .setStyle(filter === 'spend' ? ButtonStyle.Danger : ButtonStyle.Secondary)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('정수조회')
    .setDescription('파랑 정수(BE) 잔액과 최근 거래내역을 확인합니다.')
    .addUserOption(opt =>
      opt.setName('유저')
        .setDescription('조회할 대상 유저 (입력 안하면 본인)')
        .setRequired(false)
    ),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('유저') || interaction.user;
    const be = loadBE();
    const data = be[targetUser.id];

    if (!data) {
      await interaction.reply({
        content: `❌ <@${targetUser.id}>님의 🔷파랑 정수(BE) 데이터가 없습니다.`,
        ephemeral: true
      });
      return;
    }

    let page = 1;
    let filter = 'all';
    let historyList = data.history || [];
    let filteredHistory = historyList;
    if (filter === 'earn') filteredHistory = historyList.filter(h => h.type === 'earn');
    if (filter === 'spend') filteredHistory = historyList.filter(h => h.type === 'spend');
    let maxPage = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE));

    const embed = buildEmbed(targetUser, data, page, maxPage, filter);
    const row = buildRow(page, maxPage, filter);

    const msg = await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
      fetchReply: true
    });

    // 5분 동안 상호작용 가능
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300_000 });

    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id)
        return await i.reply({ content: '본인만 조작 가능.', ephemeral: true });

      if (i.customId === 'prev') page--;
      if (i.customId === 'next') page++;
      if (i.customId === 'earnonly') {
        filter = filter === 'earn' ? 'all' : 'earn';
        page = 1;
      }
      if (i.customId === 'spendonly') {
        filter = filter === 'spend' ? 'all' : 'spend';
        page = 1;
      }

      // 필터 적용
      historyList = data.history || [];
      filteredHistory = historyList;
      if (filter === 'earn') filteredHistory = historyList.filter(h => h.type === 'earn');
      if (filter === 'spend') filteredHistory = historyList.filter(h => h.type === 'spend');
      maxPage = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE));
      page = Math.max(1, Math.min(page, maxPage));

      const newEmbed = buildEmbed(targetUser, data, page, maxPage, filter);
      const newRow = buildRow(page, maxPage, filter);

      await i.update({ embeds: [newEmbed], components: [newRow] });
    });

    collector.on('end', async () => {
      try {
        await msg.edit({ components: [] });
      } catch (e) { }
    });
  }
};
