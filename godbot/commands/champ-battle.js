const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const {
  initBattleContext,
  processTurnStart,
  calculateDamage
} = require('../utils/battleEngine');
const skills = require('../utils/skills');
const skillCd = require('../utils/skills-cooldown');
const { getChampionIcon } = require('../utils/champion-utils');

const userDataPath = path.join(__dirname, '../data/champion-users.json');
const recordPath   = path.join(__dirname, '../data/champion-records.json');
const battlePath   = path.join(__dirname, '../data/battle-active.json');

function load(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '{}');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
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

  return new EmbedBuilder()
    .setTitle('⚔️ 챔피언 배틀')
    .setDescription(`**${challenger.username}** vs **${opponent.username}**`)
    .addFields(
      {
        name: `👑 ${challenger.username}`,
        value: `${ch.name} ${getStatusIcons(battle.context.effects[challenger.id])}
💖 ${chp}/${ch.stats.hp}
${createHpBar(chp, ch.stats.hp)}
${createStatField(ch, battle.context.effects[challenger.id])}
${createSkillField(challenger.id, ch.name, battle.context)}
`,
        inline: true
      },
      {
        name: `🛡️ ${opponent.username}`,
        value: `${op.name} ${getStatusIcons(battle.context.effects[opponent.id])}
💖 ${ohp}/${op.stats.hp}
${createHpBar(ohp, op.stats.hp)}
${createStatField(op, battle.context.effects[opponent.id])}
${createSkillField(opponent.id, op.name, battle.context)}
`,
        inline: true
      },
      { name: '🎯 현재 턴', value: `<@${turnId}>`, inline: false },
      { name: '📢 행동 결과', value: log || '없음', inline: false }
    )
    .setThumbnail(iconOp)
    .setImage(iconCh)
    .setColor(0x3498db);
}

async function createResultEmbed(winner, loser, userData, records, interaction) {
  const winChampName = userData[winner].name;
  const loseChampName = userData[loser].name;
  const winChampDesc = skills[winChampName]?.description || '';
  const loseChampDesc = skills[loseChampName]?.description || '';
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
        value: `**${winChampName}**\n${winChampDesc}`,
        inline: true
      },
      {
        name: '🪦 패배자 챔피언',
        value: `**${loseChampName}**\n${loseChampDesc}`,
        inline: true
      }
    )
    .addFields(
      {
        name: '🪦 패배자!',
        value: `${loseChampName} (${interaction.guild.members.cache.get(loser).user.username})\n`
          + `${loseChampDesc?.split('.')[0] || '챔피언의 특징 정보 없음.'}`,
        inline: false
      }
    )
    .setImage(winIcon)
    .setThumbnail(loseIcon)
    .setColor(0x00ff88)
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('챔피언배틀')
    .setDescription('지정한 유저와 챔피언을 배틀합니다.')
    .addUserOption(o =>
      o.setName('상대')
       .setDescription('대전 상대')
       .setRequired(true)
    ),
  async execute(interaction) {
    const challenger = interaction.user;
    const opponent   = interaction.options.getUser('상대');
    if (challenger.id === opponent.id) {
      return interaction.reply({ content: '❌ 자신과 대전할 수 없습니다.', ephemeral: true });
    }
    const userData = load(userDataPath);
    const bd       = load(battlePath);
    const battleId = `${challenger.id}_${opponent.id}`;

    if (bd[battleId]) {
      return interaction.reply({ content: '⚔️ 이미 이 상대와 배틀이 대기 중이거나 진행 중입니다.', ephemeral: true });
    }
    if (Object.values(bd).some(b =>
      b.challenger === challenger.id ||
      b.opponent    === challenger.id ||
      b.challenger === opponent.id    ||
      b.opponent    === opponent.id
    )) {
      return interaction.reply({ content: '⚔️ 이미 진행 중인 배틀이 있어 다른 배틀을 신청할 수 없습니다.', ephemeral: true });
    }
    if (!userData[challenger.id] || !userData[opponent.id]) {
      return interaction.reply({ content: '❌ 두 유저 모두 챔피언을 보유해야 합니다.', ephemeral: true });
    }

    // --- 배틀 요청 임베드 ---
    const chData = userData[challenger.id];
    const opData = userData[opponent.id];
    const chIcon = await getChampionIcon(chData.name);
    const opIcon = await getChampionIcon(opData.name);

    const requestEmbed = new EmbedBuilder()
      .setTitle('🗡️ 챔피언 배틀 요청')
      .setDescription(`<@${opponent.id}>님, ${challenger.username}님이 챔피언 배틀을 신청했어요!`)
      .addFields(
        { name: '👑 도전하는 자', value: `${challenger.username}\n**${chData.name}** (강화 ${chData.level}단계)`, inline: true },
        { name: '🛡️ 지키는 자',   value: `${opponent.username}\n**${opData.name}** (강화 ${opData.level}단계)`, inline: true }
      )
      .setThumbnail(chIcon)
      .setImage(opIcon)
      .setColor(0xffd700)
      .setFooter({ text: '30초 내에 의사를 표현하세요.' })
      .setTimestamp();

    bd[battleId] = { challenger: challenger.id, opponent: opponent.id, pending: true };
    save(battlePath, bd);

    const req = await interaction.reply({
      embeds: [requestEmbed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('accept').setLabel('✅ 도전 수락').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('decline').setLabel('❌ 거절').setStyle(ButtonStyle.Danger)
        )
      ],
      fetchReply: true
    });

    const reqCol = req.createMessageComponentCollector({ time: 30000 });
    reqCol.on('collect', async btn => {
      if (btn.user.id !== opponent.id) {
        return btn.reply({ content: '⛔ 요청받은 유저만 가능합니다.', ephemeral: true });
      }
      await btn.deferUpdate();

      if (btn.customId === 'decline') {
        delete bd[battleId];
        save(battlePath, bd);
        await btn.editReply({ content: '❌ 배틀 요청이 거절되었습니다.', embeds: [], components: [] });
        return reqCol.stop();
      }

      reqCol.stop();

      const startHpCh = userData[challenger.id].stats.hp;
      const startHpOp = userData[opponent.id].stats.hp;

      // 쿨타임 및 본인 턴 카운트 구조 세팅
      bd[battleId] = {
        challenger: challenger.id,
        opponent:   opponent.id,
        hp: {
          [challenger.id]: startHpCh,
          [opponent.id]:   startHpOp
        },
        turn: challenger.id,
        logs: [],
        usedSkill: {},
        context: {
          skillTurn: { [challenger.id]: 0, [opponent.id]: 0 },
          cooldowns: { [challenger.id]: 0, [opponent.id]: 0 },
          effects:   { [challenger.id]: [], [opponent.id]: [] }
        }
      };
      initBattleContext(bd[battleId]);
      save(battlePath, bd);

      let embed = await createBattleEmbed(challenger, opponent, bd[battleId], userData, challenger.id, '', true);

      const getActionRow = (canUseSkillBtn) =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('attack').setLabel('🗡️ 평타').setStyle(ButtonStyle.Danger).setDisabled(false),
          new ButtonBuilder().setCustomId('defend').setLabel('🛡️ 무빙').setStyle(ButtonStyle.Secondary).setDisabled(false),
          new ButtonBuilder().setCustomId('skill').setLabel('✨ 스킬').setStyle(ButtonStyle.Primary).setDisabled(!canUseSkillBtn)
        );
      await btn.editReply({ content: '⚔️ 전투 시작!', embeds: [embed], components: [getActionRow(true)] });
      const battleMsg = await btn.fetchReply();

      let turnCol;
      const startTurn = async () => {
        // battle 객체가 존재하는지 확인
        if (!bd[battleId]) return;

        const cur = bd[battleId];
        // 추가 방어: cur 자체가 없거나 turn 값이 없으면 collector 무시!
        if (!cur || typeof cur.turn === "undefined") return;

        cur.usedSkill = cur.usedSkill || {};
        const currentTurnUser = cur.turn;
        cur.context.skillTurn = cur.context.skillTurn || { [cur.challenger]: 0, [cur.opponent]: 0 };
        cur.context.cooldowns = cur.context.cooldowns || { [cur.challenger]: 0, [cur.opponent]: 0 };
        cur.context.effects   = cur.context.effects || { [cur.challenger]: [], [cur.opponent]: [] };

        // 내 턴 시작시 본인 skillTurn+1, 쿨다운(남아있으면) 1 감소
        cur.context.skillTurn[currentTurnUser] = (cur.context.skillTurn[currentTurnUser] || 0) + 1;
        if (cur.context.cooldowns[currentTurnUser] > 0) {
          cur.context.cooldowns[currentTurnUser]--;
        }

        processTurnStart(userData, cur, cur.turn);
        save(battlePath, bd);

        if (turnCol && !turnCol.ended) turnCol.stop();

        turnCol = battleMsg.createMessageComponentCollector({
          filter: i => {
            // collector 시작 시에도 bd[battleId]와 cur.turn 다시 확인!
            if (!bd[battleId]) return false;
            const cc = bd[battleId];
            if (!cc || typeof cc.turn === "undefined") return false;
            return [cc.challenger, cc.opponent].includes(i.user.id);
          },
          idle: 60000,
          time: 600000
        });

        let actionDone = {};

        turnCol.on('collect', async i => {
          // battle 객체가 유효한지(삭제 안됐는지) 매번 확인
          if (!bd[battleId]) {
            await i.reply({ content: '❌ 이미 종료된 배틀입니다.', ephemeral: true });
            return;
          }
          const cur = bd[battleId];
          // 추가 방어: cur 및 turn이 반드시 정의되어야 함
          if (!cur || typeof cur.turn === "undefined") {
            await i.reply({ content: '❌ 잘못된 배틀 상태입니다. (turn 없음)', ephemeral: true });
            return;
          }
          const uid = i.user.id;
          if (uid !== cur.turn) {
            return i.reply({ content: '⛔ 당신 턴이 아닙니다.', ephemeral: true });
          }
          await i.deferUpdate();

          const tgt = cur.challenger === uid ? cur.opponent : cur.challenger;
          let log = '';

          // 평타 or 방어(턴 종료)
          if (i.customId === 'attack' || i.customId === 'defend') {
            actionDone[uid] = actionDone[uid] || { skill: false, done: false };
            actionDone[uid].done = true;

            if (i.customId === 'attack') {
              const dmgInfo = calculateDamage(
                { ...userData[uid], id: uid, hp: cur.hp[uid] },
                { ...userData[tgt], id: tgt, hp: cur.hp[tgt] },
                true,
                cur.context,
                userData[uid].name,
                false
              );
              cur.hp[uid] = cur.context.hp ? cur.context.hp[uid] : cur.hp[uid];
              cur.hp[tgt] = cur.context.hp ? cur.context.hp[tgt] : Math.max(0, cur.hp[tgt] - dmgInfo.damage);
              log = dmgInfo.log;
            } else {
              const block = userData[uid].stats.defense;
              cur.context.effects[uid].push({ type: 'damageReduction', value: block, turns: 1 });
              log = `🛡️ ${userData[uid].name}이 무빙… 다음 턴 피해 ${block}↓`;
            }

            cur.logs.push(log);
            actionDone[uid] = { skill: false, done: false };
            cur.usedSkill[uid] = false;

            // 턴 변경
            cur.turn = cur.turn === cur.challenger ? cur.opponent : cur.challenger;
            save(battlePath, bd);

            const loser = cur.hp[cur.challenger] <= 0 ? cur.challenger : (cur.hp[cur.opponent] <= 0 ? cur.opponent : null);
            if (loser) {
              turnCol.stop();
              const winner = loser === cur.challenger ? cur.opponent : cur.challenger;
              const records = load(recordPath);
              records[winner] = records[winner] || { name: userData[winner].name, win: 0, draw: 0, lose: 0 };
              records[loser] = records[loser] || { name: userData[loser].name, win: 0, draw: 0, lose: 0 };
              records[winner].win++;
              records[loser].lose++;
              save(recordPath, records);

              const winEmbed = await createResultEmbed(winner, loser, userData, records, interaction);

              await i.editReply({ content: '🏆 승리!', embeds: [winEmbed], components: [] });
              delete bd[battleId];
              save(battlePath, bd);
              return;
            }

            // 다음 턴: "본인 턴만 카운트 증가" 유지
            const nextEmbed = await createBattleEmbed(
              challenger, opponent, cur, userData, cur.turn, log, canUseSkillBtn(cur)
            );
            await i.editReply({ content: '💥 턴 종료!', embeds: [nextEmbed], components: [getActionRow(canUseSkillBtn(cur))] });

            startTurn();
            return;
          }

          // 스킬(성공/실패 관계 없이 '턴 넘기지 않음' & 카운트 증가 X)
          if (i.customId === 'skill') {
            actionDone[uid] = actionDone[uid] || { skill: false, done: false };
            cur.usedSkill[uid] = cur.usedSkill[uid] || false;

            if (actionDone[uid].skill || cur.usedSkill[uid]) {
              log = '이 턴엔 이미 스킬을 사용했습니다!';
            } else {
              const champName = userData[uid].name;
              const skillCheck = canUseSkill(uid, champName, cur.context);
              if (!skillCheck.ok) {
                log = `❌ 스킬 사용 불가: ${skillCheck.reason}`;
              } else {
                const dmgInfo = calculateDamage(
                  { ...userData[uid], id: uid, hp: cur.hp[uid] },
                  { ...userData[tgt], id: tgt, hp: cur.hp[tgt] },
                  true,
                  cur.context,
                  champName,
                  true
                );
                cur.hp[uid] = cur.context.hp ? cur.context.hp[uid] : cur.hp[uid];
                cur.hp[tgt] = cur.context.hp ? cur.context.hp[tgt] : Math.max(0, cur.hp[tgt] - dmgInfo.damage);
                log = dmgInfo.log;
                actionDone[uid].skill = true;
                cur.usedSkill[uid] = true;

                // 쿨타임 세팅: 쿨이 N이면 "다음 내 턴부터 N턴 뒤에" 사용 가능 (0이면 사용 가능)
                const cdObj = skillCd[champName];
                if (cdObj) {
                  cur.context.cooldowns[uid] = cdObj.cooldown || 1;
                  cur.context.skillTurn[uid] = 0; // 다음 내 턴부터 카운트
                }
              }
            }
            cur.logs.push(log);

            const nextEmbed = await createBattleEmbed(
              challenger, opponent, cur, userData, cur.turn, log, canUseSkillBtn(cur)
            );
            await i.editReply({ content: '✨ 스킬 사용!', embeds: [nextEmbed], components: [getActionRow(canUseSkillBtn(cur))] });
            // **턴은 그대로! 평타/무빙 때만 넘어감**
            return;
          }
        });

        turnCol.on('end', async (_col, reason) => {
          if (['idle', 'time'].includes(reason)) {
            if (bd[battleId]) delete bd[battleId];
            save(battlePath, bd);
            const stopEmbed = new EmbedBuilder()
              .setTitle('🛑 전투 중단')
              .setDescription('60초 동안 아무런 행동도 없어 전투가 자동 종료되었습니다.')
              .setColor(0xff4444)
              .setTimestamp();
            await battleMsg.edit({ content: null, embeds: [stopEmbed], components: [] });
          }
        });
      };

      reqCol.on('end', async (_col, reason) => {
        if (['time', 'idle'].includes(reason) && bd[battleId]?.pending) {
          delete bd[battleId];
          save(battlePath, bd);
          try {
            await req.edit({ content: '❌ 배틀 요청 시간 초과로 취소되었습니다.', embeds: [], components: [] });
          } catch {}
        }
      });

      function canUseSkillBtn(cur) {
        if (!cur || typeof cur.turn === "undefined") return false;
        const uid = cur.turn;
        const champName = userData[uid]?.name;
        return canUseSkill(uid, champName, cur.context).ok;
      }

      startTurn();
    });
  }
};
