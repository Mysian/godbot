// commands/champ-battle.js
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
  }
  return s;
}

async function createBattleEmbed(challenger, opponent, battle, userData, turnId, log = '') {
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
${createHpBar(chp, ch.stats.hp)}`,
        inline: true
      },
      {
        name: `🛡️ ${opponent.username}`,
        value: `${op.name} ${getStatusIcons(battle.context.effects[opponent.id])}
💖 ${ohp}/${op.stats.hp}
${createHpBar(ohp, op.stats.hp)}`,
        inline: true
      },
      { name: '🎯 현재 턴', value: `<@${turnId}>`, inline: false },
      { name: '📢 행동 결과', value: log || '없음', inline: false }
    )
    .setThumbnail(iconOp)
    .setImage(iconCh)
    .setColor(0x3498db);
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

    // 동일 페어 pending/active 체크
    if (bd[battleId]) {
      return interaction.reply({ content: '⚔️ 이미 이 상대와 배틀이 대기 중이거나 진행 중입니다.', ephemeral: true });
    }
    // 어느 한쪽이라도 다른 배틀 참여 중이면 차단
    if (Object.values(bd).some(b =>
      b.challenger === challenger.id ||
      b.opponent    === challenger.id ||
      b.challenger === opponent.id    ||
      b.opponent    === opponent.id
    )) {
      return interaction.reply({ content: '⚔️ 이미 진행 중인 배틀이 있어 다른 배틀을 신청할 수 없습니다.', ephemeral: true });
    }

    // 챔피언 소지 확인
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

    // pending 상태 기록
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

    // 수락/거절 콜렉터
    const reqCol = req.createMessageComponentCollector({ time: 30000 });
    reqCol.on('collect', async btn => {
      if (btn.user.id !== opponent.id) {
        return btn.reply({ content: '⛔ 요청받은 유저만 가능합니다.', ephemeral: true });
      }
      await btn.deferUpdate();

      // 거절 처리
      if (btn.customId === 'decline') {
        delete bd[battleId];
        save(battlePath, bd);
        await btn.editReply({ content: '❌ 배틀 요청이 거절되었습니다.', embeds: [], components: [] });
        return reqCol.stop();
      }

      // 수락 처리 → 콜렉터 중지
      reqCol.stop();

      // 전투 데이터로 덮기
      const startHpCh = userData[challenger.id].stats.hp;
      const startHpOp = userData[opponent.id].stats.hp;
      bd[battleId] = {
        challenger: challenger.id,
        opponent:   opponent.id,
        hp: {
          [challenger.id]: startHpCh,
          [opponent.id]:    startHpOp
        },
        turn: challenger.id,
        logs: []
      };
      initBattleContext(bd[battleId]);
      save(battlePath, bd);

      // 전투 시작 임베드 + 버튼
      let embed = await createBattleEmbed(challenger, opponent, bd[battleId], userData, challenger.id);
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('attack').setLabel('🗡️ 평타').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('defend').setLabel('🛡️ 무빙').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('skill').setLabel('✨ 스킬').setStyle(ButtonStyle.Primary)
      );
      await btn.editReply({ content: '⚔️ 전투 시작!', embeds: [embed], components: [buttons] });
      const battleMsg = await btn.fetchReply();

      // 턴 콜렉터 (참가자만)
let turnCol;

const startTurn = () => {
  processTurnStart(userData, bd[battleId]);
  const cur = bd[battleId];

  if (!turnCol) { // 처음에만 collector 생성
    turnCol = battleMsg.createMessageComponentCollector({
      filter: i => [cur.challenger, cur.opponent].includes(i.user.id),
      idle: 30000,
      time: 300000
    });

    turnCol.on('collect', async i => {
  const uid = i.user.id;
  const cur = bd[battleId];

  if (uid !== cur.turn) {
    return i.reply({ content: '⛔ 당신 턴이 아닙니다.', ephemeral: true });
  }

  await i.deferUpdate();

  const tgt = cur.challenger === uid ? cur.opponent : cur.challenger;
  const atkStats = userData[uid].stats;
  let log = '';

  if (i.customId === 'attack') {
    const dmgInfo = calculateDamage(userData[uid], userData[tgt], true, cur.context);
    cur.hp[tgt] = Math.max(0, cur.hp[tgt] - dmgInfo.damage);
    log = dmgInfo.log;

  } else if (i.customId === 'defend') {
    const block = atkStats.defense;
    cur.context.effects[uid].push({ type: 'damageReductionFlat', value: block, turns: 1 });
    log = `🛡️ ${userData[uid].name}이 무빙… 다음 턴 피해 ${block}↓`;

  } else if (i.customId === 'skill') {
    const skillObj = skills[userData[uid].name];

    let skillDamage = Math.floor(
      (atkStats.attack || 0) * (skillObj.adRatio || 1) +
      (atkStats.ap || 0) * (skillObj.apRatio || 0)
    );

    const dmgInfo = calculateDamage(
      { stats: { attack: skillDamage, penetration: atkStats.penetration }, name: userData[uid].name },
      userData[tgt],
      true,
      cur.context
    );

    let finalDmg = dmgInfo.damage;

    if (typeof skillObj.effect === 'function') {
      finalDmg = skillObj.effect(
        { ...userData[uid], id: uid, hp: cur.hp[uid] },
        { ...userData[tgt], id: tgt, hp: cur.hp[tgt] },
        true,
        finalDmg,
        cur.context
      ) ?? finalDmg;

      cur.hp[uid] = Math.min(userData[uid].stats.hp, cur.hp[uid]);
      cur.hp[tgt] = Math.min(userData[tgt].stats.hp, cur.hp[tgt]);

      if (userData[tgt].stunned) {
        cur.context.effects[tgt].push({ type: 'stunned', turns: 1 });
        userData[tgt].stunned = false;
        cur.logs.push(`💫 ${userData[tgt].name}이(가) 기절!`);
      }
    }

    cur.hp[tgt] = Math.max(0, cur.hp[tgt] - finalDmg);
    cur.context.cooldowns[uid][skillObj.name] = skillObj.cooldown;

    log = `✨ ${skillObj.name} 발동! ${finalDmg} 데미지!`;
  }

  cur.logs.push(log);
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

    const winEmbed = new EmbedBuilder()
      .setTitle('🏆 승리!')
      .setDescription(`${userData[winner].name} (${interaction.guild.members.cache.get(winner).user.username}) 승리!`)
      .setThumbnail(await getChampionIcon(userData[loser].name))
      .setColor(0x00ff88)
      .setImage(await getChampionIcon(userData[winner].name));

    return i.editReply({ embeds: [winEmbed], components: [] });
  }

  const nextEmbed = await createBattleEmbed(challenger, opponent, cur, userData, cur.turn, log);
  await i.editReply({ content: '💥 턴 종료!', embeds: [nextEmbed], components: [buttons] });

  startTurn();
 });
}  
};  

    turnCol.on('end', async (_col, reason) => {
      if (['idle', 'time'].includes(reason)) {
        delete bd[battleId];
        save(battlePath, bd);
        const stopEmbed = new EmbedBuilder()
          .setTitle('🛑 전투 중단')
          .setDescription('전투가 장기화되어 중단됩니다.')
          .setColor(0xff4444)
          .setTimestamp();
        await battleMsg.edit({ content: null, embeds: [stopEmbed], components: [] });
      }
    });
    
    // 요청 콜렉터 타임아웃 시 pending 삭제
    reqCol.on('end', async (_col, reason) => {
      if (['time','idle'].includes(reason) && bd[battleId]?.pending) {
        delete bd[battleId];
        save(battlePath, bd);
        try {
          await req.edit({ content: '❌ 배틀 요청 시간 초과로 취소되었습니다.', embeds: [], components: [] });
        } catch {}
      }
    });
  }
};
