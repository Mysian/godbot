const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

// 경로
const bePath = path.join(__dirname, '../data/BE.json');
const marketPath = path.join(__dirname, '../data/skill-market.json');
const skillsPath = path.join(__dirname, '../data/skills.json');

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
    .setName('스킬상점')
    .setDescription('파랑 정수(BE)로 스킬을 구매할 수 있는 상점을 엽니다.'),

  async execute(interaction) {
    const market = loadJson(marketPath);
    const skillKeys = Object.keys(market);
    if (!skillKeys.length) {
      await interaction.reply({ content: "상점에 등록된 스킬이 없습니다!", ephemeral: true });
      return;
    }

    // 한 페이지 5개, 최근 등록순
    const sorted = skillKeys.map(k => ({ ...market[k], id: k })).sort((a, b) => b.timestamp - a.timestamp);
    let page = 0;
    const showSkills = sorted.slice(page * 5, (page + 1) * 5);

    // 임베드
    const embed = new EmbedBuilder()
      .setTitle("📚 스킬 상점")
      .setDescription(showSkills.map((skill, i) =>
        `#${i + 1} | **${skill.name}** (${skill.price} BE, 재고:${skill.stock})\n${skill.desc}\n판매자: ${skill.sellerTag}`
      ).join("\n\n"))
      .setFooter({ text: `총 스킬: ${skillKeys.length} | 페이지 ${page + 1}/${Math.ceil(skillKeys.length / 5)}` });

    // 버튼
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("skill_prev").setLabel("이전 페이지").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("skill_refresh").setLabel("새로고침").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("skill_next").setLabel("다음 페이지").setStyle(ButtonStyle.Secondary),
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("skill_buy").setLabel("구매").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("skill_search").setLabel("검색").setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: false });

    // 버튼 상호작용
    const filter = i => i.user.id === interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 90000 });

    collector.on('collect', async i => {
      let nowPage = page;
      if (i.customId === "skill_prev" && page > 0) nowPage--;
      if (i.customId === "skill_next" && (page + 1) * 5 < sorted.length) nowPage++;
      if (i.customId === "skill_refresh") nowPage = page;
      if (["skill_prev", "skill_next", "skill_refresh"].includes(i.customId)) {
        const showSkills = sorted.slice(nowPage * 5, (nowPage + 1) * 5);
        const embed = new EmbedBuilder()
          .setTitle("📚 스킬 상점")
          .setDescription(showSkills.map((skill, idx) =>
            `#${idx + 1 + nowPage * 5} | **${skill.name}** (${skill.price} BE, 재고:${skill.stock})\n${skill.desc}\n판매자: ${skill.sellerTag}`
          ).join("\n\n"))
          .setFooter({ text: `총 스킬: ${skillKeys.length} | 페이지 ${nowPage + 1}/${Math.ceil(skillKeys.length / 5)}` });
        await i.update({ embeds: [embed] });
        page = nowPage;
        return;
      }

      // 구매(맨 위 스킬)
      if (i.customId === "skill_buy") {
        const showSkills = sorted.slice(page * 5, (page + 1) * 5);
        const skill = showSkills[0];
        if (!skill || skill.stock < 1) {
          await i.reply({ content: "구매할 수 있는 스킬이 없습니다.", ephemeral: true });
          return;
        }
        const be = loadJson(bePath);
        const userBe = be[i.user.id]?.amount || 0;
        if (userBe < skill.price) {
          await i.reply({ content: `파랑 정수 부족! (보유: ${userBe} BE)`, ephemeral: true });
          return;
        }
        // 결제/기록
        be[i.user.id] = be[i.user.id] || { amount: 0, history: [] };
        be[i.user.id].amount -= skill.price;
        be[i.user.id].history.push({ type: "spend", amount: skill.price, reason: `${skill.name} 스킬 구매`, timestamp: Date.now() });
        saveJson(bePath, be);

        // 스킬 인벤토리 적재
        const skills = loadJson(skillsPath);
        skills[i.user.id] = skills[i.user.id] || {};
        skills[i.user.id][skill.name] = skills[i.user.id][skill.name] || { count: 0, desc: skill.desc };
        skills[i.user.id][skill.name].count += 1;
        saveJson(skillsPath, skills);

        // 재고 차감
        market[skill.id].stock -= 1;
        if (market[skill.id].stock <= 0) delete market[skill.id];
        saveJson(marketPath, market);

        await i.reply({ content: `✅ [${skill.name}] 스킬을 ${skill.price} BE에 구매 완료!`, ephemeral: true });
        return;
      }

      // 검색(미구현)
      if (i.customId === "skill_search") {
        await i.reply({ content: "스킬 검색 기능은 추후 추가!", ephemeral: true });
      }
    });

    collector.on('end', async () => {
      try { await interaction.editReply({ components: [] }); } catch (e) {}
    });
  }
};
