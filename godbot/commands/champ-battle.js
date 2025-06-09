const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { calculateDamage } = require('../utils/battleEngine');
const { getChampionIcon, getChampionSplash } = require('../utils/champion-utils');
const championSkills = require('../utils/skills');

const userDataPath = path.join(__dirname, '../data/champion-users.json');
const recordPath   = path.join(__dirname, '../data/champion-records.json');
const battlePath   = path.join(__dirname, '../data/battle-active.json');

function load(filePath) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '{}');
  return JSON.parse(fs.readFileSync(filePath));
}

function save(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function createHpBar(current, max) {
  const totalBars = 10;
  const filled = Math.max(0, Math.round((current / max) * totalBars));
  return '🟥'.repeat(filled) + '⬜'.repeat(totalBars - filled);
}

const getStatusIcons = (effects) => {
  if (!effects) return '';
  let icons = '';
  if (effects.stunned) icons += '💫';
  if (effects.dot)     icons += '☠️';
  return icons;
};

function createBattleEmbed(challenger, opponent, battle, userData, turnId, logMessage = '') {
  const ch  = userData[challenger.id];
  const op  = userData[opponent.id];
  const chp = battle.hp[challenger.id];
  const ohp = battle.hp[opponent.id];

  return new EmbedBuilder()
    .setTitle('⚔️ 챔피언 배틀')
    .setDescription(`**${challenger.username}** vs **${opponent.username}**`)
    .addFields(
      {
        name: `👑 ${challenger.username}`,
        value: `💬 ${ch.name} ${getStatusIcons(battle.statusEffects?.[challenger.id])} | 💖 ${chp}/${ch.stats.hp}\n${createHpBar(chp, ch.stats.hp)}`,
        inline: true
      },
      {
        name: `🛡️ ${opponent.username}`,
        value: `💬 ${op.name} ${getStatusIcons(battle.statusEffects?.[opponent.id])} | 💖 ${ohp}/${op.stats.hp}\n${createHpBar(ohp, op.stats.hp)}`,
        inline: true
      },
      {
        name: '🎯 현재 턴',
        value: `<@${turnId}>`,
        inline: false
      },
      {
        name: '📢 행동 결과',
        value: logMessage || '없음',
        inline: false
      }
    )
    .setThumbnail(getChampionIcon(ch.name))
    .setColor(0x3498db);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('챔피언배틀')
    .setDescription('지정한 유저와 챔피언 배틀을 요청합니다.')
    .addUserOption(opt =>
      opt.setName('상대').setDescription('대결할 상대를 선택하세요').setRequired(true)
    ),

  async execute(interaction) {
    const challenger = interaction.user;
    const opponent    = interaction.options.getUser('상대');
    if (challenger.id === opponent.id) {
      return interaction.reply({ content: '❌ 자신과는 배틀할 수 없습니다.', ephemeral: true });
    }

    const userData   = load(userDataPath);
    const battleData = load(battlePath);
    if (!userData[challenger.id] || !userData[opponent.id]) {
      return interaction.reply({ content: '❌ 두 유저 모두 챔피언을 보유해야 합니다.', ephemeral: true });
    }
    if (Object.values(battleData).some(b =>
      [b.challenger, b.opponent].includes(challenger.id) ||
      [b.challenger, b.opponent].includes(opponent.id)
    )) {
      return interaction.reply({ content: '⚔️ 둘 중 한 명이 이미 전투 중입니다!', ephemeral: true });
    }

    // 배틀 요청 메시지
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('accept_battle').setLabel('✅ 수락').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('decline_battle').setLabel('❌ 거절').setStyle(ButtonStyle.Danger)
    );
    const requestMsg = await interaction.reply({
      content: `📝 <@${opponent.id}>님, <@${challenger.id}>의 챔피언 배틀 요청이 도착했습니다. 수락하시겠습니까?`,
      components: [confirmRow],
      fetchReply: true
    });

    const reqCollector = requestMsg.createMessageComponentCollector({ time: 30000 });
    reqCollector.on('collect', async btn => {
      if (btn.user.id !== opponent.id)
        return btn.reply({ content: '⛔ 요청받은 유저만 사용할 수 있습니다.', ephemeral: true });

      await btn.deferUpdate();
      if (btn.customId === 'decline_battle') {
        await btn.editReply({ content: `❌ <@${opponent.id}>님이 배틀을 거절했습니다.`, components: [] });
        return reqCollector.stop();
      }

      // 배틀 세팅
      reqCollector.stop();
      const battleId = `${challenger.id}_${opponent.id}`;
      battleData[battleId] = {
        challenger: challenger.id,
        opponent: opponent.id,
        hp: {
          [challenger.id]: userData[challenger.id].stats.hp,
          [opponent.id]:    userData[opponent.id].stats.hp
        },
        turn: challenger.id,
        logs: [],
        statusEffects: { [challenger.id]: {}, [opponent.id]: {} }
      };
      save(battlePath, battleData);

      const embed = createBattleEmbed(challenger, opponent, battleData[battleId], userData, challenger.id);
      const battleButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('attack').setLabel('🗡️ 평타').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('defend').setLabel('🛡️ 무빙').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('skill').setLabel('✨ 스킬').setStyle(ButtonStyle.Primary)
      );

      await btn.editReply({ content: `⚔️ 전투 시작!`, embeds: [embed], components: [battleButtons] });
      await new Promise(r => setTimeout(r, 300));
      const battleMsg = await btn.fetchReply();

      // === 콜렉터 & 토너먼트 로직 ===
      let turnCollector;
      const startTurnCollector = () => {
        if (turnCollector) turnCollector.stop();
        turnCollector = battleMsg.createMessageComponentCollector({
          idle: 30000,    // 유휴 30초 이내 클릭 없으면 종료
          time: 300000    // 전체 최대 5분
        });

        turnCollector.on('collect', async i => {
          try {
            await i.deferUpdate();
            const data = load(battlePath);
            const cur  = data[battleId];
            if (!cur) return i.followUp({ content: '⚠️ 전투 정보가 없습니다.', ephemeral: true });

            const actorId  = i.user.id;
            const targetId = actorId === cur.challenger ? cur.opponent : cur.challenger;
            const atk = userData[actorId];
            const def = userData[targetId];

            // 기절·DOT 처리 생략…

            let logMsg = '';
            if (i.customId === 'skill') {
              const skill = championSkills[atk.name];
              if (skill) {
                const base   = calculateDamage(atk.stats, def.stats, true).damage;
                const dmg    = skill.apply(atk, def, true, base, {});
                cur.hp[targetId] -= dmg;
                logMsg = `✨ ${atk.name}의 스킬 [${skill.name}] 발동! ${dmg} 데미지`;
              } else {
                logMsg = `⚠️ ${atk.name}는 스킬이 없습니다!`;
              }
            } else {
              const isAtk = i.customId === 'attack';
              const res   = calculateDamage(atk.stats, def.stats, isAtk);
              cur.hp[targetId] -= res.damage;
              logMsg = isAtk
                ? `🗡️ ${atk.name} 공격! ${res.log}`
                : `🛡️ ${atk.name} 방어 자세`;
            }

            cur.logs.push(logMsg);
            cur.turn = targetId;
            save(battlePath, data);

            // 승리 체크
            if (cur.hp[targetId] <= 0) {
              turnCollector.stop();
              // ...승리 처리 (레코드 저장/최종 메시지)
              return;
            }

            const updated = createBattleEmbed(challenger, opponent, cur, userData, targetId, logMsg);
            await battleMsg.edit({ content: `💥 턴 종료!`, embeds: [updated], components: [battleButtons] });
            startTurnCollector();
          } catch (e) {
            console.error(e);
            if (!i.deferred && !i.replied) {
              await i.reply({ content: '❌ 처리 중 오류 발생', ephemeral: true });
            }
          }
        });

        turnCollector.on('end', async (_col, reason) => {
          if (reason === 'idle' || reason === 'time') {
            const data = load(battlePath);
            if (data[battleId]) {
              delete data[battleId];
              save(battlePath, data);
              await battleMsg.edit({
                content: '⛔ 전투가 시간 초과로 종료되었습니다.',
                components: []
              });
            }
          }
        });
      };

      // 초기 콜렉터 시작
      startTurnCollector();
    });
  }
};
