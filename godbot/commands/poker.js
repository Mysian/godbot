// 📁 commands/poker.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { addBE, getBE } = require("./be-util.js"); // 상대경로 주의!
const CARD_API_URL = "https://deckofcardsapi.com/static/img/";
const SUITS = ['♠', '♥', '♣', '◆'];
const SUIT_ENG = ['S', 'H', 'C', 'D'];
const VALUES = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const HAND_RANK = [
  "하이카드", "원페어", "투페어", "트리플", "스트레이트", "플러시",
  "풀하우스", "포카드", "스트레이트플러시", "로얄플러시"
];
const DEFAULTS = { sb: 10, bb: 20, entry: 100, max: 6 };

// 메모리 기반 다중방
const pokerRooms = new Map();

// 카드 변환
function cardToImg(card) {
  const v = card.value === "10" ? "0" : card.value[0].toUpperCase();
  const s = SUIT_ENG[SUITS.indexOf(card.suit)];
  return `${CARD_API_URL}${v}${s}.png`;
}
function cardToStr(card) {
  return `${card.value}${card.suit}`;
}
function shuffleDeck() {
  let deck = [];
  for (let s=0; s<4; ++s)
    for (let v=0; v<13; ++v)
      deck.push({ suit: SUITS[s], value: VALUES[v] });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function getRoom(channelId) { return pokerRooms.get(channelId); }
function setRoom(channelId, data) { pokerRooms.set(channelId, data); }
function delRoom(channelId) { pokerRooms.delete(channelId); }

// 족보 판정 함수(포커핸드 7장 중 5장 족보 최대값, 순위/핸드 반환)
function evalHand(cards) {
  // 카드 숫자별/무늬별 정리
  let vals = {}, suits = {};
  let valArr = [];
  for (const c of cards) {
    let vi = VALUES.indexOf(c.value);
    vals[vi] = (vals[vi] || 0) + 1;
    suits[c.suit] = (suits[c.suit] || []);
    suits[c.suit].push(vi);
    valArr.push(vi);
  }
  valArr.sort((a,b)=>b-a);

  // 플러시/스트레이트플러시/로얄플러시
  let flush = null, straight = null;
  for (const suit in suits) {
    if (suits[suit].length >= 5) {
      let svals = suits[suit].slice().sort((a,b)=>b-a);
      flush = svals;
      // 스트레이트플러시
      let st = findStraight(svals);
      if (st) {
        if (st[0] === 12 && st[4] === 8) return { rank:9, value:st }; // 로얄플러시
        return { rank:8, value:st };
      }
    }
  }
  // 포카드, 풀하우스, 트리플, 투페어, 원페어
  let vcnt = Object.entries(vals).sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
  if (vcnt[0][1] === 4) return { rank:7, value:[+vcnt[0][0]] }; // 포카드
  if (vcnt[0][1] === 3 && vcnt[1] && vcnt[1][1] >=2) return { rank:6, value:[+vcnt[0][0], +vcnt[1][0]] }; // 풀하우스
  if (flush) return { rank:5, value:flush.slice(0,5) }; // 플러시
  let st = findStraight(valArr);
  if (st) return { rank:4, value:st }; // 스트레이트
  if (vcnt[0][1] === 3) return { rank:3, value:[+vcnt[0][0]] }; // 트리플
  if (vcnt[0][1] === 2 && vcnt[1] && vcnt[1][1] === 2) return { rank:2, value:[+vcnt[0][0], +vcnt[1][0]] }; // 투페어
  if (vcnt[0][1] === 2) return { rank:1, value:[+vcnt[0][0]] }; // 원페어
  return { rank:0, value:valArr.slice(0,5) }; // 하이카드
}
function findStraight(vals) {
  let uniq = [...new Set(vals)].sort((a,b)=>b-a);
  for (let i=0; i<=uniq.length-5; ++i) {
    if (uniq[i]-uniq[i+4]===4) return uniq.slice(i,i+5);
  }
  // A-5-4-3-2
  if (uniq[0]===12 && uniq.includes(3) && uniq.includes(2) && uniq.includes(1) && uniq.includes(0)) return [12,3,2,1,0];
  return null;
}
function handStr(evaled) {
  let rankName = HAND_RANK[evaled.rank];
  let value = (evaled.value||[]).map(v=>VALUES[v]);
  return `**${rankName}** (${value.join(" ")})`;
}

// -----------------------
// Slash 명령어 및 메인 핸들러
// -----------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName("포커")
    .setDescription("텍사스 홀덤 포커방 생성/입장/옵션")
    .addSubcommand(s=>s.setName("개설").setDescription("포커방 개설")
      .addIntegerOption(o=>o.setName("참가비").setDescription("참가비(기본100)"))
      .addIntegerOption(o=>o.setName("최대인원").setDescription("최대인원(2~9)"))
      .addIntegerOption(o=>o.setName("스몰블라인드").setDescription("스몰블라인드(기본10)"))
      .addIntegerOption(o=>o.setName("빅블라인드").setDescription("빅블라인드(기본20)"))
    )
    .addSubcommand(s=>s.setName("입장").setDescription("포커방 참가"))
    .addSubcommand(s=>s.setName("상태").setDescription("방 현황 보기"))
    .addSubcommand(s=>s.setName("퇴장").setDescription("방에서 나가기/게임 포기")),

  async execute(interaction) {
    const channelId = interaction.channel.id;
    const sub = interaction.options.getSubcommand();
    let room = getRoom(channelId);

    // 개설
    if (sub === "개설") {
      if (room) return interaction.reply({ content:"이미 포커방이 개설되어 있습니다.", ephemeral:true });
      // 옵션 커스텀
      let entry = interaction.options.getInteger("참가비") || DEFAULTS.entry;
      let max = Math.max(2, Math.min(9, interaction.options.getInteger("최대인원")||DEFAULTS.max));
      let sb = interaction.options.getInteger("스몰블라인드") || DEFAULTS.sb;
      let bb = interaction.options.getInteger("빅블라인드") || DEFAULTS.bb;
      // 방 생성
      room = {
        state:"WAIT", hostId:interaction.user.id, players:[], joined:new Set(), joinMsgId:null,
        smallBlind:sb, bigBlind:bb, entry, max,
        board:[], deck:[], pot:0, turn:0, dealer:0, currentBet:0, lastAction:Date.now(), acting:null, betOrder:[], raiseCount:0, chips:{}, chipBank:0
      };
      setRoom(channelId, room);
      // 참가 버튼
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("poker_join").setLabel(`참가(${entry} BE)`).setStyle(ButtonStyle.Success)
      );
      const embed = new EmbedBuilder()
        .setTitle("🃏 포커방 모집")
        .setDescription(`텍사스 홀덤 포커를 시작합니다!\n\n- ${max}명까지 참가 가능\n- 참가비: **${entry} BE**\n- 블라인드: SB ${sb} / BB ${bb}\n\n방장이 [모집 종료]시 게임 자동 시작`)
        .setFooter({ text: `방장: ${interaction.user.tag}` });
      const msg = await interaction.reply({ embeds:[embed], components:[row], fetchReply:true });
      room.joinMsgId = msg.id;
      // 버튼 핸들러
      const collector = msg.createMessageComponentCollector({ time:10*60*1000 });
      collector.on('collect', async btnInt => {
        if (btnInt.customId === "poker_join") {
          if (room.state !== "WAIT") return btnInt.reply({ content:"이미 시작된 방입니다.", ephemeral:true });
          if (room.joined.has(btnInt.user.id)) return btnInt.reply({ content:"이미 참가함", ephemeral:true });
          if (room.players.length >= room.max) return btnInt.reply({ content:"방이 꽉 찼습니다.", ephemeral:true });
          let money = getBE(btnInt.user.id);
          if (money < room.entry) return btnInt.reply({ content: `잔액 부족! (보유 BE: ${money})`, ephemeral:true });
          await addBE(btnInt.user.id, -room.entry, "포커 참가비");
          room.players.push({
            id:btnInt.user.id, tag:btnInt.user.tag, bet:0, money:0, fold:false, allin:false, hand:[], inGame:true
          });
          room.joined.add(btnInt.user.id);
          room.chips[btnInt.user.id] = room.entry;
          btnInt.reply({ content:`✅ 참가 완료! (${room.players.length}/${room.max})`, ephemeral:true });
        }
      });
      collector.on('end', () => {
        if (room.state === "WAIT") {
          interaction.followUp("포커방 모집이 만료되어 종료.");
          delRoom(channelId);
        }
      });
      return;
    }

    // 입장
    if (sub === "입장") {
      if (!room || room.state !== "WAIT") return interaction.reply({ content:"모집 중인 포커방이 없습니다.", ephemeral:true });
      if (room.joined.has(interaction.user.id)) return interaction.reply({ content:"이미 참가했습니다.", ephemeral:true });
      if (room.players.length >= room.max) return interaction.reply({ content:"방이 꽉 찼습니다.", ephemeral:true });
      let money = getBE(interaction.user.id);
      if (money < room.entry) return interaction.reply({ content: `잔액 부족! (보유 BE: ${money})`, ephemeral:true });
      await addBE(interaction.user.id, -room.entry, "포커 참가비");
      room.players.push({
        id:interaction.user.id, tag:interaction.user.tag, bet:0, money:0, fold:false, allin:false, hand:[], inGame:true
      });
      room.joined.add(interaction.user.id);
      room.chips[interaction.user.id] = room.entry;
      interaction.reply({ content:`✅ 참가 완료! (${room.players.length}/${room.max})`, ephemeral:true });
      return;
    }

    // 상태
    if (sub === "상태") {
      if (!room) return interaction.reply({ content:"포커방이 없습니다.", ephemeral:true });
      return showAllTable(interaction, room, true);
    }

    // 퇴장
    if (sub === "퇴장") {
      if (!room) return interaction.reply({ content:"포커방이 없습니다.", ephemeral:true });
      let idx = room.players.findIndex(p=>p.id===interaction.user.id);
      if (idx === -1) return interaction.reply({ content:"참가자가 아님", ephemeral:true });
      room.players.splice(idx,1);
      room.joined.delete(interaction.user.id);
      delete room.chips[interaction.user.id];
      interaction.reply({ content:"방에서 나갔습니다.", ephemeral:true });
      if (room.players.length === 0) delRoom(channelId);
      return;
    }

    // 게임 자동시작
    if (room.state === "WAIT" && room.players.length>=2) {
      room.state = "DEAL";
      await startGame(interaction, room);
    } else if (room.state === "DEAL" || room.state === "BET" || room.state === "SHOWDOWN") {
      await interaction.reply({ content:"이미 게임 진행중입니다.", ephemeral:true });
    } else {
      await interaction.reply({ content:"방 상태가 이상함.", ephemeral:true });
    }
  }
};

// 전체 테이블 및 칩 표시(옵션 showStatus=true면 임베드만, false면 메시지 전송)
async function showAllTable(interaction, room, showStatus=false) {
  let embed = new EmbedBuilder()
    .setTitle("🃏 포커 테이블 현황")
    .setDescription(
      `**공용카드:** ${
        room.board.length
          ? room.board.map(cardToStr).join(" ")
          : "없음"
      }\n\n**판돈(Pot):** ${room.pot} 칩\n\n` +
      room.players.map((p, i) =>
        `${i===room.dealer?"👑":""} <@${p.id}> ${p.fold?"(폴드)":""}${p.allin?"(올인)":""}\n  - 베팅: ${p.bet} / 칩: ${room.chips[p.id]??0}`
      ).join("\n")
    )
    .setFooter({ text:`블라인드: SB ${room.smallBlind} / BB ${room.bigBlind} | 참가비 ${room.entry} BE` });
  if (showStatus) await interaction.reply({ embeds:[embed], ephemeral:true });
  else await interaction.channel.send({ embeds:[embed] });
}

// 게임 시작/카드배분
async function startGame(interaction, room) {
  room.deck = shuffleDeck();
  room.board = [];
  room.pot = 0;
  room.turn = 0;
  room.currentBet = room.bigBlind;
  room.dealer = Math.floor(Math.random()*room.players.length);
  room.betOrder = [];
  room.raiseCount = 0;

  // 칩 배분(참가비 전환, 잔액은 칩으로만)
  for (let p of room.players) {
    p.bet = 0; p.fold = false; p.allin = false; p.inGame = true;
    p.money = room.chips[p.id] = room.entry;
    p.hand = [ room.deck.pop(), room.deck.pop() ];
  }
  for (let i=0; i<room.players.length; ++i)
    room.betOrder.push((room.dealer+1+i)%room.players.length);

  await interaction.channel.send(`포커 게임 시작! 참가자: ${room.players.map(p=>`<@${p.id}>`).join(", ")}\n딜러: <@${room.players[room.dealer].id}>`);
  await showAllTable(interaction, room);

  // 베팅 라운드 시작(프리플랍/플랍/턴/리버)
  await bettingRound(interaction, room);
}

// "내 패 보기" 임베드 (DM 또는 ephemeral)
async function showHand(interaction, userId, hand) {
  let embed = new EmbedBuilder()
    .setTitle("내 포커 패")
    .setDescription(hand.map(cardToStr).join("  "))
    .setImage(cardToImg(hand[0]))
    .addFields({ name:"내 패", value: hand.map(c=>`[${cardToStr(c)}](${cardToImg(c)})`).join(" ") });
  await interaction.user.send({ embeds:[embed] }).catch(()=>{});
}

// 베팅 라운드
async function bettingRound(interaction, room) {
  room.state = "BET";
  let active = room.players.filter(p=>!p.fold && p.inGame && room.chips[p.id]>0);
  if (active.length <= 1) return await showdown(interaction, room);

  let currentIdx = 0;
  let betPlayers = 0, bettingDone = false;
  while (!bettingDone) {
    let playerIdx = room.betOrder[currentIdx % room.players.length];
    let player = room.players[playerIdx];

    if (player.fold || !player.inGame || player.allin) { currentIdx++; if (++betPlayers >= active.length) bettingDone=true; continue; }

    // "내 패 보기" 및 베팅 액션 버튼
    let handRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`poker_hand_${player.id}`).setLabel("내 패 보기").setStyle(ButtonStyle.Secondary)
    );
    let betRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`poker_fold_${player.id}`).setLabel("폴드").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`poker_check_${player.id}`).setLabel("체크").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`poker_call_${player.id}`).setLabel("콜").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`poker_raise_${player.id}`).setLabel("레이즈").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`poker_allin_${player.id}`).setLabel("올인").setStyle(ButtonStyle.Success)
    );
    const betMsg = await interaction.channel.send({
      content: `<@${player.id}> 님의 턴!`,
      components: [handRow, betRow]
    });

    // 버튼 콜백
    const filter = i => i.user.id === player.id;
    const collector = betMsg.createMessageComponentCollector({ filter, time:60000 });
    collector.on('collect', async btn => {
      if (btn.customId.startsWith("poker_hand")) {
        await showHand(btn, player.id, player.hand);
        await btn.reply({ content:"내 패를 DM으로 확인하세요!", ephemeral:true }); return;
      }
      if (btn.customId.startsWith("poker_fold")) {
        player.fold = true;
        player.inGame = false;
        await btn.reply({ content:"폴드!", ephemeral:true });
      }
      if (btn.customId.startsWith("poker_check")) {
        await btn.reply({ content:"체크!", ephemeral:true });
      }
      if (btn.customId.startsWith("poker_call")) {
        let callBet = room.currentBet - player.bet;
        if (room.chips[player.id] < callBet) {
          player.allin = true; callBet = room.chips[player.id];
        }
        room.chips[player.id] -= callBet;
        player.bet += callBet;
        room.pot += callBet;
        await btn.reply({ content:`콜 (${callBet} 칩)`, ephemeral:true });
      }
      if (btn.customId.startsWith("poker_raise")) {
        let raiseAmount = 20;
        if (room.chips[player.id] < (room.currentBet-player.bet+raiseAmount)) {
          player.allin = true;
          raiseAmount = room.chips[player.id]-(room.currentBet-player.bet);
        }
        room.chips[player.id] -= (room.currentBet-player.bet+raiseAmount);
        player.bet = room.currentBet + raiseAmount;
        room.currentBet += raiseAmount;
        room.pot += (room.currentBet-player.bet+raiseAmount);
        room.raiseCount++;
        await btn.reply({ content:`레이즈 (${raiseAmount} 칩)`, ephemeral:true });
      }
      if (btn.customId.startsWith("poker_allin")) {
        player.bet += room.chips[player.id];
        room.pot += room.chips[player.id];
        room.chips[player.id] = 0;
        player.allin = true;
        await btn.reply({ content:`올인!`, ephemeral:true });
      }
      collector.stop();
    });
    collector.on('end', async (collected, reason) => {
      await betMsg.delete().catch(()=>{});
      currentIdx++;
      if (++betPlayers >= active.length) bettingDone=true;
    });

    // 타임아웃(자동 폴드)
    await new Promise(res => setTimeout(res, 61000));
  }

  // 다음 라운드(공용카드 추가)
  if (room.board.length < 5) {
    if (room.board.length === 0) room.board.push(room.deck.pop(), room.deck.pop(), room.deck.pop());
    else room.board.push(room.deck.pop());
    await showAllTable(interaction, room);
    await bettingRound(interaction, room);
  } else {
    await showdown(interaction, room);
  }
}

// 승자 판정(족보)
async function showdown(interaction, room) {
  room.state = "SHOWDOWN";
  let alive = room.players.filter(p=>!p.fold && p.inGame);
  let results = alive.map(p => {
    let all = [...p.hand, ...room.board];
    let evaled = evalHand(all);
    return { id:p.id, tag:p.tag, evaled, hand:p.hand };
  });
  // 가장 높은 족보 선정 (동점시 랜덤)
  results.sort((a,b)=>b.evaled.rank-a.evaled.rank);
  let winner = results[0];
  await interaction.channel.send({ content: `🏆 <@${winner.id}> **${handStr(winner.evaled)}** 로 승리! (${room.pot} 칩 획득)` });

  // 칩 → BE 환전 지급
  let winnerUser = room.players.find(p=>p.id===winner.id);
  let payout = room.pot;
  await addBE(winner.id, payout, "포커 승리금");

  // 각 유저 칩 정산/리셋
  for (let p of room.players) p.chips = 0;

  delRoom(interaction.channel.id);
}
