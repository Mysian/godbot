const { EmbedBuilder } = require('discord.js');
const { getChampionIcon } = require('./champion-utils');
const passiveSkills = require('./passive-skills');

// 체력바 (한 줄)
function createHpBarInline(current, max) {
  const total = 10;
  if (typeof current !== 'number' || typeof max !== 'number' || max <= 0) return '⬜'.repeat(total) + ` (0/${max || 0})`;
  const ratio = current / max;
  const filled = Math.min(total, Math.max(0, Math.round(ratio * total)));
  return '🟥'.repeat(filled) + '⬜'.repeat(total - filled) + ` (${current}/${max})`;
}

// 상태효과(이모지)
function getBuffDebuffDescription(effects = []) {
  if (!effects || effects.length === 0) return '정상';
  const desc = [];
  for (const e of effects) {
    if (e.type === 'stunned') desc.push('💫기절');
    if (e.type === 'dot') desc.push('☠️중독');
    if (e.type === 'dodgeNextAttack') desc.push('💨회피');
    if (e.type === 'damageReduction' || e.type === 'damageReductionPercent') desc.push('🛡️방어상승');
    if (e.type === 'invulnerable') desc.push('🛡️무적');
    if (e.type === 'revive') desc.push('🔁부활');
    if (e.type === 'atkBuff' || e.type === 'atkUpPercent') desc.push('🟩공격력↑');
    if (e.type === 'atkDown' || e.type === 'atkDownPercent') desc.push('🟥공격력↓');
    if (e.type === 'defBuff' || e.type === 'defUpPercent') desc.push('🟦방어력↑');
    if (e.type === 'defDown' || e.type === 'defDownPercent') desc.push('🟥방어력↓');
    if (e.type === 'magicResistBuff') desc.push('🟪마저↑');
    if (e.type === 'magicResistDebuff' || e.type === 'magicResistDebuffPercent') desc.push('🟧마저↓');
    if (e.type === 'penBuff' || e.type === 'penetrationBuffPercent') desc.push('🟦관통↑');
    if (e.type === 'penDown') desc.push('🟥관통↓');
    if (e.type === 'dodgeBuff') desc.push('💨회피↑');
    if (e.type === 'dodgeDown') desc.push('💨회피↓');
    if (e.type === 'extraAttack') desc.push('🔄추가공격');
    if (e.type === 'extraTurn') desc.push('🔄추가턴');
    if (e.type === 'bonusDamage') desc.push('💥부가피해');
    if (e.type === 'execute' || e.type === 'kill' || e.type === 'deathMark') desc.push('⚔️즉사/처형');
    if (e.type === 'blockAttackAndSkill') desc.push('❌공/스불가');
    if (e.type === 'skillBlocked') desc.push('🚫스킬봉인');
    if (e.type === 'missNext') desc.push('❌공격무효');
    if (e.type === 'delayedDamage') desc.push('⏳지연피해');
    if (e.type === 'delayedStun') desc.push('⏳지연기절');
    if (e.type === 'delayedDot') desc.push('⏳지연도트');
    if (e.type === 'damageBuff') desc.push('🔥피해증폭');
    if (e.type === 'damageUpPercent') desc.push('🔥피해증폭');
    if (e.type === 'damageTakenUpPercent') desc.push('🔥피해증폭(피격)');
    if (e.type === 'dmgDealtDownPercent') desc.push('❄️공격감소');
    if (e.type === 'removeAllDebuffs') desc.push('🧹디버프해제');
    if (e.type === 'debuffImmune') desc.push('🧬디버프면역');
    if (e.type === 'ignoreDebuff') desc.push('🧬상태이상면역');
    if (e.type === 'blockSkill') desc.push('🚫스킬무적');
    if (e.type === 'undying') desc.push('💀불사');
    if (e.type === 'critChanceBuff') desc.push('💯치명타확률↑');
    if (e.type === 'critDamageBuff') desc.push('💥치명타피해↑');
    if (e.type === 'confused') desc.push('😵혼란');
    if (e.type === 'skipNextTurn') desc.push('⏭️턴스킵');
    if (e.type === 'blinded') desc.push('🌫️실명');
    if (e.type === 'hpDownPercent') desc.push('🟥최대체력↓');
    if (e.type === 'hpUpPercent') desc.push('🟩최대체력↑');
  }
  return desc.length > 0 ? desc.join(', ') : '정상';
}

// 능력치 한줄씩(버프 포함, 실제값+버프합산 표기)
function createStatField(user, effects = []) {
  const stat = user.stats || {};
  let atk = stat.attack || 0, ap = stat.ap || 0, def = stat.defense || 0, mr = stat.magicResist || 0, pen = stat.penetration || 0, dodge = stat.dodge || 0;
  let atkBuf = 0, defBuf = 0, apBuf = 0, mrBuf = 0, penBuf = 0, dodgeBuf = 0;
  for (const e of effects) {
    if (e.type === 'atkBuff' || e.type === 'atkUpPercent') atkBuf += e.value || 0;
    if (e.type === 'atkDown' || e.type === 'atkDownPercent') atkBuf -= e.value || 0;
    if (e.type === 'apBuff' || e.type === 'apUpPercent') apBuf += e.value || 0;
    if (e.type === 'apDown' || e.type === 'apDownPercent') apBuf -= e.value || 0;
    if (e.type === 'defBuff' || e.type === 'defUpPercent') defBuf += e.value || 0;
    if (e.type === 'defDown' || e.type === 'defDownPercent') defBuf -= e.value || 0;
    if (e.type === 'magicResistBuff') mrBuf += e.value || 0;
    if (e.type === 'magicResistDebuff' || e.type === 'magicResistDebuffPercent') mrBuf -= e.value || 0;
    if (e.type === 'penBuff' || e.type === 'penetrationBuffPercent') penBuf += e.value || 0;
    if (e.type === 'penDown') penBuf -= e.value || 0;
    if (e.type === 'dodgeBuff') dodgeBuf += e.value || 0;
    if (e.type === 'dodgeDown') dodgeBuf -= e.value || 0;
  }
  const f = (base, buf) => buf ? `${base} ${buf > 0 ? `+${buf}` : `${buf}`}` : `${base}`;
  return (
    `🗡️ 공격력: ${f(atk, atkBuf)}\n` +
    `✨ 주문력: ${f(ap, apBuf)}\n` +
    `🛡️ 방어력: ${f(def, defBuf)}\n` +
    `🔪 관통력: ${f(pen, penBuf)}\n` +
    `💨 회피: ${(dodge * 100).toFixed(1)}%${dodgeBuf ? ` ${dodgeBuf > 0 ? `+${(dodgeBuf * 100).toFixed(1)}%` : `${(dodgeBuf * 100).toFixed(1)}%`}` : ''}\n` +
    `🔮 마법저항: ${f(mr, mrBuf)}\n`
  );
}

// 패시브 설명+발동내역 (패시브 로그까지 모두 표기)
function getPassiveBlock(championName, passiveLogs, userId) {
  const data = passiveSkills[championName];
  const desc = data
    ? `🧬 [패시브] ${data.name}: ${data.description}`
    : "🧬 [패시브] 없음";
  const arr = Array.isArray(passiveLogs?.[userId]) ? passiveLogs[userId] : [];
  if (!arr.length) return desc;
  return desc + '\n' + arr.map(msg => `🧬 ${msg}`).join('\n');
}

// [개인 턴 카운트] → [n턴째]
function getPersonalTurnStr(turnUserId, context) {
  const n = context?.personalTurns?.[turnUserId] || 0;
  return `[${n + 1}턴째]`;
}

// 행동/패시브/스킬 로그 → 완전 중복 제거 (딱 한 번만)
function getLatestUniqueLog(log, context) {
  const logs = [];
  if (log) logs.push(log);
  ['actionLogs', 'passiveLogLines', 'skillLogLines'].forEach(key => {
    const arr = context?.[key];
    if (Array.isArray(arr) && arr.length) logs.push(arr[arr.length - 1]);
  });
  // 완전히 같은 로그라면 한 번만!
  const unique = [];
  for (let l of logs) {
    if (l && !unique.includes(l)) unique.push(l);
  }
  return unique.length ? unique.join('\n') : '없음';
}

// 임베드(행동결과/턴정보/이미지 스왑 포함, battleEngine의 context/passiveLogs 100% 호환)
async function createBattleEmbed(
  challenger,
  opponent,
  battle,
  userData,
  turnId,
  log = '',
  canUseSkillBtn = true,
  passiveLogs = null
) {
  const ch = userData[challenger.id || challenger];
  const op = userData[opponent.id || opponent];
  const chp = (battle.context?.hp && battle.context.hp[challenger.id || challenger] !== undefined)
    ? battle.context.hp[challenger.id || challenger] : ch.hp;
  const ohp = (battle.context?.hp && battle.context.hp[opponent.id || opponent] !== undefined)
    ? battle.context.hp[opponent.id || opponent] : op.hp;

  // 턴정보
  const turnUser = userData[turnId];
  const curTurn = battle.context?.turn || 1;
  const personalTurnStr = getPersonalTurnStr(turnId, battle.context);
  const turnStr = `현재 턴: <@${turnId}> (${turnUser?.name || ''}) ${personalTurnStr}\n총 ${curTurn}턴째`;

  // 이미지 위치 스왑 (본인턴: 이미지 하단, 아니면 상단/하단 반전)
  let imageUrl, thumbnailUrl;
  if (turnId === (challenger.id || challenger)) {
    imageUrl = await getChampionIcon(ch.name);
    thumbnailUrl = await getChampionIcon(op.name);
  } else {
    imageUrl = await getChampionIcon(op.name);
    thumbnailUrl = await getChampionIcon(ch.name);
  }

  // 행동/패시브/스킬 로그(가장 최신+중복X)
  const allLogStr = getLatestUniqueLog(log, battle.context);

  const chStatus = getBuffDebuffDescription(battle.context.effects[challenger.id || challenger]);
  const opStatus = getBuffDebuffDescription(battle.context.effects[opponent.id || opponent]);

  return new EmbedBuilder()
    .setTitle('⚔️ 챔피언 배틀')
    .addFields(
      {
        name: `[${ch.name}]`,
        value: `${createHpBarInline(chp, ch.stats.hp)}
상태: ${chStatus}
${createStatField(ch, battle.context.effects[challenger.id || challenger])}
${getPassiveBlock(ch.name, battle.context.passiveLogs, challenger.id || challenger)}
`,
        inline: true
      },
      {
        name: `[${op.name}]`,
        value: `${createHpBarInline(ohp, op.stats.hp)}
상태: ${opStatus}
${createStatField(op, battle.context.effects[opponent.id || opponent])}
${getPassiveBlock(op.name, battle.context.passiveLogs, opponent.id || opponent)}
`,
        inline: true
      },
      { name: '🎯 턴 정보', value: turnStr, inline: false },
      { name: '📢 행동 결과 / 공식', value: allLogStr, inline: false }
    )
    .setThumbnail(thumbnailUrl)
    .setImage(imageUrl)
    .setColor(0x3498db);
}

// 배틀 결과 임베드 (변경 없음)
async function createResultEmbed(winner, loser, userData, records, interaction, isDraw = false, drawIds = []) {
  if (isDraw) {
    const champ1 = userData[drawIds[0]], champ2 = userData[drawIds[1]];
    const stat1 = createStatField(champ1);
    const stat2 = createStatField(champ2);
    const icon1 = await getChampionIcon(champ1.name);
    const icon2 = await getChampionIcon(champ2.name);

    return new EmbedBuilder()
      .setTitle('🤝 무승부!')
      .setDescription('두 챔피언이 동시에 쓰러졌습니다. 무승부로 기록됩니다!')
      .addFields(
        { name: `[${champ1.name}]`, value: stat1, inline: true },
        { name: `[${champ2.name}]`, value: stat2, inline: true },
      )
      .setThumbnail(icon1)
      .setImage(icon2)
      .setColor(0xff9800)
      .setTimestamp();
  } else {
    const winChampName = userData[winner].name;
    const loseChampName = userData[loser].name;
    const winStat = createStatField(userData[winner]);
    const loseStat = createStatField(userData[loser]);
    const winIcon = await getChampionIcon(winChampName);
    const loseIcon = await getChampionIcon(loseChampName);

    return new EmbedBuilder()
      .setTitle('🏆 배틀 결과')
      .setDescription(
        `### 👑 **승리자!**\n` +
        `**${winChampName}** (<@${winner}>)\n` +
        `전적: ${records[winner].win}승 ${records[winner].lose}패 ${records[winner].draw || 0}무\n`
      )
      .addFields(
        {
          name: '👑 승리자 챔피언',
          value: `**${winChampName}**\n${winStat}`,
          inline: true
        },
        {
          name: '🪦 패배자 챔피언',
          value: `**${loseChampName}**\n${loseStat}`,
          inline: true
        }
      )
      .addFields(
        {
          name: '🪦 패배자!',
          value: `${loseChampName} (<@${loser}>)`,
          inline: false
        }
      )
      .setThumbnail(winIcon)
      .setImage(loseIcon)
      .setColor(0x00ff88)
      .setTimestamp();
  }
}

module.exports = {
  createBattleEmbed,
  createResultEmbed,
  getBuffDebuffDescription,
  createHpBar: createHpBarInline,
  createStatField,
};
