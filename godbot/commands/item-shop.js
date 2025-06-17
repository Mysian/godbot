const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const ITEMS = require('../utils/items.js');

const bePath = path.join(__dirname, '../data/BE.json');
const itemsPath = path.join(__dirname, '../data/items.json');

function loadJson(p, isArray = false) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, isArray ? "[]" : "{}");
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('아이템상점')
    .setDescription('파랑 정수(BE)로 아이템을 구매할 수 있는 상점입니다.'),

  async execute(interaction) {
    const ITEM_LIST = Object.values(ITEMS);
    const sorted = ITEM_LIST.slice().sort((a, b) => b.price - a.price);
    let page = 0;
    const ITEMS_PER_PAGE = 5;
    const maxPage = Math.ceil(ITEM_LIST.length / ITEMS_PER_PAGE);

    // 임베드 + 각 아이템별 구매 버튼 생성 함수
    const getEmbedAndRows = (_page) => {
      const showItems = sorted.slice(_page * ITEMS_PER_PAGE, (_page + 1) * ITEMS_PER_PAGE);
      const embed = new EmbedBuilder()
        .setTitle("🛒 아이템 상점")
        .setDescription(showItems.map((item, i) =>
          `#${i + 1 + _page * ITEMS_PER_PAGE} | ${item.icon || ""} **${item.name}** (${item.price} BE)\n${item.desc}`
        ).join("\n\n"))
        .setFooter({ text: `총 아이템: ${ITEM_LIST.length} | 페이지 ${_page + 1}/${maxPage}` });

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("item_prev").setLabel("이전 페이지").setStyle(ButtonStyle.Secondary).setDisabled(_page === 0),
        new ButtonBuilder().setCustomId("item_refresh").setLabel("새로고침").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("item_next").setLabel("다음 페이지").setStyle(ButtonStyle.Secondary).setDisabled(_page + 1 >= maxPage),
      );
      // 각 아이템별 구매 버튼
      const rowBuy = new ActionRowBuilder();
      showItems.forEach(item => {
        rowBuy.addComponents(
          new ButtonBuilder()
            .setCustomId(`buy_${item.name}`)
            .setLabel(`${item.name} 구매`)
            .setStyle(ButtonStyle.Primary)
        );
      });

      return { embed, rows: [row1, rowBuy] };
    };

    const { embed, rows } = getEmbedAndRows(page);
    await interaction.reply({ embeds: [embed], components: rows, ephemeral: false });

    const filter = i => i.user.id === interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 90000 });

    collector.on('collect', async i => {
      let updated = false;
      if (i.customId === "item_prev" && page > 0) { page--; updated = true; }
      if (i.customId === "item_next" && (page + 1) * ITEMS_PER_PAGE < sorted.length) { page++; updated = true; }
      if (i.customId === "item_refresh") { updated = true; }

      if (updated) {
        const { embed, rows } = getEmbedAndRows(page);
        await i.update({ embeds: [embed], components: rows });
        return;
      }

      if (i.customId.startsWith("buy_")) {
        const itemName = i.customId.replace("buy_", "");
        const item = ITEM_LIST.find(x => x.name === itemName);
        if (!item) {
          await i.reply({ content: "해당 아이템을 찾을 수 없습니다.", ephemeral: true });
          return;
        }
        // 인벤토리 개수 확인(최대 99)
        const items = loadJson(itemsPath);
        items[i.user.id] = items[i.user.id] || {};
        const myItem = items[i.user.id][item.name] || { count: 0, desc: item.desc };
        if (myItem.count >= 99) {
          await i.reply({ content: `최대 99개까지만 소지할 수 있습니다. (보유: ${myItem.count})`, ephemeral: true });
          return;
        }
        // 결제/기록
        const be = loadJson(bePath);
        const userBe = be[i.user.id]?.amount || 0;
        if (userBe < item.price) {
          await i.reply({ content: `파랑 정수 부족! (보유: ${userBe} BE)`, ephemeral: true });
          return;
        }
        be[i.user.id] = be[i.user.id] || { amount: 0, history: [] };
        be[i.user.id].amount -= item.price;
        be[i.user.id].history.push({ type: "spend", amount: item.price, reason: `${item.name} 구매`, timestamp: Date.now() });
        saveJson(bePath, be);

        myItem.count += 1;
        items[i.user.id][item.name] = myItem;
        saveJson(itemsPath, items);

        await i.reply({ content: `✅ [${item.name}]을(를) ${item.price} BE에 구매 완료! (최대 99개까지 소지 가능)`, ephemeral: true });
        return;
      }
    });

    collector.on('end', async () => {
      try { await interaction.editReply({ components: [] }); } catch (e) {}
    });
  }
};
