// embeds/battle-embed.js

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getChampionIcon } = require('../utils/champion-utils');

// 최근 로그 최대 줄 수
const LOG_LIMIT = 7;

async function battleEmbed({ user, enemy, turn, logs, isUserTurn }) {
  // 챔피언 아이콘
  const userIcon = await getChampionIcon(user.name);
  const enemyIcon = await getChampionIcon(enemy.name);

  // HP 퍼센트 계산
  const userHpPct = Math.max(0, Math.floor((user.hp / user.stats.hp) * 100));
  const enemyHpPct = Math.max(0, Math.floor((enemy.hp / enemy.stats.hp) * 100));

  // 주요 상태 표시
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

  // 임베드
  const embed = new EmbedBuilder()
    .setColor(isUserTurn ? '#e44d26' : '#1769e0')
    .setTitle(`⚔️ ${user.nickname} vs ${enemy.nickname} | ${turn}턴`)
    .setThumbnail(isUserTurn ? userIcon : enemyIcon)
    .setFields(
      {
        name: `${user.nickname} (${user.name})`,
        value:
          `HP: **${user.hp}/${user.stats.hp}** (${userHpPct}%)\n` +
          `공격력: ${user.stats.attack} | 주문력: ${user.stats.ap}\n` +
          `방어력: ${user.stats.defense} | 관통력: ${user.stats.penetration}\n` +
          (userState.length ? `상태: ${userState.join(', ')}` : '상태: 없음'),
        inline: true
      },
      {
        name: `${enemy.nickname} (${enemy.name})`,
        value:
          `HP: **${enemy.hp}/${enemy.stats.hp}** (${enemyHpPct}%)\n` +
          `공격력: ${enemy.stats.attack} | 주문력: ${enemy.stats.ap}\n` +
          `방어력: ${enemy.stats.defense} | 관통력: ${enemy.stats.penetration}\n` +
          (enemyState.length ? `상태: ${enemyState.join(', ')}` : '상태: 없음'),
        inline: true
      }
    )
    .setFooter({ text: isUserTurn ? `${user.nickname}의 턴! 행동을 선택하세요.` : `${enemy.nickname}의 턴을 기다리는 중...` });

  // 로그(최신순 상단, 최대 7줄)
  const viewLogs = (logs || []).slice(-LOG_LIMIT).map(log => `• ${log}`).reverse();
  embed.addFields({
    name: '전투 로그',
    value: viewLogs.length ? viewLogs.join('\n') : '전투 로그가 없습니다.',
  });

  // 버튼 (행동 선택)
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
