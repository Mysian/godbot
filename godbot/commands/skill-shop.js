const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const SKILL_LIST = require('../data/skill-list.js');

const bePath = path.join(__dirname, '../data/BE.json');
const skillsPath = path.join(__dirname, '../data/skills.json');

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
    .setDescription('파랑 정수(BE)로 유니크 스킬을 구매할 수 있는 상점입니다.'),

  async execute(interaction) {
    const sorted = SKILL_LIST.slice().sort((a, b) => b.price - a.price); // 비싼 순(혹은 등록순 등 자유)
    let page = 0;
    const showSkills = sorted.slice(page * 5, (page + 1) * 5);

    const embed = new EmbedBuilder()
      .setTitle("📚 스킬 상점")
      .setDescription(showSkills.map((skill, i) =>
        `#${i + 1} | ${skill.icon || ""} **${skill.name}** (${skill.price} BE)\n${skill.desc}`
      ).join("\n\n"))
      .setFooter({ text: `총 스킬: ${SKILL_LIST.length} | 페이지 ${page + 1}/${Math.ceil(SKILL_LIST.length / 5)}` });

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
            `#${idx + 1 + nowPage * 5} | ${skill.icon || ""} **${skill.name}** (${skill.price} BE)\n${skill.desc}`
          ).join("\n\n"))
          .setFooter({ text: `총 스킬: ${SKILL_LIST.length} | 페이지 ${nowPage + 1}/${Math.ceil(SKILL_LIST.length / 5)}` });
        await i.update({ embeds: [embed] });
        page = nowPage;
        return;
      }

      // 구매(맨 위 스킬)
      if (i.customId === "skill_buy") {
        const showSkills = sorted.slice(page * 5, (page + 1) * 5);
        const skill = showSkills[0];
        if (!skill) {
          await i.reply({ content: "구매할 수 있는 스킬이 없습니다.", ephemeral: true });
          return;
        }
        // 이미 소유한 스킬이면 구매 불가
        const skills = loadJson(skillsPath);
        const mySkills = skills[i.user.id] || {};
        if (mySkills[skill.name]) {
          await i.reply({ content: `이미 [${skill.name}] 스킬을 소유하고 있습니다! (스킬은 1개만 소유 가능)`, ephemeral: true });
          return;
        }
        // 결제/기록
        const be = loadJson(bePath);
        const userBe = be[i.user.id]?.amount || 0;
        if (userBe < skill.price) {
          await i.reply({ content: `파랑 정수 부족! (보유: ${userBe} BE)`, ephemeral: true });
          return;
        }
        be[i.user.id] = be[i.user.id] || { amount: 0, history: [] };
        be[i.user.id].amount -= skill.price;
        be[i.user.id].history.push({ type: "spend", amount: skill.price, reason: `${skill.name} 스킬 구매`, timestamp: Date.now() });
        saveJson(bePath, be);

        // 유저 스킬 소유(1개만 등록)
        skills[i.user.id] = skills[i.user.id] || {};
        skills[i.user.id][skill.name] = { desc: skill.desc }; // count 없이!
        saveJson(skillsPath, skills);

        await i.reply({ content: `✅ [${skill.name}] 스킬을 ${skill.price} BE에 구매 완료! (동일 스킬 중복 보유 불가)`, ephemeral: true });
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
