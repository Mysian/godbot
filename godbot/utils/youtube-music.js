const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const play = require('play-dl');

const MUSIC_TEXT_CHANNEL_ID = '1432696771796013097';

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

async function connectTo(message) {
  const state = getOrInitGuildState(message.guild.id);
  const channel = message.member?.voice?.channel;
  if (!channel) throw new Error('VOICE_REQUIRED');
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
  connection.on(VoiceConnectionStatus.Disconnected, () => { setTimeout(() => { if (state.connection) { state.connection.destroy(); state.connection = null; state.playing = false; } }, 1000); });
  return connection;
}

async function makeResource(url) {
  const stream = await play.stream(url, { discordPlayerCompatibility: true, quality: 2 });
  return createAudioResource(stream.stream, { inputType: stream.type });
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
  } catch {
    const ch = await client.channels.fetch(state.textChannelId).catch(() => null);
    if (ch && ch.send) ch.send(`⚠️ 재생 실패: ${item.title}`);
    await next(guildId, client);
  }
}

async function enqueue(message, url) {
  const info = await play.video_basic_info(url);
  const title = info?.video_details?.title || url;
  const state = getOrInitGuildState(message.guild.id);
  state.queue.push({ url, title, requestedBy: message.author.id });
  const ch = message.channel;
  await ch.send(`➕ 큐 추가: **${title}**`);
  if (!state.playing) {
    await connectTo(message);
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

function isYoutubeUrl(s) {
  if (!s) return false;
  return /(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/i.test(s.trim());
}

async function handlePlayCommand(message, argStr) {
  if (argStr && isYoutubeUrl(argStr)) return enqueue(message, argStr);
  const state = getOrInitGuildState(message.guild.id);
  if (!state.queue.length) return message.channel.send('대기열이 비어 있어요. 유튜브 링크를 붙여 넣어 주세요.');
  try { await connectTo(message); } catch (e) { if (e.message === 'VOICE_REQUIRED') return message.channel.send('먼저 음성 채널에 들어가세요.'); return message.channel.send('음성 채널 연결 실패.'); }
  await playIndex(message.guild.id, message.client);
}

function sameTextChannel(message) {
  return message.channel.id === MUSIC_TEXT_CHANNEL_ID;
}

function sameOrEmpty(arg) { return typeof arg === 'string' ? arg.trim() : ''; }

function extractFirstYoutubeUrl(text) {
  const r = /(https?:\/\/(?:www\.)?(?:youtube\.com\/\S+|youtu\.be\/\S+))/i;
  const m = text.match(r);
  return m ? m[1] : null;
}

function userInAnyVoice(message) { return !!message.member?.voice?.channel; }

function gateByVoiceAndChannel(message) { if (!sameTextChannel(message)) return 'WRONG_CHANNEL'; if (!userInAnyVoice(message)) return 'NO_VOICE'; return 'OK'; }

function onMessageCreate(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    if (sameTextChannel(message)) {
      const url = extractFirstYoutubeUrl(message.content);
      if (url) {
        try {
          if (!userInAnyVoice(message)) return message.reply('먼저 음성 채널에 들어가세요.');
          await enqueue(message, url);
        } catch { message.channel.send('큐 추가에 실패했습니다.'); }
        return;
      }
    }

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
      if (cmd === '재생') return void handlePlayCommand(message, sameOrEmpty(args));
      if (cmd === '중단') { await stopAll(message.guild.id, client); return; }
      if (cmd === '다음곡') { await next(message.guild.id, client); return; }
      if (cmd === '이전곡') { await prev(message.guild.id, client); return; }
    } catch { message.channel.send('요청 처리 중 오류가 발생했어요.'); }
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
    if (!channel || channel.type !== 2) return;
    const humans = channel.members.filter(m => !m.user.bot);
    if (humans.size === 0) stopAll(guildId, client).catch(()=>{});
  });
}

function registerYouTubeMusic(client) {
  onMessageCreate(client);
  onVoiceCleanup(client);
}

module.exports = { registerYouTubeMusic };
