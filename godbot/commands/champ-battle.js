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

function getStatusIcons(effects = {}) {
  let s = '';
  if (effects.stunned) s += '💫';
  if (effects.dot)     s += '☠️';
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

    // 이미 대기 중이거나 진행 중인 배틀 체크
    if (bd[battleId]) {
      return interaction.reply({
        content: '⚔️ 이미 이 상대와 배틀이 대기 중이거나 진행 중입니다.',
        ephemeral: true
      });
    }
    // 자신 또는 상대가 다른 배틀에 참여 중인지 체크
    if (Object.values(bd).some(b =>
      (b.challenger === challenger.id || b.opponent === challenger.id) ||
      (b.challenger === opponent.id    || b.opponent === opponent.id)
    )) {
      return interaction.reply({
        content: '⚔️ 이미 진행 중인 배틀이 있어 새로운 배틀을 신청할 수 없습니다.',
        ephemeral: true
      });
    }

    // 챔피언 보유 체크
    if (!userData[challenger.id] || !userData[opponent.id]) {
      return interaction.reply({ content: '❌ 두 유저 모두 챔피언을 보유해야 합니다.', ephemeral: true });
    }

    // 배틀 요청 임베드 구성
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

    // pending 상태 저장
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

      // 거절 시 pending 삭제
      if (btn.customId === 'decline') {
        delete bd[battleId];
        save(battlePath, bd);
        await btn.editReply({ content: '❌ 배틀 요청이 거절되었습니다.', embeds: [], components: [] });
        return reqCol.stop();
      }

      // 수락 시 실제 배틀 데이터로 초기화
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

      // 전투 시작 임베드
      let embed = await createBattleEmbed(challenger, opponent, bd[battleId], userData, challenger.id);
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('attack').setLabel('🗡️ 평타').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('defend').setLabel('🛡️ 무빙').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('skill').setLabel('✨ 스킬').setStyle(ButtonStyle.Primary)
      );
      await btn.editReply({ content: '⚔️ 전투 시작!', embeds: [embed], components: [buttons] });
      const battleMsg = await btn.fetchReply();

      // 턴 콜렉터
      let turnCol;
      const startTurn = () => {
        if (turnCol) turnCol.stop();
        processTurnStart(userData, bd[battleId]);
        const cur = bd[battleId];
        turnCol = battleMsg.createMessageComponentCollector({ idle: 30000, time: 300000 });

        turnCol.on('collect', async i => {
          const uid = i.user.id;
          if (cur.turn !== uid) {
            return i.reply({ content: '⛔ 당신 턴이 아닙니다.', ephemeral: true });
          }

          let log = '';
          if (i.customId === 'attack') {
            // 평타
            const tgt     = cur.challenger === uid ? cur.opponent : cur.challenger;
            const dmgInfo = calculateDamage(userData[uid], userData[tgt], true, cur.context);
            const damage  = Number(dmgInfo.damage) || 0;
            cur.hp[tgt]   = Math.max(0, cur.hp[tgt] - damage);
            log           = dmgInfo.log;

          } else if (i.customId === 'defend') {
            // 무빙: 다음 턴 flat 방어력 만큼 피해 감소
            const block = userData[uid].stats.defense;
            cur.context.effects[uid].push({
              type: 'damageReductionFlat',
              value: block,
              turns: 1
            });
            log = `🛡️ ${userData[uid].name}이 무빙을 치며 다음 턴 받는 피해 ${block}만큼 감소`;

          } else {
            // 스킬
            const tgt      = cur.challenger === uid ? cur.opponent : cur.challenger;
            const skillObj = skills[userData[uid].name];
            const cd = cur.context.cooldowns[uid][skillObj.name] || 0;
            if (cd > 0) {
              return i.reply({ content: `❗ 쿨다운: ${cd}턴 남음`, ephemeral: true });
            }
            // 기본 데미지 산출
            const raw     = calculateDamage(userData[uid], userData[tgt], true, cur.context);
            const baseDmg = Math.floor(raw.damage * (skillObj.adRatio||0) + (userData[uid].stats.ap||0) * (skillObj.apRatio||0));
            // effect() 호출
            const finalDmg = typeof skillObj.effect === 'function'
              ? (skillObj.effect(userData[uid], userData[tgt], true, baseDmg, cur.context) ?? baseDmg)
              : baseDmg;
            cur.hp[tgt] = Math.max(0, cur.hp[tgt] - finalDmg);
            cur.context.cooldowns[uid][skillObj.name] = skillObj.cooldown;
            log = `✨ ${skillObj.name} 발동! ${finalDmg} 데미지`;
          }

          // 공통: 로그 저장, 턴 전환, 파일 저장
          if (log) cur.logs.push(log);
          cur.turn = cur.turn === cur.challenger ? cur.opponent : cur.challenger;
          save(battlePath, bd);

          // 승리 체크
          const loser = cur.challenger === uid ? cur.opponent : cur.challenger;
          if (cur.hp[loser] <= 0) {
            turnCol.stop();

            // 전적 로드 및 갱신
            const records = load(recordPath);
            // 초기화
            records[uid]   = records[uid]   || { name: userData[uid].name, win: 0, draw: 0, lose: 0 };
            records[loser] = records[loser] || { name: userData[loser].name, win: 0, draw: 0, lose: 0 };
            records[uid].win++;
            records[loser].lose++;
            save(recordPath, records);

            // 승리 임베드
            const winIcon   = await getChampionIcon(userData[uid].name);
            const winSplash = await getChampionIcon(userData[loser].name);
            const winEmbed  = new EmbedBuilder()
              .setTitle('🏆 승리!')
              .setDescription(`${i.user.username}님 승리!`)
              .setThumbnail(winSplash)
              .setColor(0x00ff88)
              .setImage(winIcon);
            return i.update({ content: null, embeds: [winEmbed], components: [] });
          }

          // 다음 턴
          embed = await createBattleEmbed(challenger, opponent, cur, userData, cur.turn, log);
          await i.update({ content: '💥 턴 종료!', embeds: [embed], components: [buttons] });
          startTurn();
        });

        turnCol.on('end', async (_col, reason) => {
          if (['idle', 'time'].includes(reason)) {
            // 배틀 데이터 삭제
            delete bd[battleId];
            save(battlePath, bd);
            // 중단 임베드
            const stopEmbed = new EmbedBuilder()
              .setTitle('🛑 전투 중단')
              .setDescription('전투가 장기화되어 중단됩니다.')
              .setColor(0xff4444)
              .setTimestamp();
            await battleMsg.edit({ content: null, embeds: [stopEmbed], components: [] });
          }
        });
      };

      startTurn();
    });
  }
};
