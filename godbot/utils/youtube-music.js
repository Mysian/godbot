const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { PermissionsBitField, ChannelType } = require('discord.js');
const play = require('play-dl');

const MUSIC_TEXT_CHANNEL_ID = '1432696771796013097';

if (process.env.YT_COOKIE) { try { play.setToken({ youtube: { cookie: process.env.YT_COOKIE } }); } catch {} }

const queues = new Map();

function getOrInitGuildState(guildId) {
  if (!queues.has(guildId)) {
    queues.set(guildId, {
      connection: null,
      player: createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } }),
      queue: [],
      index: 0,
      playing: false,
      textChannelId: MUSIC_TEXT_CHANNEL_ID,
      voiceChannelId: null
    });
  }
  return queues.get(guildId);
}

function botPermsOk(channel, clientUserId) {
  const perm = channel.permissionsFor(clientUserId);
  if (!perm) return false;
  const need = [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak];
  return need.every(f => perm.has(f));
}

async function connectTo(message) {
  const state = getOrInitGuildState(message.guild.id);
  const channel = message.member?.voice?.channel;
  if (!channel) throw new Error('VOICE_REQUIRED');
  if (channel.type === ChannelType.GuildStageVoice) throw new Error('STAGE_UNSUPPORTED');
  if (!botPermsOk(channel, message.client.user.id)) throw new Error('NO_PERMS');
  state.voiceChannelId = channel.id;
  if (state.connection && state.connection.state.status !== VoiceConnectionStatus.Destroyed) return state.connection;
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: message.guild.id,
    adapterCreator: message.guild.voiceAdapterCreator,
    selfDeaf: true
  });
  state.connection = connection;
  try { await entersState(connection, VoiceConnectionStatus.Ready, 15000); } catch { connection.destroy(); state.connection = null; throw new Error('CONNECT_FAIL'); }
  connection.subscribe(state.player);
  state.player.removeAllListeners('stateChange');
  state.player.on('stateChange', (oldS, newS) => {
    if (oldS.status !== AudioPlayerStatus.Idle && newS.status === AudioPlayerStatus.Idle) next(message.guild.id, message.client).catch(() => {});
  });
  connection.on(VoiceConnectionStatus.Disconnected, () => { setTimeout(() => { if (state.connection) { state.connection.destroy(); state.connection = null; state.playing = false; } }, 800); });
  return connection;
}

async function searchTop(query) {
  const q = String(query || '').trim();
  if (!q) throw new Error('EMPTY_QUERY');
  let results = await play.search(q, { limit: 1, source: { youtube: 'video' } });
  if (!results || !results[0]?.url) {
    results = await play.search(q, { limit: 1, source: { youtube: 'search' } });
  }
  if (!results || !results[0]?.url) throw new Error('NO_RESULT');
  const url = results[0].url;
  let title = results[0].title || url;
  try {
    const info = await play.video_basic_info(url);
    title = info?.video_details?.title || title;
  } catch {}
  return { url, title };
}

async function makeResource(url) {
  let lastErr = null;
  for (let i = 0; i < 2; i++) {
    try {
      const s = await play.stream(url, { discordPlayerCompatibility: true, quality: 2 });
      return createAudioResource(s.stream, { inputType: s.type });
    } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 600)); }
  }
  throw lastErr || new Error('STREAM_FAIL');
}

async function playIndex(guildId, client) {
  const state = getOrInitGuildState(guildId);
  if (!state.queue.length) { state.playing = false; return; }
  if (state.index < 0 || state.index >= state.queue.length) state.index = 0;
  const item = state.queue[state.index];
  try {
    const resource = await makeResource(item.url);
    state.player.play(resource);
    state.playing = true;
    const ch = await client.channels.fetch(state.textChannelId).catch(() => null);
    if (ch && ch.send) ch.send(`▶️ 재생: **${item.title}**`);
  } catch (e) {
    const ch = await client.channels.fetch(state.textChannelId).catch(() => null);
    const reason = (e && (e.shortMessage || e.message || e.name)) ? String(e.shortMessage || e.message || e.name).slice(0, 180) : '알 수 없음';
    if (ch && ch.send) ch.send(`⚠️ 재생 실패: ${item.title}\n사유: ${reason}`);
    console.error('[music] play fail:', reason, '| url:', item.url);
    await next(guildId, client);
  }
}

async function enqueueByTitle(message, titleQuery) {
  let picked;
  try { picked = await searchTop(titleQuery); }
  catch (e) {
    const why = e?.message === 'NO_RESULT' ? '검색 결과가 없어요.' : '검색에 실패했어요.';
    return message.channel.send(why);
  }
  const state = getOrInitGuildState(message.guild.id);
  state.queue.push({ url: picked.url, title: picked.title, requestedBy: message.author.id });
  await message.channel.send(`➕ 큐 추가: **${picked.title}**`);
  if (!state.playing) {
    try { await connectTo(message); }
    catch (e) {
      if (e.message === 'VOICE_REQUIRED') return message.channel.send('먼저 음성 채널에 들어가세요.');
      if (e.message === 'STAGE_UNSUPPORTED') return message.channel.send('스테이지 채널에서는 재생할 수 없어요. 일반 음성 채널을 이용해 주세요.');
      if (e.message === 'NO_PERMS') return message.channel.send('봇에 음성 채널 권한(연결/말하기)이 없어요. 권한을 확인해 주세요.');
      return message.channel.send('음성 채널 연결 실패.');
    }
    state.index = state.queue.length - 1;
    await playIndex(message.guild.id, message.client);
  }
}

async function next(guildId, client) {
  const state = getOrInitGuildState(guildId);
  if (!state.queue.length) { state.playing = false; return; }
  state.index = (state.index + 1) % state.queue.length;
  await playIndex(guildId, client);
}

async function prev(guildId, client) {
  const state = getOrInitGuildState(guildId);
  if (!state.queue.length) { state.playing = false; return; }
  state.index = (state.index - 1 + state.queue.length) % state.queue.length;
  await playIndex(guildId, client);
}

async function stopAll(guildId, client) {
  const state = getOrInitGuildState(guildId);
  state.queue = [];
  state.index = 0;
  state.playing = false;
  try { state.player.stop(true); } catch {}
  if (state.connection) { try { state.connection.destroy(); } catch {} state.connection = null; }
  const ch = await client.channels.fetch(state.textChannelId).catch(() => null);
  if (ch && ch.send) ch.send('⏹️ 중단 및 큐 초기화');
}

function userInAnyVoice(message) { return !!message.member?.voice?.channel; }

function gateByVoiceAndChannel(message) {
  if (message.channel.id !== MUSIC_TEXT_CHANNEL_ID) return 'WRONG_CHANNEL';
  if (!userInAnyVoice(message)) return 'NO_VOICE';
  return 'OK';
}

async function handlePlayCommand(message, argStr) {
  const query = (argStr || '').trim();
  if (!query) {
    const state = getOrInitGuildState(message.guild.id);
    if (!state.queue.length) return message.channel.send('대기열이 비어 있어요. `!재생 노래제목`으로 추가해줘.');
    try { await connectTo(message); }
    catch (e) {
      if (e.message === 'VOICE_REQUIRED') return message.channel.send('먼저 음성 채널에 들어가세요.');
      if (e.message === 'STAGE_UNSUPPORTED') return message.channel.send('스테이지 채널에서는 재생할 수 없어요. 일반 음성 채널을 이용해 주세요.');
      if (e.message === 'NO_PERMS') return message.channel.send('봇에 음성 채널 권한(연결/말하기)이 없어요. 권한을 확인해 주세요.');
      return message.channel.send('음성 채널 연결 실패.');
    }
    return playIndex(message.guild.id, message.client);
  }
  return enqueueByTitle(message, query);
}

function onMessageCreate(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const content = message.content.trim();
    const prefixCmd = content.startsWith('!') ? content.slice(1) : null;
    if (!prefixCmd) return;

    const [cmdRaw, ...rest] = prefixCmd.split(/\s+/);
    const cmd = cmdRaw.toLowerCase();
    const args = rest.join(' ');
    if (!['재생','중단','다음곡','이전곡'].includes(cmd)) return;

    const gate = gateByVoiceAndChannel(message);
    if (gate === 'WRONG_CHANNEL') return;
    if (gate === 'NO_VOICE') return void message.reply('먼저 음성 채널에 들어가세요.');

    try {
      if (cmd === '재생') return void handlePlayCommand(message, args);
      if (cmd === '중단') { await stopAll(message.guild.id, message.client); return; }
      if (cmd === '다음곡') { await next(message.guild.id, message.client); return; }
      if (cmd === '이전곡') { await prev(message.guild.id, message.client); return; }
    } catch (e) {
      console.error('[music] cmd fail:', e?.message || e);
      message.channel.send('요청 처리 중 오류가 발생했어요.');
    }
  });
}

function onVoiceCleanup(client) {
  client.on('voiceStateUpdate', (oldS, newS) => {
    const guildId = (oldS.guild || newS.guild)?.id;
    if (!guildId) return;
    const state = queues.get(guildId);
    if (!state) return;
    const channelId = state.voiceChannelId;
    if (!channelId) return;
    const channel = newS.guild.channels.cache.get(channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) return;
    const humans = channel.members.filter(m => !m.user.bot);
    if (humans.size === 0) stopAll(guildId, client).catch(()=>{});
  });
}

function registerYouTubeMusic(client) {
  onMessageCreate(client);
  onVoiceCleanup(client);
}

module.exports = { registerYouTubeMusic };
