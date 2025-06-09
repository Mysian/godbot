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
  return JSON.parse(fs.readFileSync(file));
}

function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// HP바 생성
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

// 전투 진행 중 임베드 생성
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

    // 챔피언 소지 확인
    if (!userData[challenger.id] || !userData[opponent.id]) {
      return interaction.reply({ content: '❌ 두 유저 모두 챔피언을 보유해야 합니다.', ephemeral: true });
    }
    if (Object.values(bd).some(b =>
      [b.challenger, b.opponent].includes(challenger.id) ||
      [b.challenger, b.opponent].includes(opponent.id)
    )) {
      return interaction.reply({ content: '⚔️ 이미 전투 중입니다.', ephemeral: true });
    }

    // --- 예쁜 배틀 요청 임베드 ---
    const chData = userData[challenger.id];
    const opData = userData[opponent.id];
    const chIcon = await getChampionIcon(chData.name);
    const opIcon = await getChampionIcon(opData.name);

    const requestEmbed = new EmbedBuilder()
      .setTitle('🗡️ 챔피언 배틀 요청')
      .setDescription(`<@${opponent.id}>님, ${challenger.username}님이 챔피언 배틀을 신청했어요!`)
      .addFields(
        {
          name: '👑 도전자',
          value: `${challenger.username}\n**${chData.name}** (강화 ${chData.level}단계)`,
          inline: true
        },
        {
          name: '🛡️ 피청자',
          value: `${opponent.username}\n**${opData.name}** (강화 ${opData.level}단계)`,
          inline: true
        }
      )
      .setThumbnail(chIcon)
      .setImage(opIcon)
      .setColor(0xffd700)
      .setFooter({ text: '30초 내에 수락 또는 거절 버튼을 눌러주세요.' })
      .setTimestamp();

    const req = await interaction.reply({
      embeds: [requestEmbed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('accept').setLabel('✅ 수락').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('decline').setLabel('❌ 거절').setStyle(ButtonStyle.Danger)
        )
      ],
      fetchReply: true
    });

    // 버튼 콜렉터
    const reqCol = req.createMessageComponentCollector({ time: 30000 });
    reqCol.on('collect', async btn => {
      if (btn.user.id !== opponent.id) {
        return btn.reply({ content: '⛔ 요청받은 유저만 가능합니다.', ephemeral: true });
      }
      await btn.deferUpdate();

      if (btn.customId === 'decline') {
        await btn.editReply({ content: '❌ 거절했습니다.', components: [] });
        return reqCol.stop();
      }
      reqCol.stop();

      // 전투 세팅
      const battleId = `${challenger.id}_${opponent.id}`;
      bd[battleId] = {
        challenger: challenger.id,
        opponent:   opponent.id,
        hp: {
          [challenger.id]: userData[challenger.id].stats.hp,
          [opponent.id]:    userData[opponent.id].stats.hp
        },
        turn: challenger.id,
        logs: []
      };
      initBattleContext(bd[battleId]);
      save(battlePath, bd);

      // 전투 시작
      let embed = await createBattleEmbed(challenger, opponent, bd[battleId], userData, challenger.id);
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('attack').setLabel('🗡️ 평타').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('defend').setLabel('🛡️ 방어').setStyle(ButtonStyle.Secondary),
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
            const tgt = cur.challenger === uid ? cur.opponent : cur.challenger;
            const dmgInfo = calculateDamage(userData[uid], userData[tgt], true, cur.context);
            const damage = Number(dmgInfo.damage) || 0;
            cur.hp[tgt] = Math.max(0, (cur.hp[tgt] || 0) - damage);
            log = dmgInfo.log;

          } else if (i.customId === 'defend') {
            log = `🛡️ ${userData[uid].name}이 방어 자세를 취했습니다.`;

          } else {  // skill
            const skillObj = skills[userData[uid].name];
            const cd = cur.context.cooldowns[uid][skillObj.name] || 0;
            if (cd > 0) {
              return i.reply({ content: `❗ 쿨다운: ${cd}턴 남음`, ephemeral: true });
            }

            const tgt = cur.challenger === uid ? cur.opponent : cur.challenger;
            const raw = calculateDamage(userData[uid], userData[tgt], true, cur.context);
            const dmg = Math.floor(raw.damage * skillObj.adRatio + userData[uid].stats.ap * skillObj.apRatio);
            const safeDmg = Number(dmg) || 0;
            cur.hp[tgt] = Math.max(0, (cur.hp[tgt] || 0) - safeDmg);
            skillObj.effect(userData[uid], userData[tgt], safeDmg, cur.context);
            cur.context.cooldowns[uid][skillObj.name] = skillObj.cooldown;
            log = `✨ ${skillObj.name} 발동! ${safeDmg} 데미지`;
          }

          if (log) cur.logs.push(log);
          cur.turn = cur.turn === cur.challenger ? cur.opponent : cur.challenger;
          save(battlePath, bd);

          // 승리 체크 & 전적 저장
          const loser = cur.challenger === uid ? cur.opponent : cur.challenger;
          if (cur.hp[loser] <= 0) {
            turnCol.stop();

            // 전적 저장
            const records = load(recordPath);
            records[uid]   = records[uid]   || { name: userData[uid].name, win: 0, draw: 0, lose: 0 };
            records[loser] = records[loser] || { name: userData[loser].name, win: 0, draw: 0, lose: 0 };
            records[uid].win++;
            records[loser].lose++;
            save(recordPath, records);

            // 승리 임베드 (아이콘도 비동기 처리)
            const winIcon = await getChampionIcon(userData[uid].name);
            const winSplash = await getChampionIcon(userData[loser].name);
            const winEmbed = new EmbedBuilder()
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
            delete bd[battleId];
            save(battlePath, bd);
            await battleMsg.edit({ content: '⛔ 전투 시간 종료', components: [] });
          }
        });
      };

      startTurn();
    });
  }
};
