const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require('discord.js');
const path = require('path');
const {
  initBattleContext,
  processTurnStart,
  calculateDamage,
  activateGuard,
  tryEscape,
} = require('./battleEngine');
const { load, save } = require('./file-db');

const userDataPath = path.join(__dirname, '../data/champion-users.json');
const recordPath   = path.join(__dirname, '../data/champion-records.json');
const battlePath   = path.join(__dirname, '../data/battle-active.json');

async function checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol) {
  const chId = cur.challenger, opId = cur.opponent;
  const chp = cur.hp[chId], opp = cur.hp[opId];
  const chEffects = cur.context.effects[chId] || [];
  const opEffects = cur.context.effects[opId] || [];
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

// 예상 데미지, 쉴드, 점멸 등 실시간 계산 함수
function calcRealtimeInfo(attacker, defender, context) {
  // 예상 평타 데미지 범위(50~150%)
  const atkStats = attacker.stats || attacker;
  const defStats = defender.stats || defender;
  let ad = atkStats.attack || 0;
  let ap = atkStats.ap || 0;
  let pen = atkStats.penetration || 0;
  let def = defStats.defense || 0;
  let dodge = defStats.dodge || 0;

  let main = Math.max(ad, ap);
  let sub = Math.min(ad, ap);
  let defVal = Math.max(0, def - pen);

  // 방어효과
  let guardPct = context.percentReduction?.[defender.id] || 0;

  // 데미지 공식(랜덤 X, 최소/최대만)
  let minBase = Math.max(0, (main * 1.0 + sub * 0.5) - defVal) * 0.5;
  let maxBase = Math.max(0, (main * 1.0 + sub * 0.5) - defVal) * 1.5;

  // 더블데미지 적용 X (평균화)
  minBase = Math.floor(minBase * (1 - (guardPct / 100)));
  maxBase = Math.floor(maxBase * (1 - (guardPct / 100)));

  // 점멸 회피 확률 (20% + dodge + 버프)
  let blinkRate = 0.2 + (defStats.dodge || 0);

  return {
    minDmg: minBase,
    maxDmg: maxBase,
    shieldPct: guardPct,
    blinkRate: blinkRate
  };
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
      await btn.reply({ content: '⛔ 요청받은 유저만 가능합니다.', ephemeral: true });
      return;
    }
    await btn.deferUpdate();

    if (btn.customId === 'decline') {
      delete bd[battleId];
      save(battlePath, bd);
      await btn.editReply({ content: '❌ 배틀 요청이 거절되었습니다.', embeds: [], components: [] });
      reqCol.stop();
      return;
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
      context: {},
      turnStartTime: Date.now()
    };
    initBattleContext(bd[battleId]);
    save(battlePath, bd);

    let getActionRows = () => [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('attack').setLabel('🗡️ 평타').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('defend').setLabel('🛡️ 방어').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('blink').setLabel('✨ 점멸').setStyle(ButtonStyle.Primary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('skill').setLabel('🌟 스킬(준비중)').setStyle(ButtonStyle.Success).setDisabled(true),
        new ButtonBuilder().setCustomId('inventory').setLabel('🎒 인벤토리').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('escape').setLabel('🏃‍♂️ 탈주').setStyle(ButtonStyle.Secondary)
      ),
    ];

    // 임베드 생성 함수(턴 시간/예상 수치 반영)
    async function getBattleEmbed(cur, log, isEnd = false) {
      // 턴 시간 계산
      const remainTime = Math.max(0, 60 - Math.floor((Date.now() - (cur.turnStartTime || Date.now())) / 1000));
      const attackerId = cur.turn;
      const defenderId = cur.challenger === attackerId ? cur.opponent : cur.challenger;
      const attackerData = userData[attackerId];
      const defenderData = userData[defenderId];
      // 예상값 계산
      const rt = calcRealtimeInfo(attackerData, defenderData, cur.context);

      let embed = new EmbedBuilder()
        .setTitle('⚔️ 챔피언 배틀')
        .setDescription(`${log || '행동을 선택하세요!'}`)
        .addFields(
          { name: '현재 턴', value: `<@${attackerId}> (${attackerData.name})\n남은 시간: **${remainTime}초**`, inline: false },
          { name: 'HP', value: `**${cur.hp[cur.challenger]}** / **${userData[cur.challenger].stats.hp}** vs **${cur.hp[cur.opponent]}** / **${userData[cur.opponent].stats.hp}**`, inline: false },
        )
        .setColor(isEnd ? 0xaaaaaa : 0x3399ff)
        .setTimestamp();

      // 예상값(오른쪽 아래)
      embed.addFields([
        {
          name: '📊 [실시간 예상치]',
          value: `**평타 데미지:** ${rt.minDmg} ~ ${rt.maxDmg}\n**방어 피해감소:** ${rt.shieldPct}%\n**점멸(회피) 확률:** ${(rt.blinkRate * 100).toFixed(1)}%`,
          inline: false,
        }
      ]);
      return embed;
    }

    await btn.editReply({ content: '⚔️ 전투 시작!', embeds: [await getBattleEmbed(bd[battleId], '', false)], components: getActionRows() });
    const battleMsg = await btn.fetchReply();

    let turnCol;
    const startTurn = async () => {
      if (!bd[battleId]) return;
      const cur = bd[battleId];
      if (!cur || typeof cur.turn === "undefined") return;

      // 턴 시작시 시간 갱신
      cur.turnStartTime = Date.now();

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
          await i.reply({ content: '⛔ 당신 턴이 아닙니다.', ephemeral: true });
          return;
        }
        await i.deferUpdate();

        const tgt = cur.challenger === uid ? cur.opponent : cur.challenger;
        let log = '';

        if (i.customId === 'attack') {
          const dmgInfo = calculateDamage(
            { ...userData[uid], id: uid, hp: cur.hp[uid] },
            { ...userData[tgt], id: tgt, hp: cur.hp[tgt] },
            true,
            cur.context,
            userData[uid].name,
            false
          );
          if (dmgInfo.damage > 0) {
            cur.hp[tgt] = Math.max(0, cur.hp[tgt] - dmgInfo.damage);
          }
          if (cur.context.hp) {
            cur.context.hp[uid] = cur.hp[uid];
            cur.context.hp[tgt] = cur.hp[tgt];
          }
          if (userData[uid]) userData[uid].hp = cur.hp[uid];
          if (userData[tgt]) userData[tgt].hp = cur.hp[tgt];

          log = dmgInfo.log;
          cur.logs.push(log);
          cur.turn = cur.turn === cur.challenger ? cur.opponent : cur.challenger;
          save(battlePath, bd);

          const battleEnd = await checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol);
          if (battleEnd) return;

          await i.editReply({ content: '💥 턴 종료!', embeds: [await getBattleEmbed(cur, log, false)], components: getActionRows() });
          startTurn();
          return;
        }

        if (i.customId === 'defend') {
          const guardPercent = activateGuard(cur.context, uid, userData[uid].stats);
          log = `🛡️ ${userData[uid].name}이 방어 자세! (다음 턴 피해 ${Math.round(guardPercent * 100)}% 감소)`;
          cur.logs.push(log);
          cur.turn = cur.turn === cur.challenger ? cur.opponent : cur.challenger;
          save(battlePath, bd);

          const battleEnd = await checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol);
          if (battleEnd) return;

          await i.editReply({ content: '🛡️ 방어 사용!', embeds: [await getBattleEmbed(cur, log, false)], components: getActionRows() });
          startTurn();
          return;
        }

        if (i.customId === 'blink') {
          cur.context.effects[uid].push({ type: 'dodgeNextAttack', turns: 1 });
          const blinkRate = 0.2 + (userData[uid].stats?.dodge || 0);
          log = `✨ ${userData[uid].name}이(가) 점멸을 사용! (다음 공격을 ${(blinkRate * 100).toFixed(1)}% 확률로 회피 시도합니다)`;
          cur.logs.push(log);
          cur.turn = cur.turn === cur.challenger ? cur.opponent : cur.challenger;
          save(battlePath, bd);

          const battleEnd = await checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol);
          if (battleEnd) return;

          await i.editReply({ content: '✨ 점멸 사용!', embeds: [await getBattleEmbed(cur, log, false)], components: getActionRows() });
          startTurn();
          return;
        }

        if (i.customId === 'escape') {
          const result = tryEscape(cur.context);
          log = result.log;
          if (result.success) {
            const records = load(recordPath);
            const winner = tgt, loser = uid;
            records[winner] = records[winner] || { name: userData[winner].name, win: 0, draw: 0, lose: 0 };
            records[loser] = records[loser] || { name: userData[loser].name, win: 0, draw: 0, lose: 0 };
            records[winner].win++;
            records[loser].lose++;
            save(recordPath, records);

            const winEmbed = await createResultEmbed(winner, loser, userData, records, interaction);
            await i.editReply({ content: '🏃‍♂️ 탈주 성공! (패 처리)', embeds: [winEmbed], components: [] });
            delete bd[battleId];
            save(battlePath, bd);
            return;
          } else {
            cur.logs.push(log);
            cur.turn = cur.turn === cur.challenger ? cur.opponent : cur.challenger;
            save(battlePath, bd);

            await i.editReply({ content: '❌ 탈주 실패!', embeds: [await getBattleEmbed(cur, log, false)], components: getActionRows() });
            startTurn();
            return;
          }
        }

        if (i.customId === 'inventory') {
          log = '🎒 인벤토리 기능은 추후 업데이트 예정!';
          await i.reply({ content: log, ephemeral: true });
          return;
        }
        if (i.customId === 'skill') {
          await i.reply({ content: '🌟 [아직 준비중입니다.]', ephemeral: true });
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
