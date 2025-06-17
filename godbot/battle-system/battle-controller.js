const battleEngine = require('./battle-engine');
const { loadChampionUser, updateRecord } = require('./battle-storage');
const { battleEmbed } = require('../embeds/battle-embed');
const { getChampionIcon } = require('../utils/champion-utils');
const passives = require('../utils/passive-skills');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const updateBattleViewWithLogs = require('./updateBattleViewWithLogs');
const ITEMS = require('../utils/items.js');
const ACTIVE_SKILLS = require('../utils/active-skills.js');
const fs = require('fs');
const path = require('path');

const itemsPath = path.join(__dirname, '../data/items.json');
const skillsPath = path.join(__dirname, '../data/skills.json');

const battles = new Map();
const battleRequests = new Map();
const battleTimers = new Map();
const openBattleTimers = new Map();

const LOG_LIMIT = 10;

function forceDeleteBattle(userId, enemyId) {
  if (userId) battles.delete(userId);
  if (enemyId) battles.delete(enemyId);
}

async function handleBattleCommand(interaction) {
  const userId = interaction.user.id;
  const enemyUser = interaction.options.getUser('상대');
  const isOpenBattle = !enemyUser;

  let userChamp = await loadChampionUser(userId, interaction);
  if (!userChamp)
    return interaction.reply({ content: "보유한 챔피언이 없습니다!", ephemeral: true });

  if (battles.has(userId) || battleRequests.has(userId))
    return interaction.reply({ content: "이미 진행중인 배틀이 있습니다!", ephemeral: true });

  // 오픈배틀
  if (isOpenBattle) {
    if (battleRequests.has('open')) {
      return interaction.reply({ content: "이미 모집 중인 오픈배틀이 있습니다!", ephemeral: true });
    }
    battleRequests.set('open', { user: userChamp, interaction, createdAt: Date.now() });

    const userIcon = await getChampionIcon(userChamp.name);
    const userPassive = passives[userChamp.name]?.description || '정보 없음';
    const embed = new EmbedBuilder()
      .setTitle('오픈 배틀 요청 (아무나 수락 가능)')
      .setDescription(
        `\`${userChamp.nickname}\` 님이 오픈 배틀을 신청했습니다.\n` +
        `수락 시, 아래 챔피언과 대결하게 됩니다.\n\n` +
        `⏰ **120초 이내 수락 없으면 자동 종료됩니다.**`
      )
      .setThumbnail(userIcon)
      .addFields(
        { name: `🧙 챔피언`, value: userChamp.name, inline: true },
        { name: `🕹️ 소환사`, value: userChamp.nickname, inline: true },
        { name: `🔨 강화`, value: String(userChamp.level ?? 0), inline: true },
        { name: `⚔️ 공격력`, value: String(userChamp.stats.attack), inline: true },
        { name: `🔮 주문력`, value: String(userChamp.stats.ap), inline: true },
        { name: `♥️ 체력`, value: String(userChamp.stats.hp), inline: true },
        { name: `🛡️ 방어력`, value: String(userChamp.stats.defense), inline: true },
        { name: `💣 관통력`, value: String(userChamp.stats.penetration), inline: true },
        { name: `🧬 패시브`, value: userPassive, inline: false }
      )
      .setColor('#f6ad55');
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`accept_battle_open_${userId}`)
          .setLabel('수락')
          .setStyle(ButtonStyle.Success)
      );

    await interaction.reply({ embeds: [embed], components: [row] });

    openBattleTimers.set(userId, setTimeout(() => {
      if (battleRequests.has('open')) {
        battleRequests.delete('open');
        interaction.editReply({ content: "⏰ 오픈배틀 모집이 만료되었습니다!", embeds: [], components: [] }).catch(() => {});
      }
      openBattleTimers.delete(userId);
    }, 120000));
    return;
  }

  // 지목배틀
  const enemyId = enemyUser.id;
  if (userId === enemyId)
    return interaction.reply({ content: "자기 자신과는 배틀할 수 없습니다!", ephemeral: true });

  let enemyChamp = await loadChampionUser(enemyId, interaction);
  if (!enemyChamp)
    return interaction.reply({ content: "상대가 챔피언을 소유하고 있지 않습니다!", ephemeral: true });
  if (battles.has(enemyId) || battleRequests.has(enemyId))
    return interaction.reply({ content: "상대가 이미 다른 배틀에 참여 중입니다!", ephemeral: true });

  battleRequests.set(userId, { user: userChamp, enemy: enemyChamp, interaction, createdAt: Date.now() });

  const userIcon = await getChampionIcon(userChamp.name);
  const userPassive = passives[userChamp.name]?.description || '정보 없음';
  const enemyIcon = await getChampionIcon(enemyChamp.name);
  const enemyPassive = passives[enemyChamp.name]?.description || '정보 없음';

  const embed = new EmbedBuilder()
    .setTitle("⚔️ 챔피언 배틀 신청")
    .setDescription(`<@${enemyId}>님, <@${userId}>가 배틀을 신청했습니다!`)
    .addFields(
      { name: "신청자 챔피언", value: `${userChamp.name} (${userChamp.nickname})`, inline: true },
      { name: "상대 챔피언", value: `${enemyChamp.name} (${enemyChamp.nickname})`, inline: true },
      { name: "신청자 패시브", value: userPassive, inline: false },
      { name: "상대 패시브", value: enemyPassive, inline: false }
    )
    .setThumbnail(enemyIcon)
    .setColor('#5e6cff');

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`accept_battle_${userId}`)
        .setLabel('수락')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`decline_battle_${userId}`)
        .setLabel('거절')
        .setStyle(ButtonStyle.Danger)
    );

  await interaction.reply({ embeds: [embed], components: [row] });

  battleTimers.set(`${userId}:${enemyId}`, setTimeout(() => {
    if (battleRequests.has(enemyId)) {
      battleRequests.delete(enemyId);
      interaction.editReply({ content: "⏰ 챔피언 배틀 신청이 만료되었습니다!", embeds: [], components: [] }).catch(() => {});
    }
    battleTimers.delete(`${userId}:${enemyId}`);
  }, 120000));
}

async function handleBattleButton(interaction) {
  try {
    const customId = interaction.customId;
    const userId = interaction.user.id;

    // 오픈배틀 수락
    if (customId.startsWith('accept_battle_open_')) {
      try {
        const challengerId = customId.replace(/^.*_/, '');
        const request = battleRequests.get('open');
        if (!request)
          return await interaction.reply({ content: '오픈배틀이 존재하지 않습니다.', ephemeral: true });
        if (challengerId === userId)
          return await interaction.reply({ content: '자기 자신은 수락할 수 없습니다!', ephemeral: true });
        if (battles.has(userId) || battleRequests.has(userId))
          return await interaction.reply({ content: '이미 배틀 중이거나 대기중입니다.', ephemeral: true });

        let enemyChamp = await loadChampionUser(userId, interaction);
        if (!enemyChamp)
          return await interaction.reply({ content: "챔피언을 소유하고 있지 않습니다!", ephemeral: true });

        const userChamp = request.user;

        battleRequests.delete('open');
        if (openBattleTimers.has(challengerId)) {
          clearTimeout(openBattleTimers.get(challengerId));
          openBattleTimers.delete(challengerId);
        }

        // 오픈배틀 신청 중 기존 배틀 정보 남아있으면 강제 삭제!
        forceDeleteBattle(userChamp.id, enemyChamp.id);

        const battle = {
          user: userChamp,
          enemy: enemyChamp,
          turn: 1,
          isUserTurn: true,
          finished: false,
          logs: [],
          effects: {},
        };
        battles.set(userChamp.id, battle);
        battles.set(enemyChamp.id, battle);

        await updateBattleView(interaction, battle, userChamp.id);
        return;
      } catch (e) {
        try { await interaction.reply({ content: '❌ 오픈배틀 수락 오류!', ephemeral: true }); } catch {}
        return;
      }
    }

    // 기존 배틀 수락/거절
    if (customId.startsWith('accept_battle_') || customId.startsWith('decline_battle_')) {
      try {
        const challengerId = customId.replace(/^.*_/, '');
        const request = battleRequests.get(challengerId);
        if (!request)
          return await interaction.reply({ content: '이미 만료되었거나 존재하지 않는 배틀 요청입니다.', ephemeral: true });

        if (customId.startsWith('decline_battle_')) {
          battleRequests.delete(challengerId);
          if (battleTimers.has(`${challengerId}:${userId}`)) {
            clearTimeout(battleTimers.get(`${challengerId}:${userId}`));
            battleTimers.delete(`${challengerId}:${userId}`);
          }
          // 강제 삭제!
          forceDeleteBattle(request.user.id, userId);
          return await interaction.update({ content: '배틀 요청을 거절했습니다.', embeds: [], components: [] });
        }

        if (battles.has(userId) || battleRequests.has(userId))
          return await interaction.reply({ content: '이미 배틀 중이거나 대기중입니다.', ephemeral: true });

        let enemyChamp = await loadChampionUser(userId, interaction);
        if (!enemyChamp)
          return await interaction.reply({ content: "챔피언을 소유하고 있지 않습니다!", ephemeral: true });

        const userChamp = request.user;

        battleRequests.delete(challengerId);
        if (battleTimers.has(`${challengerId}:${userId}`)) {
          clearTimeout(battleTimers.get(`${challengerId}:${userId}`));
          battleTimers.delete(`${challengerId}:${userId}`);
        }

        // 기존 배틀 정보 남아있으면 강제 삭제!
        forceDeleteBattle(userChamp.id, enemyChamp.id);

        const battle = {
          user: userChamp,
          enemy: enemyChamp,
          turn: 1,
          isUserTurn: true,
          finished: false,
          logs: [],
          effects: {},
        };
        battles.set(userChamp.id, battle);
        battles.set(enemyChamp.id, battle);

        await updateBattleView(interaction, battle, userChamp.id);
        return;
      } catch (e) {
        try { await interaction.reply({ content: '❌ 배틀 수락/거절 오류!', ephemeral: true }); } catch {}
        return;
      }
    }

    // ↓↓↓ 실제 배틀의 모든 버튼(공격/방어/점멸/아이템/스킬/도망 등) 분기 ↓↓↓
    if (!battles.has(userId))
      return await interaction.reply({ content: '진행 중인 배틀이 없습니다.', ephemeral: true });
    const battle = battles.get(userId);
    if (battle.finished)
      return await interaction.reply({ content: '이미 종료된 배틀입니다.', ephemeral: true });

    const isMyTurn = (battle.isUserTurn && battle.user.id === userId) ||
                     (!battle.isUserTurn && battle.enemy.id === userId);
    const currentPlayer = battle.isUserTurn ? battle.user : battle.enemy;
    if (!isMyTurn || currentPlayer.stunned)
      return await interaction.reply({ content: '행동 불가 상태입니다. (기절/비활성/상대턴)', ephemeral: true });

    const user = battle.isUserTurn ? battle.user : battle.enemy;
    const enemy = battle.isUserTurn ? battle.enemy : battle.user;

    const action = interaction.customId;
    let logs = [];
    let context = {
      lastAction: action,
      effects: battle.effects,
      damage: 0,
    };

    // 패시브 onTurnStart
    logs.push(...battleEngine.resolvePassive(user, enemy, context, 'onTurnStart', battle));
    logs.push(...battleEngine.resolvePassive(enemy, user, context, 'onTurnStart', battle));

    // 아이템 버튼 → 소지품 목록 임베드 전환
    if (action === 'item') {
      const items = fs.existsSync(itemsPath) ? JSON.parse(fs.readFileSync(itemsPath, 'utf8')) : {};
      const myItems = items[user.id] || {};
      const itemList = Object.entries(myItems).filter(([name, v]) => v.count > 0);

      if (itemList.length === 0)
        return await interaction.reply({ content: "소지한 아이템이 없습니다!", ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('🎒 내 아이템 목록')
        .setDescription(itemList.map(([name, v], idx) => `${idx + 1}. **${name}** x${v.count}\n${v.desc || ''}`).join('\n'))
        .setFooter({ text: '사용할 아이템을 선택하세요!' });

      const row = new ActionRowBuilder();
      itemList.slice(0, 5).forEach(([name, v], idx) => {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`useitem_${name}`)
            .setLabel(name)
            .setStyle(ButtonStyle.Primary)
        );
      });

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      return;
    }

    // 스킬 버튼 → 소지 스킬 목록 임베드 전환
    if (action === 'skill') {
      const skills = fs.existsSync(skillsPath) ? JSON.parse(fs.readFileSync(skillsPath, 'utf8')) : {};
      const mySkills = skills[user.id] || {};
      const skillList = Object.keys(mySkills);

      if (skillList.length === 0)
        return await interaction.reply({ content: "소지한 스킬이 없습니다!", ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('📚 내 스킬 목록')
        .setDescription(skillList.map((name, idx) => `${idx + 1}. **${name}**\n${mySkills[name].desc || ''}`).join('\n'))
        .setFooter({ text: '사용할 스킬을 선택하세요!' });

      const row = new ActionRowBuilder();
      skillList.slice(0, 5).forEach((name, idx) => {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`useskill_${name}`)
            .setLabel(name)
            .setStyle(ButtonStyle.Primary)
        );
      });

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      return;
    }

    // 실제 아이템 사용
    if (action.startsWith('useitem_')) {
      const itemName = action.replace('useitem_', '');
      if (!ITEMS[itemName]) {
        await interaction.reply({ content: `해당 아이템 효과를 찾을 수 없습니다.`, ephemeral: true });
        return;
      }
      const items = fs.existsSync(itemsPath) ? JSON.parse(fs.readFileSync(itemsPath, 'utf8')) : {};
      items[user.id] = items[user.id] || {};
      if (!items[user.id][itemName] || items[user.id][itemName].count <= 0) {
        await interaction.reply({ content: "해당 아이템이 없습니다!", ephemeral: true });
        return;
      }
      items[user.id][itemName].count -= 1;
      fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2));
      // 아이템 효과 실행
      const log = ITEMS[itemName](user, context);
      battle.logs = (battle.logs || []).concat([log]).slice(-LOG_LIMIT);
      await updateBattleView(interaction, battle, user.id);
      return;
    }

    // 실제 스킬 사용
    if (action.startsWith('useskill_')) {
      const skillName = action.replace('useskill_', '');
      if (!ACTIVE_SKILLS[skillName]) {
        await interaction.reply({ content: `해당 스킬 효과를 찾을 수 없습니다.`, ephemeral: true });
        return;
      }
      // 쿨타임 등은 효과 함수에서 관리
      const log = ACTIVE_SKILLS[skillName](user, enemy, context, battle);
      battle.logs = (battle.logs || []).concat([log]).slice(-LOG_LIMIT);
      await updateBattleView(interaction, battle, user.id);
      return;
    }

    // ★ 공격/방어/점멸/턴 진행/피해 처리 (기존 구조)
    if (action === 'defend' || action === 'dodge' || action === 'attack') {
      const prevLogs = (battle.logs || []).slice(-LOG_LIMIT);
      let newLogs = [];
      if (action === 'defend') {
        newLogs.push(...battleEngine.defend(user, enemy, context, []));
        newLogs.push(...battleEngine.resolvePassive(user, enemy, context, 'onDefend', battle));
        battle.turn += 1;
        battle.isUserTurn = !battle.isUserTurn;
        const nextTurnUser = battle.isUserTurn ? battle.user : battle.enemy;
        newLogs.push(` <@${nextTurnUser.id}> 턴!`);
      } else if (action === 'dodge') {
        newLogs.push(...battleEngine.dodge(user, enemy, context, []));
        newLogs.push(...battleEngine.resolvePassive(user, enemy, context, 'onDodge', battle));
        battle.turn += 1;
        battle.isUserTurn = !battle.isUserTurn;
        const nextTurnUser = battle.isUserTurn ? battle.user : battle.enemy;
        newLogs.push(` <@${nextTurnUser.id}> 턴!`);
      } else if (action === 'attack') {
        newLogs.push(...battleEngine.attack(user, enemy, context, []));
        if (enemy.isDodging) {
          if (Math.random() < 0.2) {
            context.damage = 0;
            newLogs.push(`⚡ ${enemy.nickname} 점멸 성공!`);
          } else {
            newLogs.push(`🌧️ ${enemy.nickname} 점멸 실패!`);
          }
          enemy.isDodging = false;
        }
        if (enemy.isDefending && context.damage > 0) {
          context.damage = Math.floor(context.damage * 0.5);
          newLogs.push(`${enemy.nickname}의 방어! 피해 50% 감소.`);
          enemy.isDefending = false;
        }
        newLogs.push(`⚔️ ${user.nickname}의 평타! (${context.damage} 데미지)`);
        newLogs.push(...battleEngine.resolvePassive(user, enemy, context, 'onAttack', battle));
        newLogs.push(...battleEngine.applyEffects(enemy, user, context));
        enemy.hp = Math.max(0, enemy.hp - context.damage);

        // onDeath 패시브(부활, 언데드 등)
        const deathLog = battleEngine.resolvePassive(enemy, user, context, 'onDeath', battle);
        if (deathLog && deathLog.length) newLogs.push(...deathLog);

        let winner = null;
        if (user.hp <= 0 || enemy.hp <= 0 || battle.turn >= 99) {
          battle.finished = true;
          if (user.hp > 0) winner = user;
          else if (enemy.hp > 0) winner = enemy;
          let resultEmbed;
          if (winner) {
            const loser = winner.id === user.id ? enemy : user;
            const champIcon = await getChampionIcon(winner.name);
            resultEmbed = {
              content: null,
              embeds: [
                {
                  title: '🎉 전투 결과! 승리!',
                  description:
                    `**${winner.nickname}** (${winner.name})\n` +
                    `> <@${winner.id}>\n\n` +
                    `상대: ${loser.nickname} (${loser.name})\n> <@${loser.id}>`,
                  thumbnail: { url: champIcon },
                  color: 0xffe45c
                }
              ],
              components: []
            };
          } else {
            resultEmbed = {
              content: null,
              embeds: [{ title: '⚖️ 무승부', description: '둘 다 쓰러졌습니다!', color: 0xbdbdbd }],
              components: []
            };
          }
          battle.finished = true;
          forceDeleteBattle(battle.user.id, battle.enemy.id);
          if (battleTimers.has(`${battle.user.id}:${battle.enemy.id}`)) {
            clearTimeout(battleTimers.get(`${battle.user.id}:${battle.enemy.id}`));
            battleTimers.delete(`${battle.user.id}:${battle.enemy.id}`);
          }
          await interaction.update(resultEmbed);
          return;
        }

        battle.turn += 1;
        battle.isUserTurn = !battle.isUserTurn;
        const nextTurnUser = battle.isUserTurn ? battle.user : battle.enemy;
        newLogs.push(` <@${nextTurnUser.id}> 턴!`);
      }

      battle.logs = prevLogs.concat(newLogs).slice(-LOG_LIMIT);
      await updateBattleViewWithLogs(interaction, battle, newLogs, battle.isUserTurn ? battle.user.id : battle.enemy.id);
      await updateBattleView(interaction, battle, battle.isUserTurn ? battle.user.id : battle.enemy.id);
      return;
    }

    // 도망
    if (action === 'escape') {
      if (battle.turn >= 10 && battle.turn <= 30) {
        if (Math.random() < 0.5) {
          const champIcon = await getChampionIcon(enemy.name);
          const resultEmbed = {
            content: null,
            embeds: [
              {
                title: '🏃‍♂️ 도망 성공! 전투 종료',
                description:
                  `**${enemy.nickname}** (${enemy.name})\n> <@${enemy.id}>\n\n` +
                  `상대: ${user.nickname} (${user.name})\n> <@${user.id}> (도망)`,
                thumbnail: { url: champIcon },
                color: 0xc4eaa4
              }
            ],
            components: []
          };
          battle.finished = true;
          await updateRecord(user.id, user.name, 'lose');
          await updateRecord(enemy.id, enemy.name, 'win');
          // ★ 꼭 완전 삭제!
          forceDeleteBattle(user.id, enemy.id);
          if (battleTimers.has(`${battle.user.id}:${battle.enemy.id}`)) {
            clearTimeout(battleTimers.get(`${battle.user.id}:${battle.enemy.id}`));
            battleTimers.delete(`${battle.user.id}:${battle.enemy.id}`);
          }
          await interaction.update(resultEmbed);
          return;
        } else {
          logs.push(`${user.nickname} 도망 실패... 턴만 날립니다.`);
          battle.logs = (battle.logs || []).concat(logs).slice(-LOG_LIMIT);
          battle.turn += 1;
          battle.isUserTurn = !battle.isUserTurn;
          const nextTurnUser = battle.isUserTurn ? battle.user : battle.enemy;
          battle.logs.push(` <@${nextTurnUser.id}> 턴!`);
          battle.logs = battle.logs.slice(-LOG_LIMIT);
          await updateBattleView(interaction, battle, nextTurnUser.id);
          return;
        }
      } else {
        logs.push('지금은 도망칠 수 없습니다! (10~30턴만)');
        battle.logs = (battle.logs || []).concat(logs).slice(-LOG_LIMIT);
        await updateBattleView(interaction, battle, user.id);
        return;
      }
    }

    logs.push('지원하지 않는 행동입니다.');
    battle.logs = (battle.logs || []).concat(logs).slice(-LOG_LIMIT);
    await updateBattleView(interaction, battle, user.id);
    return;
  } catch (e) {
    console.error('❌ [디버그] 버튼 클릭시 에러:', e);
    try { await interaction.reply({ content: '❌ 오류 발생! 영갓에게 제보해주세요.', ephemeral: true }); } catch {}
    return;
  }
}

async function updateBattleView(interaction, battle, activeUserId) {
  const key = `${battle.user.id}:${battle.enemy.id}`;
  if (battleTimers.has(key)) clearTimeout(battleTimers.get(key));
  battleTimers.set(key, setTimeout(async () => {
    battle.finished = true;
    forceDeleteBattle(battle.user.id, battle.enemy.id);
    try {
      // ★ 기존 메시지에서 임베드/버튼 싹 제거
      await interaction.editReply({
        content: '⏰ 2분(120초) 동안 행동이 없어 배틀이 자동 종료되었습니다.',
        embeds: [],
        components: []
      });
    } catch (e) {}
  }, 120000));
  try {
    const view = await battleEmbed({
      user: battle.user,
      enemy: battle.enemy,
      turn: battle.turn,
      logs: battle.logs,
      isUserTurn: battle.isUserTurn,
      activeUserId
    });
    await interaction.update(view);
  } catch (e) {
    try { await interaction.reply({ content: '❌ 배틀창 갱신 오류!', ephemeral: true }); } catch {}
  }
}

module.exports = {
  battles,
  battleRequests,
  battleTimers,
  openBattleTimers,
  handleBattleCommand,
  handleBattleButton,
  updateBattleView,
};
