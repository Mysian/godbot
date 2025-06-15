const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

// 경로
const bePath = path.join(__dirname, '../data/BE.json');
const marketPath = path.join(__dirname, '../data/item-market.json');
const itemsPath = path.join(__dirname, '../data/items.json');

// 데이터 유틸
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
    .setDescription('파랑 정수(BE)로 아이템을 구매할 수 있는 상점을 엽니다.'),

  async execute(interaction) {
    const market = loadJson(marketPath);
    const itemKeys = Object.keys(market);
    if (!itemKeys.length) {
      await interaction.reply({ content: "상점에 등록된 상품이 없습니다!", ephemeral: true });
      return;
    }

    // 한 페이지 5개, 최근 등록순
    const sorted = itemKeys.map(k => ({ ...market[k], id: k })).sort((a, b) => b.timestamp - a.timestamp);
    let page = 0;
    const showItems = sorted.slice(page * 5, (page + 1) * 5);

    // 임베드
    const embed = new EmbedBuilder()
      .setTitle("🛒 아이템 상점")
      .setDescription(showItems.map((item, i) =>
        `#${i + 1} | **${item.name}** (${item.price} BE, 재고:${item.stock})\n${item.desc}\n판매자: ${item.sellerTag}`
      ).join("\n\n"))
      .setFooter({ text: `총 상품: ${itemKeys.length} | 페이지 ${page + 1}/${Math.ceil(itemKeys.length / 5)}` });

    // 버튼
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("item_prev").setLabel("이전 페이지").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("item_refresh").setLabel("새로고침").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("item_next").setLabel("다음 페이지").setStyle(ButtonStyle.Secondary),
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("item_buy").setLabel("구매").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("item_search").setLabel("검색").setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: false });

    // 버튼 상호작용
    const filter = i => i.user.id === interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 90000 });

    collector.on('collect', async i => {
      let nowPage = page;
      if (i.customId === "item_prev" && page > 0) nowPage--;
      if (i.customId === "item_next" && (page + 1) * 5 < sorted.length) nowPage++;
      if (i.customId === "item_refresh") nowPage = page;
      if (["item_prev", "item_next", "item_refresh"].includes(i.customId)) {
        const showItems = sorted.slice(nowPage * 5, (nowPage + 1) * 5);
        const embed = new EmbedBuilder()
          .setTitle("🛒 아이템 상점")
          .setDescription(showItems.map((item, idx) =>
            `#${idx + 1 + nowPage * 5} | **${item.name}** (${item.price} BE, 재고:${item.stock})\n${item.desc}\n판매자: ${item.sellerTag}`
          ).join("\n\n"))
          .setFooter({ text: `총 상품: ${itemKeys.length} | 페이지 ${nowPage + 1}/${Math.ceil(itemKeys.length / 5)}` });
        await i.update({ embeds: [embed] });
        page = nowPage;
        return;
      }

      // 구매(맨 위 상품)
      if (i.customId === "item_buy") {
        const showItems = sorted.slice(page * 5, (page + 1) * 5);
        const item = showItems[0];
        if (!item || item.stock < 1) {
          await i.reply({ content: "구매할 수 있는 상품이 없습니다.", ephemeral: true });
          return;
        }
        const be = loadJson(bePath);
        const userBe = be[i.user.id]?.amount || 0;
        if (userBe < item.price) {
          await i.reply({ content: `파랑 정수 부족! (보유: ${userBe} BE)`, ephemeral: true });
          return;
        }
        // 결제/기록
        be[i.user.id] = be[i.user.id] || { amount: 0, history: [] };
        be[i.user.id].amount -= item.price;
        be[i.user.id].history.push({ type: "spend", amount: item.price, reason: `${item.name} 구매`, timestamp: Date.now() });
        saveJson(bePath, be);

        // 인벤토리 적재
        const items = loadJson(itemsPath);
        items[i.user.id] = items[i.user.id] || {};
        items[i.user.id][item.name] = items[i.user.id][item.name] || { count: 0, desc: item.desc };
        items[i.user.id][item.name].count += 1;
        saveJson(itemsPath, items);

        // 재고 차감
        market[item.id].stock -= 1;
        if (market[item.id].stock <= 0) delete market[item.id];
        saveJson(marketPath, market);

        await i.reply({ content: `✅ [${item.name}]을(를) ${item.price} BE에 구매 완료!`, ephemeral: true });
        return;
      }

      // 검색(미구현)
      if (i.customId === "item_search") {
        await i.reply({ content: "아이템 검색 기능은 추후 추가!", ephemeral: true });
      }
    });

    collector.on('end', async () => {
      try { await interaction.editReply({ components: [] }); } catch (e) {}
    });
  }
};
