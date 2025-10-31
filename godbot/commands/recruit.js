// commands/recruit.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

const 모집채널ID = "1209147973255036959";
const ADMIN_ROLE_IDS = ["786128824365482025", "1201856430580432906"];
const ADMIN_USER_IDS = ["285645561582059520"];

const VOICE_ALIAS = {
  "🎙️ 101호": "1222085152600096778",
  "🎙️ 102호": "1222085194706587730",
  "🎙️ 201호": "1230536383941050368",
  "🎙️ 202호": "1230536435526926356",
  "🎙️ 301호": "1207990601002389564",
  "🎙️ 302호": "1209157046432170015",
  "🎙️ 401호": "1209157237977911336",
  "🎙️ 402호": "1209157289555140658",
  "🎙️ 501호": "1209157326469210172",
  "🎙️ 502호": "1209157352771682304",
  "🎙️ 601호": "1209157451895672883",
  "🎙️ 602호": "1209157492207255572",
  "🎙️ 701호": "1209157524243091466",
  "🎙️ 702호": "1209157622662561813",
  "101호": "1222085152600096778",
  "102호": "1222085194706587730",
  "201호": "1230536383941050368",
  "202호": "1230536435526926356",
  "301호": "1207990601002389564",
  "302호": "1209157046432170015",
  "401호": "1209157237977911336",
  "402호": "1209157289555140658",
  "501호": "1209157326469210172",
  "502호": "1209157352771682304",
  "601호": "1209157451895672883",
  "602호": "1209157492207255572",
  "701호": "1209157524243091466",
  "702호": "1209157622662561813",
};

const GAME_BANNERS = {
  "소환사의 협곡": "https://media.discordapp.net/attachments/1429435030647607397/1429435435628761108/gFMpf7qOe9pdHzFgOtJ7PRywQiY5m7BDfJZoNpD9zP03jg2voZU88ZAY0PkUAebbF79vj7djAJTS-UbpzAt6QQ.png?format=webp&quality=lossless",
  "칼바람 나락": "https://media.discordapp.net/attachments/1429435030647607397/1429435614801035387/20220914064327.png?format=webp&quality=lossless",
  "롤토체스": "https://media.discordapp.net/attachments/1429435030647607397/1429435803532005479/20212F112F032F1635887409095-Key_Art_Banner.png?format=webp&quality=lossless",
  "이벤트 모드[우르프,아레나,돌격전 등]": "https://media.discordapp.net/attachments/1429435030647607397/1429436077151752394/fE0YPfFsKAaTGc-DoT082p_roG434QtUoiyP5FlNfnGwQPHPhnHKPo-_oaAbM8c_MYNAMHFISmA2eLLFeK7Hzg.png?format=webp&quality=lossless",
  "스팀게임": "https://media.discordapp.net/attachments/1429435030647607397/1429436367959756871/steam-software-pc-master-race-wallpaper-preview.png?format=webp&quality=lossless",
  "DJ MAX": "https://media.discordapp.net/attachments/1429435030647607397/1429436647585353778/20170726180931_6645.png?format=webp&quality=lossless&width=1482&height=782",
  "FC": "https://media.discordapp.net/attachments/1429435030647607397/1429436884680970240/desktop-wallpaper-fifa-19.png?format=webp&quality=lossless",
  "GTA": "https://media.discordapp.net/attachments/1429435030647607397/1429437002314682531/Grand_Theft_Auto_V_GTA_5_Game_HD_Wallpaper_medium.png?format=webp&quality=lossless",
  "GTFO": "https://media.discordapp.net/attachments/1429435030647607397/1429437135542292612/capsule_616x353.png?format=webp&quality=lossless",
  "TRPG": "https://media.discordapp.net/attachments/1429435030647607397/1429437318422466691/360_F_615946312_g0bFXcJLEsZEfD6pkxA1aof0fYPTbisA.png?format=webp&quality=lossless",
  "갓필드": "https://media.discordapp.net/attachments/1429435030647607397/1433654281269149802/mu50hats.png?ex=69057a18&is=69042898&hm=bc16bb51905dc5909b533e8a37758872e490b2072746f55e0b2a7a9aeb842347&=&format=webp&quality=lossless&width=550&height=272",
  "건파이어 리본": "https://media.discordapp.net/attachments/1429435030647607397/1429437427101204572/ED8380EC9DB4ED8B80_EAB79CEAB2A9.png?format=webp&quality=lossless",
  "구스구스 덕": "https://media.discordapp.net/attachments/1429435030647607397/1429437526833365042/mbBFUrshAIo_XJnGOoU9POA3aF2r3fwSfV7ljxfY3kqzI4T9CBvHsQwK8jn9_DSCpnnWwAPrzuVJw6PM-6C-dw.png?format=webp&quality=lossless",
  "데드락": "https://media.discordapp.net/attachments/1429435030647607397/1429437684895711362/34206_81714_2451.png?format=webp&quality=lossless",
  "데바데": "https://media.discordapp.net/attachments/1429435030647607397/1429437807088111710/1pj94zx19y901.png?format=webp&quality=lossless",
  "델타포스": "https://media.discordapp.net/attachments/1429435030647607397/1429438004346228799/high-quality-delta-force-wallpapers-v0-gx528mh2z48e1.png?format=webp&quality=lossless&width=1389&height=782",
  "돈스타브": "https://media.discordapp.net/attachments/1429435030647607397/1429438095979446312/KJh5c0MX1H2t-V3T6xmIyarwTXvCd2X1HwPu8Mik9Ps.png?format=webp&quality=lossless&width=1346&height=782",
  "래프트": "https://media.discordapp.net/attachments/1429435030647607397/1429438354545447054/raft-game-poster_bGZubmmUmZqaraWkpJRmbmdlrWZlbWU.png?format=webp&quality=lossless&width=1390&height=782",
  "레인보우식스": "https://media.discordapp.net/attachments/1429435030647607397/1429438479070400613/gnhd9nzetuxy.png?format=webp&quality=lossless&width=1390&height=782",
  "레포 REPO": "https://media.discordapp.net/attachments/1429435030647607397/1429438570476736512/R.png?format=webp&quality=lossless",
  "로스트아크": "https://media.discordapp.net/attachments/1429435030647607397/1429438672532672595/lost-ark-video-game-3840x2160-11989.png?format=webp&quality=lossless&width=1390&height=782",
  "리썰컴퍼니": "https://media.discordapp.net/attachments/1429435030647607397/1429438861628539043/0c40a32d-1aca-4779-978a-4a757023ab44.png?format=webp&quality=lossless",
  "리스크 오브 레인": "https://media.discordapp.net/attachments/1429435030647607397/1429438989701480581/B65EB9E1D4948886C2BC1275C991F0BB610C2E37.png?format=webp&quality=lossless&width=1390&height=782",
  "마블 라이벌즈": "https://media.discordapp.net/attachments/1429435030647607397/1429439172271407154/1_88cf22c2.png?format=webp&quality=lossless",
  "마인크래프트": "https://media.discordapp.net/attachments/1429435030647607397/1429439315129270282/Minecraft-PS4-Wallpapers-16.png?format=webp&quality=lossless&width=1390&height=782",
  "마피아42": "https://media.discordapp.net/attachments/1429435030647607397/1429439463888654396/R33OS_JvLBT6q5Qa5bQIZMF73PgkK4d1qP5pDl4CcW3dPA1JI9Y47_gLCMXM8cL8MMbTfVwFEsLLhg1OrJYy5w.png?format=webp&quality=lossless",
  "메이플스토리": "https://media.discordapp.net/attachments/1429435030647607397/1429439628825596096/0f3550cc1a064ba78e29c5f68d9de007.png?format=webp&quality=lossless",
  "몬스터 헌터": "https://media.discordapp.net/attachments/1429435030647607397/1429440173682331668/thumb-1920-1041713.png?format=webp&quality=lossless&width=1389&height=782",
  "문명": "https://media.discordapp.net/attachments/1429435030647607397/1429440285032841256/35S_3x7NBOHQTO75sWe9tSI-L1Ded2LIIfdUFzi3v5A.png?format=webp&quality=lossless&width=1390&height=782",
  "발로란트": "https://media.discordapp.net/attachments/1429435030647607397/1429440413751840859/Valorant-Wallpaper-Boys-Dark-Display.png?format=webp&quality=lossless",
  "배틀그라운드": "https://media.discordapp.net/attachments/1429435030647607397/1429440548443521044/pubg-4k-m7d01u319yw5wo0m.png?format=webp&quality=lossless&width=1390&height=782",
  "배틀필드": "https://media.discordapp.net/attachments/1429435030647607397/1429440766777753610/dk7o37s-40bc1e09-2fdb-4d31-b2e4-cec3733fd211.png?format=webp&quality=lossless&width=1390&height=782",
  "백룸": "https://media.discordapp.net/attachments/1429435030647607397/1429440960470978570/the-backrooms-8hmdrwfhzhbpebgv.png?format=webp&quality=lossless&width=1390&height=782",
  "백 포 블러드": "https://media.discordapp.net/attachments/1429435030647607397/1429441072047587349/the-battle-against-the-ridden-back-4-blood-gameplay-0ce8dyxkom86p1xt.png?format=webp&quality=lossless&width=1390&height=782",
  "비세라 클린업": "https://media.discordapp.net/attachments/1429435030647607397/1429441222002479134/3bc12a164f98f3ab35b47e92e0abc59852e9aa4c.png?format=webp&quality=lossless&width=1390&height=782",
  "서든어택": "https://media.discordapp.net/attachments/1429435030647607397/1429441424042102794/74926_68157_221.png?format=webp&quality=lossless",
  "선 헤이븐": "https://media.discordapp.net/attachments/1429435030647607397/1429441514257252392/header.png?format=webp&quality=lossless",
  "스컬": "https://media.discordapp.net/attachments/1429435030647607397/1429441677860405379/L0r2jKDBRZCsesjXX8x4GeNqAdm-lq1Dl6WSInbClGvzm2lehhGzXIrGRKcYWxb8C575WbKKxwbH0Mz1I5_vqw.png?format=webp&quality=lossless",
  "스타듀밸리": "https://media.discordapp.net/attachments/1429435030647607397/1429441767530303508/46bf2cd2412c34e4da75cfc398904f7a.png?format=webp&quality=lossless",
  "스타크래프트": "https://media.discordapp.net/attachments/1429435030647607397/1429441906156503161/starcraft-ii-campaign-collection-section1-feature1.png?format=webp&quality=lossless",
  "아크 레이더스": "https://media.discordapp.net/attachments/1429435030647607397/1433385211617345556/nlq0lvxd.png?ex=69047f81&is=69032e01&hm=7ca187ad7aaff498bcb9990a1cc7855867a8326f7750de118496d6415ccfc00e&=&format=webp&quality=lossless&width=1421&height=799",
  "에이펙스": "https://media.discordapp.net/attachments/1429435030647607397/1429442112956534805/17752_37000_596.png?format=webp&quality=lossless",
  "엘소드": "https://media.discordapp.net/attachments/1429435030647607397/1429442222096384150/EC9798EC868CEB939C10.png?format=webp&quality=lossless&width=550&height=309",
  "오버워치": "https://media.discordapp.net/attachments/1429435030647607397/1429442355102089307/6L5ADHXMMTXD1613676344761.png?format=webp&quality=lossless",
  "워프레임": "https://media.discordapp.net/attachments/1429435030647607397/1429442510144671764/every-playable-warframe_myuj.png?format=webp&quality=lossless&width=1390&height=782",
  "원신": "https://media.discordapp.net/attachments/1429435030647607397/1429442806966915082/ecn20240527000049.png?format=webp&quality=lossless",
  "원스 휴먼": "https://media.discordapp.net/attachments/1429435030647607397/1429443046373589063/i1938800944.png?format=webp&quality=lossless",
  "이터널 리턴": "https://media.discordapp.net/attachments/1429435030647607397/1429443232160550984/VpomTjQb9rmxtEn7-T0XFmvuTiGyCj3sKqbwP90omyP4f3Ur3eMNUk1gX90f_OQlL4RZDlOgVjHu2U7NXNWg_w.png?format=webp&quality=lossless",
  "좀보이드": "https://media.discordapp.net/attachments/1429435030647607397/1429443422565040230/capsule_616x353.png?format=webp&quality=lossless",
  "카운터스트라이크": "https://media.discordapp.net/attachments/1429435030647607397/1429443865470963722/ffa51a7d13a76.png?format=webp&quality=lossless",
  "코어 키퍼": "https://media.discordapp.net/attachments/1429435030647607397/1429443947574460579/capsule_616x353.png?format=webp&quality=lossless",
  "콜오브듀티": "https://media.discordapp.net/attachments/1429435030647607397/1429444057414762506/i15146719124.png?format=webp&quality=lossless&width=550&height=310",
  "테라리아": "https://media.discordapp.net/attachments/1429435030647607397/1429444161014202428/action-adventure-exploration-fantasy-wallpaper-preview.png?format=webp&quality=lossless",
  "테이블 탑 시뮬레이터": "https://media.discordapp.net/attachments/1429435030647607397/1429444297924542555/ss_203970c1dd0b8985f9f5c59767517bb7144fb6e9.png?format=webp&quality=lossless&width=1390&height=782",
  "테일즈런너": "https://media.discordapp.net/attachments/1429435030647607397/1429444419945369711/tr_visual.png?format=webp&quality=lossless&width=1653&height=782",
  "파스모포비아": "https://media.discordapp.net/attachments/1429435030647607397/1429444670013964349/wp7775348.png?format=webp&quality=lossless&width=1390&height=782",
  "파워워시 시뮬레이터": "https://media.discordapp.net/attachments/1429435030647607397/1429444759792910499/050db8610fa9593b531cd2b7d563b5115bbe5431ea3db42962da435f70edb39c.png?format=webp&quality=lossless",
  "파티 애니멀즈": "https://media.discordapp.net/attachments/1429435030647607397/1429444924905885816/download.png?format=webp&quality=lossless&width=550&height=309",
  "팰월드": "https://media.discordapp.net/attachments/1429435030647607397/1429444999912755280/UPX5478k5eOc0I22TRgcFWhlu6Sp1Nw-V4SkaIECQoCowybAC9zbTJhb-epG1oP2VL8MutNT14oDXkWyiFA7pA.png?format=webp&quality=lossless",
  "페긴": "https://media.discordapp.net/attachments/1429435030647607397/1429445103335899207/15106a3d-5965-4e97-8abe-21840bfd3797_base_resized.png?format=webp&quality=lossless",
  "포트나이트": "https://media.discordapp.net/attachments/1429435030647607397/1430535886705131521/AKR20251002092100017_01_i_P4.png?ex=68fa21dd&is=68f8d05d&hm=e013f65f2ceddc20ef3ee2345fed11f76b57015347348ace985d97b0cfdd26b0&=&format=webp&quality=lossless",
  "프래그 펑크": "https://media.discordapp.net/attachments/1429435030647607397/1429445181580513420/i1753499517.png?format=webp&quality=lossless",
  "휴먼폴플랫": "https://media.discordapp.net/attachments/1429435030647607397/1429445259267407882/hero_1.png?format=webp&quality=lossless",
  "헬다이버즈": "https://media.discordapp.net/attachments/1429435030647607397/1429445472644239452/b00d1c5f8e72940ef4f23ee0a78ae6da.png?format=webp&quality=lossless",
  "히오스": "https://media.discordapp.net/attachments/1429435030647607397/1429445547521212496/game_features_1.png?format=webp&quality=lossless&width=1390&height=782"
};
const DEFAULT_BANNER = "https://media.discordapp.net/attachments/1388728993787940914/1389192042143551548/image.png?format=webp&quality=lossless";

let ALL_GAMES = [];
try {
  ALL_GAMES = require("./select-game.js").ALL_GAMES || [];
} catch { ALL_GAMES = []; }

const CID_ROOT = "recruit";
const CID_CREATE_OPEN = `${CID_ROOT}:createOpen`;
const CID_EDIT_OPEN = `${CID_ROOT}:editOpen`;
const CID_DELETE_OPEN = `${CID_ROOT}:deleteOpen`;
const CID_CREATE_MODAL = `${CID_ROOT}:createModal`;
const CID_EDIT_MODAL = `${CID_ROOT}:editModal`;
const CID_DELETE_MODAL = `${CID_ROOT}:deleteModal`;
const CID_CREATE_GAME_SELECT = `${CID_ROOT}:createGameSelect`;
const CID_PARTICIPATE = `${CID_ROOT}:participate`;
const CID_JOINVOICE = `${CID_ROOT}:joinvoice`;
const CID_PAGE_PREV = `${CID_ROOT}:page:prev`;
const CID_PAGE_NEXT = `${CID_ROOT}:page:next`;
const CID_SEARCH_OPEN = `${CID_ROOT}:searchOpen`;
const CID_SEARCH_MODAL = `${CID_ROOT}:search`;
const CID_CLEAR = `${CID_ROOT}:clear`;
const CID_OPEN_MODAL_NOW = `${CID_ROOT}:openModalNow`;
const CID_IMG_MENU_URL = `${CID_ROOT}:img:url`;
const CID_IMG_MENU_UPLOAD = `${CID_ROOT}:img:upload`;
const CID_IMG_MENU_SKIP = `${CID_ROOT}:img:skip`;
const CID_IMG_URL_SUBMIT = `${CID_ROOT}:img:url:submit`;

const session = new Map();
const imageSessions = new Map();

function getField(embed, name) {
  const fields = embed.data?.fields || [];
  return fields.find(f => f.name === name) || null;
}
function setField(embed, name, value, inline = false) {
  const fields = embed.data?.fields ? [...embed.data.fields] : [];
  const idx = fields.findIndex(f => f.name === name);
  if (idx >= 0) fields[idx] = { name, value, inline };
  else fields.push({ name, value, inline });
  embed.setFields(fields);
}
function parseCount(text) {
  const m = String(text || "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
function parseMembersFromParticipants(value) {
  const ids = [];
  const re = /<@(\d+)>/g;
  let m;
  const s = String(value || "");
  while ((m = re.exec(s))) ids.push(m[1]);
  return ids;
}
function listMentions(ids) {
  if (!ids || ids.length === 0) return "없음";
  return ids.map(id => `<@${id}>`).join("\n");
}
function isAdminOrOwner(interaction) {
  if (ADMIN_USER_IDS.includes(interaction.user.id)) return true;
  const roles = interaction.member?.roles?.cache;
  if (!roles) return false;
  return ADMIN_ROLE_IDS.some(id => roles.has(id));
}
function closeEmbed(embed) {
  const prev = embed.data?.description || "";
  embed.setDescription(`[모집 종료]\n~~${prev}~~`);
  const fields = (embed.data?.fields || []).map(f => f.name === "마감까지" ? { name: "마감까지", value: "마감 종료", inline: true } : f);
  embed.setFields(fields);
  embed.setColor(0x8a8a8a);
  return embed;
}
function buildRecruitComponents(messageId, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${CID_PARTICIPATE}:${messageId}`).setStyle(ButtonStyle.Success).setLabel("참여하고 싶어요").setEmoji("🙋").setDisabled(disabled),
      new ButtonBuilder().setCustomId(`${CID_JOINVOICE}:${messageId}`).setStyle(ButtonStyle.Primary).setLabel("해당 음성채널 참여하기").setEmoji("🎙️").setDisabled(disabled)
    ),
  ];
}
function deriveBannerByGames(gameNames) {
  for (const g of gameNames) {
    if (GAME_BANNERS[g]) return GAME_BANNERS[g];
  }
  return DEFAULT_BANNER;
}
function buildGameTagLineByRoleNames(guild, gameNames) {
  const roleMentions = [];
  for (const name of gameNames) {
    const role = guild.roles.cache.find(r => r.name === name);
    if (role) roleMentions.push(`<@&${role.id}>`);
  }
  if (roleMentions.length === 0) return null;
  return `-# ${roleMentions.join(" ")}`;
}
function parseMessageIdFromCustomId(customId) {
  const parts = customId.split(":");
  return parts.length >= 3 ? parts[2] : parts[1];
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function ensureSession(uid) {
  if (!session.has(uid)) session.set(uid, { page: 0, selected: new Set() });
  return session.get(uid);
}
function buildGamePageSelect(guild, uid) {
  const s = ensureSession(uid);
  const pages = chunk(ALL_GAMES, 25);
  const total = pages.length;
  if (s.page >= total) s.page = total - 1;
  if (s.page < 0) s.page = 0;
  const current = pages[s.page] || [];
  const opts = current.map(n => {
    const role = guild.roles.cache.find(r => r.name === n);
    return {
      label: n,
      value: role ? role.id : `name:${n}`,
      default: false
    };
  });
  const placeholder = `게임 선택 • ${s.selected.size}개 선택됨 • 페이지 ${s.page + 1}/${Math.max(total, 1)}`;
  const select = new StringSelectMenuBuilder()
    .setCustomId(CID_CREATE_GAME_SELECT)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(opts);
  const rows = [];
  rows.push(new ActionRowBuilder().addComponents(select));
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CID_PAGE_PREV).setStyle(ButtonStyle.Secondary).setEmoji("◀️").setLabel("이전"),
    new ButtonBuilder().setCustomId(CID_PAGE_NEXT).setStyle(ButtonStyle.Secondary).setEmoji("▶️").setLabel("다음"),
    new ButtonBuilder().setCustomId(CID_SEARCH_OPEN).setStyle(ButtonStyle.Primary).setEmoji("🔎").setLabel("검색"),
    new ButtonBuilder().setCustomId(CID_CLEAR).setStyle(ButtonStyle.Danger).setEmoji("🧹").setLabel("초기화"),
    new ButtonBuilder().setCustomId(CID_OPEN_MODAL_NOW).setStyle(ButtonStyle.Success).setEmoji("⌨️").setLabel("모집 내용 입력")
  );
  rows.push(nav);
  return rows;
}
function addByKeyword(uid, keyword) {
  const s = ensureSession(uid);
  const pattern = keyword.toLowerCase().split("").map(c => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  const regex = new RegExp(pattern);
  const matches = ALL_GAMES.filter(g => regex.test(g.toLowerCase()));
  if (matches.length === 1) {
    s.selected.clear();
    s.selected.add(matches[0]);
    return { ok: true, added: matches[0], many: false, none: false };
  }
  if (matches.length === 0) return { ok: false, many: false, none: true };
  return { ok: false, many: true, list: matches.slice(0, 30) };
}
function resolveRoleIdsFromSelection(guild, uid) {
  const s = ensureSession(uid);
  const names = [...s.selected];
  const ids = names.map(n => {
    const role = guild.roles.cache.find(r => r.name === n);
    return role ? role.id : `name:${n}`;
  });
  return { names, ids };
}
function normalizeVoiceInput(raw) {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (/^\d{10,20}$/.test(v)) return v;
  if (VOICE_ALIAS[v]) return VOICE_ALIAS[v];
  return null;
}
async function fetchValidVoiceChannel(guild, idOrNull) {
  if (!idOrNull) return null;
  const ch = await guild.channels.fetch(idOrNull).catch(() => null);
  if (ch && (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice)) return ch;
  return null;
}
function canMemberConnect(member, channel) {
  const perms = member?.permissionsIn(channel);
  return perms?.has(PermissionFlagsBits.Connect) ?? false;
}
function isChannelFull(channel) {
  if (!channel?.userLimit || channel.userLimit === 0) return false;
  return channel.members.size >= channel.userLimit;
}
async function dmRecruiterAboutParticipant(client, recruiterId, guild, participant, recruitEmbed) {
  const member = await guild.members.fetch(participant.id).catch(() => null);
  const nickname = member?.displayName || participant.username;
  const thumb =
    (member?.displayAvatarURL && member.displayAvatarURL({ extension: "png", size: 256 })) ||
    participant.displayAvatarURL({ extension: "png", size: 256 });
  const recruitContent = recruitEmbed?.data?.description?.slice(0, 1000) || "모집글 본문 없음";

  const ROLE_JULGEM = "1210762420151394354";
  const ROLE_JULBBAG = "1210762298172383273";
  const ROLE_BBAG = "1210762363704311838";

  let gameStyle = "알 수 없음";
  if (member?.roles?.cache) {
    const hasJ = member.roles.cache.has(ROLE_JULGEM);
    const hasJB = member.roles.cache.has(ROLE_JULBBAG);
    const hasB = member.roles.cache.has(ROLE_BBAG);
    const owned = [hasJ, hasJB, hasB].filter(Boolean).length;
    if (owned === 1) {
      if (hasJ) gameStyle = "즐겜러";
      else if (hasJB) gameStyle = "즐빡겜러";
      else if (hasB) gameStyle = "빡겜러";
    }
  }
  const joinedTs = member?.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;

  const baseEmbed = new EmbedBuilder()
    .setTitle(`🙋 ${nickname}님이 참여를 원합니다.`)
    .setThumbnail(thumb)
    .addFields(
      { name: "모집글 정보", value: recruitContent, inline: false },
      { name: "유저 정보", value: `<@${participant.id}> (${participant.id})`, inline: false },
      { name: "게임 스타일", value: gameStyle, inline: true },
      ...(joinedTs ? [{ name: "서버 합류일", value: `<t:${joinedTs}:D>`, inline: true }] : [])
    )
    .setColor(0x57c3ff)
    .setTimestamp();
  
  let voiceId = null;
  try {
    const fVoice = (recruitEmbed?.data?.fields || []).find((f) => f.name === "음성 채널");
    voiceId = fVoice?.value?.match(/<#(\d+)>/)?.[1] || null;
  } catch { voiceId = null; }
  let dmFailed = false;
  try {
    const dmTarget = await client.users.fetch(recruiterId).catch(() => null);
    if (!dmTarget) dmFailed = true;
    else {
      await dmTarget.send({ embeds: [baseEmbed] });
    }
  } catch {
    dmFailed = true;
  }
  if (dmFailed && voiceId) {
    try {
      const ch = await guild.channels.fetch(voiceId).catch(() => null);
      if (ch && ch.isTextBased && ch.isTextBased()) {
        await ch.send({
          content: "-# (DM 차단/거부로 인해 여기로 안내돼요)",
          embeds: [baseEmbed],
        });
      }
    } catch {
    }
  }
}

function buildImageChoiceRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CID_IMG_MENU_URL).setStyle(ButtonStyle.Primary).setLabel("이미지 URL 입력").setEmoji("🌐"),
    new ButtonBuilder().setCustomId(CID_IMG_MENU_UPLOAD).setStyle(ButtonStyle.Success).setLabel("이미지 파일 업로드").setEmoji("🖼️"),
    new ButtonBuilder().setCustomId(CID_IMG_MENU_SKIP).setStyle(ButtonStyle.Secondary).setLabel("변경 안 함").setEmoji("➡️"),
  );
}

function isImageUrl(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:") return false;
    const p = url.pathname.toLowerCase();
    if (p.endsWith(".png") || p.endsWith(".jpg") || p.endsWith(".jpeg") || p.endsWith(".webp") || p.endsWith(".gif")) return true;
    return true;
  } catch { return false; }
}

function parseCloseTsFromEmbed(embed) {
  const f = (embed?.data?.fields || []).find(x => x.name === "마감까지");
  if (!f) return null;
  const m = String(f.value || "").match(/<t:(\d+):[A-Z]>/i);
  if (!m) return null;
  const ts = parseInt(m[1], 10);
  if (!Number.isFinite(ts)) return null;
  return ts;
}

function isEmbedClosed(embed) {
  const desc = embed?.data?.description || "";
  if (desc.startsWith("[모집 종료]")) return true;
  const f = (embed?.data?.fields || []).find(x => x.name === "마감까지");
  if (!f) return false;
  return String(f.value).includes("마감 종료");
}

async function tryCloseMessageIfExpired(msg) {
  if (!msg?.embeds?.[0]) return false;
  const base = EmbedBuilder.from(msg.embeds[0]);
  if (isEmbedClosed(base)) return false;
  const ts = parseCloseTsFromEmbed(base);
  if (!ts) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec < ts) return false;
  closeEmbed(base);
  const comps = buildRecruitComponents(msg.id, true);
  await msg.edit({ embeds: [base], components: comps }).catch(() => {});
  return true;
}

async function sweepExpired(client) {
  const ch = await client.channels.fetch(모집채널ID).catch(() => null);
  if (!ch || !ch.isTextBased()) return;
  let before = undefined;
  for (let round = 0; round < 10; round++) {
    const fetched = await ch.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!fetched || fetched.size === 0) break;
    const arr = Array.from(fetched.values());
    for (const m of arr) {
      if (!m.embeds?.[0]) continue;
      const e = m.embeds[0];
      const title = e?.title || "";
      if (title !== "📢 모집 글") continue;
      await tryCloseMessageIfExpired(m);
    }
    before = arr[arr.length - 1]?.id;
    if (!before) break;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("모집")
    .setDescription("모집 글 작성/수정/삭제 패널 열기"),

  async execute(interaction) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(CID_CREATE_OPEN).setStyle(ButtonStyle.Primary).setLabel("모집 글 작성하기").setEmoji("📝"),
      new ButtonBuilder().setCustomId(CID_EDIT_OPEN).setStyle(ButtonStyle.Secondary).setLabel("모집 글 수정하기").setEmoji("✏️"),
      new ButtonBuilder().setCustomId(CID_DELETE_OPEN).setStyle(ButtonStyle.Danger).setLabel("모집 글 삭제하기").setEmoji("🗑️"),
    );
    const embed = new EmbedBuilder()
      .setTitle("📢 모집 관리")
      .setDescription("아래 버튼으로 작업을 선택하세요.")
      .setColor(0x57c3ff);
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },

  registerRecruitHandlers(client) {
    client.once("ready", async () => {
      await sweepExpired(client).catch(() => {});
      setInterval(() => { sweepExpired(client).catch(() => {}); }, 60000);
    });

    client.on("interactionCreate", async (i) => {
      try {
        if (i.isButton()) {
          if (i.customId === CID_CREATE_OPEN) {
            session.set(i.user.id, { page: 0, selected: new Set() });
            const panel = new EmbedBuilder()
              .setTitle("📝 모집 글 작성")
              .setDescription("게임을 선택하거나 건너뛴 뒤, 모집 내용을 입력하세요.")
              .setColor(0x2ecc71);
            await i.reply({
              embeds: [panel],
              components: buildGamePageSelect(i.guild, i.user.id),
              ephemeral: true
            });
            return;
          }

          if (i.customId === CID_PAGE_PREV || i.customId === CID_PAGE_NEXT || i.customId === CID_CLEAR || i.customId === CID_SEARCH_OPEN || i.customId === CID_OPEN_MODAL_NOW) {
            if (!i.isRepliable()) return;
            if (i.customId === CID_PAGE_PREV) {
              const s = ensureSession(i.user.id);
              s.page -= 1;
              await i.update({ components: buildGamePageSelect(i.guild, i.user.id) });
              return;
            }
            if (i.customId === CID_PAGE_NEXT) {
              const s = ensureSession(i.user.id);
              s.page += 1;
              await i.update({ components: buildGamePageSelect(i.guild, i.user.id) });
              return;
            }
            if (i.customId === CID_CLEAR) {
              const s = ensureSession(i.user.id);
              s.selected.clear();
              await i.update({ components: buildGamePageSelect(i.guild, i.user.id) });
              return;
            }
            if (i.customId === CID_SEARCH_OPEN) {
              const modal = new ModalBuilder()
                .setCustomId(CID_SEARCH_MODAL)
                .setTitle("게임 검색");
              const ti = new TextInputBuilder()
                .setCustomId("searchKeyword")
                .setLabel("게임 이름 일부를 입력")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
              modal.addComponents(new ActionRowBuilder().addComponents(ti));
              await i.showModal(modal);
              return;
            }
            if (i.customId === CID_OPEN_MODAL_NOW) {
              const contentModal = new ModalBuilder()
                .setCustomId(CID_CREATE_MODAL)
                .setTitle("모집 글 작성");
              const tiContent = new TextInputBuilder().setCustomId("content").setLabel("모집 내용").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true);
              const tiCount = new TextInputBuilder().setCustomId("count").setLabel("모집 인원수 (본인 제외 1~9명)").setStyle(TextInputStyle.Short).setRequired(true);
              const tiHours = new TextInputBuilder().setCustomId("hours").setLabel("마감까지 유지 시간(시간, 1~24)").setStyle(TextInputStyle.Short).setRequired(true);
              const tiVoice = new TextInputBuilder().setCustomId("voice").setLabel("음성 채널(비우면 현재 접속중인 음성채널 자동)").setPlaceholder("예: 101호 또는 1222085152600096778").setStyle(TextInputStyle.Short).setRequired(false);
              contentModal.addComponents(
                new ActionRowBuilder().addComponents(tiContent),
                new ActionRowBuilder().addComponents(tiCount),
                new ActionRowBuilder().addComponents(tiHours),
                new ActionRowBuilder().addComponents(tiVoice),
              );
              await i.showModal(contentModal);
              return;
            }
          }

          if (i.customId === CID_EDIT_OPEN) {
            const modal = new ModalBuilder().setCustomId(CID_EDIT_MODAL).setTitle("모집 글 수정");
            const tiMsg = new TextInputBuilder().setCustomId("msgid").setLabel("모집글 메시지 ID").setStyle(TextInputStyle.Short).setRequired(true);
            const tiContent = new TextInputBuilder().setCustomId("content").setLabel("새 모집 내용(비우면 유지)").setStyle(TextInputStyle.Paragraph).setRequired(false);
            const tiCount = new TextInputBuilder().setCustomId("count").setLabel("새 모집 인원(1~9, 비우면 유지)").setStyle(TextInputStyle.Short).setRequired(false);
            modal.addComponents(new ActionRowBuilder().addComponents(tiMsg), new ActionRowBuilder().addComponents(tiContent), new ActionRowBuilder().addComponents(tiCount));
            await i.showModal(modal);
            return;
          }

          if (i.customId === CID_DELETE_OPEN) {
            const modal = new ModalBuilder().setCustomId(CID_DELETE_MODAL).setTitle("모집 글 삭제");
            const tiMsg = new TextInputBuilder().setCustomId("msgid").setLabel("모집글 메시지 ID").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(tiMsg));
            await i.showModal(modal);
            return;
          }

          if (i.customId.startsWith(CID_PARTICIPATE) || i.customId.startsWith(CID_JOINVOICE)) {
            const msgId = parseMessageIdFromCustomId(i.customId);
            const ch = i.channel;
            if (!ch?.isTextBased()) { await i.reply({ content: "❌ 텍스트 채널에서만 사용 가능합니다.", ephemeral: true }); return; }
            const msg = await ch.messages.fetch(msgId).catch(() => null);
            if (!msg || !msg.embeds?.[0]) { await i.reply({ content: "❌ 모집글을 찾을 수 없어요.", ephemeral: true }); return; }
            const embed = EmbedBuilder.from(msg.embeds[0]);
            const fRecruiter = getField(embed, "모집자");
            const recruiterId = fRecruiter?.value?.replace(/[<@>]/g, "") || null;
            const fCount = getField(embed, "모집 인원");
            const maxCount = parseCount(fCount?.value) || 1;
            const fParticipants = getField(embed, "참여자");
            const curIds = parseMembersFromParticipants(fParticipants?.value);
            const fVoice = getField(embed, "음성 채널");
            const voiceId = fVoice?.value?.match(/<#(\d+)>/)?.[1] || null;
            const isClosed = (embed.data?.description || "").startsWith("[모집 종료]");

            if (i.customId.startsWith(CID_PARTICIPATE)) {
              if (isClosed) { await i.reply({ content: "모집이 종료되었어요.", ephemeral: true }); return; }
              const ts = parseCloseTsFromEmbed(embed);
              if (ts && Math.floor(Date.now()/1000) >= ts) {
                closeEmbed(embed);
                await msg.edit({ embeds: [embed], components: buildRecruitComponents(msg.id, true) });
                await i.reply({ content: "모집이 마감되어 종료되었어요.", ephemeral: true });
                return;
              }
              if (curIds.includes(i.user.id)) { await i.reply({ content: "이미 참여 중이에요.", ephemeral: true }); return; }
              if (curIds.length >= maxCount) { await i.reply({ content: "정원이 가득 찼어요.", ephemeral: true }); return; }
              curIds.push(i.user.id);
              setField(embed, "참여자", listMentions(curIds), false);
              let disableNow = false;
              if (curIds.length >= maxCount) {
                closeEmbed(embed);
                disableNow = true;
              }
              await msg.edit({ embeds: [embed], components: buildRecruitComponents(msg.id, disableNow) });
              if (recruiterId) await dmRecruiterAboutParticipant(i.client, recruiterId, i.guild, i.user, embed);
              await i.reply({ content: "✅ 참여 의사를 전달했어요!", ephemeral: true });
              return;
            }

            if (i.customId.startsWith(CID_JOINVOICE)) {
              let targetVoice = null;
              if (voiceId) {
                targetVoice = await fetchValidVoiceChannel(i.guild, voiceId);
              } else if (recruiterId) {
                const recMember = await i.guild.members.fetch(recruiterId).catch(() => null);
                const recVC = recMember?.voice?.channel || null;
                if (recVC && (recVC.type === ChannelType.GuildVoice || recVC.type === ChannelType.GuildStageVoice)) {
                  targetVoice = recVC;
                }
              }
              if (!targetVoice) {
                await i.reply({ content: "❌ 지정된 음성 채널이 없고, 모집자가 현재 접속한 음성 채널도 없어요.", ephemeral: true });
                return;
              }
              if (isChannelFull(targetVoice)) {
                await i.reply({ content: "❌ 해당 음성 채널이 인원 마감이라 접속할 수 없어요.", ephemeral: true });
                return;
              }
              if (!canMemberConnect(i.member, targetVoice)) {
                const invite = await targetVoice.createInvite({ maxAge: 300, maxUses: 1, unique: true }).catch(() => null);
                await i.reply({ content: invite ? `권한이 부족해 이동은 불가해요. 초대 링크로 참여해주세요: ${invite.url}` : "권한이 부족하여 이동/초대가 불가해요.", ephemeral: true });
                return;
              }
              const canMove = i.guild.members.me?.permissions?.has(PermissionFlagsBits.MoveMembers);
              if (i.member?.voice?.channel) {
                if (canMove) {
                  try {
                    await i.member.voice.setChannel(targetVoice, "모집글 참여 이동");
                    await i.reply({ content: "🎙️ 음성 채널로 이동시켰어요!", ephemeral: true });
                  } catch {
                    const invite = await targetVoice.createInvite({ maxAge: 300, maxUses: 1, unique: true }).catch(() => null);
                    await i.reply({ content: invite ? `채널 초대: ${invite.url}` : "채널 이동에 실패했어요. 직접 참여해주세요.", ephemeral: true });
                  }
                } else {
                  const invite = await targetVoice.createInvite({ maxAge: 300, maxUses: 1, unique: true }).catch(() => null);
                  await i.reply({ content: invite ? `채널 초대: ${invite.url}` : "권한이 없어 이동시킬 수 없어요. 직접 참여해주세요.", ephemeral: true });
                }
              } else {
                const invite = await targetVoice.createInvite({ maxAge: 300, maxUses: 1, unique: true }).catch(() => null);
                await i.reply({ content: invite ? `채널 초대: ${invite.url}` : "초대링크 생성에 실패했어요. 직접 채널로 들어가주세요.", ephemeral: true });
              }
              return;
            }
          }

          if (i.customId === CID_IMG_MENU_SKIP) {
            await i.update({ content: "이미지 변경을 건너뛰었어요.", components: [] });
            return;
          }
          if (i.customId === CID_IMG_MENU_URL) {
            const modal = new ModalBuilder().setCustomId(CID_IMG_URL_SUBMIT).setTitle("이미지 URL 입력");
            const ti = new TextInputBuilder().setCustomId("imgurl").setLabel("https:// 로 시작하는 이미지 URL").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500);
            modal.addComponents(new ActionRowBuilder().addComponents(ti));
            await i.showModal(modal);
            return;
          }
          if (i.customId === CID_IMG_MENU_UPLOAD) {
            const state = imageSessions.get(i.user.id);
            if (!state || state.messageId !== i.message.reference?.messageId) {
              imageSessions.set(i.user.id, { messageId: i.message.reference?.messageId, channelId: i.channelId, expiresAt: Date.now() + 120000 });
            } else {
              state.expiresAt = Date.now() + 120000;
              imageSessions.set(i.user.id, state);
            }
            await i.update({ content: "이 채널에 이미지 한 장을 업로드해줘. 2분 안에 올리면 모집글 이미지로 교체해줄게.", components: [] });
            return;
          }
        }

        if (i.isStringSelectMenu() && i.customId === CID_CREATE_GAME_SELECT) {
          const s = ensureSession(i.user.id);
          const picked = i.values.map(v => {
            if (v.startsWith("name:")) return v.slice(5);
            const role = i.guild.roles.cache.get(v);
            return role ? role.name : null;
          }).filter(Boolean);
          const first = picked[0] || null;
          s.selected.clear();
          if (first) s.selected.add(first);
          await i.reply({ content: first ? `선택됨: ${first}` : "선택이 초기화됐어요.", ephemeral: true });
          return;
        }

        if (i.isModalSubmit() && i.customId === CID_SEARCH_MODAL) {
          const keyword = i.fields.getTextInputValue("searchKeyword").trim();
          const r = addByKeyword(i.user.id, keyword);
          if (r.ok) {
            await i.reply({ content: `선택됨: ${r.added}`, ephemeral: true });
          } else if (r.none) {
            await i.reply({ content: "검색 결과가 없습니다.", ephemeral: true });
          } else if (r.many) {
            await i.reply({ content: `여러 개가 검색됨. 더 구체적으로 입력: ${r.list.join(", ")}`, ephemeral: true });
          }
          return;
        }

        if (i.isModalSubmit() && i.customId === CID_CREATE_MODAL) {
          try {
            const s = ensureSession(i.user.id);
            const content = i.fields.getTextInputValue("content");
            let count = parseInt(i.fields.getTextInputValue("count") || "0", 10);
            let hours = parseInt(i.fields.getTextInputValue("hours") || "1", 10);
            const voiceRaw = (i.fields.getTextInputValue("voice") || "").trim();
            if (!Number.isInteger(count) || count < 1 || count > 9) count = 1;
            if (!Number.isInteger(hours) || hours < 1 || hours > 24) hours = 1;

            let voiceIdCandidate = normalizeVoiceInput(voiceRaw);
            if (!voiceIdCandidate) {
              const curVC = i.member?.voice?.channel;
              if (curVC && (curVC.type === ChannelType.GuildVoice || curVC.type === ChannelType.GuildStageVoice)) {
                voiceIdCandidate = curVC.id;
              }
            }
            const validVoice = await fetchValidVoiceChannel(i.guild, voiceIdCandidate);

            const channel = await i.guild.channels.fetch(모집채널ID).catch(() => null);
            if (!channel?.isTextBased()) {
              await i.reply({ content: "❌ 모집 전용 채널을 찾을 수 없어요.", ephemeral: true });
              return;
            }

            const now = Date.now();
            const closeAt = now + hours * 3600_000;
            const closeTs = Math.floor(closeAt / 1000);

            const recruiterId = i.user.id;
            const gameNames = [...s.selected];

            const banner = deriveBannerByGames(gameNames);
            const tagLine = gameNames.length > 0 ? buildGameTagLineByRoleNames(i.guild, gameNames) : null;

            const fields = [
              { name: "모집 인원", value: `${count}명`, inline: true },
              { name: "모집자", value: `<@${recruiterId}>`, inline: true },
              { name: "마감까지", value: `<t:${closeTs}:R>`, inline: true },
            ];
            if (validVoice) fields.splice(1, 0, { name: "음성 채널", value: `<#${validVoice.id}>`, inline: true });
            if (gameNames.length > 0) fields.push({ name: "선택 게임", value: gameNames.join(", "), inline: false });
            fields.push({ name: "참여자", value: "없음", inline: false });

            const embed = new EmbedBuilder()
              .setTitle("📢 모집 글")
              .setDescription(content)
              .addFields(fields)
              .setColor(0x57c3ff)
              .setImage(banner)
              .setTimestamp();

            const message = await channel.send({
              content: tagLine || undefined,
              embeds: [embed],
              components: buildRecruitComponents("PENDING"),
            });
            const realComponents = buildRecruitComponents(message.id);
            await message.edit({ components: realComponents });
            session.delete(i.user.id);

            const follow = new EmbedBuilder()
              .setTitle("이미지 변경")
              .setDescription("모집글에 첨부할 이미지를 변경하시겠습니까?")
              .setColor(0x57c3ff);
            const prompt = await i.reply({
              content: `게시됨 • 메시지 ID: \`${message.id}\``,
              embeds: [follow],
              components: [buildImageChoiceRow()],
              ephemeral: true
            });
            prompt.message.reference = { messageId: message.id };
          } catch {
            try { await i.reply({ content: "❌ 모집 글 작성 중 오류가 발생했어요.", ephemeral: true }); } catch {}
          }
          return;
        }

        if (i.isModalSubmit() && i.customId === CID_IMG_URL_SUBMIT) {
          const img = i.fields.getTextInputValue("imgurl").trim();
          if (!isImageUrl(img)) {
            await i.reply({ content: "❌ 올바른 https:// 이미지 URL을 입력해주세요.", ephemeral: true });
            return;
          }
          const refMsgId = i.message.reference?.messageId;
          if (!refMsgId) {
            await i.reply({ content: "❌ 대상 모집글을 찾을 수 없어요.", ephemeral: true });
            return;
          }
          const ch = await i.guild.channels.fetch(모집채널ID).catch(() => null);
          if (!ch?.isTextBased()) { await i.reply({ content: "❌ 모집 채널을 찾을 수 없어요.", ephemeral: true }); return; }
          const msg = await ch.messages.fetch(refMsgId).catch(() => null);
          if (!msg || !msg.embeds?.[0]) { await i.reply({ content: "❌ 모집글을 찾을 수 없어요.", ephemeral: true }); return; }
          const embed = EmbedBuilder.from(msg.embeds[0]);
          embed.setImage(img);
          await msg.edit({ embeds: [embed] });
          await i.reply({ content: "✅ 이미지가 변경되었어요!", ephemeral: true });
          return;
        }
      } catch {}
    });

    client.on("messageCreate", async (m) => {
      try {
        if (m.author.bot) return;
        const state = imageSessions.get(m.author.id);
        if (!state) return;
        if (Date.now() > state.expiresAt) { imageSessions.delete(m.author.id); return; }
        if (m.channelId !== state.channelId) return;
        if (!m.attachments || m.attachments.size === 0) return;
        const att = m.attachments.first();
        const isImg = (att.contentType && att.contentType.startsWith("image/")) || /\.(png|jpe?g|webp|gif)$/i.test(att.url);
        if (!isImg) return;
        const ch = await m.client.channels.fetch(모집채널ID).catch(() => null);
        if (!ch?.isTextBased()) return;
        const msg = await ch.messages.fetch(state.messageId).catch(() => null);
        if (!msg || !msg.embeds?.[0]) return;
        const embed = EmbedBuilder.from(msg.embeds[0]);
        embed.setImage(att.url);
        await msg.edit({ embeds: [embed] }).catch(() => {});
        await m.reply({ content: "✅ 모집글 이미지 교체 완료!", allowedMentions: { repliedUser: false } }).catch(() => {});
        await m.delete().catch(() => {});
        imageSessions.delete(m.author.id);
      } catch {}
    });
  },
};
