const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const SKILLS = require('../utils/active-skills.js');

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
    const SKILL_LIST = Object.values(SKILLS);
    const sorted = SKILL_LIST.slice().sort((a, b) => b.price - a.price);
    let page = 0;
    const SKILLS_PER_PAGE = 5;
    const maxPage = Math.ceil(SKILL_LIST.length / SKILLS_PER_PAGE);

    // 임베드 + 각 스킬별 구매 버튼 생성 함수
    const getEmbedAndRows = (_page) => {
      const showSkills = sorted.slice(_page * SKILLS_PER_PAGE, (_page + 1) * SKILLS_PER_PAGE);
      const embed = new EmbedBuilder()
        .setTitle("📚 스킬 상점")
        .setDescription(showSkills.map((skill, i) =>
          `#${i + 1 + _page * SKILLS_PER_PAGE} | ${skill.icon || ""} **${skill.name}** (${skill.price} BE)\n${skill.desc}`
        ).join("\n\n"))
        .setFooter({ text: `총 스킬: ${SKILL_LIST.length} | 페이지 ${_page + 1}/${maxPage}` });

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("skill_prev").setLabel("이전 페이지").setStyle(ButtonStyle.Secondary).setDisabled(_page === 0),
        new ButtonBuilder().setCustomId("skill_refresh").setLabel("새로고침").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("skill_next").setLabel("다음 페이지").setStyle(ButtonStyle.Secondary).setDisabled(_page + 1 >= maxPage),
      );
      // 각 스킬별 구매 버튼
      const rowBuy = new ActionRowBuilder();
      showSkills.forEach(skill => {
        rowBuy.addComponents(
          new ButtonBuilder()
            .setCustomId(`buy_${skill.name}`)
            .setLabel(`${skill.name} 구매`)
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
      if (i.customId === "skill_prev" && page > 0) { page--; updated = true; }
      if (i.customId === "skill_next" && (page + 1) * SKILLS_PER_PAGE < sorted.length) { page++; updated = true; }
      if (i.customId === "skill_refresh") { updated = true; }

      if (updated) {
        const { embed, rows } = getEmbedAndRows(page);
        await i.update({ embeds: [embed], components: rows });
        return;
      }

      if (i.customId.startsWith("buy_")) {
        const skillName = i.customId.replace("buy_", "");
        const skill = SKILL_LIST.find(x => x.name === skillName);
        if (!skill) {
          await i.reply({ content: "해당 스킬을 찾을 수 없습니다.", ephemeral: true });
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
        skills[i.user.id][skill.name] = { desc: skill.desc };
        saveJson(skillsPath, skills);

        await i.reply({ content: `✅ [${skill.name}] 스킬을 ${skill.price} BE에 구매 완료! (동일 스킬 중복 보유 불가)`, ephemeral: true });
        return;
      }
    });

    collector.on('end', async () => {
      try { await interaction.editReply({ components: [] }); } catch (e) {}
    });
  }
};
