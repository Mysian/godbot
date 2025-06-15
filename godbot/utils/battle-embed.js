const { EmbedBuilder } = require('discord.js');
const { getChampionIcon } = require('./champion-utils');
const passiveSkills = require('./passive-skills');

// 체력바 (빨간색 10칸)
function createHpBar(current, max) {
  const total = 10;
  if (typeof current !== 'number' || typeof max !== 'number' || max <= 0) return '⬜'.repeat(total);
  const ratio = current / max;
  const filled = Math.min(total, Math.max(0, Math.round(ratio * total)));
  return '🟥'.repeat(filled) + '⬜'.repeat(total - filled);
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
    if (e.type === 'atkBuff') desc.push('🟩공격력↑');
    if (e.type === 'atkDown') desc.push('🟥공격력↓');
    if (e.type === 'defBuff') desc.push('🟦방어력↑');
    if (e.type === 'defDown') desc.push('🟥방어력↓');
    if (e.type === 'magicResistBuff') desc.push('🟪마저↑');
    if (e.type === 'magicResistDebuff') desc.push('🟧마저↓');
    if (e.type === 'penBuff') desc.push('🟦관통↑');
    if (e.type === 'penDown') desc.push('🟥관통↓');
    if (e.type === 'dodgeBuff') desc.push('💨회피↑');
    if (e.type === 'dodgeDown') desc.push('💨회피↓');
    if (e.type === 'extraAttack') desc.push('🔄추가공격');
    if (e.type === 'bonusDamage') desc.push('💥부가피해');
    if (e.type === 'execute' || e.type === 'kill') desc.push('⚔️즉사/처형');
    if (e.type === 'blockAttackAndSkill') desc.push('❌공/스불가');
    if (e.type === 'skillBlocked') desc.push('🚫스킬봉인');
  }
  return desc.length > 0 ? desc.join(', ') : '정상';
}

// 능력치 한줄씩(버프 포함)
function createStatField(user, effects = []) {
  const stat = user.stats || {};
  let atk = stat.attack || 0, ap = stat.ap || 0, def = stat.defense || 0, mr = stat.magicResist || 0, pen = stat.penetration || 0, dodge = stat.dodge || 0;
  let atkBuf = 0, defBuf = 0, apBuf = 0, mrBuf = 0, penBuf = 0, dodgeBuf = 0;
  for (const e of effects) {
    if (e.type === 'atkBuff') atkBuf += e.value;
    if (e.type === 'atkDown') atkBuf -= e.value;
    if (e.type === 'apBuff') apBuf += e.value;
    if (e.type === 'apDown') apBuf -= e.value;
    if (e.type === 'defBuff') defBuf += e.value;
    if (e.type === 'defDown') defBuf -= e.value;
    if (e.type === 'magicResistBuff') mrBuf += e.value;
    if (e.type === 'magicResistDebuff') mrBuf -= e.value;
    if (e.type === 'penBuff') penBuf += e.value;
    if (e.type === 'penDown') penBuf -= e.value;
    if (e.type === 'dodgeBuff') dodgeBuf += e.value;
    if (e.type === 'dodgeDown') dodgeBuf -= e.value;
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

// 패시브 설명+발동내역
function getPassiveBlock(championName, passiveLogs, userId) {
  const data = passiveSkills[championName];
  const desc = data
    ? `🧬 [패시브] ${data.name}: ${data.description}`
    : "🧬 [패시브] 없음";
  const arr = Array.isArray(passiveLogs?.[userId]) ? passiveLogs[userId] : [];
  if (!arr.length) return desc;
  return desc + '\n' + arr.map(msg => `🧬 ${msg}`).join('\n');
}

// 중복 제거(마지막 한 줄만)
function dedupLogs(arr) {
  if (!Array.isArray(arr) || !arr.length) return [];
  return [arr[arr.length - 1]];
}

// 임베드(행동결과/턴정보/이미지 스왑 포함)
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
    ? battle.context.hp[challenger.id || challenger] : battle.hp[challenger.id || challenger];
  const ohp = (battle.context?.hp && battle.context.hp[opponent.id || opponent] !== undefined)
    ? battle.context.hp[opponent.id || opponent] : battle.hp[opponent.id || opponent];

  // 턴정보
  const turnUser = userData[turnId];
  const curTurn = battle.context?.turn || 1;
  const turnStr = `현재 턴: <@${turnId}> (${turnUser?.name || ''})\n총 ${curTurn}턴째`;

  // 본인턴이면 본인 이미지 하단, 아니면 상대
  let imageUrl;
  if (turnId === (challenger.id || challenger)) imageUrl = await getChampionIcon(ch.name);
  else imageUrl = await getChampionIcon(op.name);

  // 행동/패시브/스킬 로그(1줄씩만)
  let allLogs = [];
  if (log) allLogs.push(log);
  if (battle.context?.actionLogs?.length) allLogs.push(...dedupLogs(battle.context.actionLogs));
  if (battle.context?.passiveLogLines?.length) allLogs.push(...dedupLogs(battle.context.passiveLogLines));
  if (battle.context?.skillLogLines?.length) allLogs.push(...dedupLogs(battle.context.skillLogLines));
  const allLogStr = allLogs.length ? allLogs.join('\n') : '없음';

  const chStatus = getBuffDebuffDescription(battle.context.effects[challenger.id || challenger]);
  const opStatus = getBuffDebuffDescription(battle.context.effects[opponent.id || opponent]);

  return new EmbedBuilder()
    .setTitle('⚔️ 챔피언 배틀')
    .addFields(
      {
        name: `[${ch.name}]`,
        value: `${chp}/${ch.stats.hp} ${createHpBar(chp, ch.stats.hp)}
상태: ${chStatus}
${createStatField(ch, battle.context.effects[challenger.id || challenger])}
${getPassiveBlock(ch.name, passiveLogs, challenger.id || challenger)}
`,
        inline: true
      },
      {
        name: `[${op.name}]`,
        value: `${ohp}/${op.stats.hp} ${createHpBar(ohp, op.stats.hp)}
상태: ${opStatus}
${createStatField(op, battle.context.effects[opponent.id || opponent])}
${getPassiveBlock(op.name, passiveLogs, opponent.id || opponent)}
`,
        inline: true
      },
      { name: '🎯 턴 정보', value: turnStr, inline: false },
      { name: '📢 행동 결과 / 공식', value: allLogStr, inline: false }
    )
    .setThumbnail(await getChampionIcon(op.name))
    .setImage(imageUrl)
    .setColor(0x3498db);
}

// 배틀 결과 임베드
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
  createHpBar,
  createStatField,
};
