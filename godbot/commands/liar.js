const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const fs = require("fs");
const path = require("path");
const topicsRaw = require("../embeds/liar-topics.js");

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;
const TALK_SECONDS = 60;
const VOTE_SECONDS = 180;

const statsPath = path.join(__dirname, "../data/liar-stats.json");
if (!fs.existsSync(path.dirname(statsPath))) fs.mkdirSync(path.dirname(statsPath), { recursive: true });
if (!fs.existsSync(statsPath)) fs.writeFileSync(statsPath, JSON.stringify({}, null, 2));

const GAMES = new Map();

function readStats() { try { return JSON.parse(fs.readFileSync(statsPath, "utf8")); } catch { return {}; } }
function writeStats(d) { fs.writeFileSync(statsPath, JSON.stringify(d, null, 2)); }

function norm(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.,!?~・·'"`’“”()[\]{}<>:;\/\\|@#$%^&*_+=-]/g, "");
}
function levenshtein(a, b) {
  a = a || ""; b = b || "";
  const m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}
function similar(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const d = levenshtein(a, b);
  const L = Math.max(a.length, b.length);
  if (L <= 4) return d <= 1;
  if (L <= 6) return d <= 2;
  return (1 - d / L) >= 0.75;
}
function parseItemToken(token) {
  token = token.trim();
  const m = token.match(/^(.+?)\((.+)\)$/);
  if (!m) return { main: token, syns: [] };
  const main = m[1].trim();
  const syns = m[2].split(",").map(s => s.trim()).filter(Boolean);
  return { main, syns };
}
function buildPoolFromRaw(rawText) {
  const seen = new Map();
  const tokens = rawText.split(",").map(s => s.trim()).filter(Boolean);
  for (const t of tokens) {
    const { main, syns } = parseItemToken(t);
    const key = norm(main);
    const cur = seen.get(key) || { main, syns: [] };
    for (const s of syns) if (!cur.syns.some(x => norm(x) === norm(s))) cur.syns.push(s);
    seen.set(key, cur);
  }
  return Array.from(seen.values());
}
const TOPICS = {};
for (const [k, v] of Object.entries(topicsRaw)) TOPICS[k] = buildPoolFromRaw(v);

function pickTwoDifferent(pool) {
  if (pool.length < 2) return null;
  const i = Math.floor(Math.random() * pool.length);
  let j = Math.floor(Math.random() * pool.length);
  if (j === i) j = (j + 1) % pool.length;
  return [pool[i], pool[j]];
}
function acceptedForms(item) {
  const set = new Set([item.main, ...item.syns]);
  return Array.from(set);
}
function isGuessCorrect(guess, answerItem) {
  const g = guess.replace(/\s+/g, " ").trim();
  for (const form of acceptedForms(answerItem)) {
    if (similar(g, form)) return true;
  }
  const gNorm = norm(g);
  for (const form of acceptedForms(answerItem)) {
    const fNorm = norm(form);
    if (gNorm.includes(fNorm) || fNorm.includes(gNorm)) return true;
  }
  return false;
}
function makeLobbyRows(chId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`liar:join:${chId}`).setLabel("참여").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`liar:leave:${chId}`).setLabel("참여 취소").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`liar:conf:${chId}`).setLabel("주제 설정/변경").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`liar:start:${chId}`).setLabel("게임 시작").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`liar:cancel:${chId}`).setLabel("모집 취소").setStyle(ButtonStyle.Danger)
    )
  ];
}
function lobbyEmbed(game) {
  const names = game.players.map(p => `<@${p.id}>`).join(" ") || "없음";
  const cat = game.category || "미선택";
  return new EmbedBuilder()
    .setTitle("🕵️ 라이어 게임: 모집 중")
    .setDescription(`채널에서 진행됩니다. 최소 ${MIN_PLAYERS}명, 최대 ${MAX_PLAYERS}명`)
    .addFields(
      { name: "주제", value: `${cat}`, inline: true },
      { name: "인원", value: `${game.players.length}/${MAX_PLAYERS}`, inline: true },
      { name: "참여자", value: names }
    )
    .setColor(0x5865F2);
}
function statusEmbed(game) {
  const order = game.order.map((id, idx) => {
    const p = game.players.find(x => x.id === id);
    const mark = idx < game.turnIndex ? "✅" : (idx === game.turnIndex ? "🗣️" : "⏳");
    return `${mark} ${idx + 1}. <@${id}>`;
  }).join("\n");
  const talks = game.players.map(p => {
    const said = p.speech != null ? (p.speech.length ? "발언 완료" : "발언하지 않았음") : "대기";
    return `• <@${p.id}> : ${said}`;
  }).join("\n");
  return new EmbedBuilder()
    .setTitle("🗒️ 발언 현황")
    .addFields(
      { name: "발언 순서", value: order || "없음" },
      { name: "현황", value: talks || "없음" }
    )
    .setColor(0x2b2d31);
}
function voteEmbed(game, endsAt) {
  const list = game.players.map(p => `• <@${p.id}>`).join("\n");
  const left = Math.max(0, Math.floor((endsAt - Date.now()) / 1000));
  return new EmbedBuilder()
    .setTitle("🗳️ 투표 진행 중")
    .setDescription(`/라이어 투표하기 명령어로 라이어로 의심되는 1명을 선택하세요.`)
    .addFields(
      { name: "대상", value: list || "없음" },
      { name: "남은 시간", value: `${left}초` }
    )
    .setColor(0xfee75c);
}
function resultEmbed(title, desc) {
  return new EmbedBuilder().setTitle(title).setDescription(desc).setColor(0x57F287);
}

async function handleButton(ix) {
  const [prefix, action, chId] = (ix.customId || "").split(":");
  if (prefix !== "liar") return;
  const game = GAMES.get(chId);
  if (!game) return ix.reply({ content: "게임이 없습니다.", ephemeral: true });
  if (ix.channelId !== game.channelId) return ix.reply({ content: "게임 채널이 아닙니다.", ephemeral: true });

  if (action === "join") {
    if (game.phase !== "lobby") return ix.reply({ content: "이미 시작되었습니다.", ephemeral: true });
    if (game.players.some(p => p.id === ix.user.id)) return ix.reply({ content: "이미 참여 중입니다.", ephemeral: true });
    if (game.players.length >= MAX_PLAYERS) return ix.reply({ content: "정원이 가득 찼습니다.", ephemeral: true });
    game.players.push({ id: ix.user.id, speech: null, votedFor: null });
    await ix.update({ embeds: [lobbyEmbed(game)], components: makeLobbyRows(game.channelId) });
  }

  if (action === "leave") {
    if (game.phase !== "lobby") return ix.reply({ content: "이미 시작되었습니다.", ephemeral: true });
    game.players = game.players.filter(p => p.id !== ix.user.id);
    await ix.update({ embeds: [lobbyEmbed(game)], components: makeLobbyRows(game.channelId) });
  }

  if (action === "conf") {
    if (ix.user.id !== game.hostId) return ix.reply({ content: "방장만 설정할 수 있습니다.", ephemeral: true });
    const options = Object.keys(TOPICS).slice(0, 25).map(k => ({ label: k, value: k }));
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`liar:sel:${game.channelId}`).setPlaceholder("주제 선택").addOptions(options)
    );
    return ix.reply({ content: "주제를 선택하세요.", components: [row], ephemeral: true });
  }

  if (action === "start") {
    if (ix.user.id !== game.hostId) return ix.reply({ content: "방장만 시작할 수 있습니다.", ephemeral: true });
    if (game.phase !== "lobby") return ix.reply({ content: "이미 시작되었습니다.", ephemeral: true });
    if (!game.category) return ix.reply({ content: "주제를 먼저 설정하세요.", ephemeral: true });
    if (game.players.length < MIN_PLAYERS) return ix.reply({ content: `최소 ${MIN_PLAYERS}명 필요합니다.`, ephemeral: true });

    game.phase = "talk";
    game.order = shuffle(game.players.map(p => p.id));
    game.turnIndex = 0;
    game.votes = new Map();
    game.noms = new Map();
    const liarIdx = Math.floor(Math.random() * game.players.length);
    game.liarId = game.players[liarIdx].id;

    const pool = TOPICS[game.category] || [];
    const picked = pickTwoDifferent(pool);
    if (!picked) return ix.reply({ content: "해당 주제 단어 풀이 부족합니다.", ephemeral: true });
    const [realItem, liarItem] = picked;
    game.realItem = realItem;
    game.liarItem = liarItem;

    for (const p of game.players) {
      const item = p.id === game.liarId ? liarItem : realItem;
      const forms = acceptedForms(item);
      const payload = `당신의 단어: ${forms[0]}`;
      try { await ix.client.users.send(p.id, payload); } catch {}
    }

    await ix.update({ embeds: [statusEmbed(game)], components: [] });
    scheduleTalkTimer(ix.client, game);
  }

  if (action === "guessbtn") {
    if (ix.user.id !== game.liarId) return ix.reply({ content: "당사자만 입력할 수 있습니다.", ephemeral: true });
    if (game.phase !== "guess") return ix.reply({ content: "정답 입력 단계가 아닙니다.", ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`liar:guess:${game.channelId}`).setTitle("정답 시도");
    const input = new TextInputBuilder().setCustomId("g").setLabel("정답을 입력").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return ix.showModal(modal);
  }

  if (action === "cancel") {
    if (game.phase !== "lobby") {
      return ix.reply({ content: "이미 게임이 시작되어 모집을 취소할 수 없습니다.", ephemeral: true });
    }
    const isHost = ix.user.id === game.hostId;
    const isAdmin = ix.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
    if (!isHost && !isAdmin) {
      return ix.reply({ content: "방장 또는 관리자만 모집을 취소할 수 있어요.", ephemeral: true });
    }
    const msg = await ix.channel.messages.fetch(game.messageId).catch(() => null);
    if (msg) {
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`liar:join:${game.channelId}`).setLabel("참여").setStyle(ButtonStyle.Success).setDisabled(true),
        new ButtonBuilder().setCustomId(`liar:leave:${game.channelId}`).setLabel("참여 취소").setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`liar:conf:${game.channelId}`).setLabel("주제 설정/변경").setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId(`liar:start:${game.channelId}`).setLabel("게임 시작").setStyle(ButtonStyle.Success).setDisabled(true),
        new ButtonBuilder().setCustomId(`liar:cancel:${game.channelId}`).setLabel("모집 취소").setStyle(ButtonStyle.Danger).setDisabled(true)
      );
      const cancelled = EmbedBuilder
        .from(msg.embeds[0] ?? lobbyEmbed(game))
        .setColor(0x808080)
        .setFooter({ text: "📕 모집이 취소되었습니다." });
      await msg.edit({ embeds: [cancelled], components: [disabledRow] }).catch(() => {});
    }
    GAMES.delete(game.channelId);
    return ix.reply({ content: "📕 모집을 취소했어.", ephemeral: true });
  }
}

async function handleSelect(ix) {
  const [prefix, action, chId] = (ix.customId || "").split(":");
  if (prefix !== "liar" || action !== "sel") return;
  const game = GAMES.get(chId);
  if (!game) return ix.reply({ content: "게임이 없습니다.", ephemeral: true });
  if (ix.user.id !== game.hostId) return ix.reply({ content: "방장만 설정할 수 있습니다.", ephemeral: true });
  const val = ix.values?.[0];
  if (!TOPICS[val]) return ix.reply({ content: "잘못된 주제입니다.", ephemeral: true });
  game.category = val;
  await ix.update({ content: `주제 설정: ${val}`, components: [] });
  const msg = await ix.channel.messages.fetch(game.messageId).catch(() => null);
  if (msg) await msg.edit({ embeds: [lobbyEmbed(game)], components: makeLobbyRows(game.channelId) });
}

async function handleModal(ix) {
  const [prefix, action, chId] = (ix.customId || "").split(":");
  if (prefix !== "liar") return;
  const game = GAMES.get(chId);
  if (!game) return ix.reply({ content: "게임이 없습니다.", ephemeral: true });
  if (action === "speech") {
    if (game.phase !== "talk") return ix.reply({ content: "발언 단계가 아닙니다.", ephemeral: true });
    const curId = game.order[game.turnIndex];
    if (ix.user.id !== curId) return ix.reply({ content: "네 차례가 아닙니다.", ephemeral: true });
    const text = ix.fields.getTextInputValue("t") || "";
    const me = game.players.find(p => p.id === ix.user.id);
    me.speech = text.trim();
    clearTimeout(game._talkTimer);
    game.turnIndex++;
    if (game.turnIndex >= game.order.length) {
      startVote(ix.client, game, ix.channel);
      return ix.reply({ content: "발언 완료. 투표가 시작됩니다.", ephemeral: true });
    } else {
      scheduleTalkTimer(ix.client, game);
      const msg = await ix.channel.messages.fetch(game.messageId).catch(() => null);
      if (msg) await msg.edit({ embeds: [statusEmbed(game)], components: [] });
      return ix.reply({ content: "발언 제출 완료.", ephemeral: true });
    }
  }
  if (action === "guess") {
    if (game.phase !== "guess") return ix.reply({ content: "정답 입력 단계가 아닙니다.", ephemeral: true });
    if (ix.user.id !== game.liarId) return ix.reply({ content: "당사자만 입력할 수 있습니다.", ephemeral: true });
    const g = ix.fields.getTextInputValue("g") || "";
    const ok = isGuessCorrect(g, game.realItem);
    finishGameWithGuess(game, ix.channel, ok, g);
    return ix.reply({ content: "정답 시도 완료.", ephemeral: true });
  }
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function scheduleTalkTimer(client, game) {
  clearTimeout(game._talkTimer);
  const curId = game.order[game.turnIndex];
  const chId = game.channelId;
  game._talkTimer = setTimeout(async () => {
    if (game.phase !== "talk") return;
    const me = game.players.find(p => p.id === curId);
    if (me && me.speech == null) me.speech = "";
    game.turnIndex++;
    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(game.messageId).catch(() => null);
    if (game.turnIndex >= game.order.length) {
      startVote(client, game, ch);
    } else {
      if (msg) await msg.edit({ embeds: [statusEmbed(game)], components: [] });
      scheduleTalkTimer(client, game);
    }
  }, TALK_SECONDS * 1000);
}

async function startVote(client, game, channel) {
  game.phase = "vote";
  game.voteEndsAt = Date.now() + VOTE_SECONDS * 1000;
  clearTimeout(game._voteTimer);
  game._voteTimer = setTimeout(() => endVote(game, channel), VOTE_SECONDS * 1000);
  const msg = await channel.messages.fetch(game.messageId).catch(() => null);
  if (msg) await msg.edit({ embeds: [voteEmbed(game, game.voteEndsAt)], components: [] });
}

function endVote(game, channel) {
  if (game.phase !== "vote") return;
  const tally = {};
  for (const p of game.players) {
    if (!p.votedFor) continue;
    tally[p.votedFor] = (tally[p.votedFor] || 0) + 1;
  }
  let max = 0, winners = [];
  for (const [id, cnt] of Object.entries(tally)) {
    if (cnt > max) { max = cnt; winners = [id]; }
    else if (cnt === max) winners.push(id);
  }
  if (winners.length !== 1) {
    settleNonSelection(game, channel, "투표 동률 또는 미선정");
    return;
  }
  const selected = winners[0];
  if (selected === game.liarId) {
    game.phase = "guess";
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`liar:guessbtn:${game.channelId}`).setLabel("정답 시도").setStyle(ButtonStyle.Primary)
    );
    channel.send({ embeds: [resultEmbed("🗳️ 결과", `최다 득표: <@${selected}> (라이어)\n라이어가 정답을 맞히면 무승부, 틀리면 라이어 패배입니다.`)], components: [] });
    channel.send({ content: `<@${game.liarId}> 정답을 시도하세요.`, components: [row] });
  } else {
    settleWhenInnocentSelected(game, channel, selected);
  }
}

function settleWhenInnocentSelected(game, channel, innocentId) {
  const stats = readStats();
  for (const p of game.players) {
    const s = stats[p.id] || { w: 0, d: 0, l: 0 };
    if (p.id === game.liarId) s.w += 1;
    else if (p.id === innocentId) s.d += 1;
    else s.l += 1;
    stats[p.id] = s;
  }
  writeStats(stats);
  const real = acceptedForms(game.realItem)[0];
  const liar = acceptedForms(game.liarItem)[0];
  channel.send({ embeds: [resultEmbed("✅ 최종 결과", `라이어가 아닌 <@${innocentId}>가 지목되었습니다.\n라이어 승리.\n실제 정답: **${real}**\n라이어에게 전달된 단어: **${liar}**`)] });
  cleanup(game);
}

function finishGameWithGuess(game, channel, ok, rawGuess) {
  const stats = readStats();
  if (ok) {
    for (const p of game.players) {
      const s = stats[p.id] || { w: 0, d: 0, l: 0 };
      if (p.id === game.liarId) s.d += 1; else s.w += 1;
      stats[p.id] = s;
    }
    writeStats(stats);
    const real = acceptedForms(game.realItem)[0];
    channel.send({ embeds: [resultEmbed("🤝 최종 결과", `라이어 <@${game.liarId}>의 정답 시도: “${rawGuess}” → 정답 인정\n무승부 처리. 실제 정답: **${real}**`)] });
  } else {
    for (const p of game.players) {
      const s = stats[p.id] || { w: 0, d: 0, l: 0 };
      if (p.id === game.liarId) s.l += 1; else s.w += 1;
      stats[p.id] = s;
    }
    writeStats(stats);
    const real = acceptedForms(game.realItem)[0];
    channel.send({ embeds: [resultEmbed("❌ 최종 결과", `라이어 <@${game.liarId}>의 정답 시도: “${rawGuess}” → 오답\n라이어 패배. 실제 정답: **${real}**`)] });
  }
  cleanup(game);
}

function settleNonSelection(game, channel, reason) {
  const stats = readStats();
  for (const p of game.players) {
    const s = stats[p.id] || { w: 0, d: 0, l: 0 };
    if (p.id === game.liarId) s.w += 1; else s.l += 1;
    stats[p.id] = s;
  }
  writeStats(stats);
  const real = acceptedForms(game.realItem)[0];
  const liar = acceptedForms(game.liarItem)[0];
  channel.send({ embeds: [resultEmbed("⚖️ 최종 결과", `최다 득표자 단일 선정 실패(${reason}).\n라이어 승리.\n실제 정답: **${real}**\n라이어에게 전달된 단어: **${liar}**`)] });
  cleanup(game);
}

function cleanup(game) {
  clearTimeout(game._talkTimer);
  clearTimeout(game._voteTimer);
  GAMES.delete(game.channelId);
}

async function component(ix) {
  if (ix.isButton()) return handleButton(ix);
  if (ix.isStringSelectMenu()) return handleSelect(ix);
}

async function modal(ix) {
  return handleModal(ix);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("라이어")
    .setDescription("미스매치(바보 라이어) 게임")
    .addSubcommand(s => s.setName("게임시작").setDescription("모집 임베드 생성"))
    .addSubcommand(s => s.setName("게임설명").setDescription("게임 규칙 설명"))
    .addSubcommand(s => s.setName("지목하기").setDescription("의심되는 유저를 지목(기록용)")
      .addUserOption(o => o.setName("대상").setDescription("지목 대상").setRequired(true)))
    .addSubcommand(s => s.setName("발언하기").setDescription("네 차례에 발언 제출"))
    .addSubcommand(s => s.setName("발언보기").setDescription("현재 발언 현황 보기"))
    .addSubcommand(s => s.setName("투표하기").setDescription("라이어로 의심되는 유저에게 투표")
      .addUserOption(o => o.setName("대상").setDescription("투표 대상").setRequired(true)))
    .addSubcommand(s => s.setName("전체순위").setDescription("누적 전적 순위")),
  async execute(ix) {
    const sub = ix.options.getSubcommand();
    if (sub === "게임시작") {
      if (!ix.channel || !ix.channel.permissionsFor(ix.client.user)?.has(PermissionFlagsBits.SendMessages))
        return ix.reply({ content: "여기서 메시지를 보낼 권한이 없습니다.", ephemeral: true });
      const chId = ix.channelId;
      if (GAMES.has(chId)) return ix.reply({ content: "이미 이 채널에 진행 중인 게임이 있습니다.", ephemeral: true });
      const game = {
        hostId: ix.user.id,
        channelId: chId,
        messageId: null,
        category: null,
        players: [],
        phase: "lobby",
        order: [],
        turnIndex: 0,
        liarId: null,
        realItem: null,
        liarItem: null,
        votes: new Map(),
        noms: new Map()
      };
      const msg = await ix.channel.send({ embeds: [lobbyEmbed(game)], components: makeLobbyRows(chId) });
      game.messageId = msg.id;
      GAMES.set(chId, game);
      return ix.reply({ content: "모집을 시작했어.", ephemeral: true });
    }
    if (sub === "게임설명") {
      const e = new EmbedBuilder()
        .setTitle("🕵️ 미스매치(바보 라이어) 규칙")
        .setDescription([
          "• 최소 3명, 최대 10명 모집",
          "• 방장이 주제를 선택",
          "• 참가자 전원에게 해당 주제의 ‘단어’가 DM으로 전달됨",
          "• 단 1명(라이어)은 다른 단어를 받음. 본인은 라이어인지 모름",
          `• 발언: 순서대로 1인 ${TALK_SECONDS}초, /라이어 발언하기 로 제출(미제출시 ‘발언하지 않았음’)`,
          `• 전원 발언 후 투표 ${VOTE_SECONDS}초: /라이어 투표하기`,
          "• 라이어가 지목되면 정답 시도(유사어/별칭/오타 허용). 맞추면 무, 틀리면 라이어 패",
          "• 라이어가 아닌 사람이 지목되면: 지목당한 사람 무, 라이어 승, 그 외 패",
          "• 동률/미선정이면 라이어 승",
          "• /라이어 전체순위 로 누적 전적 확인"
        ].join("\n"))
        .setColor(0x5865F2);
      return ix.reply({ embeds: [e], ephemeral: true });
    }
    if (sub === "지목하기") {
      const target = ix.options.getUser("대상");
      const game = GAMES.get(ix.channelId);
      if (!game) return ix.reply({ content: "진행 중인 게임이 없어.", ephemeral: true });
      const c = (game.noms.get(target.id) || 0) + 1;
      game.noms.set(target.id, c);
      return ix.reply({ content: `${ix.user} ➜ ${target} 지목 (누적 ${c})`, allowedMentions: { users: [] } });
    }
    if (sub === "발언하기") {
      const game = GAMES.get(ix.channelId);
      if (!game) return ix.reply({ content: "진행 중인 게임이 없어.", ephemeral: true });
      if (game.phase !== "talk") return ix.reply({ content: "지금은 발언 단계가 아니야.", ephemeral: true });
      const curId = game.order[game.turnIndex];
      if (ix.user.id !== curId) return ix.reply({ content: "네 차례가 아니야.", ephemeral: true });
      const modal = new ModalBuilder().setCustomId(`liar:speech:${game.channelId}`).setTitle("발언 제출");
      const input = new TextInputBuilder().setCustomId("t").setLabel("발언 내용(60초 내)").setStyle(TextInputStyle.Paragraph).setMaxLength(300);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return ix.showModal(modal);
    }
    if (sub === "발언보기") {
      const game = GAMES.get(ix.channelId);
      if (!game) return ix.reply({ content: "진행 중인 게임이 없어.", ephemeral: true });
      return ix.reply({ embeds: [statusEmbed(game)], ephemeral: false });
    }
    if (sub === "투표하기") {
      const target = ix.options.getUser("대상");
      const game = GAMES.get(ix.channelId);
      if (!game) return ix.reply({ content: "진행 중인 게임이 없어.", ephemeral: true });
      if (game.phase !== "vote") return ix.reply({ content: "지금은 투표 단계가 아니야.", ephemeral: true });
      if (!game.players.some(p => p.id === ix.user.id)) return ix.reply({ content: "참가자만 투표 가능.", ephemeral: true });
      if (!game.players.some(p => p.id === target.id)) return ix.reply({ content: "대상은 참가자여야 해.", ephemeral: true });
      const me = game.players.find(p => p.id === ix.user.id);
      me.votedFor = target.id;
      ix.reply({ content: `${ix.user} ➜ ${target} 투표 완료`, ephemeral: true });
      const allVoted = game.players.every(p => p.votedFor);
      if (allVoted) endVote(game, ix.channel);
    }
    if (sub === "전체순위") {
      const stats = readStats();
      const arr = Object.entries(stats).map(([id, s]) => ({ id, ...s, g: (s.w || 0) + (s.d || 0) + (s.l || 0) }));
      arr.sort((a, b) => (b.w - a.w) || ((b.w/(b.g||1)) - (a.w/(a.g||1))) || (b.g - a.g));
      const top = arr.slice(0, 20);
      if (top.length === 0) return ix.reply({ content: "기록 없음.", ephemeral: true });
      const lines = top.map((x, i) => `${i + 1}. <@${x.id}> — ${x.w}승 ${x.d}무 ${x.l}패 (총 ${x.g}판, 승률 ${(x.g? Math.round((x.w/x.g)*100):0)}%)`).join("\n");
      const e = new EmbedBuilder().setTitle("🏆 라이어 전체순위 TOP 20").setDescription(lines).setColor(0x57F287);
      return ix.reply({ embeds: [e] });
    }
  },
  component,
  modal
};
