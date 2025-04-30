const { PrismaClient } = require('../app/generated/prisma');

const prisma = new PrismaClient();

// Manually segmented and summarized data from Wikipedia
const wikiData = [
  // From: https://ja.wikipedia.org/wiki/%E5%90%8D%E6%8E%A2%E5%81%B5%E3%82%B3%E3%83%8A%E3%83%B3
  {
    title: '名探偵コナン - 概要',
    sourceUrl: 'https://ja.wikipedia.org/wiki/%E5%90%8D%E6%8E%A2%E5%81%B5%E3%82%B3%E3%83%8A%E3%83%B3',
    content: `『名探偵コナン』（めいたんていコナン、英: Detective Conan / Case Closed）は、青山剛昌による日本の推理漫画作品。『週刊少年サンデー』（小学館）にて1994年5号より連載されている。高校生探偵・工藤新一は、謎の組織の取引現場を目撃した際に口封じのために毒薬を飲まされ、小学1年生の姿にされてしまう。彼は正体を隠して「江戸川コナン」と名乗り、数々の難事件を解決しながら組織の行方を追う。`,
  },
  {
    title: '名探偵コナン - あらすじの構成',
    sourceUrl: 'https://ja.wikipedia.org/wiki/%E5%90%8D%E6%8E%A2%E5%81%B5%E3%82%B3%E3%83%8A%E3%83%B3',
    content: `物語は、黒ずくめの組織に関連する核心的な出来事を軸に、いくつかの「編」に分けられることがある。ジン・ウォッカ編（初期）、ベルモット編、キール編、バーボン編、ラム編などが主な区分として挙げられる。各編では、組織の新たなメンバーが登場したり、潜入捜査官の正体が示唆されたりするなど、物語の核心に迫る展開が見られる。`,
  },
  {
    title: '名探偵コナン - 登場人物 (主要)',
    sourceUrl: 'https://ja.wikipedia.org/wiki/%E5%90%8D%E6%8E%A2%E5%81%B5%E3%82%B3%E3%83%8A%E3%83%B3',
    content: `主要人物には、体が小さくなった高校生探偵・江戸川コナン（工藤新一）、彼の幼馴染で空手の達人・毛利蘭、蘭の父親で探偵（コナンの活躍で有名になる）・毛利小五郎がいる。コナンの正体を知る隣人の発明家・阿笠博士や、同じく薬で幼児化した元組織の科学者・灰原哀（宮野志保）も重要な役割を担う。`,
  },
    {
    title: '名探偵コナン - 登場人物 (関係者)',
    sourceUrl: 'https://ja.wikipedia.org/wiki/%E5%90%8D%E6%8E%A2%E5%81%B5%E3%82%B3%E3%83%8A%E3%83%B3',
    content: `コナンの同級生で結成された少年探偵団（吉田歩美、円谷光彦、小嶋元太）、新一や蘭の同級生である鈴木園子、大阪の高校生探偵・服部平次とその幼馴染・遠山和葉、警視庁の目暮警部、佐藤刑事、高木刑事なども頻繁に登場し、事件解決に協力したり、日常の物語を彩る。`,
  },
  {
    title: '名探偵コナン - 黒ずくめの組織',
    sourceUrl: 'https://ja.wikipedia.org/wiki/%E5%90%8D%E6%8E%A2%E5%81%B5%E3%82%B3%E3%83%8A%E3%83%B3',
    content: `工藤新一に毒薬アポトキシン4869を飲ませた張本人たちが所属する国際的な犯罪組織。構成員は酒の名前をコードネームとして持つ（例: ジン、ウォッカ、ベルモット、バーボン、キール、ラム）。組織の真の目的や規模、ボスである「あの方」の正体は物語最大の謎とされている。FBIやCIA、日本の公安警察などが組織の実態を追っている。`,
  },
  {
    title: '名探偵コナン - 阿笠博士の発明品',
    sourceUrl: 'https://ja.wikipedia.org/wiki/%E5%90%8D%E6%8E%A2%E5%81%B5%E3%82%B3%E3%83%8A%E3%83%B3',
    content: `体が小さくなったコナンのために、阿笠博士が様々な探偵アイテムを開発している。主なものに、犯人を眠らせる「腕時計型麻酔銃」、声色を変える「蝶ネクタイ型変声機」、キック力を増強する「キック力増強シューズ」、伸縮する「伸縮サスペンダー」、太陽光で充電し高速移動できる「ターボエンジン付きスケートボード」、犯人を追跡する「犯人追跡メガネ」などがある。`,
  },
  // From: https://ja.wikipedia.org/wiki/%E5%90%8D%E6%8E%A2%E5%81%B5%E3%82%B3%E3%83%8A%E3%83%B3%E3%81%AE%E6%BC%AB%E7%94%BB%E3%82%A8%E3%83%94%E3%82%BD%E3%83%BC%E3%83%89%E4%B8%80%E8%A6%A7
  {
    title: 'エピソード: ジェットコースター殺人事件 (FILE.1)',
    sourceUrl: 'https://ja.wikipedia.org/wiki/%E5%90%8D%E6%8E%A2%E5%81%B5%E3%82%B3%E3%83%8A%E3%83%B3%E3%81%AE%E6%BC%AB%E7%94%BB%E3%82%A8%E3%83%94%E3%82%BD%E3%83%BC%E3%83%89%E4%B8%80%E8%A6%A7',
    content: `幼馴染の毛利蘭と遊園地に遊びに行った工藤新一は、ジェットコースターで起こった惨殺事件を解決する。しかし、その帰り道に怪しげな黒ずくめの男たちの取引現場を目撃。背後から別の仲間に襲われ、開発中の毒薬アポトキシン4869を飲まされてしまう。`,
  },
  {
    title: 'エピソード: 社長令嬢誘拐事件 (FILE.2-5)',
    sourceUrl: 'https://ja.wikipedia.org/wiki/%E5%90%8D%E6%8E%A2%E5%81%B5%E3%82%B3%E3%83%8A%E3%83%B3%E3%81%AE%E6%BC%AB%E7%94%BB%E3%82%A8%E3%83%94%E3%82%BD%E3%83%BC%E3%83%89%E4%B8%80%E8%A6%A7',
    content: `薬の効果で小学1年生の姿になってしまった新一は、隣人の阿笠博士に助けを求める。蘭に正体を聞かれた際、とっさに江戸川コナンと名乗る。博士の提案で、探偵である蘭の父・毛利小五郎の家に居候することに。早速、会社社長の娘が誘拐される事件が発生し、コナンは小五郎に代わって推理を進める。`,
  },
  {
    title: 'エピソード: アイドル密室殺人事件 (FILE.6-9)',
    sourceUrl: 'https://ja.wikipedia.org/wiki/%E5%90%8D%E6%8E%A2%E5%81%B5%E3%82%B3%E3%83%8A%E3%83%B3%E3%81%AE%E6%BC%AB%E7%94%BB%E3%82%A8%E3%83%94%E3%82%BD%E3%83%BC%E3%83%89%E4%B8%80%E8%A6%A7',
    content: `人気アイドル沖野ヨーコの依頼で、彼女のマンションを訪れた小五郎、蘭、コナン。しかし、部屋の中ではヨーコの元交際相手が殺害されていた。密室状況での殺人事件の謎を、コナンは阿笠博士の発明品「蝶ネクタイ型変声機」を初めて使い、小五郎の声を借りて解き明かす。「眠りの小五郎」誕生の瞬間である。`,
  },
  {
    title: 'エピソード: 奇妙な人捜し殺人事件 (FILE.13-16)',
    sourceUrl: 'https://ja.wikipedia.org/wiki/%E5%90%8D%E6%8E%A2%E5%81%B5%E3%82%B3%E3%83%8A%E3%83%B3%E3%81%AE%E6%BC%AB%E7%94%BB%E3%82%A8%E3%83%94%E3%82%BD%E3%83%BC%E3%83%89%E4%B8%80%E8%A6%A7',
    content: `10億円強盗事件の犯人を追うコナンは、広田雅美と名乗る女性と出会う。彼女は黒ずくめの組織の末端構成員であり、妹を組織から抜けさせるために強盗計画に加担していた。しかし、任務完了後にジンとウォッカによって口封じのために殺害されてしまう。彼女の妹こそ、後に灰原哀としてコナンの前に現れる宮野志保（シェリー）だった。`,
  },
];

async function main() {
  console.log(`Start seeding with ${wikiData.length} documents...`);

  // Clear existing documents first
  await prisma.document.deleteMany();
  console.log('Deleted existing documents.');

  for (const doc of wikiData) {
    try {
      const document = await prisma.document.create({
        data: doc,
      });
      console.log(`Created document: "${document.title}" (ID: ${document.id})`);
    } catch (error) {
      console.error(`Failed to create document "${doc.title}":`, error);
    }
  }
  console.log(`Seeding finished.`);
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
