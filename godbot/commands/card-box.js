const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUserCardData } = require('../utils/cardDataManager');
const { characterList } = require('../config/cardData');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('카드상자')
    .setDescription('보유 중인 카드 목록을 확인합니다.'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const cardData = await getUserCardData(userId);
    const cards = cardData.cards || [];

    if (cards.length === 0) {
      return interaction.reply({
        content: `📭 ${interaction.user}님은 아직 카드를 뽑지 않았어요!`,
        ephemeral: true,
      });
    }

    let page = 0;
    const itemsPerPage = 10;
    const totalPages = Math.ceil(cards.length / itemsPerPage);

    const getPageEmbed = (page) => {
      const start = page * itemsPerPage;
      const end = start + itemsPerPage;
      const sliced = cards.slice(start, end);

      const fields = sliced.map((card, index) => {
        const character = characterList.find((c) => c.key === card.character);
        const displayName = `${character.emoji} ${character.kor} (${character.eng})`;
        return {
          name: `#${card.id}`,
          value: `- 🃏 ${displayName}\n- 🌈 속성: ${card.attribute}\n- 🏷️ 등급: ${card.grade}\n- 🔼 레벨: ${card.level}`,
        };
      });

      return {
        embeds: [
          {
            title: `${interaction.user.username}님의 카드 상자 📦`,
            description: `총 카드 수: ${cards.length}장`,
            fields,
            footer: {
              text: `페이지 ${page + 1} / ${totalPages}`,
            },
          },
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('prev_page')
              .setLabel('◀ 이전')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(page === 0),
            new ButtonBuilder()
              .setCustomId('next_page')
              .setLabel('다음 ▶')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(page === totalPages - 1)
          ),
        ],
      };
    };

    const message = await interaction.reply(getPageEmbed(page));

    const collector = message.createMessageComponentCollector({
      time: 60_000,
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== userId) return i.reply({ content: '❌ 이 상자는 당신 것이 아닙니다!', ephemeral: true });

      if (i.customId === 'prev_page') page--;
      else if (i.customId === 'next_page') page++;

      await i.update(getPageEmbed(page));
    });

    collector.on('end', async () => {
      try {
        const msg = await interaction.fetchReply();
        msg.edit({ components: [] }).catch(() => {});
      } catch {}
    });
  },
};
