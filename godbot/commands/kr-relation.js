// commands/relation.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const relationship = require('../utils/relationship.js');
const member1 = await interaction.guild.members.fetch(user1).catch(() => null);
const member2 = await interaction.guild.members.fetch(user2).catch(() => null);
const name1 = member1 ? `**${member1.displayName}**` : `<Unknown>`;
const name2 = member2 ? `**${member2.displayName}**` : `<Unknown>`;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('관계')
    .setDescription('두 유저간의 관계 확인')
    .addUserOption(opt =>
      opt.setName('유저1').setDescription('첫번째 유저').setRequired(true)
    )
    .addUserOption(opt =>
      opt.setName('유저2').setDescription('두번째 유저').setRequired(true)
    ),
  async execute(interaction) {
    const user1 = interaction.options.getUser('유저1').id;
    const user2 = interaction.options.getUser('유저2').id;

    if (user1 === user2) {
      return interaction.reply({ content: '동일인 간의 관계는 항상 "무관심"입니다.', ephemeral: true });
    }

    const score1 = relationship.getScore(user1, user2);
    const rel1 = relationship.getRelation(user1, user2);
    const score2 = relationship.getScore(user2, user1);
    const rel2 = relationship.getRelation(user2, user1);

    const embed = new EmbedBuilder()
      .setTitle('유저 간 관계도')
      .addFields(
  { name: `${name1} → ${name2}`, value: `관계: ${rel1}\n점수: ${score1}`, inline: true },
  { name: `${name2} → ${name1}`, value: `관계: ${rel2}\n점수: ${score2}`, inline: true }
)
      .setColor(0x00bfff);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
