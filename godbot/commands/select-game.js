const { 
  SlashCommandBuilder, 
  StringSelectMenuBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  EmbedBuilder, 
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");


// 롤, 스팀게임, 나머지
const PAGE_SIZE        = 10;
const BLANK = '\u200B';
const LOL              = ["소환사의 협곡", "칼바람 나락", "롤토체스", "이벤트 모드"];
const STEAM_GAMES      = ["스팀게임"];
const FOOTER_ICON_URL  = "https://media.discordapp.net/attachments/1388728993787940914/1389194104424108223/2D.png?format=webp&quality=lossless";
const ALL_GAMES = [
  "소환사의 협곡", "칼바람 나락", "롤토체스", "이벤트 모드", // 롤
  "스팀게임", // 스팀
  "DJ MAX", "FC", "GTA", "GTFO", "TRPG", "건파이어 리본", "구스구스 덕", "데드락", "데바데", "델타포스",
  "돈스타브", "래프트", "레인보우식스", "레포", "로스트아크", "리썰컴퍼니", "리스크 오브 레인", "마스터 듀얼",
  "마인크래프트", "마피아42", "메이플스토리", "몬스터 헌터", "문명", "발로란트", "배틀그라운드", "배틀필드",
  "백룸", "백 포 블러드", "블레이드 앤 소울", "블루아카이브", "비세라 클린업", "서든어택", "선 헤이븐",
  "스컬", "스타듀밸리", "스타크래프트", "에이펙스", "엘소드", "오버워치", "왁제이맥스", "워프레임",
  "원신", "원스 휴먼", "이터널 리턴", "좀보이드", "카운터스트라이크", "코어 키퍼", "콜오브듀티", "테라리아",
  "테이블 탑 시뮬레이터", "테일즈런너", "파스모포비아", "파워워시 시뮬레이터", "파티 애니멀즈", "팰월드", "페긴",
  "프래그 펑크", "휴먼폴플랫", "헬다이버즈", "히오스"
];

const GAME_EMOJIS = {
  "소환사의 협곡": "<:lol1:1209715264115974144>",
  "칼바람 나락": "<:lol2:1209715933262905484>",
  "롤토체스": "<:lol3:1209715268964720680>",
  "이벤트 모드": "<:lol4:1264547319550840863>",
  "스팀게임": "<:steamgames:1209715229492117534>",
  "DJ MAX": "<:djmax:1209715237864087603>",
  "FC": "<:FcFifa:1209715892913438730>",
  "GTA": "<:gta:1209715249016737892>",
  "GTFO": "<:gtfo:1209715231647989791>",
  "TRPG": "🎲",
  "건파이어 리본": "<:Gunfire_Reborn:1287616806843842600>",
  "구스구스 덕": "<:GooseGooseDuck:1209715246743429140>",
  "데드락": "<:Dead_Lock:1287616809876324374>",
  "데바데": "<:DeadByDaylight:1212026350123225138>",
  "델타포스": "<:DeltaForce:1325337677691617331>",
  "돈스타브": "<:Dontstarve:1227026743777431553>",
  "래프트": "<:raft:1209715251826786314>",
  "레인보우식스": "<:RainbowSix:1209715227122466887>",
  "레포": "<:REPO:1348545414013390858>",
  "로스트아크": "<:lostark:1209715273070936064>",
  "리썰컴퍼니": "<:lethalCompany:1209715276325724180>",
  "리스크 오브 레인": "<:riskofrain:1209715278259425330>",
  "마스터 듀얼": "<:masterduel:1209715988556423179>",
  "마인크래프트": "<:minecraft:1209715287616917534>",
  "마피아42": "<:mafia42:1209739752862126092>",
  "메이플스토리": "<:maplestory:1239453793741963274>",
  "몬스터 헌터": "<:MONSTERHUNTER:1239453811941183558>",
  "문명": "<:Civilization:1227027166663938068>",
  "발로란트": "<:Valorant:1209715300032057436>",
  "배틀그라운드": "<:PUBG:1209741906133786634>",
  "배틀필드": "<:battlefield:1209715305270616094>",
  "백룸": "<:backroom:1209715310303641650>",
  "백 포 블러드": "<:Back4Blood:1239453806186729544>",
  "블레이드 앤 소울": "<:BladeandSoul:1239453817305698315>",
  "블루아카이브": "<:bluearchive:1209750788080013322>",
  "비세라 클린업": "<:VisceraCleanup:1239453802386690090>",
  "서든어택": "<:suddenattack:1209715325038497832>",
  "선 헤이븐": "<:sunhaven:1239475392176459856>",
  "스컬": "<:skul:1212026352539144203>",
  "스타듀밸리": "<:StardewValley:1227026750718869638>",
  "스타크래프트": "<:Starcraft:1239453819381743737>",
  "에이펙스": "<:apex:1209715329400311859>",
  "엘소드": "<:Elsword:1319307644485505044>",
  "오버워치": "<:overwatch:1209715332126875720>",
  "왁제이맥스": "<:Wak:1239468331376054314>",
  "워프레임": "<:warframe:1209715336404803615>",
  "원신": "<:genshin:1209750786012221471>",
  "원스 휴먼": "<:once_human:1277595703941533696>",
  "이터널 리턴": "<:EternalReturn:1209715201860173836>",
  "좀보이드": "<:zomboid:1209715205324406865>",
  "카운터스트라이크": "<:CSO:1209715207220232212>",
  "코어 키퍼": "<:CoreKeeper:1239454456110780466>",
  "콜오브듀티": "<:CallOfDuty:1227026741650915429>",
  "테라리아": "<:terraria:1209715209120387172>",
  "테이블 탑 시뮬레이터": "<:TabletopSimulator:1239453797668098079>",
  "테일즈런너": "<:TalesRunner:1209715210852638731>",
  "파스모포비아": "<:phasmophobia:1209715213306302524>",
  "파워워시 시뮬레이터": "<:PowerWashSimulator:1227026735619637368>",
  "파티 애니멀즈": "<:party_animals2:1319307580773761106>",
  "팰월드": "<:Palworld:1209715220360990791>",
  "페긴": "<:feign:1209715217152475166>",
  "프래그 펑크": "<:FragPunk:1348542967677456444>",
  "휴먼폴플랫": "<:humanfallflat:1209715225742549062>",
  "헬다이버즈": "<:helldivers:1209715222462599188>",
  "히오스": "<:HeroesoftheStorm:1361899848579678218>"
};


// -------- 정렬 유틸 ---------------------------------
function getInitial(ch){
  const code = ch.charCodeAt(0);
  if(code>=0xac00&&code<=0xd7a3){
    const INITIALS="ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
    return INITIALS[Math.floor((code-0xac00)/588)];
  }
  if(/[a-zA-Z]/.test(ch)) return ch[0].toLowerCase();
  return "Ω";
}
function sortByInitial(a,b){
  const ia=getInitial(a), ib=getInitial(b);
  if(ia===ib) return a.localeCompare(b,"ko-KR");
  if(ia==="Ω") return 1;
  if(ib==="Ω") return-1;
  if(/[ㄱ-ㅎ]/.test(ia)&&/[ㄱ-ㅎ]/.test(ib)) return ia.localeCompare(ib,"ko-KR");
  if(/[ㄱ-ㅎ]/.test(ia)) return-1;
  if(/[ㄱ-ㅎ]/.test(ib)) return 1;
  return ia.localeCompare(ib,"en");
}

const ETC_GAMES = ALL_GAMES.filter(x=>![...LOL,...STEAM_GAMES].includes(x)).sort(sortByInitial);

// -------- 명령어 -------------------------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName("게임태그설정")
    .setDescription("게임 역할 태그를 설정합니다."),

  async execute(interaction){
    await interaction.guild.roles.fetch();
    let member = await interaction.guild.members.fetch(interaction.user.id);

    // 인기 순 정렬용
    const rolePopularity = {};
    interaction.guild.roles.cache
      .filter(r=>!r.managed&&ALL_GAMES.includes(r.name))
      .forEach(r=>{ rolePopularity[r.name]=r.members.size; });

    const firstPageGames = [
      ...LOL, ...STEAM_GAMES,
      ...ETC_GAMES
        .sort((a,b)=>(rolePopularity[b]||0)-(rolePopularity[a]||0))
        .slice(0, Math.max(0,PAGE_SIZE-LOL.length-STEAM_GAMES.length))
    ];

    const remaining = ETC_GAMES.filter(g=>!firstPageGames.includes(g))
      .sort((a,b)=>(rolePopularity[b]||0)-(rolePopularity[a]||0));

    let PAGES = [
      firstPageGames,
      ...Array.from({length: Math.ceil(remaining.length/PAGE_SIZE)},(_,i)=>
        remaining.slice(i*PAGE_SIZE,(i+1)*PAGE_SIZE))
    ];

    const pageHasRole = arr => arr.some(name =>
  interaction.guild.roles.cache.find(r => r.name === name)
);
PAGES = PAGES.filter(pageHasRole);

    let page = 0;
    const getRoles = names=>names
      .map(n=>interaction.guild.roles.cache.find(r=>r.name===n))
      .filter(Boolean);

   async function render(u = null) {
  const chosenRoles = member.roles.cache.filter(r => ALL_GAMES.includes(r.name));

let chosenText;
if (chosenRoles.size) {
  const arr = chosenRoles.map(r => GAME_EMOJIS[r.name] || "");
  const lines = [];
  for (let i = 0; i < arr.length; i += 5) {
    lines.push(arr.slice(i, i + 5).join(" "));
  }
  chosenText = lines.join("\n");
} else {
  chosenText = "아직 등록된 태그가 없습니다.";
}

      const rolesThisPage = getRoles(PAGES[page]);

      
      const emojis = rolesThisPage.map(r => GAME_EMOJIS[r.name] || "❔");
const lines  = [];
for (let i = 0; i < emojis.length; i += 5) {
  lines.push(emojis.slice(i, i + 5).join(", "));
}
const pageList = lines.join(",\n");

      const embed = new EmbedBuilder()
        .setTitle("🎮 게임 태그 설정하기")
        .setColor(0x2095ff)
        .setFooter({text:"게임 태그는 최소 1개 이상 유지해야 합니다.",iconURL:FOOTER_ICON_URL})
        .addFields(
          { name: "📌 등록한 게임 태그", value: chosenText },
  { name: BLANK, value: BLANK },
  { name: BLANK, value: BLANK },
  { name: `🗂️ 현재 목록에 있는 게임 (페이지 ${page+1}/${PAGES.length})`, value: pageList }
);

      const select = new StringSelectMenuBuilder()
        .setCustomId("select")
        .setPlaceholder("여기를 눌러 게임 태그를 설정하세요!")
        .setMinValues(0)
        .setMaxValues(rolesThisPage.length)
        .addOptions(
          rolesThisPage.map(r=>({
            label: r.name.length>100 ? r.name.slice(0,97)+"…" : r.name,
            value: r.id,
            default: member.roles.cache.has(r.id),
            emoji: GAME_EMOJIS[r.name] || undefined
          }))
        );

      const nav = new ActionRowBuilder().addComponents(
        
  new ButtonBuilder()
    .setCustomId("search")
    .setEmoji("🔍")
    .setStyle("Secondary"),

  new ButtonBuilder()
    .setCustomId("prev")
    .setLabel("이전 게임")
    .setStyle("Secondary")
    .setDisabled(page===0)
    .setEmoji("⬅️"),
  new ButtonBuilder()
    .setCustomId("next")
    .setLabel("다음 게임")
    .setStyle("Primary")
    .setDisabled(page>=PAGES.length-1)
    .setEmoji("➡️"),
  new ButtonBuilder()
    .setCustomId("info")
    .setLabel("설명")
    .setStyle("Success")
    .setEmoji("ℹ️")
);

      const payload = {
        embeds:[embed],
        components:[
          new ActionRowBuilder().addComponents(select),
          nav
        ],
        ephemeral:true
      };
      return u ? u.update(payload) : interaction.reply(payload);
    }

    await render();
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      filter:i=>i.user.id===interaction.user.id,
      time:600_000,
    });

    collector.on("collect",async i=>{

      if(i.isButton()&&i.customId==="search"){
    const modal = new ModalBuilder()
      .setCustomId("gameSearchModal")
      .setTitle("🔍 게임 검색")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("searchKeyword")
            .setLabel("검색할 게임 키워드")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("예: 배틀그라운드")
            .setRequired(true)
        )
      );
    await i.showModal(modal);
    return;
  }
      
      if(i.isStringSelectMenu()){
        const chosen = new Set(i.values);
        const pageRoles = getRoles(PAGES[page]);

        const future = new Set(
          member.roles.cache
            .filter(r=>ALL_GAMES.includes(r.name)&&!pageRoles.find(pr=>pr.id===r.id))
            .map(r=>r.id)
            .concat([...chosen])
        );
        if(future.size===0){
          await i.reply({content:"❌ 최소 1개 이상의 게임 태그를 선택해야만 합니다!",ephemeral:true});
          return;
        }

        const toAdd    = pageRoles.filter(r=>chosen.has(r.id)&&!member.roles.cache.has(r.id));
        const toRemove = pageRoles.filter(r=>!chosen.has(r.id)&&member.roles.cache.has(r.id));
        try{
          if(toAdd.length)    await member.roles.add(toAdd,"게임 태그 추가");
          if(toRemove.length) await member.roles.remove(toRemove,"게임 태그 제거");
          member = await interaction.guild.members.fetch(interaction.user.id);
          await render(i);
        }catch(e){
          await i.reply({content:"❌ 역할 변경 중 오류가 발생했어요 (관리자에게 문의)",ephemeral:true});
        }
      }else if(i.isButton()){
        if(i.customId==="prev"&&page>0){ page--; await render(i); }
        else if(i.customId==="next"&&page<PAGES.length-1){ page++; await render(i); }
        else if(i.customId==="info"){
          const infoEmbed = new EmbedBuilder()
            .setTitle("📌 게임 태그 안내")
            .setColor(0x2ecc71)
            .setDescription([
              "• 게임 목록은 **서버 인기 순** 정렬입니다.",
              "• **게임 태그는 최소 1개** 이상 장착해주세요.",
              "• 자유롭게 **@게임태그 멘션**을 활용하여 소통하세요! 🎮"
            ].join("\n"));
          await i.reply({embeds:[infoEmbed],ephemeral:true});
        }
      }
    });

    collector.on("end",async()=>{
      member = await interaction.guild.members.fetch(interaction.user.id);
      if(member.roles.cache.filter(r=>ALL_GAMES.includes(r.name)).size===0){
        try{ await interaction.editReply({content:"❌ 최소 1개 이상의 게임 태그를 선택하세요. 1개는 상시 유지!",components:[]}); }catch{}
      }else{
        try{ await interaction.editReply({components:[]}); }catch{}
      }
    });
  },
};

module.exports.ALL_GAMES = ALL_GAMES;
