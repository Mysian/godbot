const { EmbedBuilder } = require('discord.js');
const { getChampionIcon } = require('./champion-utils');
const skills = require('./skills');
const skillCd = require('./skills-cooldown');

function createHpBar(current, max) {
  const total = 10;
  if (typeof current !== 'number' || typeof max !== 'number' || max <= 0) {
    return '⬜'.repeat(total);
  }
  const ratio = current / max;
  const filled = Math.min(total, Math.max(0, Math.round(ratio * total)));
  return '🟥'.repeat(filled) + '⬜'.repeat(total - filled);
}
function getStatusIcons(effects = []) {
  let s = '';
  for (const e of effects) {
    if (e.type === 'stunned') s += '💫';
    if (e.type === 'dot')     s += '☠️';
    if (e.type === 'dodgeNextAttack') s += '💨';
    if (e.type === 'damageReduction' || e.type === 'damageReductionPercent') s += '🛡️';
    if (e.type === 'revive') s += '🔁';
  }
  return s;
}
function createStatField(user, effects = []) {
  const stat = user.stats || {};
  let atk = stat.attack || 0, ap = stat.ap || 0, def = stat.defense || 0, mr = stat.magicResist || 0;
  let atkBuf = 0, defBuf = 0, apBuf = 0, mrBuf = 0;
  for (const e of effects) {
    if (e.type === 'atkBuff') atkBuf += e.value;
    if (e.type === 'atkDown') atkBuf -= e.value;
    if (e.type === 'defBuff') defBuf += e.value;
    if (e.type === 'defDown') defBuf -= e.value;
    if (e.type === 'magicResistBuff') mrBuf += e.value;
    if (e.type === 'magicResistDebuff') mrBuf -= e.value;
  }
  const f = (base, buf) => buf ? `${base} ${buf > 0 ? `+${buf}` : `${buf}`}` : `${base}`;
  return (
    `🗡️ 공격력: ${f(atk, atkBuf)}\n` +
    `🔮 주문력: ${f(ap, apBuf)}\n` +
    `🛡️ 방어력: ${f(def, defBuf)}\n` +
    `✨ 마법저항: ${f(mr, mrBuf)}\n`
  );
}
function canUseSkill(userId, champName, context) {
  const cdObj = skillCd[champName];
  const minTurn = cdObj?.minTurn || 1;
  const cooldown = cdObj?.cooldown || 1;
  const turn = context.skillTurn?.[userId] ?? 0;
  const remain = context.cooldowns?.[userId] ?? 0;

  if (turn < minTurn) {
    return { ok: false, reason: `${minTurn}턴 이후부터 사용 가능 (내 턴 ${turn}회 경과)` };
  }
  if (remain > 0) {
    return { ok: false, reason: `쿨타임: ${remain}턴 남음` };
  }
  return { ok: true };
}
function createSkillField(userId, champName, context) {
  const skillObj = skills[champName];
  const cdObj = skillCd[champName];
  if (!skillObj || !cdObj) return '스킬 정보 없음';
  const { name, description } = skillObj;
  const { minTurn, cooldown } = cdObj;
  const turn = context.skillTurn?.[userId] ?? 0;
  const remain = context.cooldowns?.[userId] ?? 0;
  const check = canUseSkill(userId, champName, context);
  let txt = `✨ **${name}**\n${description}\n`;
  txt += `⏳ 최소 ${minTurn || 1}턴 후 사용, 쿨타임: ${cooldown || 1}턴\n`;
  txt += `내 턴 횟수: ${turn}, 남은 쿨다운: ${remain}\n`;
  txt += check.ok ? '🟢 **사용 가능!**' : `🔴 사용 불가: ${check.reason}`;
  return txt;
}

async function createBattleEmbed(challenger, opponent, battle, userData, turnId, log = '', canUseSkillBtn = true) {
  const ch = userData[challenger.id];
  const op = userData[opponent.id];
  const chp = battle.hp[challenger.id];
  const ohp = battle.hp[opponent.id];
  const iconCh = await getChampionIcon(ch.name);
  const iconOp = await getChampionIcon(op.name);

  // 턴 강조용
  const isChTurn = (turnId === challenger.id);
  const isOpTurn = (turnId === opponent.id);

  return new EmbedBuilder()
    .setTitle('⚔️ 챔피언 배틀')
    .setDescription(
      `**${challenger.username}** vs **${opponent.username}**\n\n` +
      `👉 **지금 차례: <@${turnId}> (${isChTurn ? ch.name : op.name})**`
    )
    .addFields(
      {
        name: `👑 ${challenger.username} ${isChTurn ? '👉 (내 턴)' : ''}`,
        value: `${ch.name} ${getStatusIcons(battle.context.effects[challenger.id])}
💖 ${chp}/${ch.stats.hp}
${createHpBar(chp, ch.stats.hp)}
${createStatField(ch, battle.context.effects[challenger.id])}
${createSkillField(challenger.id, ch.name, battle.context)}
`,
        inline: true
      },
      {
        name: `🛡️ ${opponent.username} ${isOpTurn ? '👉 (내 턴)' : ''}`,
        value: `${op.name} ${getStatusIcons(battle.context.effects[opponent.id])}
💖 ${ohp}/${op.stats.hp}
${createHpBar(ohp, op.stats.hp)}
${createStatField(op, battle.context.effects[opponent.id])}
${createSkillField(opponent.id, op.name, battle.context)}
`,
        inline: true
      },
      { name: '🎯 현재 턴', value: `👉 <@${turnId}> (${isChTurn ? ch.name : op.name})`, inline: false },
      { name: '📢 행동 결과', value: log || '없음', inline: false }
    )
    .setThumbnail(iconOp)
    .setImage(iconCh)
    .setColor(0x3498db);
}


async function createResultEmbed(winner, loser, userData, records, interaction, isDraw = false, drawIds = []) {
  if (isDraw) {
    // 무승부 안내
    const champ1 = userData[drawIds[0]], champ2 = userData[drawIds[1]];
    const stat1 = createStatField(champ1);
    const stat2 = createStatField(champ2);
    const icon1 = await getChampionIcon(champ1.name);
    const icon2 = await getChampionIcon(champ2.name);

    return new EmbedBuilder()
      .setTitle('🤝 무승부!')
      .setDescription('두 챔피언이 동시에 쓰러졌습니다. 무승부로 기록됩니다!')
      .addFields(
        { name: `${champ1.name} (${interaction.guild.members.cache.get(drawIds[0]).user.username})`, value: stat1, inline: true },
        { name: `${champ2.name} (${interaction.guild.members.cache.get(drawIds[1]).user.username})`, value: stat2, inline: true },
      )
      .setThumbnail(icon1)
      .setImage(icon2)
      .setColor(0xff9800)
      .setTimestamp();
  } else {
    // 기존 승패 안내
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
        `**${winChampName}** (${interaction.guild.members.cache.get(winner).user.username})\n` +
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
          value: `${loseChampName} (${interaction.guild.members.cache.get(loser).user.username})`,
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
  createHpBar,
  getStatusIcons,
  createStatField,
  canUseSkill,
  createSkillField,
};
