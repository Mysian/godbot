// embeds/battle-embed.js

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getChampionIcon } = require('../utils/champion-utils');

// 체력 바 함수
function createHpBar(current, max, length = 20) {
  const ratio = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  const bar = '🟩'.repeat(filled) + '⬛'.repeat(empty);
  return bar;
}

/**
 * @param {Object} param
 * @param {Object} param.user - 내 챔피언
 * @param {Object} param.enemy - 상대 챔피언
 * @param {number} param.turn - 현재 턴
 * @param {Array<string>} param.logs - 전투 로그
 * @param {boolean} param.isUserTurn - 현재 턴이 내 턴인지
 * @param {string} [param.activeUserId] - 버튼을 활성화할 Discord 유저ID (필수!)
 */
async function battleEmbed({ user, enemy, turn, logs, isUserTurn, activeUserId }) {
  const userIcon = await getChampionIcon(user.name);
  const enemyIcon = await getChampionIcon(enemy.name);

  // HP, 체력바
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

  // 본인 턴 챔피언 이미지를 setImage로 (맨 하단에 크게)
  const mainChampionIcon = isUserTurn ? userIcon : enemyIcon;

  // 공격/주문/방어/관통 이모지
  const atkEmoji = "⚔️";
  const apEmoji = "✨";
  const defEmoji = "🛡️";
  const penEmoji = "🗡️";

  // 현재 턴 유저ID
  const currentTurnUserId = isUserTurn ? user.id : enemy.id;
  const currentTurnNickname = isUserTurn ? user.nickname : enemy.nickname;
  const currentTurnChamp = isUserTurn ? user.name : enemy.name;

  // 임베드
  const embed = new EmbedBuilder()
    .setColor(isUserTurn ? '#e44d26' : '#1769e0')
    .setTitle(`⚔️ ${user.nickname} vs ${enemy.nickname} | ${turn}턴`)
    // 우상단 작은 이미지: 상대 챔피언 (본인 턴이 아니면 내 챔피언)
    .setAuthor({
      name: isUserTurn
        ? `${enemy.nickname} (${enemy.name})`
        : `${user.nickname} (${user.name})`,
      iconURL: isUserTurn ? enemyIcon : userIcon
    })
    .setImage(mainChampionIcon)
    .addFields(
      {
        name: `🟦 ${user.nickname} (${user.name})`,
        value:
          `HP: **${user.hp}/${user.stats.hp}** (${userHpPct}%)\n` +
          `${userHpBar}\n` +
          `상태: ${userState.length ? userState.join(', ') : '정상'}\n` +
          `${atkEmoji} 공격력: ${user.stats.attack}  ` +
          `${apEmoji} 주문력: ${user.stats.ap}  ` +
          `${defEmoji} 방어력: ${user.stats.defense}  ` +
          `${penEmoji} 관통력: ${user.stats.penetration}`,
        inline: false
      },
      {
        name: `🟥 ${enemy.nickname} (${enemy.name})`,
        value:
          `HP: **${enemy.hp}/${enemy.stats.hp}** (${enemyHpPct}%)\n` +
          `${enemyHpBar}\n` +
          `상태: ${enemyState.length ? enemyState.join(', ') : '정상'}\n` +
          `${atkEmoji} 공격력: ${enemy.stats.attack}  ` +
          `${apEmoji} 주문력: ${enemy.stats.ap}  ` +
          `${defEmoji} 방어력: ${enemy.stats.defense}  ` +
          `${penEmoji} 관통력: ${enemy.stats.penetration}`,
        inline: false
      }
    )
    .setFooter({
      text: isUserTurn
        ? `🎮 ${currentTurnChamp} (<@${currentTurnUserId}>)의 턴! 행동을 선택하세요.`
        : `⏳ ${currentTurnChamp} (<@${currentTurnUserId}>)의 턴을 기다리는 중...`
    });

  // 로그
  const LOG_LIMIT = 7;
  const viewLogs = (logs || []).slice(-LOG_LIMIT).map(log => `• ${log}`).reverse();
  embed.addFields({
    name: '전투 로그',
    value: viewLogs.length ? viewLogs.join('\n') : '전투 로그가 없습니다.',
  });

  // 현재 버튼 클릭 가능한 유저만 활성화
  const enable = !!activeUserId && currentTurnUserId === activeUserId && isUserTurn && !user.stunned;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('attack')
      .setLabel('⚔️ 평타')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!enable),
    new ButtonBuilder()
      .setCustomId('defend')
      .setLabel('🛡️ 방어')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!enable),
    new ButtonBuilder()
      .setCustomId('dodge')
      .setLabel('💨 점멸(회피)')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!enable),
    new ButtonBuilder()
      .setCustomId('item')
      .setLabel('🧪 아이템')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!enable || user._itemUsedCount >= 3),
    new ButtonBuilder()
      .setCustomId('skill')
      .setLabel('✨ 스킬')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!enable)
  );

  // 도망(탈주) 버튼 (10~30턴, 확률 안내)
  let canEscape = turn >= 10 && turn <= 30 && enable;
  const escapeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('escape')
      .setLabel('🏃‍♂️ 도망 (50%)')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!canEscape)
  );

  return {
    embeds: [embed],
    components: [row, escapeRow],
  };
}

module.exports = {
  battleEmbed,
};
