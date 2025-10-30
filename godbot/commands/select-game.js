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

const PAGE_SIZE        = 20;
const BLANK = '\u200B';
const LOL              = ["소환사의 협곡", "칼바람 나락", "롤토체스", "이벤트 모드"];
const STEAM_GAMES      = ["스팀게임"];
const FOOTER_ICON_URL  = "https://media.discordapp.net/attachments/1388728993787940914/1389194104424108223/2D.png?format=webp&quality=lossless";
const ALL_GAMES = [
  "소환사의 협곡", "칼바람 나락", "롤토체스", "이벤트 모드[우르프,아레나,돌격전 등]",
  "스팀게임",
  "DJ MAX", "FC", "GTA", "GTFO", "TRPG", "건파이어 리본", "구스구스 덕", "데드락", "데바데", "델타포스",
  "돈스타브", "래프트", "레인보우식스", "레포 REPO", "로스트아크", "리썰컴퍼니", "리스크 오브 레인", "마블 라이벌즈",
  "마인크래프트", "마피아42", "메이플스토리", "몬스터 헌터", "문명", "발로란트", "배틀그라운드", "배틀필드",
  "백룸", "백 포 블러드", "비세라 클린업", "서든어택", "선 헤이븐",
  "스컬", "스타듀밸리", "스타크래프트", "아크 레이더스", "에이펙스", "엘소드", "오버워치", "왁제이맥스", "워프레임",
  "원신", "원스 휴먼", "이터널 리턴", "좀보이드", "카운터스트라이크", "코어 키퍼", "콜오브듀티", "테라리아",
  "테이블 탑 시뮬레이터", "테일즈런너", "파스모포비아", "파워워시 시뮬레이터", "파티 애니멀즈", "팰월드", "페긴", "포트나이트",
  "프래그 펑크", "휴먼폴플랫", "헬다이버즈", "히오스"
];

const GAME_EMOJIS = {
  "소환사의 협곡": "<:lol1:1209715264115974144>",
  "칼바람 나락": "<:lol2:1209715933262905484>",
  "롤토체스": "<:lol3:1209715268964720680>",
  "이벤트 모드[우르프,아레나,돌격전 등]": "<:lol4:1264547319550840863>",
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
  "레포 REPO": "<:REPO:1348545414013390858>",
  "로스트아크": "<:lostark:1209715273070936064>",
  "리썰컴퍼니": "<:lethalCompany:1209715276325724180>",
  "리스크 오브 레인": "<:riskofrain:1209715278259425330>",
  "마블 라이벌즈": "<:Marvel_Rivals:1407737222433865779>",
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
  "비세라 클린업": "<:VisceraCleanup:1239453802386690090>",
  "서든어택": "<:suddenattack:1209715325038497832>",
  "선 헤이븐": "<:sunhaven:1239475392176459856>",
  "스컬": "<:skul:1212026352539144203>",
  "스타듀밸리": "<:StardewValley:1227026750718869638>",
  "스타크래프트": "<:Starcraft:1239453819381743737>",
  "아크 레이더스": "<:ARC_Raiders:1433384481091485796>",
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
  "포트나이트": "<:fortnite:1430523696694431814>",
  "프래그 펑크": "<:FragPunk:1348542967677456444>",
  "휴먼폴플랫": "<:humanfallflat:1209715225742549062>",
  "헬다이버즈": "<:helldivers:1209715222462599188>",
  "히오스": "<:HeroesoftheStorm:1361899848579678218>"
};

// ------ 장르 역할(이모지: 기본 이모지) ------
const GENRE_ROLES = [
  { name: "모든 게임", id: "1433389538776191018", emoji: "📚", pin: true },
  { name: "신작 게임", id: "1433389710713028730", emoji: "🆕", pin: true },
  { name: "롤플레잉 게임", id: "1433389939369709620", emoji: "🧙" },
  { name: "액션 게임", id: "1433390009549062256", emoji: "⚔️" },
  { name: "RPG 게임", id: "1433390102826192946", emoji: "🗡️" },
  { name: "격투 게임", id: "1433390189249822801", emoji: "🥊" },
  { name: "시뮬레이션 게임", id: "1433392306282565742", emoji: "🛠️" },
  { name: "스포츠 게임", id: "1433390266836058244", emoji: "🏅" },
  { name: "퀴즈 / 퍼즐 게임", id: "1433391817969111080", emoji: "🧩" },
  { name: "레이싱 게임", id: "1433390338671640597", emoji: "🏎️" },
  { name: "전략 게임", id: "1433390416564064326", emoji: "🧠" },
  { name: "FPS / 슈팅 게임", id: "1433390474239938580", emoji: "🔫" },
  { name: "리듬 / 음악 게임", id: "1433390593358434395", emoji: "🎵" },
  { name: "턴제 게임", id: "1433390697414922280", emoji: "♟️" },
  { name: "디펜스 게임", id: "1433390834459476038", emoji: "🛡️" },
  { name: "로그라이크 게임", id: "1433390910569320530", emoji: "🎲" },
  { name: "공포 게임", id: "1433390974226399333", emoji: "👻" },
  { name: "귀여운 게임", id: "1433391088025993246", emoji: "🐣" },
  { name: "성인 게임", id: "1433391151213183028", emoji: "🔞" },
  { name: "경영 게임", id: "1433391231446155346", emoji: "🏭" },
  { name: "육성 / 성장 게임", id: "1433391301289709691", emoji: "🌱" },
  // 제공 목록상 레이싱 게임이 한번 더 있으나(1433392144592408667) 중복이므로 제외
  { name: "샌드박스 게임", id: "1433392213160886363", emoji: "🧱" }
];

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
    let genreMode = false;

    const getRoles = names=>names
      .map(n=>interaction.guild.roles.cache.find(r=>r.name===n))
      .filter(Boolean);

    function buildChosenTagText(member){
      const chosenRoles = member.roles.cache.filter(r => ALL_GAMES.includes(r.name));
      if (!chosenRoles.size) return "아직 등록된 태그가 없습니다.";
      const arr = chosenRoles.map(r => `${GAME_EMOJIS[r.name] || "❔"}${r.name}`);
      const maxShow = 30;
      let showArr = arr;
      if (arr.length > maxShow) showArr = arr.slice(0, maxShow).concat(`...외 ${arr.length - maxShow}개`);
      const lines = [];
      for (let i = 0; i < showArr.length; i += 5) lines.push(showArr.slice(i, i + 5).join(" "));
      return lines.join("\n");
    }

    function getSortedGenresByPopularity(){
      const cache = interaction.guild.roles.cache;
      const pins = GENRE_ROLES.filter(g=>g.pin);
      const normals = GENRE_ROLES.filter(g=>!g.pin).slice();

      normals.sort((a,b)=>{
        const ra = cache.get(a.id), rb = cache.get(b.id);
        const ca = ra?.members?.size||0, cb = rb?.members?.size||0;
        return cb - ca;
      });
      return [...pins, ...normals];
    }

    function buildChosenGenreText(member){
      const ids = GENRE_ROLES.map(g=>g.id);
      const mine = GENRE_ROLES.filter(g => member.roles.cache.has(g.id));
      if (mine.length === 0) return "아직 선택한 장르가 없습니다.";
      return mine.map(g => `${g.emoji || "🏷️"} ${g.name}`).join("\n");
    }

    async function render(u = null) {
      const chosenText = buildChosenTagText(member);

      // 공통 상단: 등록한 게임 태그
      const chosenEmbed = new EmbedBuilder()
        .setTitle("📌 등록한 게임 태그")
        .setDescription(chosenText)
        .setColor(0xf2b619);

      if (!genreMode) {
        // ---- 기본(게임 목록) 모드 ----
        const rolesThisPage = getRoles(PAGES[page]);
        const emojis = rolesThisPage.map(r => GAME_EMOJIS[r.name] || "❔");
        const lines = [];
        for (let i = 0; i < emojis.length; i += 5) lines.push(emojis.slice(i, i + 5).join(", "));
        const pageList = lines.join(",\n");

        const mainEmbed = new EmbedBuilder()
          .setTitle("🎮 게임 태그 설정하기")
          .setColor(0x2095ff)
          .setFooter({text:"게임 태그는 최소 1개 이상 유지해야 합니다.",iconURL:FOOTER_ICON_URL})
          .addFields(
            { name: "🗂️ 현재 목록에 있는 게임 (페이지 " + (page + 1) + "/" + PAGES.length + ")", value: pageList || "표시할 게임이 없습니다." }
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
          new ButtonBuilder().setCustomId("search").setEmoji("🔍").setStyle("Secondary"),
          new ButtonBuilder().setCustomId("prev").setLabel("이전 게임").setStyle("Secondary").setDisabled(page===0).setEmoji("⬅️"),
          new ButtonBuilder().setCustomId("next").setLabel("다음 게임").setStyle("Primary").setDisabled(page>=PAGES.length-1).setEmoji("➡️"),
          new ButtonBuilder().setCustomId("info").setLabel("설명").setStyle("Success").setEmoji("ℹ️")
        );

        const genreNav = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("genre").setLabel("게임 장르별 선택하기").setStyle("Secondary").setEmoji("🏷️")
        );

        const payload = {
          embeds: [chosenEmbed, mainEmbed],
          components: [
            new ActionRowBuilder().addComponents(select),
            nav,
            genreNav
          ],
          ephemeral: true
        };
        return u ? u.update(payload) : interaction.reply(payload);
      } else {
        // ---- 장르 모드 ----
        const sortedGenres = getSortedGenresByPopularity();
        const chosenGenreText = buildChosenGenreText(member);

        const chosenGenreEmbed = new EmbedBuilder()
          .setTitle("🏷️ 게임 태그 설정하기에서 선택한 게임 장르")
          .setDescription(chosenGenreText)
          .setColor(0x8e7fff);

        const genreEmbed = new EmbedBuilder()
          .setTitle("🧩 게임 장르 설정하기")
          .setColor(0x4aa3ff)
          .setFooter({ text: "최대 5개까지 선택 가능", iconURL: FOOTER_ICON_URL })
          .setDescription([
            "• 모든 게임, 신작 게임은 상단 고정",
            "• 그 외 장르는 **선택 수 인기 순** 정렬",
            "• 최소 선택 수 제한 없음 / **최대 5개**"
          ].join("\n"));

        const genreSelect = new StringSelectMenuBuilder()
          .setCustomId("genre_select")
          .setPlaceholder("장르를 선택하세요 (최대 5개)")
          .setMinValues(0)
          .setMaxValues(Math.min(5, sortedGenres.length))
          .addOptions(
            sortedGenres.map(g => {
              const role = interaction.guild.roles.cache.get(g.id);
              return {
                label: g.name,
                value: g.id,
                default: member.roles.cache.has(g.id),
                emoji: g.emoji || "🏷️",
                description: role ? `선택 ${role.members.size}명` : undefined
              };
            })
          );

        const payload = {
          embeds: [chosenEmbed, chosenGenreEmbed, genreEmbed], // 요청대로 상단 임베드 순서 표현
          components: [
            new ActionRowBuilder().addComponents(genreSelect),
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId("info").setLabel("설명").setStyle("Success").setEmoji("ℹ️")
            ),
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId("genre_back").setLabel("게임 목록으로").setStyle("Primary").setEmoji("↩️")
            )
          ],
          ephemeral: true
        };
        return u ? u.update(payload) : interaction.reply(payload);
      }
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

      // 장르 셀렉트 처리
      if (i.isStringSelectMenu() && i.customId === "genre_select") {
        const chosen = new Set(i.values); // 최대 5
        const allGenreRoleIds = GENRE_ROLES.map(g=>g.id);
        const current = member.roles.cache.filter(r=> allGenreRoleIds.includes(r.id));

        const toAdd = [...chosen].filter(id => !current.has(id));
        const toRemove = current.filter(r => !chosen.has(r.id)).map(r=>r.id);

        try{
          if (toAdd.length)    await member.roles.add(toAdd, "게임 장르 태그 추가");
          if (toRemove.length) await member.roles.remove(toRemove, "게임 장르 태그 제거");
          member = await interaction.guild.members.fetch(interaction.user.id);
          await render(i);
        }catch(e){
          await i.reply({content:"❌ 장르 역할 변경 중 오류가 발생했어요 (관리자에게 문의)",ephemeral:true});
        }
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
        if (i.customId === "genre") { genreMode = true; await render(i); return; }
        if (i.customId === "genre_back") { genreMode = false; await render(i); return; }

        if(i.customId==="prev"&&page>0){ page--; await render(i); }
        else if(i.customId==="next"&&page<PAGES.length-1){ page++; await render(i); }
        else if(i.customId==="info"){
          const infoEmbed = new EmbedBuilder()
            .setTitle("📌 게임 태그 안내")
            .setColor(0x2ecc71)
            .setDescription([
              "• 게임 목록은 **서버 인기 순** 정렬입니다.",
              "• **게임 태그는 최소 1개** 이상 장착해주세요.",
              "• 자유롭게 **@게임태그 멘션**을 활용하여 소통하세요! 🎮",
              "• 장르는 최대 **5개까지** 선택할 수 있어요."
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
