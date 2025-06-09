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

function load(p) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, '{}');
  return JSON.parse(fs.readFileSync(p));
}

function save(p, d) {
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
}

// HP바 생성: max가 0이거나 유효하지 않으면 빈 바
function createHpBar(current, max) {
  const total = 10;
  if (typeof current !== 'number' || typeof max !== 'number' || max <= 0) {
    return '⬜'.repeat(total);
  }
  const ratio = current / max;
  const filled = Math.min(total, Math.max(0, Math.round(ratio * total)));
  return '🟥'.repeat(filled) + '⬜'.repeat(total - filled);
}

function getStatusIcons(effects) {
  let s = '';
  if (effects.stunned) s += '💫';
  if (effects.dot)     s += '☠️';
  return s;
}

// 배틀 Embed: 좌측 썸네일에 요청자, 우측 메인이미지에 상대 아이콘
async function createBattleEmbed(challenger, opponent, battle, userData, turnId, log = '') {
  const ch = userData[challenger.id];
  const op = userData[opponent.id];
  const chp = battle.hp[challenger.id];
  const ohp = battle.hp[opponent.id];

  // 비동기 fallback 처리된 아이콘 URL
  const thumbUrl = await getChampionIcon(ch.name);
  const imageUrl = await getChampionIcon(op.name);

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
    .setThumbnail(thumbUrl)
    .setImage(imageUrl)
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
    if (challenger.id === opponent.id)
      return interaction.reply({ content: '❌ 자신과 대전할 수 없습니다.', ephemeral: true });

    const userData = load(userDataPath);
    const bd       = load(battlePath);
    if (!userData[challenger.id] || !userData[opponent.id])
      return interaction.reply({ content: '❌ 챔피언이 없습니다.', ephemeral: true });
    if (Object.values(bd).some(b =>
      [b.challenger, b.opponent].includes(challenger.id) ||
      [b.challenger, b.opponent].includes(opponent.id)
    ))
      return interaction.reply({ content: '⚔️ 이미 전투 중입니다.', ephemeral: true });

    // 배틀 요청
    const req = await interaction.reply({
      content: `📝 <@${opponent.id}>님, ${challenger.username}님이 배틀을 요청합니다.`,
      components: [ new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('accept').setLabel('✅ 수락').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('decline').setLabel('❌ 거절').setStyle(ButtonStyle.Danger)
      ) ],
      fetchReply: true
    });

    const reqCol = req.createMessageComponentCollector({ time: 30000 });
    reqCol.on('collect', async btn => {
      if (btn.user.id !== opponent.id)
        return btn.reply({ content:'⛔ 요청받은 유저만 가능합니다.', ephemeral:true });
      await btn.deferUpdate();

      if (btn.customId === 'decline') {
        await btn.editReply({ content:'❌ 거절했습니다.', components:[] });
        return reqCol.stop();
      }
      reqCol.stop();

      // 전투 셋업
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

      let embed = await createBattleEmbed(challenger, opponent, bd[battleId], userData, challenger.id);
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('attack').setLabel('🗡️ 평타').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('defend').setLabel('🛡️ 방어').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('skill').setLabel('✨ 스킬').setStyle(ButtonStyle.Primary)
      );
      await btn.editReply({ content:'⚔️ 전투 시작!', embeds:[embed], components:[buttons] });
      const battleMsg = await btn.fetchReply();

      // 턴 콜렉터
      let turnCol;
      const startTurn = () => {
        if (turnCol) turnCol.stop();
        processTurnStart(userData, bd[battleId]);
        const cur = bd[battleId];
        turnCol = battleMsg.createMessageComponentCollector({ idle:30000, time:300000 });

        turnCol.on('collect', async i => {
          const uid = i.user.id;
          if (cur.turn !== uid)
            return i.reply({ content:'⛔ 당신 턴이 아닙니다.', ephemeral:true });

          let log = '';
          if (i.customId === 'attack') {
            const tgt = cur.challenger === uid ? cur.opponent : cur.challenger;
            const dmgInfo = calculateDamage(userData[uid], userData[tgt], true, cur.context);
            cur.hp[tgt] -= dmgInfo.damage;
            log = dmgInfo.log;

          } else if (i.customId === 'defend') {
            log = `🛡️ ${userData[uid].name}이 방어 자세를 취했습니다.`;

          } else {  // skill
            const skillObj = skills[userData[uid].name];
            const cd = cur.context.cooldowns[uid][skillObj.name] || 0;
            if (cd > 0)
              return i.reply({ content:`❗ 쿨다운: ${cd}턴 남음`, ephemeral:true });

            const tgt = cur.challenger === uid ? cur.opponent : cur.challenger;
            const raw = calculateDamage(userData[uid], userData[tgt], true, cur.context);
            const dmg = Math.floor(raw.damage * skillObj.adRatio + userData[uid].stats.ap * skillObj.apRatio);
            cur.hp[tgt] -= dmg;
            skillObj.effect(userData[uid], userData[tgt], dmg, cur.context);
            cur.context.cooldowns[uid][skillObj.name] = skillObj.cooldown;
            log = `✨ ${skillObj.name} 발동! ${dmg} 데미지`;
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
            records[uid]   = records[uid]   || { name: userData[uid].name, win:0, draw:0, lose:0 };
            records[loser] = records[loser] || { name: userData[loser].name, win:0, draw:0, lose:0 };
            records[uid].win++;
            records[loser].lose++;
            save(recordPath, records);

            // 승리 임베드 (아이콘도 비동기 처리)
            const winThumb = await getChampionIcon(userData[uid].name);
            const winImage = await getChampionIcon(userData[loser].name);
            const winEmbed = new EmbedBuilder()
              .setTitle('🏆 승리!')
              .setDescription(`${i.user.username}님 승리!`)
              .setThumbnail(winThumb)
              .setColor(0x00ff88)
              .setImage(winImage);
            return i.update({ content:null, embeds:[winEmbed], components:[] });
          }

          // 다음 턴
          embed = await createBattleEmbed(challenger, opponent, cur, userData, cur.turn, log);
          await i.update({ content:'💥 턴 종료!', embeds:[embed], components:[buttons] });
          startTurn();
        });

        turnCol.on('end', async (_col, reason) => {
          if (['idle','time'].includes(reason)) {
            delete bd[battleId];
            save(battlePath, bd);
            await battleMsg.edit({ content:'⛔ 전투 시간 종료', components:[] });
          }
        });
      };

      startTurn();
    });
  }
};
