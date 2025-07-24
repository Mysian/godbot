// 📁 commands/cardbattle.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Collection } = require('discord.js');
const { getBE, addBE, transferBE } = require('./be-util.js');

const MAX_BET = 1000000;
const DONOR_ROLE = "1397076919127900171";
const BOOSTER_ROLE = "서버 부스터 역할ID"; // 실제 부스터 역할 ID로 바꿔야 함

const CARD_TYPES = ["공격", "공격", "공격", "방어", "회복"];
const CARD_EMOJI = { 공격: "⚔️", 방어: "🛡️", 회복: "❤️" };

const waitingMatch = new Collection(); // 유저 결투 대기 큐

module.exports = {
  data: new SlashCommandBuilder()
    .setName('카드배틀')
    .setDescription('확률형 턴제 카드 배틀 게임! (AI/유저 대결)')
    .addIntegerOption(opt =>
      opt.setName('배팅금액')
        .setDescription(`배팅 금액 (최대 ${MAX_BET} BE)`)
        .setMinValue(1000)
        .setMaxValue(MAX_BET)
        .setRequired(true)
    ),
  async execute(interaction) {
    const user = interaction.member;
    const hasRole = user.roles.cache.has(DONOR_ROLE) || user.roles.cache.has(BOOSTER_ROLE);
    if (!hasRole) {
      return interaction.reply({ content: "이 명령어는 서버 부스터 또는 𝕯𝖔𝖓𝖔𝖗 역할 유저만 사용할 수 있어!", ephemeral: true });
    }

    const bet = interaction.options.getInteger('배팅금액');
    const be = getBE(user.id);
    if (be < bet) {
      return interaction.reply({ content: "보유 BE가 부족해!", ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle("🎴 카드배틀 (AI/유저 턴제)")
      .setDescription([
        `각자 **공격(⚔️) / 방어(🛡️) / 회복(❤️)** 카드 5장 중 1장씩 선택`,
        `턴마다 효과 적용, 상대 카드 선택은 비밀!`,
        `체력 2칸, 카드 모두 소모시 남은 체력 많은 쪽 승리`,
        "",
        `- **공격(⚔️):** 방어에 막히고, 서로 공격은 아무 일 없음(카드도 소모X)`,
        `- **방어(🛡️):** 공격만 막음, 서로 방어는 아무 일 없음(카드도 소모X)`,
        `- **회복(❤️):** 공격 맞으면 무효, 안 맞으면 체력 1 회복(최대2)`,
        "",
        `**AI결투:** 승리시 +${bet * 1.5} BE, 패배시 -${bet} BE\n**플레이어결투:** 승자 +${bet * 1.9} BE, 패자 -${bet} BE`,
      ].join("\n"))
      .setFooter({ text: "까리한 디스코드 | 카드 소모시 종료, 동작은 턴마다 버튼으로!" })
      .setColor(0x7c51c2);

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('ai_battle')
          .setLabel('🤖 인공지능 결투')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('user_battle')
          .setLabel('🧑‍🤝‍🧑 플레이어 결투')
          .setStyle(ButtonStyle.Secondary),
      );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

    // 버튼 처리
    const btnInt = await interaction.channel.awaitMessageComponent({
      filter: i => i.user.id === interaction.user.id,
      componentType: ComponentType.Button,
      time: 30000
    }).catch(() => null);

    if (!btnInt) {
      return interaction.editReply({ content: "시간초과! 카드배틀이 취소됐어.", components: [], embeds: [] });
    }

    if (btnInt.customId === "ai_battle") {
      return await runAIBattle(btnInt, bet, interaction.user.id);
    } else if (btnInt.customId === "user_battle") {
      return await runUserBattle(btnInt, bet, interaction.user.id, user.displayName);
    }
  },
};

// ----- AI 결투 -----
async function runAIBattle(interaction, bet, userId) {
  await interaction.deferUpdate();
  await addBE(userId, -bet, "[카드배틀] AI결투 배팅");

  let player = { hp: 2, cards: [...CARD_TYPES], used: [] };
  let ai = { hp: 2, cards: [...CARD_TYPES], used: [] };
  let turn = 1, log = [];

  while (player.cards.length > 0 && ai.cards.length > 0 && player.hp > 0 && ai.hp > 0) {
    // 카드 선택 UI (비공개)
    const cardRow = new ActionRowBuilder()
      .addComponents(player.cards.map(type =>
        new ButtonBuilder()
          .setCustomId(type)
          .setLabel(`${CARD_EMOJI[type]} ${type}`)
          .setStyle(ButtonStyle.Primary)
      ));
    const stateEmbed = new EmbedBuilder()
      .setTitle(`턴 ${turn} | 카드배틀 vs AI`)
      .setDescription([
        `**내 체력:** ${"🟩".repeat(player.hp)}${"⬜".repeat(2 - player.hp)}`,
        `**AI 체력:** ${"🟩".repeat(ai.hp)}${"⬜".repeat(2 - ai.hp)}`,
        `**남은 내 카드:** ${player.cards.map(type => `${CARD_EMOJI[type]}`).join(" ")}`,
        `**남은 AI 카드:** ${"❓".repeat(ai.cards.length)}`,
      ].join("\n"))
      .setFooter({ text: "한 장을 선택!" })
      .setColor(0x7c51c2);

    await interaction.editReply({ embeds: [stateEmbed], components: [cardRow] });

    let cardPick;
    try {
      const cardInt = await interaction.channel.awaitMessageComponent({
        filter: i => i.user.id === userId,
        componentType: ComponentType.Button,
        time: 20000,
      });
      await cardInt.deferUpdate();
      cardPick = cardInt.customId;
    } catch (e) {
      return await interaction.editReply({ content: "시간초과로 게임 종료!", components: [], embeds: [] });
    }

    // AI 카드 선택 (확률)
    const aiPick = aiAICardPick(ai.cards, player.hp, ai.hp);

    // 턴 결과 연출
    await interaction.editReply({
      embeds: [
        stateEmbed.setFooter({ text: "카드 선택 완료! 상대 카드 공개 중..." })
      ],
      components: []
    });
    await delay(1200);

    // 룰 적용
    let pUse = false, aUse = false;
    let pDmg = 0, aDmg = 0;

    if (cardPick === aiPick) {
      // 공격-공격, 방어-방어 : 아무 일도 X, 카드 소모 X
      log.push(`턴${turn} | ${CARD_EMOJI[cardPick]} vs ${CARD_EMOJI[aiPick]} : 서로 같은 카드, 변화 없음!`);
    } else {
      // 아래 모든 if는 '둘이 다를 때'만 실행됨!
      // 공격 vs 방어
      if ((cardPick === "공격" && aiPick === "방어") || (cardPick === "방어" && aiPick === "공격")) {
        if (cardPick === "공격") aUse = true;
        if (aiPick === "공격") pUse = true;
        log.push(`턴${turn} | ⚔️ vs 🛡️ : 공격이 방어에 막혔다! (방어 카드만 소모)`);
      }
      // 공격 vs 회복
      else if ((cardPick === "공격" && aiPick === "회복")) {
        aDmg = 1; aUse = true;
        log.push(`턴${turn} | ⚔️ vs ❤️ : 회복이 공격에 끊겼다! (AI 데미지, AI 카드 소모)`);
      } else if ((cardPick === "회복" && aiPick === "공격")) {
        pDmg = 1; pUse = true;
        log.push(`턴${turn} | ❤️ vs ⚔️ : 회복이 공격에 끊겼다! (유저 데미지, 유저 카드 소모)`);
      }
      // 방어 vs 회복
      else if ((cardPick === "방어" && aiPick === "회복")) {
        aUse = true; if (ai.hp < 2) ai.hp++;
        log.push(`턴${turn} | 🛡️ vs ❤️ : AI가 안전하게 체력 1 회복! (AI 카드 소모)`);
      } else if ((cardPick === "회복" && aiPick === "방어")) {
        pUse = true; if (player.hp < 2) player.hp++;
        log.push(`턴${turn} | ❤️ vs 🛡️ : 유저가 안전하게 체력 1 회복! (유저 카드 소모)`);
      }
    }

    // 피해 적용
    if (pDmg) player.hp -= pDmg;
    if (aDmg) ai.hp -= aDmg;

    // 카드 소모
    if (pUse) player.cards.splice(player.cards.indexOf(cardPick), 1);
    if (aUse) ai.cards.splice(ai.cards.indexOf(aiPick), 1);

    turn++;
    if (player.hp <= 0 || ai.hp <= 0) break;
  }

  // 승패 결정
  let result;
  if (player.hp <= 0 && ai.hp <= 0) result = "무승부";
  else if (player.hp > ai.hp) result = "승리";
  else if (player.hp < ai.hp) result = "패배";
  else result = "무승부";

  let earn = 0;
  if (result === "승리") {
    earn = Math.floor(bet * 1.5);
    await addBE(userId, earn, "[카드배틀] AI결투 보상");
  }

  const resultEmbed = new EmbedBuilder()
    .setTitle(`🎴 카드배틀 결과: ${result}`)
    .setDescription([
      ...log,
      "",
      `**최종 내 체력:** ${player.hp <= 0 ? "0" : player.hp}`,
      `**최종 AI 체력:** ${ai.hp <= 0 ? "0" : ai.hp}`,
      earn > 0 ? `\n**💰 보상: +${earn} BE!**` : result === "패배" ? `\n**❌ 배팅금액: -${bet} BE**` : ""
    ].join("\n"))
    .setColor(result === "승리" ? 0x7cf251 : result === "무승부" ? 0xcccccc : 0xff3333);

  await interaction.editReply({ embeds: [resultEmbed], components: [] });
}

function aiAICardPick(cards, pHp, aiHp) {
  // 상황 따라 AI 확률 조정
  let weights = cards.map(type => {
    if (type === "공격") return aiHp === 1 ? 1 : 3;
    if (type === "방어") return pHp === 1 ? 3 : 2;
    if (type === "회복") return aiHp === 1 ? 4 : 1;
    return 1;
  });
  let total = weights.reduce((a, b) => a + b, 0);
  let rnd = Math.random() * total;
  for (let i = 0, s = 0; i < cards.length; i++) {
    s += weights[i];
    if (rnd < s) return cards[i];
  }
  return cards[0];
}

function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

// ----- 플레이어 vs 플레이어 -----
async function runUserBattle(interaction, bet, userId, userDisplayName) {
  await interaction.deferUpdate();

  // BE 차감 (매칭 상대도 나중에 차감)
  await addBE(userId, -bet, "[카드배틀] 유저결투 배팅");

  // 대기 큐 등록
  waitingMatch.set(interaction.channel.id, {
    initiator: { id: userId, name: userDisplayName, bet, interaction },
    joined: null
  });

  // 대기 안내
  const waitEmbed = new EmbedBuilder()
    .setTitle("🧑‍🤝‍🧑 플레이어 결투 대기중")
    .setDescription([
      `**${userDisplayName}**님이 ${bet.toLocaleString()} BE로 결투를 신청했습니다!`,
      "같이 참여할 유저는 아래 버튼을 눌러주세요.",
      "*결투는 누구나 참여 가능! (단, 명령어 시작은 부스터/도너만)*"
    ].join("\n"))
    .setColor(0x2986cc);

  const joinBtn = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('join_battle')
        .setLabel('참가하기')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('cancel_battle')
        .setLabel('취소')
        .setStyle(ButtonStyle.Danger)
    );

  await interaction.editReply({ embeds: [waitEmbed], components: [joinBtn] });

  // 참가/취소 대기
  let joinedUser, joinedMember;
  try {
    const btnInt = await interaction.channel.awaitMessageComponent({
      filter: i => i.customId === "join_battle" || (i.customId === "cancel_battle" && i.user.id === userId),
      time: 60000
    });
    if (btnInt.customId === "cancel_battle") {
      waitingMatch.delete(interaction.channel.id);
      await btnInt.update({ content: "결투가 취소되었습니다.", components: [], embeds: [] });
      await addBE(userId, bet, "[카드배틀] 결투취소 반환");
      return;
    }
    joinedUser = btnInt.user;
    joinedMember = btnInt.member;
  } catch (e) {
    waitingMatch.delete(interaction.channel.id);
    await interaction.editReply({ content: "참가자가 없어 결투가 취소됐어!", components: [], embeds: [] });
    await addBE(userId, bet, "[카드배틀] 결투취소 반환");
    return;
  }

  if (joinedUser.id === userId) {
    await interaction.followUp({ content: "자기 자신과는 결투할 수 없어!", ephemeral: true });
    return;
  }

  // 참가자 BE 확인
  const joinedBE = getBE(joinedUser.id);
  if (joinedBE < bet) {
    await interaction.followUp({ content: "참가 유저의 BE가 부족해!", ephemeral: true });
    await interaction.editReply({ content: "결투가 취소됐어! (상대 BE 부족)", components: [], embeds: [] });
    await addBE(userId, bet, "[카드배틀] 결투취소 반환");
    waitingMatch.delete(interaction.channel.id);
    return;
  }
  await addBE(joinedUser.id, -bet, "[카드배틀] 유저결투 배팅");

  // 결투 시작!
  waitingMatch.delete(interaction.channel.id);
  await playUserVsUser(interaction, bet, userId, userDisplayName, joinedUser.id, joinedUser.displayName || joinedUser.username);
}

async function playUserVsUser(interaction, bet, idA, nameA, idB, nameB) {
  // 기본 세팅
  let A = { id: idA, name: nameA, hp: 2, cards: [...CARD_TYPES] };
  let B = { id: idB, name: nameB, hp: 2, cards: [...CARD_TYPES] };
  let turn = 1, log = [];

  // 카드 동시 선택 → 결과 공개 → 반복
  while (A.cards.length > 0 && B.cards.length > 0 && A.hp > 0 && B.hp > 0) {
    // 두 플레이어에게 각각 카드 고르기 DM 전송
    const pickMsg = (p, opp, channel) => {
      const row = new ActionRowBuilder()
        .addComponents(p.cards.map(type =>
          new ButtonBuilder()
            .setCustomId(type + "_" + turn)
            .setLabel(`${CARD_EMOJI[type]} ${type}`)
            .setStyle(ButtonStyle.Primary)
        ));
      const embed = new EmbedBuilder()
        .setTitle(`턴 ${turn} | ${p.name}의 카드 선택`)
        .setDescription([
          `**내 체력:** ${"🟩".repeat(p.hp)}${"⬜".repeat(2 - p.hp)}`,
          `**상대 체력:** ${"🟩".repeat(opp.hp)}${"⬜".repeat(2 - opp.hp)}`,
          `**내 남은 카드:** ${p.cards.map(type => `${CARD_EMOJI[type]}`).join(" ")}`,
          `**상대 남은 카드:** ${"❓".repeat(opp.cards.length)}`,
        ].join("\n"))
        .setColor(0x3c8ccf)
        .setFooter({ text: "한 장을 고르세요! (상대는 아직 몰라요)" });
      return { embeds: [embed], components: [row] };
    };

    // 각각에게 카드 선택 받기
    let pickA, pickB;
    try {
      // 동시에 선택받기 위해 Promise.race + filter 분리
      const msg = await interaction.editReply({
        content: null,
        embeds: [
          new EmbedBuilder()
            .setTitle(`턴 ${turn} | 카드 선택 대기중...`)
            .setDescription(`양쪽 모두 카드 선택시 결과가 공개됩니다!`)
            .setColor(0xffc801)
        ],
        components: [],
        fetchReply: true
      });

      // 양쪽 모두 버튼 대기
      const filterA = i => i.user.id === idA && i.customId.endsWith("_" + turn);
      const filterB = i => i.user.id === idB && i.customId.endsWith("_" + turn);

      // 둘 다 올때까지 기다리기
      const pickRes = await Promise.all([
        interaction.channel.awaitMessageComponent({ filter: filterA, time: 60000 }),
        interaction.channel.awaitMessageComponent({ filter: filterB, time: 60000 })
      ]);

      pickA = pickRes[0].customId.split("_")[0];
      pickB = pickRes[1].customId.split("_")[0];
      await pickRes[0].deferUpdate();
      await pickRes[1].deferUpdate();
    } catch (e) {
      await interaction.editReply({ content: "시간초과로 결투가 중단됐어!", components: [], embeds: [] });
      await addBE(idA, bet, "[카드배틀] 결투취소 반환");
      await addBE(idB, bet, "[카드배틀] 결투취소 반환");
      return;
    }

    // 결과 연출
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`턴 ${turn} 결과 공개!`)
          .setDescription([
            `${A.name}: ${CARD_EMOJI[pickA]}`,
            `${B.name}: ${CARD_EMOJI[pickB]}`,
            `결과 계산중...`
          ].join("\n"))
          .setColor(0x888888)
      ],
      components: []
    });
    await delay(1200);

    // 룰 적용
    let useA = false, useB = false;
    let dmgA = 0, dmgB = 0;
    if (pickA === pickB) {
      log.push(`턴${turn} | ${CARD_EMOJI[pickA]} vs ${CARD_EMOJI[pickB]} : 서로 같은 카드, 변화 없음!`);
    } else {
      if ((pickA === "공격" && pickB === "방어") || (pickA === "방어" && pickB === "공격")) {
        if (pickA === "공격") useB = true;
        if (pickB === "공격") useA = true;
        log.push(`턴${turn} | ⚔️ vs 🛡️ : 공격이 방어에 막힘! (방어만 소모)`);
      }
      else if (pickA === "공격" && pickB === "회복") {
        dmgB = 1; useB = true;
        log.push(`턴${turn} | ⚔️ vs ❤️ : 회복이 공격에 끊겼다! (B 데미지, B 카드 소모)`);
      }
      else if (pickA === "회복" && pickB === "공격") {
        dmgA = 1; useA = true;
        log.push(`턴${turn} | ❤️ vs ⚔️ : 회복이 공격에 끊겼다! (A 데미지, A 카드 소모)`);
      }
      else if (pickA === "방어" && pickB === "회복") {
        useB = true; if (B.hp < 2) B.hp++;
        log.push(`턴${turn} | 🛡️ vs ❤️ : B가 안전하게 체력 1 회복! (B 카드 소모)`);
      }
      else if (pickA === "회복" && pickB === "방어") {
        useA = true; if (A.hp < 2) A.hp++;
        log.push(`턴${turn} | ❤️ vs 🛡️ : A가 안전하게 체력 1 회복! (A 카드 소모)`);
      }
    }
    if (dmgA) A.hp -= dmgA;
    if (dmgB) B.hp -= dmgB;

    if (useA) A.cards.splice(A.cards.indexOf(pickA), 1);
    if (useB) B.cards.splice(B.cards.indexOf(pickB), 1);

    turn++;
    if (A.hp <= 0 || B.hp <= 0) break;
  }

  // 승패 결정
  let resultA, resultB;
  if (A.hp <= 0 && B.hp <= 0) resultA = resultB = "무승부";
  else if (A.hp > B.hp) { resultA = "승리"; resultB = "패배"; }
  else if (A.hp < B.hp) { resultA = "패배"; resultB = "승리"; }
  else resultA = resultB = "무승부";

  // BE 보상/차감
  if (resultA === "승리") {
    const earn = Math.floor(bet * 1.9);
    await addBE(A.id, earn, "[카드배틀] 플레이어승리 보상");
    await addBE(B.id, 0, "[카드배틀] 플레이어패배");
  } else if (resultB === "승리") {
    const earn = Math.floor(bet * 1.9);
    await addBE(B.id, earn, "[카드배틀] 플레이어승리 보상");
    await addBE(A.id, 0, "[카드배틀] 플레이어패배");
  } // 무승부는 둘 다 추가X

  // 결과 임베드
  const resultEmbed = new EmbedBuilder()
    .setTitle(`🎴 카드배틀 결과`)
    .setDescription([
      ...log,
      "",
      `**${A.name} 체력:** ${A.hp <= 0 ? "0" : A.hp}`,
      `**${B.name} 체력:** ${B.hp <= 0 ? "0" : B.hp}`,
      resultA === "승리" ? `\n**${A.name} 승리! +${Math.floor(bet*1.9)} BE**` : 
      resultB === "승리" ? `\n**${B.name} 승리! +${Math.floor(bet*1.9)} BE**` : 
      "\n**무승부!**"
    ].join("\n"))
    .setColor(resultA === "승리" ? 0x7cf251 : resultB === "승리" ? 0xff3333 : 0xcccccc);

  await interaction.editReply({ embeds: [resultEmbed], components: [] });
}
