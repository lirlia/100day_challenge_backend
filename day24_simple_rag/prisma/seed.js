const { PrismaClient } = require('../app/generated/prisma');

const prisma = new PrismaClient();

// NOTE: In a real scenario, you might fetch this data dynamically or from files.
// Here, we use truncated versions for simplicity.
const wikiData = [
  {
    title: '名探偵コナン (Wikipedia)',
    sourceUrl: 'https://ja.wikipedia.org/wiki/%E5%90%8D%E6%8E%A2%E5%81%B5%E3%82%B3%E3%83%8A%E3%83%B3',
    content: `『名探偵コナン』（めいたんていコナン、英: Detective Conan / Case Closed）は、青山剛昌による日本の推理漫画作品。『週刊少年サンデー』（小学館）にて1994年5号より連載されている。
概要: 高校生探偵・工藤新一は、謎の組織の取引現場を目撃した際に口封じのために毒薬を飲まされ、小学1年生の姿にされてしまう。彼は正体を隠して「江戸川コナン」と名乗り、数々の難事件を解決しながら組織の行方を追う。
あらすじ: 物語はいくつかの「編」に分かれている。ジン・ウォッカ編、ベルモット編、キール編、バーボン編、ラム編など。
登場人物: 主要人物には江戸川コナン（工藤新一）、毛利蘭、毛利小五郎など。少年探偵団、帝丹高校関係者、大阪の服部平次・遠山和葉、警視庁の刑事たち、FBIやCIAなどの捜査官、そして黒ずくめの組織のメンバーが複雑に関わり合う。
黒ずくめの組織: コナンが追う謎の犯罪組織。構成員のコードネームは酒の名前。目的や全貌は不明。
道具: 阿笠博士が開発した探偵グッズ（腕時計型麻酔銃、蝶ネクタイ型変声機、ターボエンジン付きスケートボードなど）を駆使して事件を解決する。`,
  },
  {
    title: '名探偵コナンの漫画エピソード一覧 (Wikipedia)',
    sourceUrl: 'https://ja.wikipedia.org/wiki/%E5%90%8D%E6%8E%A2%E5%81%B5%E3%82%B3%E3%83%8A%E3%83%B3%E3%81%AE%E6%BC%AB%E7%94%BB%E3%82%A8%E3%83%94%E3%82%BD%E3%83%BC%E3%83%89%E4%B8%80%E8%A6%A7',
    content: `名探偵コナンの漫画エピソード一覧（めいたんていコナンのまんがエピソードいちらん）では、青山剛昌の漫画『名探偵コナン』において、『週刊少年サンデー』に掲載された全ての事件の話数をまとめたものである。
掲載形式: 基本的に「FILE.○」の形式で話数がカウントされる。数話で一つの事件（シリーズ）が構成されることが多い。
単行本: 小学館から少年サンデーコミックスとして刊行されている。2024年時点で100巻を超えている。
主な長編・重要エピソード: 黒ずくめの組織との接触、主要キャラクターの過去や関係性が明かされるエピソードなどが存在する。
(例) ジェットコースター殺人事件 (FILE.1): 工藤新一がコナンになるきっかけの事件。
(例) 奇妙な人捜し殺人事件 (FILE.13-16): 宮野明美 (灰原哀の姉) が登場し、組織に関わる事件。
(例) 黒の組織との再会 (FILE.238-242): 灰原哀が組織と直接対峙する。
(例) 満月の夜の二元ミステリー (FILE.429-434): ベルモット編のクライマックスの一つ。
(例) 赤と黒のクラッシュ (FILE.595-609): FBIと黒の組織の対決、キール編の中心。
(例) 緋色シリーズ (FILE.891-898): バーボン (安室透) の正体などに関わる重要エピソード。
この一覧はネタバレを含む可能性があるため注意が必要。`,
  },
];

async function main() {
  console.log(`Start seeding ...`);

  // Clear existing documents first
  await prisma.document.deleteMany();
  console.log('Deleted existing documents.');

  for (const doc of wikiData) {
    const document = await prisma.document.create({
      data: doc,
    });
    console.log(`Created document with id: ${document.id}`);
  }
  console.log(`Seeding finished.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
