// commands/friend.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const relationship = require('../utils/relationship.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('우정')
    .setDescription('특정 유저를 생각하는 자신의 관계 확인')
    .addUserOption(opt =>
      opt.setName('유저').setDescription('대상 유저').setRequired(true)
    ),
  async execute(interaction) {
    const me = interaction.user.id;
    const target = interaction.options.getUser('유저').id;

    if (me === target) {
      return interaction.reply({ content: '자기 자신과의 관계는 항상 "무관심"입니다.', ephemeral: true });
    }

    const score = relationship.getScore(me, target).toFixed(2);
    const rel = relationship.getRelation(me, target);

    const embed = new EmbedBuilder()
      .setTitle('나의 관계도')
      .addFields(
        { name: '대상', value: `<@${target}>`, inline: true },
        { name: '관계', value: rel, inline: true },
        { name: '호감도 점수', value: score, inline: true }
      )
      .setColor(0x43e743);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
