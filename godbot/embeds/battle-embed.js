const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getChampionIcon } = require('../utils/champion-utils');
const passives = require('../utils/passive-skills');

function createHpBar(current, max, length = 20) {
  const ratio = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  const bar = '🟩'.repeat(filled) + '⬛'.repeat(empty);
  return bar;
}

function effectToState(effect) {
  if (!effect || !effect.type) return null;
  // 감성 이모지 + 상태 이름
  switch (effect.type) {
    case 'poison':    return '☠️중독';
    case 'burn':      return '🔥화상';
    case 'blind':     return '🌫️실명';
    case 'silence':   return '🔇침묵';
    case 'dot':       return '☠️도트';
    case 'heal':      return '💚회복';
    case 'shield':    return '🛡️실드';
    case 'execute':   return '💀처형예정';
    // 필요시 추가
    default:          return null;
  }
}

async function battleEmbed({
  user,
  enemy,
  turn,
  logs,
  isUserTurn,
  activeUserId,
  disableAllButtons = false
}) {
  const userIcon = await getChampionIcon(user.name);
  const enemyIcon = await getChampionIcon(enemy.name);

  const userLabel = `${user.name} (${user.nickname})`;
  const enemyLabel = `${enemy.name} (${enemy.nickname})`;

  const userHpPct = Math.max(0, Math.floor((user.hp / user.stats.hp) * 100));
  const enemyHpPct = Math.max(0, Math.floor((enemy.hp / enemy.stats.hp) * 100));
  const userHpBar = createHpBar(user.hp, user.stats.hp);
  const enemyHpBar = createHpBar(enemy.hp, enemy.stats.hp);

  // 기존 기본 상태들
  const userState = [];
  if (user.stunned) userState.push('⚡기절');
  if (user.undying) userState.push('💀언데드');
  if (user.debuffImmune) userState.push('🟣디버프 면역');
  if (user._itemUsedCount >= 3) userState.push('🔒아이템 제한');
  // context.effects 기반 효과 추가
  if (user.effects) {
    Object.values(user.effects).forEach(effectsArr => {
      effectsArr.forEach(effect => {
        const str = effectToState(effect);
        if (str && !userState.includes(str)) userState.push(str);
      });
    });
  }

  const enemyState = [];
  if (enemy.stunned) enemyState.push('⚡기절');
  if (enemy.undying) enemyState.push('💀언데드');
  if (enemy.debuffImmune) enemyState.push('🟣디버프 면역');
  if (enemy._itemUsedCount >= 3) enemyState.push('🔒아이템 제한');
  if (enemy.effects) {
    Object.values(enemy.effects).forEach(effectsArr => {
      effectsArr.forEach(effect => {
        const str = effectToState(effect);
        if (str && !enemyState.includes(str)) enemyState.push(str);
      });
    });
  }

  const mainChampionIcon = isUserTurn ? userIcon : enemyIcon;

  const atkEmoji = "⚔️";
  const apEmoji = "✨";
  const defEmoji = "🛡️";
  const penEmoji = "🗡️";

  const currentLabel = isUserTurn ? userLabel : enemyLabel;
  const currentTurnUserId = isUserTurn ? user.id : enemy.id;

  const userPassive = passives[user.name]?.description || '정보 없음';
  const enemyPassive = passives[enemy.name]?.description || '정보 없음';

  const embed = new EmbedBuilder()
    .setColor(isUserTurn ? '#e44d26' : '#1769e0')
    .setTitle(`⚔️ ${userLabel} vs ${enemyLabel} | ${turn}턴`)
    .setAuthor({
      name: isUserTurn ? enemyLabel : userLabel,
      iconURL: isUserTurn ? enemyIcon : userIcon
    })
    .setImage(mainChampionIcon)
    .addFields(
      {
        name: `🟦 ${userLabel}`,
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
        name: `🟥 ${enemyLabel}`,
        value:
          `HP: **${enemy.hp}/${enemy.stats.hp}** (${enemyHpPct}%)\n` +
          `${enemyHpBar}\n` +
          `상태: ${enemyState.length ? enemyState.join(', ') : '정상'}\n` +
          `${atkEmoji} 공격력: ${enemy.stats.attack}  ` +
          `${apEmoji} 주문력: ${enemy.stats.ap}  ` +
          `${defEmoji} 방어력: ${enemy.stats.defense}  ` +
          `${penEmoji} 관통력: ${enemy.stats.penetration}`,
        inline: false
      },
      {
        name: `🟦 ${userLabel} 패시브`,
        value: userPassive,
        inline: false
      },
      {
        name: `🟥 ${enemyLabel} 패시브`,
        value: enemyPassive,
        inline: false
      }
    )
    .setFooter({
      text: isUserTurn
        ? `🟦 ${currentLabel} 의 턴! (아이템과 스킬 사용은 턴이 감소하지 않습니다.)`
        : `🟥 ${currentLabel} 의 턴! (아이템과 스킬 사용은 턴이 감소하지 않습니다.)`
    });

  const LOG_LIMIT = 10;
  // 아래쪽이 "최신 로그"가 되게 (배열 맨 뒤쪽이 최근)
  const viewLogs = (logs || []).slice(-LOG_LIMIT).map(log => `• ${log}`);
  embed.addFields({
    name: '전투 로그 (최신 로그가 아래에 표시됨)',
    value: viewLogs.length ? viewLogs.join('\n') : '이곳의 아랫줄부터 행동이 기록됩니다.',
  });

  const currentPlayer = isUserTurn ? user : enemy;
  const enable = !!activeUserId && currentPlayer.id === activeUserId && !currentPlayer.stunned;
  const allDisabled = disableAllButtons ? true : !enable;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('attack')
      .setLabel('⚔️ 평타')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(allDisabled),
    new ButtonBuilder()
      .setCustomId('defend')
      .setLabel('🛡️ 방어')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(allDisabled),
    new ButtonBuilder()
      .setCustomId('dodge')
      .setLabel('💨 점멸(회피)')
      .setStyle(ButtonStyle.Success)
      .setDisabled(allDisabled),
    new ButtonBuilder()
      .setCustomId('item')
      .setLabel('🧪 아이템')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(allDisabled || currentPlayer._itemUsedCount >= 3),
    new ButtonBuilder()
      .setCustomId('skill')
      .setLabel('✨ 스킬')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(allDisabled)
  );
  let canEscape = turn >= 10 && turn <= 30 && enable;
  const escapeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('escape')
      .setLabel('🏃‍♂️ 도망 (50%)')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disableAllButtons || !canEscape)
  );

  return {
    embeds: [embed],
    components: [row, escapeRow],
  };
}

module.exports = {
  battleEmbed,
};
