// embeds/battle-embed.js

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getChampionIcon } = require('../utils/champion-utils');

// 체력 바 생성 함수
function createHpBar(current, max, length = 20) {
  const ratio = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  const bar = '🟩'.repeat(filled) + '⬛'.repeat(empty);
  return bar;
}

// 전투 임베드 생성
async function battleEmbed({ user, enemy, turn, logs, isUserTurn }) {
  // 이미지
  const userIcon = await getChampionIcon(user.name);
  const enemyIcon = await getChampionIcon(enemy.name);

  // HP
  const userHpPct = Math.max(0, Math.floor((user.hp / user.stats.hp) * 100));
  const enemyHpPct = Math.max(0, Math.floor((enemy.hp / enemy.stats.hp) * 100));
  const userHpBar = createHpBar(user.hp, user.stats.hp);
  const enemyHpBar = createHpBar(enemy.hp, enemy.stats.hp);

  // 상태
  const userState = [];
  if (user.stunned) userState.push('⚡기절');
  if (user.undying) userState.push('💀언데드');
  if (user.debuffImmune) userState.push('🟣디버프 면역');
  if (user._itemUsedCount >= 3) userState.push('🔒아이템 제한');
  const enemyState = [];
  if (enemy.stunned) enemyState.push('⚡기절');
  if (enemy.undying) enemyState.push('💀언데드');
  if (enemy.debuffImmune) enemyState.push('🟣디버프 면역');
  if (enemy._itemUsedCount >= 3) enemyState.push('🔒아이템 제한');

  // 본인 턴 챔피언 이미지(크게)
  const mainChampionIcon = isUserTurn ? userIcon : enemyIcon;

  // 임베드
  const embed = new EmbedBuilder()
    .setColor(isUserTurn ? '#e44d26' : '#1769e0')
    .setTitle(`⚔️ ${user.nickname} vs ${enemy.nickname} | ${turn}턴`)
    .setThumbnail(userIcon)  // 좌측 상단
    .setAuthor({ name: `${enemy.nickname} (${enemy.name})`, iconURL: enemyIcon }) // 우측 상단(상대 초상화)
    .addFields(
      {
        name: `🟦 ${user.nickname} (${user.name})`,
        value:
          `HP: **${user.hp}/${user.stats.hp}** (${userHpPct}%)\n` +
          `${userHpBar}\n` +
          `상태: ${userState.length ? userState.join(', ') : '정상'}\n` +
          `공격력: ${user.stats.attack} | 주문력: ${user.stats.ap}\n` +
          `방어력: ${user.stats.defense} | 관통력: ${user.stats.penetration}`,
        inline: false
      },
      {
        name: `🟥 ${enemy.nickname} (${enemy.name})`,
        value:
          `HP: **${enemy.hp}/${enemy.stats.hp}** (${enemyHpPct}%)\n` +
          `${enemyHpBar}\n` +
          `상태: ${enemyState.length ? enemyState.join(', ') : '정상'}\n` +
          `공격력: ${enemy.stats.attack} | 주문력: ${enemy.stats.ap}\n` +
          `방어력: ${enemy.stats.defense} | 관통력: ${enemy.stats.penetration}`,
        inline: false
      }
    )
    .setFooter({
      text: isUserTurn
        ? `🎮 ${user.nickname}의 턴! 행동을 선택하세요.`
        : `⏳ ${enemy.nickname}의 턴을 기다리는 중...`
    })
    .setImage(mainChampionIcon);

  // 로그
  const LOG_LIMIT = 7;
  const viewLogs = (logs || []).slice(-LOG_LIMIT).map(log => `• ${log}`).reverse();
  embed.addFields({
    name: '전투 로그',
    value: viewLogs.length ? viewLogs.join('\n') : '전투 로그가 없습니다.',
  });

  // 버튼 (행동)
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('attack')
      .setLabel('평타')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!isUserTurn || user.stunned),
    new ButtonBuilder()
      .setCustomId('defend')
      .setLabel('방어')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!isUserTurn || user.stunned),
    new ButtonBuilder()
      .setCustomId('dodge')
      .setLabel('점멸(회피)')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!isUserTurn || user.stunned),
    new ButtonBuilder()
      .setCustomId('item')
      .setLabel('아이템')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!isUserTurn || user._itemUsedCount >= 3 || user.stunned),
    new ButtonBuilder()
      .setCustomId('skill')
      .setLabel('스킬')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!isUserTurn || user.stunned)
  );

  // 도망(탈주) 버튼 (10~30턴, 확률 안내)
  let canEscape = turn >= 10 && turn <= 30 && isUserTurn;
  const escapeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('escape')
      .setLabel('도망 (50% 확률)')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!canEscape || user.stunned)
  );

  // 버튼 2줄로 반환
  return {
    embeds: [embed],
    components: [row, escapeRow],
  };
}

module.exports = {
  battleEmbed,
};
