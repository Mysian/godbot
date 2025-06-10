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
  calculateDamage,
  canUseSkill
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
      bd[battleId] = {
        challenger: challenger.id,
        opponent:   opponent.id,
        hp: {
          [challenger.id]: startHpCh,
          [opponent.id]:   startHpOp
        },
        turn: challenger.id,
        logs: [],
        usedSkill: {} // 턴 내 스킬 사용 여부
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
        const cur = bd[battleId];
        cur.usedSkill = {}; // 턴 넘길 때 스킬 사용여부 리셋!
        processTurnStart(userData, cur, cur.turn);
        save(battlePath, bd);

        if (!turnCol) {
          turnCol = battleMsg.createMessageComponentCollector({
            filter: i => [cur.challenger, cur.opponent].includes(i.user.id),
            idle: 30000,
            time: 300000
          });

          let actionDone = {}; // uid별 평타/방어/스킬 기록

          turnCol.on('collect', async i => {
            const uid = i.user.id;
            const cur = bd[battleId];
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

              // [핵심] 내 턴이 끝났으니 평타/방어 후에만 스킬 사용 여부 리셋!
              actionDone[uid] = { skill: false, done: false };
              cur.usedSkill[uid] = false;

              cur.turn = cur.turn === cur.challenger ? cur.opponent : cur.challenger;
              save(battlePath, bd);

              // 종료 체크
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

              const nextEmbed = await createBattleEmbed(
                challenger, opponent, cur, userData, cur.turn, log, true
              );
              await i.editReply({ content: '💥 턴 종료!', embeds: [nextEmbed], components: [getActionRow(true)] });

              startTurn();
              return;
            }

            // 스킬(성공시 같은 턴엔 스킬 버튼 disable, 쿨돌면 또 사용 가능)
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
                  cur.usedSkill[uid] = true; // 이 턴엔 disable!
                }
              }
              cur.logs.push(log);

              // 공격/방어를 아직 안 했다면 내 턴 유지(스킬 버튼만 disable)
              const nextEmbed = await createBattleEmbed(
                challenger, opponent, cur, userData, cur.turn, log, false
              );
              await i.editReply({ content: '✨ 스킬 사용!', embeds: [nextEmbed], components: [getActionRow(false)] });
              return;
            }
          });
        }
      };

      turnCol && turnCol.on('end', async (_col, reason) => {
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

      reqCol.on('end', async (_col, reason) => {
        if (['time', 'idle'].includes(reason) && bd[battleId]?.pending) {
          delete bd[battleId];
          save(battlePath, bd);
          try {
            await req.edit({ content: '❌ 배틀 요청 시간 초과로 취소되었습니다.', embeds: [], components: [] });
          } catch {}
        }
      });

      startTurn();
    });
  }
};
