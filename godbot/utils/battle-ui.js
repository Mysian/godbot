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
const { createResultEmbed } = require('./battle-embed');
const { load, save } = require('./file-db');

const userDataPath = path.join(__dirname, '../data/champion-users.json');
const recordPath   = path.join(__dirname, '../data/champion-records.json');
const battlePath   = path.join(__dirname, '../data/battle-active.json');

// 체력바 (빨간색 10칸)
function createHpBar(current, max) {
  const totalBars = 10;
  const filled = Math.max(0, Math.round((current / max) * totalBars));
  return "🟥".repeat(filled) + "⬜".repeat(totalBars - filled);
}

// 능력치 이모지
const statEmojis = {
  attack: "⚔️",
  ap: "✨",
  defense: "🛡️",
  penetration: "🔪",
  dodge: "💨"
};

// 점멸 효과 반영 (파란 강조)
function getDodgeLine(stats, effects, baseDodge) {
  const blink = effects.find(e => e.type === 'dodgeNextAttack' && e.turns > 0);
  let text = `${statEmojis.dodge} 회피: ${(baseDodge * 100).toFixed(0)}%`;
  if (blink) {
    // 디스코드에서 파랑 강조: **__+20%__**
    text += " **__+20%__**";
  }
  return text;
}

// 능력치 표기(한줄씩, 점멸 효과 반영)
function statLines(stats, effects) {
  return [
    `${statEmojis.attack} 공격력: ${stats.attack || 0}`,
    `${statEmojis.ap} 주문력: ${stats.ap || 0}`,
    `${statEmojis.defense} 방어력: ${stats.defense || 0}`,
    `${statEmojis.penetration} 관통력: ${stats.penetration || 0}`,
    getDodgeLine(stats, effects, stats.dodge || 0)
  ].join('\n');
}

// 임베드 생성: 멘션+닉네임+챔피언명+상태+능력치(점멸시 파란+20%)
async function getBattleEmbed(challenger, opponent, cur, userData, turnUserId, log, isEnd = false) {
  const chId = challenger.id || challenger;
  const opId = opponent.id || opponent;
  const chData = userData[chId];
  const opData = userData[opId];
  const chIcon = await require('./champion-utils').getChampionIcon(chData.name);
  const opIcon = await require('./champion-utils').getChampionIcon(opData.name);

  // 상태(확장 가능)
  const chState = "정상";
  const opState = "정상";

  // 현재 턴
  const nowTurn = cur.turn;
  const nowTurnText = `<@${nowTurn}> (${userData[nowTurn].name})`;
  const logText = log ? `\n\n📍 **행동 결과**\n${log}` : "";

  // 점멸효과 포함한 능력치
  const chEffects = (cur.context.effects && cur.context.effects[chId]) ? cur.context.effects[chId] : [];
  const opEffects = (cur.context.effects && cur.context.effects[opId]) ? cur.context.effects[opId] : [];

  return new EmbedBuilder()
    .setTitle('⚔️ 챔피언 배틀')
    .setDescription(
      `**지금 차례:** ${nowTurnText}${logText}`
    )
    .addFields(
      {
        name: `<@${chId}> (${userData[chId]?.username || chId}) [${chData.name}]`,
        value: [
          `${createHpBar(cur.hp[chId], chData.stats.hp)} (${cur.hp[chId]} / ${chData.stats.hp})`,
          `상태: ${chState}`,
          statLines(chData.stats, chEffects)
        ].join('\n'),
        inline: true
      },
      {
        name: `<@${opId}> (${userData[opId]?.username || opId}) [${opData.name}]`,
        value: [
          `${createHpBar(cur.hp[opId], opData.stats.hp)} (${cur.hp[opId]} / ${opData.stats.hp})`,
          `상태: ${opState}`,
          statLines(opData.stats, opEffects)
        ].join('\n'),
        inline: true
      }
    )
    .setImage(chIcon)
    .setThumbnail(opIcon)
    .setColor(isEnd ? 0xaaaaaa : 0x3399ff)
    .setTimestamp();
}

// 승패/무승부 처리
async function checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol) {
  const chId = cur.challenger, opId = cur.opponent;
  const chHp = cur.hp[chId], opHp = cur.hp[opId];
  // 동시 사망 무승부
  if (chHp <= 0 && opHp <= 0) {
    if (turnCol && !turnCol.ended) turnCol.stop();
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
  // 승리/패배
  const loser = chHp <= 0 ? chId : (opHp <= 0 ? opId : null);
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
    delete bd[battleId]; save(battlePath, bd);
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
    .setThumbnail(opIcon)
    .setImage(chIcon)
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
      context: {
        effects: {
          [challenger.id]: [],
          [opponent.id]: []
        }
      },
      turnStartTime: Date.now()
    };
    initBattleContext(bd[battleId]);
    save(battlePath, bd);

    const getActionRows = () => [
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

    let battleMsg = await btn.editReply({
      content: '⚔️ 전투 시작!',
      embeds: [await getBattleEmbed(challenger, opponent, bd[battleId], userData, challenger.id, '', false)],
      components: getActionRows()
    });

    let turnCol;
    const startTurn = async () => {
      if (!bd[battleId]) return;
      const cur = bd[battleId];
      if (!cur || typeof cur.turn === "undefined") return;

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

        // === 평타 ===
        if (i.customId === 'attack') {
          // 회피 판정 (점멸 효과만)
          let effectsArr = cur.context.effects[tgt] || [];
          let dodgeIdx = effectsArr.findIndex(e => e.type === 'dodgeNextAttack' && e.turns > 0);
          if (dodgeIdx !== -1) {
            let dodgeRate = 0.2 + (userData[tgt].stats.dodge || 0);
            if (Math.random() < dodgeRate) {
              log = `💨 ${userData[tgt].name}이(가) 점멸로 공격을 회피!`;
              effectsArr[dodgeIdx].turns = 0;
              cur.context.effects[tgt] = effectsArr.filter(e => e.turns > 0);
              cur.logs.push(log);
              cur.turn = cur.turn === cur.challenger ? cur.opponent : cur.challenger;
              save(battlePath, bd);

              const battleEnd = await checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol);
              if (battleEnd) return;

              const nextEmbed = await getBattleEmbed(challenger, opponent, cur, userData, cur.turn, log, false);
              await i.editReply({ content: '💨 회피 성공!', embeds: [nextEmbed], components: getActionRows() });
              startTurn();
              return;
            } else {
              effectsArr[dodgeIdx].turns = 0;
              cur.context.effects[tgt] = effectsArr.filter(e => e.turns > 0);
            }
          }
          // 일반 공격
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

          // 승패 체크
          const battleEnd = await checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol);
          if (battleEnd) return;

          cur.turn = cur.turn === cur.challenger ? cur.opponent : cur.challenger;
          save(battlePath, bd);

          const nextEmbed = await getBattleEmbed(challenger, opponent, cur, userData, cur.turn, log, false);
          await i.editReply({ content: '💥 턴 종료!', embeds: [nextEmbed], components: getActionRows() });
          startTurn();
          return;
        }

        // === 방어 ===
        if (i.customId === 'defend') {
          const guardPercent = activateGuard(cur.context, uid, userData[uid].stats);
          log = `🛡️ ${userData[uid].name}이 방어 자세! (다음 턴 피해 ${Math.round(guardPercent * 100)}% 감소)`;
          cur.logs.push(log);

          // 승패 체크
          const battleEnd = await checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol);
          if (battleEnd) return;

          cur.turn = cur.turn === cur.challenger ? cur.opponent : cur.challenger;
          save(battlePath, bd);

          const nextEmbed = await getBattleEmbed(challenger, opponent, cur, userData, cur.turn, log, false);
          await i.editReply({ content: '🛡️ 방어 사용!', embeds: [nextEmbed], components: getActionRows() });
          startTurn();
          return;
        }

        // === 점멸 ===
        if (i.customId === 'blink') {
          if (!cur.context.effects[uid]) cur.context.effects[uid] = [];
          cur.context.effects[uid].push({ type: 'dodgeNextAttack', turns: 1 });
          const blinkRate = 0.2 + (userData[uid].stats?.dodge || 0);
          log = `✨ ${userData[uid].name}이(가) 점멸을 사용! (다음 공격을 ${(blinkRate * 100).toFixed(1)}% 확률로 회피 시도합니다)`;
          cur.logs.push(log);

          // 승패 체크
          const battleEnd = await checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol);
          if (battleEnd) return;

          cur.turn = cur.turn === cur.challenger ? cur.opponent : cur.challenger;
          save(battlePath, bd);

          const nextEmbed = await getBattleEmbed(challenger, opponent, cur, userData, cur.turn, log, false);
          await i.editReply({ content: '✨ 점멸 사용!', embeds: [nextEmbed], components: getActionRows() });
          startTurn();
          return;
        }

        // === 탈주 ===
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
            save(battlePath, bd);

            const nextEmbed = await getBattleEmbed(challenger, opponent, cur, userData, cur.turn, log, false);
            await i.editReply({ content: '❌ 탈주 실패! (턴 유지)', embeds: [nextEmbed], components: getActionRows() });
            return;
          }
        }

        // === 인벤토리/스킬(준비중) ===
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
