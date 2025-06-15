// battle-ui.js

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require('discord.js');
const path = require('path');
const {
  initBattleContext,
  processTurn,
  applyEffects,
} = require('./battleEngine');
const { createResultEmbed, createBattleEmbed } = require('./battle-embed');
const passiveSkills = require('./passive-skills');
const { load, save } = require('./file-db');
const { getChampionIcon } = require('./champion-utils');

const userDataPath = path.join(__dirname, '../data/champion-users.json');
const recordPath   = path.join(__dirname, '../data/champion-records.json');
const battlePath   = path.join(__dirname, '../data/battle-active.json');

function getActionRows() {
  return [
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

  const chIcon = await getChampionIcon(chData.name);
  const opIcon = await getChampionIcon(opData.name);

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

  // 전투 context 세팅 (총 턴 turn: 1부터 시작)
  bd[battleId] = {
    challenger: challenger.id,
    opponent:   opponent.id,
    hp: {
      [challenger.id]: chData.stats.hp,
      [opponent.id]:   opData.stats.hp
    },
    turn: 1,
    logs: [],
    usedSkill: {},
    context: {
      effects: {
        [challenger.id]: [],
        [opponent.id]: []
      },
      passiveLogs: {},
      actionLogs: [],
      passiveLogLines: [],
      skillLogLines: [],
      personalTurns: {
        [challenger.id]: 0,
        [opponent.id]: 0
      },
      globalTurn: 1
    },
    turnUser: challenger.id,
    turnStartTime: Date.now()
  };
  initBattleContext(bd[battleId]);
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

    let battleMsg = await btn.editReply({
      content: '⚔️ 전투 시작!',
      embeds: [await createBattleEmbed(challenger, opponent, bd[battleId], userData, challenger.id, '', true, bd[battleId].context.passiveLogs)],
      components: getActionRows()
    });

    let turnCol;
    const startTurn = async () => {
      if (!bd[battleId]) return;
      const cur = bd[battleId];
      if (!cur || typeof cur.turn === "undefined") return;

      cur.turnStartTime = Date.now();

      // === 턴 시작시: 총 턴 증가 ===
      cur.turn = (cur.turn || 0) + 1;
      cur.context.globalTurn = cur.turn;

      // 턴 시작 전: 효과 적용
      const user1 = cur.challenger, user2 = cur.opponent;
      applyEffects(userData[user1], cur.context, 'turnStart');
      applyEffects(userData[user2], cur.context, 'turnStart');
      cur.context.personalTurns[user1] = (cur.context.personalTurns[user1] || 0) + 1;
      cur.context.personalTurns[user2] = (cur.context.personalTurns[user2] || 0) + 1;

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
        if (uid !== cur.turnUser) {
          await i.reply({ content: '⛔ 당신 턴이 아닙니다.', ephemeral: true });
          return;
        }
        await i.deferUpdate();

        const tgt = cur.challenger === uid ? cur.opponent : cur.challenger;
        let log = '';

        // === 평타 ===
        if (i.customId === 'attack') {
          cur.context.actionLogs = [];
          cur.context.passiveLogLines = [];
          cur.context.skillLogLines = [];
          log = processTurn(userData, cur, uid, tgt, 'attack');

          // 내 턴 카운트만 +1 (개인 턴)
          cur.context.personalTurns[uid] = (cur.context.personalTurns[uid] || 0) + 1;

          const battleEnd = await checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol);
          if (battleEnd) return;

          // 턴 종료: 효과 적용
          applyEffects(userData[uid], cur.context, 'turnEnd');
          applyEffects(userData[tgt], cur.context, 'turnEnd');

          // 턴 전환
          cur.turnUser = cur.turnUser === cur.challenger ? cur.opponent : cur.challenger;
          save(battlePath, bd);

          // 패시브 로그 마지막 한 줄만 전달
          let plogs = {};
          for (const key of Object.keys(cur.context.passiveLogs || {})) {
            const arr = cur.context.passiveLogs[key];
            plogs[key] = arr && arr.length > 0 ? [arr[arr.length - 1]] : [];
          }

          const nextEmbed = await createBattleEmbed(challenger, opponent, cur, userData, cur.turnUser, log, true, plogs);
          await i.editReply({ content: '💥 턴 종료!', embeds: [nextEmbed], components: getActionRows() });
          startTurn();
          return;
        }

        // === 방어 ===
        if (i.customId === 'defend') {
          cur.context.actionLogs = [];
          cur.context.passiveLogLines = [];
          cur.context.skillLogLines = [];
          log = processTurn(userData, cur, uid, tgt, 'defend');

          cur.context.personalTurns[uid] = (cur.context.personalTurns[uid] || 0) + 1;

          const battleEnd = await checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol);
          if (battleEnd) return;

          applyEffects(userData[uid], cur.context, 'turnEnd');
          applyEffects(userData[tgt], cur.context, 'turnEnd');

          cur.turnUser = cur.turnUser === cur.challenger ? cur.opponent : cur.challenger;
          save(battlePath, bd);

          let plogs = {};
          for (const key of Object.keys(cur.context.passiveLogs || {})) {
            const arr = cur.context.passiveLogs[key];
            plogs[key] = arr && arr.length > 0 ? [arr[arr.length - 1]] : [];
          }

          const nextEmbed = await createBattleEmbed(challenger, opponent, cur, userData, cur.turnUser, log, true, plogs);
          await i.editReply({ content: '🛡️ 방어 사용!', embeds: [nextEmbed], components: getActionRows() });
          startTurn();
          return;
        }

        // === 점멸 ===
        if (i.customId === 'blink') {
          cur.context.actionLogs = [];
          cur.context.passiveLogLines = [];
          cur.context.skillLogLines = [];
          log = processTurn(userData, cur, uid, tgt, 'dodge');

          cur.context.personalTurns[uid] = (cur.context.personalTurns[uid] || 0) + 1;

          const battleEnd = await checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol);
          if (battleEnd) return;

          applyEffects(userData[uid], cur.context, 'turnEnd');
          applyEffects(userData[tgt], cur.context, 'turnEnd');

          cur.turnUser = cur.turnUser === cur.challenger ? cur.opponent : cur.challenger;
          save(battlePath, bd);

          let plogs = {};
          for (const key of Object.keys(cur.context.passiveLogs || {})) {
            const arr = cur.context.passiveLogs[key];
            plogs[key] = arr && arr.length > 0 ? [arr[arr.length - 1]] : [];
          }

          const nextEmbed = await createBattleEmbed(challenger, opponent, cur, userData, cur.turnUser, log, true, plogs);
          await i.editReply({ content: '✨ 점멸 사용!', embeds: [nextEmbed], components: getActionRows() });
          startTurn();
          return;
        }

        // === 탈주 ===
        if (i.customId === 'escape') {
          cur.hp[uid] = 0;
          cur.context.actionLogs.push('🏃‍♂️ 탈주!');
          cur.logs.push('🏃‍♂️ 탈주!');
          const battleEnd = await checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol);
          if (battleEnd) return;
        }

        // === 인벤토리/스킬(준비중) === (턴 카운트/전환 X)
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
    if (['time', 'idle'].includes(reason) && bd[battleId]) {
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

async function checkAndHandleBattleEnd(cur, userData, interaction, battleId, bd, challenger, opponent, battleMsg, turnCol) {
  const chId = cur.challenger, opId = cur.opponent;
  const chHp = cur.hp[chId], opHp = cur.hp[opId];
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
  const loserId = chHp <= 0 ? chId : opId;
  const winnerId = chHp <= 0 ? opId : chId;
  if (chHp <= 0 || opHp <= 0) {
    if (turnCol && !turnCol.ended) turnCol.stop();
    const records = load(recordPath);
    records[winnerId] = records[winnerId] || { name: userData[winnerId].name, win: 0, draw: 0, lose: 0 };
    records[loserId]  = records[loserId]  || { name: userData[loserId].name,  win: 0, draw: 0, lose: 0 };
    records[winnerId].win = (records[winnerId].win || 0) + 1;
    records[loserId].lose = (records[loserId].lose || 0) + 1;
    save(recordPath, records);
    const winEmbed = await createResultEmbed(winnerId, loserId, userData, records, interaction, false);
    await battleMsg.edit({ content: '🏆 전투 종료!', embeds: [winEmbed], components: [] });
    delete bd[battleId]; save(battlePath, bd);
    return true;
  }
  return false;
}

module.exports = {
  startBattleRequest
};
