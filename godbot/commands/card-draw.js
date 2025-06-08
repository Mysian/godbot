const { SlashCommandBuilder } = require('discord.js');
const { getUserCardData, saveUserCardData } = require('../utils/cardDataManager');
const { characterList, attributeList, drawGrade } = require('../config/cardData');
const { hasRole } = require('../utils/roleChecker');

const BOOSTER_ROLE_ID = '1207437971037356142';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('카드뽑기')
    .setDescription('하루에 3회(부스터는 6회)까지 카드를 뽑을 수 있습니다!'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const isBooster = hasRole(interaction.member, BOOSTER_ROLE_ID);
    const maxDraws = isBooster ? 6 : 3;

    const cardData = await getUserCardData(userId);

    const now = Date.now();
    const today = new Date(now).toDateString();

    if (!cardData.lastDrawDate || cardData.lastDrawDate !== today) {
      cardData.drawCount = 0;
      cardData.lastDrawDate = today;
    }

    if (cardData.drawCount >= maxDraws) {
      return interaction.reply({
        content: `❌ 오늘은 이미 ${maxDraws}회 뽑기를 모두 사용했어요!`,
        ephemeral: true,
      });
    }

    // 캐릭터 & 속성 & 등급 뽑기
    const character = characterList[Math.floor(Math.random() * characterList.length)];
    const attribute = attributeList[Math.floor(Math.random() * attributeList.length)];
    const grade = drawGrade();

    // 카드 객체 생성
    const card = {
      id: Date.now().toString(),
      character: character.key,
      attribute,
      grade,
      level: 1,
      exp: 0,
      wins: 0,
      losses: 0,
    };

    // 카드 저장
    cardData.cards.push(card);
    cardData.drawCount += 1;

    await saveUserCardData(userId, cardData);

    // 메시지 출력
    const displayName = `${character.emoji} ${character.kor} (${character.eng})`;
    return interaction.reply(
      `🎉 ${interaction.user} 님이 카드를 뽑았습니다!\n\n` +
      `🃏 **${displayName}**\n` +
      `🌈 속성: **${attribute}**\n` +
      `🏷️ 등급: **${grade}**\n\n` +
      `💡 오늘 남은 뽑기: **${maxDraws - cardData.drawCount}회**`
    );
  },
};
