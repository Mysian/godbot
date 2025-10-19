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
  "소환사의 협곡": "https://media.discordapp.net/attachments/1429435030647607397/1429435435628761108/gFMpf7qOe9pdHzFgOtJ7PRywQiY5m7BDfJZoNpD9zP03jg2voZU88ZAY0PkUAebbF79vj7djAJTS-UbpzAt6QQ.png?ex=68f620fd&is=68f4cf7d&hm=a451243053991af2f2498b98494ca95ab7842cdc283693d09ff1b55027011cf9&=&format=webp&quality=lossless",
  "칼바람 나락": "https://media.discordapp.net/attachments/1429435030647607397/1429435614801035387/20220914064327.png?ex=68f62128&is=68f4cfa8&hm=f89ae3c22922abe39d5977f480edd98b149ecc04fd72b3b557eecb86611a18fd&=&format=webp&quality=lossless",
  "롤토체스": "https://media.discordapp.net/attachments/1429435030647607397/1429435803532005479/20212F112F032F1635887409095-Key_Art_Banner.png?ex=68f62155&is=68f4cfd5&hm=545b0a29d8f0ae3ab66edd69152dedaa6dabf669c2b8578362ec383cede6bbb4&=&format=webp&quality=lossless&width=550&height=309",
  "이벤트 모드[우르프,아레나,돌격전 등]": "https://media.discordapp.net/attachments/1429435030647607397/1429436077151752394/fE0YPfFsKAaTGc-DoT082p_roG434QtUoiyP5FlNfnGwQPHPhnHKPo-_oaAbM8c_MYNAMHFISmA2eLLFeK7Hzg.png?ex=68f62196&is=68f4d016&hm=8d4bb3836b8719f4ac84c6e92234b9fc8bd9bc942626f3535d8e479b429a4178&=&format=webp&quality=lossless",
  "스팀게임": "https://media.discordapp.net/attachments/1429435030647607397/1429436367959756871/steam-software-pc-master-race-wallpaper-preview.png?ex=68f621db&is=68f4d05b&hm=c404c2883b120709f3cbd1f04df5abf240ced65805377e37de514d4d0b7e5727&=&format=webp&quality=lossless",
  "DJ MAX": "https://media.discordapp.net/attachments/1429435030647607397/1429436647585353778/20170726180931_6645.png?ex=68f6221e&is=68f4d09e&hm=ae44557ce5e9aa185009f8a872c4bf1e73d8517ddb35b09ec501a665956f3c85&=&format=webp&quality=lossless&width=1482&height=782",
  "FC": "https://media.discordapp.net/attachments/1429435030647607397/1429436884680970240/desktop-wallpaper-fifa-19.png?ex=68f62256&is=68f4d0d6&hm=fb0d48fe433fc292f16bde8c773591f55888d28a5aff9b5c69c1a69c70181977&=&format=webp&quality=lossless",
  "GTA": "https://media.discordapp.net/attachments/1429435030647607397/1429437002314682531/Grand_Theft_Auto_V_GTA_5_Game_HD_Wallpaper_medium.png?ex=68f62273&is=68f4d0f3&hm=c3de9239701dd600ca0b01ab7b8bfeb96f1f810d951c8d2b29965db14c96f85a&=&format=webp&quality=lossless",
  "GTFO": "https://media.discordapp.net/attachments/1429435030647607397/1429437135542292612/capsule_616x353.png?ex=68f62292&is=68f4d112&hm=d912021d6ee908db2fbb239b93757a0a9c1f8696f376ca36166fa318b8b1676f&=&format=webp&quality=lossless",
  "TRPG": "https://media.discordapp.net/attachments/1429435030647607397/1429437318422466691/360_F_615946312_g0bFXcJLEsZEfD6pkxA1aof0fYPTbisA.png?ex=68f622be&is=68f4d13e&hm=fda4dfdd9d01b67532d6410ec705a288306955840b9f556b530ad13be066a4de&=&format=webp&quality=lossless",
  "건파이어 리본": "https://media.discordapp.net/attachments/1429435030647607397/1429437427101204572/ED8380EC9DB4ED8B80_EAB79CEAB2A9.png?ex=68f622d8&is=68f4d158&hm=f5b0b88213c6eeea8794a475dbe467589b2e28d3186d6b22ae0d46c7ce906965&=&format=webp&quality=lossless",
  "구스구스 덕": "https://media.discordapp.net/attachments/1429435030647607397/1429437526833365042/mbBFUrshAIo_XJnGOoU9POA3aF2r3fwSfV7ljxfY3kqzI4T9CBvHsQwK8jn9_DSCpnnWwAPrzuVJw6PM-6C-dw.png?ex=68f622f0&is=68f4d170&hm=14b1bf7c1c6ae6512923df1345ec85eb49bc7ad4f2ae3a585868709a0a874c94&=&format=webp&quality=lossless",
  "데드락": "https://media.discordapp.net/attachments/1429435030647607397/1429437684895711362/34206_81714_2451.png?ex=68f62315&is=68f4d195&hm=94d5fb2e7c0527bccd8d6c0d999e195a50ebe03c063cd7288d095b8c5dc390b9&=&format=webp&quality=lossless",
  "데바데": "https://media.discordapp.net/attachments/1429435030647607397/1429437807088111710/1pj94zx19y901.png?ex=68f62332&is=68f4d1b2&hm=001f1bfa2f8f7f3cd28f0c0b64fd5eab8a26ea63d23f7738821ba1908fd8dcb1&=&format=webp&quality=lossless",
  "델타포스": "https://media.discordapp.net/attachments/1429435030647607397/1429438004346228799/high-quality-delta-force-wallpapers-v0-gx528mh2z48e1.png?ex=68f62361&is=68f4d1e1&hm=bf1fe65cbfcc49059e4eb37237e2f8c2f95636dd30c0441eda53e9e8aab52da1&=&format=webp&quality=lossless&width=1389&height=782",
  "돈스타브": "https://media.discordapp.net/attachments/1429435030647607397/1429438095979446312/KJh5c0MX1H2t-V3T6xmIyarwTXvCd2X1HwPu8Mik9Ps.png?ex=68f62377&is=68f4d1f7&hm=3f817205587f749a1f2f5571dbdd4c2aa30a5cfd98548a32bb7bbac25358dd5d&=&format=webp&quality=lossless&width=1346&height=782",
  "래프트": "https://media.discordapp.net/attachments/1429435030647607397/1429438354545447054/raft-game-poster_bGZubmmUmZqaraWkpJRmbmdlrWZlbWU.png?ex=68f623b5&is=68f4d235&hm=ac2a5f408af84ece108922ea44e5f1dc3c788e1af041459cb3cc1ba988c0dda1&=&format=webp&quality=lossless&width=1390&height=782",
  "레인보우식스": "https://media.discordapp.net/attachments/1429435030647607397/1429438479070400613/gnhd9nzetuxy.png?ex=68f623d3&is=68f4d253&hm=10de9aedd3c13be87341de0dd9fd816db7579b8b1632c2e4611eb4aa44bf7f44&=&format=webp&quality=lossless&width=1390&height=782",
  "레포 REPO": "https://media.discordapp.net/attachments/1429435030647607397/1429438570476736512/R.png?ex=68f623e8&is=68f4d268&hm=a14af90b4c83495c7ab953fc7e0b90eadd932eb4594025823a53951fec6bb04c&=&format=webp&quality=lossless",
  "로스트아크": "https://media.discordapp.net/attachments/1429435030647607397/1429438672532672595/lost-ark-video-game-3840x2160-11989.png?ex=68f62401&is=68f4d281&hm=93f92532b539c1df35d4faf05bf745b124a134351363ed3cad9cae18c865ecd3&=&format=webp&quality=lossless&width=1390&height=782",
  "리썰컴퍼니": "https://media.discordapp.net/attachments/1429435030647607397/1429438861628539043/0c40a32d-1aca-4779-978a-4a757023ab44.png?ex=68f6242e&is=68f4d2ae&hm=7f56a3a3e04f6e8e894258692700b6eeac5200308efea593a88ddf117abfe281&=&format=webp&quality=lossless",
  "리스크 오브 레인": "https://media.discordapp.net/attachments/1429435030647607397/1429438989701480581/B65EB9E1D4948886C2BC1275C991F0BB610C2E37.png?ex=68f6244c&is=68f4d2cc&hm=115356141442ffaf28ad4a108d09561cc2d62b602651f86f54dda1455159c5dc&=&format=webp&quality=lossless&width=1390&height=782",
  "마블 라이벌즈": "https://media.discordapp.net/attachments/1429435030647607397/1429439172271407154/1_88cf22c2.png?ex=68f62478&is=68f4d2f8&hm=b851da479a5915a19c603132ad467c294b80e0afaa5ffb438c5bf25d511bc822&=&format=webp&quality=lossless",
  "마인크래프트": "https://media.discordapp.net/attachments/1429435030647607397/1429439315129270282/Minecraft-PS4-Wallpapers-16.png?ex=68f6249a&is=68f4d31a&hm=8926f986759a2b38b21419201961a1768e8a84d664259102212ec474c3e358d4&=&format=webp&quality=lossless&width=1390&height=782",
  "마피아42": "https://media.discordapp.net/attachments/1429435030647607397/1429439463888654396/R33OS_JvLBT6q5Qa5bQIZMF73PgkK4d1qP5pDl4CcW3dPA1JI9Y47_gLCMXM8cL8MMbTfVwFEsLLhg1OrJYy5w.png?ex=68f624bd&is=68f4d33d&hm=e3f00becda94ce1a57482cc5cdb14c76176fb78d1c79a3e96fc49eae0ca9ccbe&=&format=webp&quality=lossless",
  "메이플스토리": "https://media.discordapp.net/attachments/1429435030647607397/1429439628825596096/0f3550cc1a064ba78e29c5f68d9de007.png?ex=68f624e5&is=68f4d365&hm=bd6874020f2b22f732dc6aa35fe1ea5cb2fae68f26a262a941234af83e125455&=&format=webp&quality=lossless",
  "몬스터 헌터": "https://media.discordapp.net/attachments/1429435030647607397/1429440173682331668/thumb-1920-1041713.png?ex=68f62567&is=68f4d3e7&hm=24e5a46b1c3835f1ed3c1cb38e6f3b0b2dc9c45548ad1771590f641c0ab575c4&=&format=webp&quality=lossless&width=1389&height=782",
  "문명": "https://media.discordapp.net/attachments/1429435030647607397/1429440285032841256/35S_3x7NBOHQTO75sWe9tSI-L1Ded2LIIfdUFzi3v5A.png?ex=68f62581&is=68f4d401&hm=07476956f8859f700a69ed22ef5b49c81746c220552361c1c56658403f0d0a32&=&format=webp&quality=lossless&width=1390&height=782",
  "발로란트": "https://media.discordapp.net/attachments/1429435030647607397/1429440413751840859/Valorant-Wallpaper-Boys-Dark-Display.png?ex=68f625a0&is=68f4d420&hm=b75cb07385f86b5d4770f6f124258d7fb7c72d1b42ba0ce5346e1758804bc895&=&format=webp&quality=lossless",
  "배틀그라운드": "https://media.discordapp.net/attachments/1429435030647607397/1429440548443521044/pubg-4k-m7d01u319yw5wo0m.png?ex=68f625c0&is=68f4d440&hm=1368e641f69696ea334c8822b8179e76820cf1a73c5a2659bc3d8136b673df8a&=&format=webp&quality=lossless&width=1390&height=782",
  "배틀필드": "https://media.discordapp.net/attachments/1429435030647607397/1429440766777753610/dk7o37s-40bc1e09-2fdb-4d31-b2e4-cec3733fd211.png?ex=68f625f4&is=68f4d474&hm=1c9ca74bbde0795002ae14743ef371f0a4182ff69a04afc18609a145bfb2b2c8&=&format=webp&quality=lossless&width=1390&height=782",
  "백룸": "https://media.discordapp.net/attachments/1429435030647607397/1429440960470978570/the-backrooms-8hmdrwfhzhbpebgv.png?ex=68f62622&is=68f4d4a2&hm=9f2f21906ca0736d8e7e4766761f20c683fd3e83c05ebbdc0ddb7ed1bae56271&=&format=webp&quality=lossless&width=1390&height=782",
  "백 포 블러드": "https://media.discordapp.net/attachments/1429435030647607397/1429441072047587349/the-battle-against-the-ridden-back-4-blood-gameplay-0ce8dyxkom86p1xt.png?ex=68f6263d&is=68f4d4bd&hm=d2173b912ee7ee279ac868ac4d282c9dd265c36f12cf68709701f87390f81f3a&=&format=webp&quality=lossless&width=1390&height=782",
  "비세라 클린업": "https://media.discordapp.net/attachments/1429435030647607397/1429441222002479134/3bc12a164f98f3ab35b47e92e0abc59852e9aa4c.png?ex=68f62661&is=68f4d4e1&hm=b746fc7ae8da7a4340de30e80ca21d69a7e22ec958f7c28e60339dad311c38cc&=&format=webp&quality=lossless&width=1390&height=782",
  "서든어택": "https://media.discordapp.net/attachments/1429435030647607397/1429441424042102794/74926_68157_221.png?ex=68f62691&is=68f4d511&hm=bc5d4e5489568c6b15e75b8a2e5f6b2f99c518528fce4682c7fd249cd9f21996&=&format=webp&quality=lossless",
  "선 헤이븐": "https://media.discordapp.net/attachments/1429435030647607397/1429441514257252392/header.png?ex=68f626a6&is=68f4d526&hm=4a1d03714e8272e203f93d0b6ea7d8a2d34f5e8d602de48e113cbdb09d7eb2d2&=&format=webp&quality=lossless",
  "스컬": "https://media.discordapp.net/attachments/1429435030647607397/1429441677860405379/L0r2jKDBRZCsesjXX8x4GeNqAdm-lq1Dl6WSInbClGvzm2lehhGzXIrGRKcYWxb8C575WbKKxwbH0Mz1I5_vqw.png?ex=68f626cd&is=68f4d54d&hm=d88a96620b9568eb26124357585b3a64eff83fac5e9a0c33731e4ff983664871&=&format=webp&quality=lossless",
  "스타듀밸리": "https://media.discordapp.net/attachments/1429435030647607397/1429441767530303508/46bf2cd2412c34e4da75cfc398904f7a.png?ex=68f626e3&is=68f4d563&hm=8aea94783336f2898a2f1820f8e1750490e5a07798b2d54d85c94032e0fc9b02&=&format=webp&quality=lossless",
  "스타크래프트": "https://media.discordapp.net/attachments/1429435030647607397/1429441906156503161/starcraft-ii-campaign-collection-section1-feature1.png?ex=68f62704&is=68f4d584&hm=5580fc7d358220efc7030fc19881d189d2ced381770510200d9d5ffab485a91f&=&format=webp&quality=lossless",
  "에이펙스": "https://media.discordapp.net/attachments/1429435030647607397/1429442112956534805/17752_37000_596.png?ex=68f62735&is=68f4d5b5&hm=940b2b0ab3ebf3797a11869caec4aae0f05157b5799bd93bd2dd497786347077&=&format=webp&quality=lossless",
  "엘소드": "https://media.discordapp.net/attachments/1429435030647607397/1429442222096384150/EC9798EC868CEB939C10.png?ex=68f6274f&is=68f4d5cf&hm=c931175f4afa33f1ff6434ea004cd905565b6d86ca834eff6f6bcb4333cb9635&=&format=webp&quality=lossless&width=550&height=309",
  "오버워치": "https://media.discordapp.net/attachments/1429435030647607397/1429442355102089307/6L5ADHXMMTXD1613676344761.png?ex=68f6276f&is=68f4d5ef&hm=b020eb83a3f6f75ccceceb2d732be8dfca0c4c038b770748a90dc0b0d9c0b7bb&=&format=webp&quality=lossless",
  "워프레임": "https://media.discordapp.net/attachments/1429435030647607397/1429442510144671764/every-playable-warframe_myuj.png?ex=68f62794&is=68f4d614&hm=b228c461b3e24182dfe2dd7a37a9ff47337497863097dae0bd396a96d91af5f1&=&format=webp&quality=lossless&width=1390&height=782",
  "원신": "https://media.discordapp.net/attachments/1429435030647607397/1429442806966915082/ecn20240527000049.png?ex=68f627da&is=68f4d65a&hm=fa5e40c671c04a2dd5d9300fa7f80c9375e83cf9ffc16bbcf078712bd11f9dfd&=&format=webp&quality=lossless",
  "원스 휴먼": "https://media.discordapp.net/attachments/1429435030647607397/1429443046373589063/i1938800944.png?ex=68f62814&is=68f4d694&hm=3ca849b37b062a27fbe2465cdeda91c056731907a70d7d2bf53a963471a6fc55&=&format=webp&quality=lossless",
  "이터널 리턴": "https://media.discordapp.net/attachments/1429435030647607397/1429443232160550984/VpomTjQb9rmxtEn7-T0XFmvuTiGyCj3sKqbwP90omyP4f3Ur3eMNUk1gX90f_OQlL4RZDlOgVjHu2U7NXNWg_w.png?ex=68f62840&is=68f4d6c0&hm=34b4f36b680c1951f06eb4f0672595179246f084952e948e8ffa3ec720c37e2a&=&format=webp&quality=lossless",
  "좀보이드": "https://media.discordapp.net/attachments/1429435030647607397/1429443422565040230/capsule_616x353.png?ex=68f6286d&is=68f4d6ed&hm=52d4bd999d1d941dff02ac591fafcb3b228799d6e072df40a30200667e230b7d&=&format=webp&quality=lossless",
  "카운터스트라이크": "https://media.discordapp.net/attachments/1429435030647607397/1429443865470963722/ffa51a7d13a76.png?ex=68f628d7&is=68f4d757&hm=838cee91ceb20c66a89d9cd34ca96c03ebb43b41caf2353619269064424c6a00&=&format=webp&quality=lossless",
  "코어 키퍼": "https://media.discordapp.net/attachments/1429435030647607397/1429443947574460579/capsule_616x353.png?ex=68f628ea&is=68f4d76a&hm=db40d49d73652d17587bef742c4a148139f2e908188b4bfca4c291b8f265b64c&=&format=webp&quality=lossless",
  "콜오브듀티": "https://media.discordapp.net/attachments/1429435030647607397/1429444057414762506/i15146719124.png?ex=68f62905&is=68f4d785&hm=fb872966c6f8f5d6ce2a221c19473bfa49e3a3f6410142233f81afa93f40027f&=&format=webp&quality=lossless&width=550&height=310",
  "테라리아": "https://media.discordapp.net/attachments/1429435030647607397/1429444161014202428/action-adventure-exploration-fantasy-wallpaper-preview.png?ex=68f6291d&is=68f4d79d&hm=315177b7cba0b9c44e625b28ed693613286b3ad036b1c5ad3279965f60c2a4b9&=&format=webp&quality=lossless",
  "테이블 탑 시뮬레이터": "https://media.discordapp.net/attachments/1429435030647607397/1429444297924542555/ss_203970c1dd0b8985f9f5c59767517bb7144fb6e9.png?ex=68f6293e&is=68f4d7be&hm=b1d65f93d0e0e9483dbaccd44aa324ce7fef59ba0328d80cf4ce7c31a70ea95f&=&format=webp&quality=lossless&width=1390&height=782",
  "테일즈런너": "https://media.discordapp.net/attachments/1429435030647607397/1429444419945369711/tr_visual.png?ex=68f6295b&is=68f4d7db&hm=9055c82600fa88773ac1eabcb010c8ae0e132ec0a247487ce96a7229d3983ee4&=&format=webp&quality=lossless&width=1653&height=782",
  "파스모포비아": "https://media.discordapp.net/attachments/1429435030647607397/1429444670013964349/wp7775348.png?ex=68f62997&is=68f4d817&hm=523e4ffea6bb97948ed8d97208a40a37854401941e48da0974831a30e106b2eb&=&format=webp&quality=lossless&width=1390&height=782",
  "파워워시 시뮬레이터": "https://media.discordapp.net/attachments/1429435030647607397/1429444759792910499/050db8610fa9593b531cd2b7d563b5115bbe5431ea3db42962da435f70edb39c.png?ex=68f629ac&is=68f4d82c&hm=7a8d09c5ab391fbb2b2db274c0de9edfcec881aa8f53f9f599101324a8c91e30&=&format=webp&quality=lossless",
  "파티 애니멀즈": "https://media.discordapp.net/attachments/1429435030647607397/1429444924905885816/download.png?ex=68f629d3&is=68f4d853&hm=647408e2268f0ddb11c271043997e4e76a95fbdf7001d8a45eae532800c54927&=&format=webp&quality=lossless&width=550&height=309",
  "팰월드": "https://media.discordapp.net/attachments/1429435030647607397/1429444999912755280/UPX5478k5eOc0I22TRgcFWhlu6Sp1Nw-V4SkaIECQoCowybAC9zbTJhb-epG1oP2VL8MutNT14oDXkWyiFA7pA.png?ex=68f629e5&is=68f4d865&hm=316b7d5675dca21a6373ba1d572ac5be679f685479860a90815650fa4f0f70fd&=&format=webp&quality=lossless",
  "페긴": "https://media.discordapp.net/attachments/1429435030647607397/1429445103335899207/15106a3d-5965-4e97-8abe-21840bfd3797_base_resized.png?ex=68f629fe&is=68f4d87e&hm=c5e96275d6d1ac0975d36ab796194ebd8263116dc5a5400d635aed4d6d7f9151&=&format=webp&quality=lossless",
  "프래그 펑크": "https://media.discordapp.net/attachments/1429435030647607397/1429445181580513420/i1753499517.png?ex=68f62a11&is=68f4d891&hm=8e149fabefc2526a66e1d540c2377bb63d50a0a19c028f6501bbf8e64e6ee676&=&format=webp&quality=lossless",
  "휴먼폴플랫": "https://media.discordapp.net/attachments/1429435030647607397/1429445259267407882/hero_1.png?ex=68f62a23&is=68f4d8a3&hm=07fc606a928c1f0ab280dd0b076d2b2a19fde4f8dd3da6126e9d91044baffec6&=&format=webp&quality=lossless",
  "헬다이버즈": "https://media.discordapp.net/attachments/1429435030647607397/1429445472644239452/b00d1c5f8e72940ef4f23ee0a78ae6da.png?ex=68f62a56&is=68f4d8d6&hm=bc722e0a262c0a62507c33bbeb8963c828724129013a6b0f8e371423b8e92e64&=&format=webp&quality=lossless",
  "히오스": "https://media.discordapp.net/attachments/1429435030647607397/1429445547521212496/game_features_1.png?ex=68f62a68&is=68f4d8e8&hm=9772d16afb759ee4501170284f3eb6a106f78dbde53832f585df9b6fc94cd58e&=&format=webp&quality=lossless&width=1390&height=782"
};
const DEFAULT_BANNER = "https://media.discordapp.net/attachments/1388728993787940914/1389192042143551548/image.png?ex=68f60fe8&is=68f4be68&hm=c4682adfda5c83bd89672252b69e20109776eb204c0fde487b6a1dbf2a980d7c&=&format=webp&quality=lossless";

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

const session = new Map();

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
      new ButtonBuilder().setCustomId(`${CID_PARTICIPATE}:${messageId}`).setStyle(ButtonStyle.Primary).setLabel("참여하고 싶어요").setEmoji("🙋").setDisabled(disabled),
      new ButtonBuilder().setCustomId(`${CID_JOINVOICE}:${messageId}`).setStyle(ButtonStyle.Success).setLabel("해당 음성채널 참여하기").setEmoji("🎙️").setDisabled(disabled)
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
async function dmRecruiterAboutParticipant(client, recruiterId, guild, participant) {
  try {
    const user = await client.users.fetch(recruiterId).catch(() => null);
    if (!user) return;
    const m = await guild.members.fetch(participant.id).catch(() => null);
    const embed = new EmbedBuilder()
      .setTitle("🙋 새 참여 의사 알림")
      .setDescription(`<@${participant.id}> 님이 모집글에 참여 의사를 밝혔어요.`)
      .addFields(
        { name: "유저", value: `<@${participant.id}> (${participant.username}#${participant.discriminator || "0000"})`, inline: false },
        { name: "유저 ID", value: participant.id, inline: true },
        { name: "계정 생성일", value: `<t:${Math.floor(participant.createdTimestamp / 1000)}:D>`, inline: true },
        ...(m ? [
          { name: "서버 닉네임", value: m.displayName, inline: true },
          { name: "서버 합류일", value: `<t:${Math.floor(m.joinedTimestamp / 1000)}:D>`, inline: true },
        ] : [])
      )
      .setColor(0x57c3ff)
      .setTimestamp();
    await user.send({ embeds: [embed] }).catch(() => {});
  } catch {}
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
              const tiCount = new TextInputBuilder().setCustomId("count").setLabel("모집 인원수 (본인은 제외하고 1~9명까지 가능)").setStyle(TextInputStyle.Short).setRequired(true);
              const tiHours = new TextInputBuilder().setCustomId("hours").setLabel("마감까지 유지 시간(시간, 1~24)").setStyle(TextInputStyle.Short).setRequired(true);
              const tiVoice = new TextInputBuilder().setCustomId("voice").setLabel("음성 채널(예: 101호 또는 채널ID)").setPlaceholder("예: 101호 또는 1222085152600096778").setStyle(TextInputStyle.Short).setRequired(false);
              contentModal.addComponents(
                new ActionRowBuilder().addComponents(tiContent),
                new ActionRowBuilder().addComponents(tiCount),
                new ActionRowBuilder().addComponents(tiHours),
                new ActionRowBuilder().addComponents(tiVoice)
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

              if (recruiterId) await dmRecruiterAboutParticipant(client, recruiterId, i.guild, i.user);

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
            const voiceIdCandidate = normalizeVoiceInput(voiceRaw);

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
            if (voiceIdCandidate) fields.splice(1, 0, { name: "음성 채널", value: `<#${voiceIdCandidate}>`, inline: true });
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
            await i.reply({ content: "✅ 모집 글을 게시했어요!", ephemeral: true });
          } catch {
            try { await i.reply({ content: "❌ 모집 글 작성 중 오류가 발생했어요.", ephemeral: true }); } catch {}
          }
          return;
        }

        if (i.isModalSubmit() && i.customId === CID_EDIT_MODAL) {
          try {
            const msgId = i.fields.getTextInputValue("msgid").trim();
            const newContent = (i.fields.getTextInputValue("content") || "").trim();
            const newCountRaw = (i.fields.getTextInputValue("count") || "").trim();
            const ch = await i.guild.channels.fetch(모집채널ID).catch(() => null);
            if (!ch?.isTextBased()) { await i.reply({ content: "❌ 모집 채널을 찾을 수 없어요.", ephemeral: true }); return; }
            const msg = await ch.messages.fetch(msgId).catch(() => null);
            if (!msg || !msg.embeds?.[0]) { await i.reply({ content: "❌ 모집글을 찾을 수 없어요.", ephemeral: true }); return; }
            const embed = EmbedBuilder.from(msg.embeds[0]);
            const recruiterId = getField(embed, "모집자")?.value?.replace(/[<@>]/g, "");
            const isOwner = recruiterId && recruiterId === i.user.id;
            if (!(isOwner || isAdminOrOwner(i))) { await i.reply({ content: "❌ 수정 권한이 없어요.", ephemeral: true }); return; }
            if (newContent) embed.setDescription(newContent);
            if (newCountRaw) {
              const n = parseInt(newCountRaw, 10);
              if (Number.isInteger(n) && n >= 1 && n <= 9) setField(embed, "모집 인원", `${n}명`, true);
            }
            await msg.edit({ embeds: [embed] });
            await i.reply({ content: "✅ 모집 글을 수정했어요!", ephemeral: true });
          } catch {
            try { await i.reply({ content: "❌ 수정 중 오류가 발생했어요.", ephemeral: true }); } catch {}
          }
          return;
        }

        if (i.isModalSubmit() && i.customId === CID_DELETE_MODAL) {
          try {
            const msgId = i.fields.getTextInputValue("msgid").trim();
            const ch = await i.guild.channels.fetch(모집채널ID).catch(() => null);
            if (!ch?.isTextBased()) { await i.reply({ content: "❌ 모집 채널을 찾을 수 없어요.", ephemeral: true }); return; }
            const msg = await ch.messages.fetch(msgId).catch(() => null);
            if (!msg || !msg.embeds?.[0]) { await i.reply({ content: "❌ 모집글을 찾을 수 없어요.", ephemeral: true }); return; }
            const embed = EmbedBuilder.from(msg.embeds[0]);
            const recruiterId = getField(embed, "모집자")?.value?.replace(/[<@>]/g, "");
            const isOwner = recruiterId && recruiterId === i.user.id;
            if (!(isOwner || isAdminOrOwner(i))) { await i.reply({ content: "❌ 삭제 권한이 없어요.", ephemeral: true }); return; }
            await msg.delete().catch(() => {});
            await i.reply({ content: "🗑️ 모집 글을 삭제했어요!", ephemeral: true });
          } catch {
            try { await i.reply({ content: "❌ 삭제 중 오류가 발생했어요.", ephemeral: true }); } catch {}
          }
          return;
        }
      } catch {}
    });
  },
};
