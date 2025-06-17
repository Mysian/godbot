const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getChampionIcon } = require('../utils/champion-utils');
const passives = require('../utils/passive-skills');

// HP바 생성
function createHpBar(current, max, length = 20) {
  const ratio = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  return '🟩'.repeat(filled) + '⬛'.repeat(empty);
}

// 스탯 +추가/감소 표기
function statWithBonus(base, current) {
  const diff = current - base;
  if (!isFinite(current)) return '0';
  if (diff === 0) return `${current}`;
  const sign = diff > 0 ? '+' : '';
  return `${current} (${sign}${diff.toFixed(1)})`;
}

// 효과→상태변환
function effectToState(effect) {
  if (!effect || !effect.type) return null;
  switch (effect.type) {
    case 'poison':    return '☠️중독';
    case 'burn':      return `🔥화상(${effect.value ?? ""})`;
    case 'blind':     return '🌫️실명';
    case 'silence':   return '🔇침묵';
    case 'dot':       return '☠️도트';
    case 'heal':      return '💚회복';
    case 'shield':    return '🛡️실드';
    case 'execute':   return '💀처형예정';
    case 'healOverTime': return `💧재생(${effect.value ? `${effect.value}` : ''}, ${effect.turns ?? 0}턴)`;
    case 'apBuff':    return `✨공격력↑`;
    case 'atkBuff':   return `⚔️주문력↑`;
    case 'defBuff':   return `🛡️방어력↑`;
    case 'maxHpBuff': return `❤️최대체력↑`;
    case 'damageReduce': return `🔽피해감소`;
    case 'dodgeUp':   return `👟회피↑`;
    case 'dodgeDown': return `👁️회피↓`;
    case 'critUp':    return `🎯치명타↑`;
    case 'lifesteal': return `🩸흡혈`;
    case 'immune':    return `🛡️상태이상면역`;
    case 'penguBuff': return `🥄스탯상승+`;
    default:          return null;
  }
}

// 상태 효과(버프/디버프/중첩) 요약 리스트 (이모지+이름+중첩/수치)
function getAllStates(effectsArr = []) {
  const counted = {};
  for (const e of effectsArr) {
    const base = effectToState(e);
    if (!base) continue;
    let key = base;
    if (!counted[key]) counted[key] = { count: 0, value: 0 };
    counted[key].count += 1;
    if (e.value && typeof e.value === 'number') counted[key].value += e.value;
  }
  return Object.entries(counted).map(([k, v]) =>
    v.count > 1 ? `${k}x${v.count}${v.value ? `(${v.value})` : ''}` :
    v.value ? `${k}(${v.value})` : k
  );
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

  // 상태 효과 정리
  const userEffects = (user.effects && Array.isArray(user.effects)) ? user.effects :
    (user.effects ? Object.values(user.effects).flat() : []);
  const enemyEffects = (enemy.effects && Array.isArray(enemy.effects)) ? enemy.effects :
    (enemy.effects ? Object.values(enemy.effects).flat() : []);
  const userState = getAllStates(userEffects);
  const enemyState = getAllStates(enemyEffects);

  // 특수 상태
  if (user.stunned) userState.push('⚡기절');
  if (user.undying) userState.push('💀언데드');
  if (user.debuffImmune) userState.push('🟣디버프 면역');
  if (user._itemUsedCount >= 3) userState.push('🔒아이템 제한');
  if (enemy.stunned) enemyState.push('⚡기절');
  if (enemy.undying) enemyState.push('💀언데드');
  if (enemy.debuffImmune) enemyState.push('🟣디버프 면역');
  if (enemy._itemUsedCount >= 3) enemyState.push('🔒아이템 제한');

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
          `${atkEmoji} 공격력: ${statWithBonus(user.stats.attack, user.attack ?? user.stats.attack)}  ` +
          `${apEmoji} 주문력: ${statWithBonus(user.stats.ap, user.ap ?? user.stats.ap)}  ` +
          `${defEmoji} 방어력: ${statWithBonus(user.stats.defense, user.defense ?? user.stats.defense)}  ` +
          `${penEmoji} 관통력: ${statWithBonus(user.stats.penetration, user.penetration ?? user.stats.penetration)}`,
        inline: false
      },
      {
        name: `🟥 ${enemyLabel}`,
        value:
          `HP: **${enemy.hp}/${enemy.stats.hp}** (${enemyHpPct}%)\n` +
          `${enemyHpBar}\n` +
          `상태: ${enemyState.length ? enemyState.join(', ') : '정상'}\n` +
          `${atkEmoji} 공격력: ${statWithBonus(enemy.stats.attack, enemy.attack ?? enemy.stats.attack)}  ` +
          `${apEmoji} 주문력: ${statWithBonus(enemy.stats.ap, enemy.ap ?? enemy.stats.ap)}  ` +
          `${defEmoji} 방어력: ${statWithBonus(enemy.stats.defense, enemy.defense ?? enemy.stats.defense)}  ` +
          `${penEmoji} 관통력: ${statWithBonus(enemy.stats.penetration, enemy.penetration ?? enemy.stats.penetration)}`,
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
      .setLabel('⚔️ 평타 (턴 넘김)')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(allDisabled),
    new ButtonBuilder()
      .setCustomId('defend')
      .setLabel('🛡️ 방어 (턴 넘김)')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(allDisabled),
    new ButtonBuilder()
      .setCustomId('dodge')
      .setLabel('💨 점멸 (턴 넘김)')
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
