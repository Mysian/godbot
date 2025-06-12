const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require('discord.js');
const path = require('path');
const { initBattleContext, processTurnStart, calculateDamage } = require('./battleEngine');
const { createBattleEmbed, createResultEmbed, canUseSkill } = require('./battle-embed');
const { load, save } = require('./file-db');

const userDataPath = path.join(__dirname, '../data/champion-users.json');
const recordPath   = path.join(__dirname, '../data/champion-records.json');
const battlePath   = path.join(__dirname, '../data/battle-active.json');

async function checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol) {
  const chId = cur.challenger, opId = cur.opponent;
  const chp = cur.hp[chId], opp = cur.hp[opId];
  const chEffects = cur.context.effects[chId] || [];
  const opEffects = cur.context.effects[opId] || [];
  // 부활 판정 (효과 리스트에 revive)
  const chRevive = chEffects.some(e => e.type === 'revive' && e.applied !== true);
  const opRevive = opEffects.some(e => e.type === 'revive' && e.applied !== true);

  if (chp <= 0 && opp <= 0) {
    if (turnCol && !turnCol.ended) turnCol.stop();

    if (chRevive || opRevive) {
      if (chRevive && !opRevive) {
        const records = load(recordPath);
        records[chId] = records[chId] || { name: userData[chId].name, win: 0, draw: 0, lose: 0 };
        records[opId] = records[opId] || { name: userData[opId].name, win: 0, draw: 0, lose: 0 };
        records[chId].win++;
        records[opId].lose++;
        save(recordPath, records);

        const winEmbed = await createResultEmbed(chId, opId, userData, records, interaction);
        await battleMsg.edit({ content: '🪄 부활! 승리!', embeds: [winEmbed], components: [] });
        delete bd[battleId]; save(battlePath, bd);
        return true;
      }
      if (!chRevive && opRevive) {
        const records = load(recordPath);
        records[chId] = records[chId] || { name: userData[chId].name, win: 0, draw: 0, lose: 0 };
        records[opId] = records[opId] || { name: userData[opId].name, win: 0, draw: 0, lose: 0 };
        records[chId].lose++;
        records[opId].win++;
        save(recordPath, records);

        const winEmbed = await createResultEmbed(opId, chId, userData, records, interaction);
        await battleMsg.edit({ content: '🪄 부활! 승리!', embeds: [winEmbed], components: [] });
        delete bd[battleId]; save(battlePath, bd);
        return true;
      }
      if (chRevive && opRevive) {
        const realChp = cur.hp[chId];
        const realOpp = cur.hp[opId];
        if (realChp > realOpp) {
          const records = load(recordPath);
          records[chId] = records[chId] || { name: userData[chId].name, win: 0, draw: 0, lose: 0 };
          records[opId] = records[opId] || { name: userData[opId].name, win: 0, draw: 0, lose: 0 };
          records[chId].win++;
          records[opId].lose++;
          save(recordPath, records);
          const winEmbed = await createResultEmbed(chId, opId, userData, records, interaction);
          await battleMsg.edit({ content: '🪄 동시 부활! HP 높은 쪽 승!', embeds: [winEmbed], components: [] });
          delete bd[battleId]; save(battlePath, bd);
          return true;
        }
        if (realChp < realOpp) {
          const records = load(recordPath);
          records[chId] = records[chId] || { name: userData[chId].name, win: 0, draw: 0, lose: 0 };
          records[opId] = records[opId] || { name: userData[opId].name, win: 0, draw: 0, lose: 0 };
          records[chId].lose++;
          records[opId].win++;
          save(recordPath, records);
          const winEmbed = await createResultEmbed(opId, chId, userData, records, interaction);
          await battleMsg.edit({ content: '🪄 동시 부활! HP 높은 쪽 승!', embeds: [winEmbed], components: [] });
          delete bd[battleId]; save(battlePath, bd);
          return true;
        }
        if (realChp === realOpp) {
          const records = load(recordPath);
          records[chId] = records[chId] || { name: userData[chId].name, win: 0, draw: 0, lose: 0 };
          records[opId] = records[opId] || { name: userData[opId].name, win: 0, draw: 0, lose: 0 };
          records[chId].draw = (records[chId].draw || 0) + 1;
          records[opId].draw = (records[opId].draw || 0) + 1;
          save(recordPath, records);
          const drawEmbed = await createResultEmbed(null, null, userData, records, interaction, true, [chId, opId]);
          await battleMsg.edit({ content: '🤝 완벽한 동시 부활 무승부!', embeds: [drawEmbed], components: [] });
          delete bd[battleId]; save(battlePath, bd);
          return true;
        }
      }
    } else {
      const records = load(recordPath);
      records[chId] = records[chId] || { name: userData[chId].name, win: 0, draw: 0, lose: 0 };
      records[opId] = records[opId] || { name: userData[opId].name, win: 0, draw: 0, lose: 0 };
      records[chId].draw = (records[chId].draw || 0) + 1;
      records[opId].draw = (records[opId].draw || 0) + 1;
      save(recordPath, records);
      const drawEmbed = await createResultEmbed(null, null, userData, records, interaction, true, [chId, opId]);
      await battleMsg.edit({ content: '🤝 동시 사망 무승부!', embeds: [drawEmbed], components: [] });
      delete bd[battleId]; save(battlePath, bd);
      return true;
    }
  }

  const loser = chp <= 0 ? chId : (opp <= 0 ? opId : null);
  if (loser) {
    if (turnCol && !turnCol.ended) turnCol.stop();
    const winner = loser === chId ? opId : chId;
    const records = load(recordPath);
    records[winner] = records[winner] || { name: userData[winner].name, win: 0, draw: 0, lose: 0 };
    records[loser] = records[loser] || { name: userData[loser].name, win: 0, draw: 0, lose: 0 };
    records[winner].win++;
    records[loser].lose++;
    save(recordPath, records);

    const winEmbed = await createResultEmbed(winner, loser, userData, records, interaction);
    await battleMsg.edit({ content: '🏆 승리!', embeds: [winEmbed], components: [] });
    delete bd[battleId];
    save(battlePath, bd);
    return true;
  }
  return false;
}

async function startBattleRequest(interaction) {
  const challenger = interaction.user;
  const opponent   = interaction.options.getUser('상대');
  const userData = load(userDataPath);
  const bd       = load(battlePath);
  const battleId = `${challenger.id}_${opponent.id}`;

  if (challenger.id === opponent.id) {
    return interaction.reply({ content: '❌ 자신과 대전할 수 없습니다.', ephemeral: true });
  }
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

  const chData = userData[challenger.id];
  const opData = userData[opponent.id];
  const chIcon = await require('./champion-utils').getChampionIcon(chData.name);
  const opIcon = await require('./champion-utils').getChampionIcon(opData.name);

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

  const getActionRows = (canUseSkillBtn) => [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('attack').setLabel('🗡️ 평타').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('defend').setLabel('🛡️ 쉴드').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('blink').setLabel('✨ 점멸').setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('skill').setLabel('🌟 스킬').setStyle(ButtonStyle.Success).setDisabled(!canUseSkillBtn),
      new ButtonBuilder().setCustomId('inventory').setLabel('🎒 인벤토리').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('escape').setLabel('🏃‍♂️ 탈주').setStyle(ButtonStyle.Secondary)
    ),
  ];
    
    await btn.editReply({ content: '⚔️ 전투 시작!', embeds: [embed], components: [getActionRow(true)] });
    const battleMsg = await btn.fetchReply();

    let turnCol;
    const startTurn = async () => {
      if (!bd[battleId]) return;
      const cur = bd[battleId];
      if (!cur || typeof cur.turn === "undefined") return;

      cur.usedSkill = cur.usedSkill || {};
      const currentTurnUser = cur.turn;
      cur.context.skillTurn = cur.context.skillTurn || { [cur.challenger]: 0, [cur.opponent]: 0 };
      cur.context.cooldowns = cur.context.cooldowns || { [cur.challenger]: 0, [cur.opponent]: 0 };
      cur.context.effects   = cur.context.effects || { [cur.challenger]: [], [cur.opponent]: [] };

      cur.context.skillTurn[currentTurnUser] = (cur.context.skillTurn[currentTurnUser] || 0) + 1;
      if (cur.context.cooldowns[currentTurnUser] > 0) {
        cur.context.cooldowns[currentTurnUser]--;
      }

      processTurnStart(userData, cur, cur.turn);
      save(battlePath, bd);

      if (turnCol && !turnCol.ended) turnCol.stop();

      turnCol = battleMsg.createMessageComponentCollector({
        filter: i => {
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
        if (!bd[battleId]) {
          await i.reply({ content: '❌ 이미 종료된 배틀입니다.', ephemeral: true });
          return;
        }
        const cur = bd[battleId];
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

            const battleEnd = await checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol);
            if (battleEnd) return;
          } else {
            const block = userData[uid].stats.defense;
            cur.context.effects[uid].push({ type: 'damageReduction', value: block, turns: 1 });
            log = `🛡️ ${userData[uid].name}이 무빙… 다음 턴 피해 ${block}↓`;
          }

          cur.logs.push(log);
          actionDone[uid] = { skill: false, done: false };
          cur.usedSkill[uid] = false;

          cur.turn = cur.turn === cur.challenger ? cur.opponent : cur.challenger;
          save(battlePath, bd);

          const battleEnd = await checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol);
          if (battleEnd) return;

          const nextEmbed = await createBattleEmbed(
            challenger, opponent, cur, userData, cur.turn, log, canUseSkillBtn(cur)
          );
          await i.editReply({ content: '💥 턴 종료!', embeds: [nextEmbed], components: getActionRows(canUseSkillBtn(cur)) });
          startTurn();
          return;
        }

          if (i.customId === 'blink') {
          // 점멸(회피) 예시: 회피 버프 1턴 부여 (커스텀 효과)
          cur.context.effects[uid].push({ type: 'dodgeNextAttack', turns: 1 });
          log = `✨ ${userData[uid].name}이(가) 순식간에 점멸! (다음 공격 1회 회피)`;
          cur.logs.push(log);
          cur.turn = cur.turn === cur.challenger ? cur.opponent : cur.challenger;
          save(battlePath, bd);

          const battleEnd = await checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol);
          if (battleEnd) return;

          const nextEmbed = await createBattleEmbed(challenger, opponent, cur, userData, cur.turn, log, canUseSkillBtn(cur));
          await i.editReply({ content: '✨ 점멸 사용!', embeds: [nextEmbed], components: getActionRows(canUseSkillBtn(cur)) });
          startTurn();
          return;
        }
        if (i.customId === 'inventory') {
          log = '🎒 인벤토리 기능은 추후 업데이트 예정!';
          await i.reply({ content: log, ephemeral: true });
          return;
        }
        if (i.customId === 'escape') {
          log = '🏃‍♂️ 탈주 기능은 추후 업데이트 예정!';
          await i.reply({ content: log, ephemeral: true });
          return;
        }
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

              const cdObj = require('./skills-cooldown')[champName];
              if (cdObj) {
                cur.context.cooldowns[uid] = cdObj.cooldown || 1;
                cur.context.skillTurn[uid] = 0;
              }
              const battleEnd = await checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol);
              if (battleEnd) return;
            }
          }
          cur.logs.push(log);

          const nextEmbed = await createBattleEmbed(
            challenger, opponent, cur, userData, cur.turn, log, canUseSkillBtn(cur)
          );
          await i.editReply({ content: '✨ 스킬 사용!', embeds: [nextEmbed], components: [getActionRow(canUseSkillBtn(cur))] });
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

    function canUseSkillBtn(cur) {
      if (!cur || typeof cur.turn === "undefined") return false;
      const uid = cur.turn;
      const champName = userData[uid]?.name;
      return canUseSkill(uid, champName, cur.context).ok;
    }

    startTurn();
  });

  reqCol.on('end', async (_col, reason) => {
    if (['time', 'idle'].includes(reason) && bd[battleId]?.pending) {
      delete bd[battleId];
      save(battlePath, bd);
      const timeoutEmbed = new EmbedBuilder()
        .setTitle('⏰ 배틀 요청 시간 초과')
        .setDescription('30초 동안 아무런 응답이 없어 배틀이 종료되었습니다.')
        .setColor(0xff4444)
        .setTimestamp();
      try {
        await req.edit({ content: null, embeds: [timeoutEmbed], components: [] });
      } catch {}
    }
  });
}

module.exports = { startBattleRequest };
