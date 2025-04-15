const { PrismaClient } = require('../app/generated/prisma');

const prisma = new PrismaClient();

// 商品タイプに応じたシンプルなSVGアイコンを生成する関数
const generateProductSvg = (type: string) => {
  let svgContent = '';
  const width = 100;
  const height = 100;
  const bgColor = '#e5e7eb'; // Light gray background
  const fgColor = '#4b5563'; // Dark gray foreground

  switch (type) {
    case 'smartphone':
      svgContent = `
        <rect width="${width}" height="${height}" fill="${bgColor}" rx="10" ry="10"/>
        <rect x="15" y="10" width="70" height="80" fill="${fgColor}" rx="5" ry="5"/>
        <circle cx="50" cy="90" r="3" fill="${bgColor}"/>
      `;
      break;
    case 'laptop':
      svgContent = `
        <rect width="${width}" height="${height}" fill="${bgColor}" rx="5" ry="5"/>
        <rect x="10" y="10" width="80" height="55" fill="${fgColor}" rx="3" ry="3"/>
        <rect x="5" y="70" width="90" height="25" fill="${fgColor}" rx="3" ry="3"/>
        <line x1="30" y1="75" x2="70" y2="75" stroke="${bgColor}" stroke-width="2"/>
        <line x1="30" y1="80" x2="70" y2="80" stroke="${bgColor}" stroke-width="2"/>
        <line x1="30" y1="85" x2="70" y2="85" stroke="${bgColor}" stroke-width="2"/>
      `;
      break;
    case 'earphones':
      svgContent = `
        <rect width="${width}" height="${height}" fill="${bgColor}" rx="5" ry="5"/>
        <circle cx="35" cy="50" r="15" fill="${fgColor}"/>
        <circle cx="65" cy="50" r="15" fill="${fgColor}"/>
        <path d="M35 65 Q50 80 65 65" stroke="${fgColor}" stroke-width="3" fill="none"/>
      `;
      break;
    case 'smartwatch':
      svgContent = `
        <rect width="${width}" height="${height}" fill="${bgColor}" rx="5" ry="5"/>
        <rect x="25" y="25" width="50" height="50" fill="${fgColor}" rx="8" ry="8"/>
        <rect x="30" y="10" width="40" height="15" fill="${fgColor}" rx="3" ry="3"/>
        <rect x="30" y="75" width="40" height="15" fill="${fgColor}" rx="3" ry="3"/>
        <line x1="50" y1="35" x2="50" y2="50" stroke="${bgColor}" stroke-width="2"/>
        <line x1="50" y1="50" x2="65" y2="50" stroke="${bgColor}" stroke-width="2"/>
      `;
      break;
    case 'speaker':
      svgContent = `
        <rect width="${width}" height="${height}" fill="${bgColor}" rx="10" ry="10"/>
        <circle cx="50" cy="50" r="30" fill="${fgColor}"/>
        <circle cx="50" cy="50" r="10" fill="${bgColor}"/>
        <circle cx="30" cy="30" r="3" fill="${bgColor}"/>
        <circle cx="70" cy="30" r="3" fill="${bgColor}"/>
      `;
      break;
    default:
      svgContent = `<rect width="${width}" height="${height}" fill="${bgColor}"/>`;
  }

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
};

async function main() {
  // ユーザーの作成
  const user1 = await prisma.user.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: 'テストユーザー1',
    },
  });

  const user2 = await prisma.user.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      name: 'テストユーザー2',
    },
  });

  console.log('Created users:', user1, user2);

  // 商品の作成 (imageUrl を商品タイプ別SVGデータURIに変更)
  const products = [
    {
      name: 'スマートフォン',
      description: '最新のスマートフォン。高性能カメラと大容量バッテリー搭載。',
      price: 80000,
      imageUrl: generateProductSvg('smartphone'),
      stock: 10,
    },
    {
      name: 'ノートパソコン',
      description: '軽量で持ち運びに便利なノートPC。作業効率アップ間違いなし。',
      price: 120000,
      imageUrl: generateProductSvg('laptop'),
      stock: 5,
    },
    {
      name: 'ワイヤレスイヤホン',
      description: 'ノイズキャンセリング機能付きの高音質ワイヤレスイヤホン。',
      price: 15000,
      imageUrl: generateProductSvg('earphones'),
      stock: 20,
    },
    {
      name: 'スマートウォッチ',
      description: '健康管理と通知機能を備えた多機能スマートウォッチ。',
      price: 25000,
      imageUrl: generateProductSvg('smartwatch'),
      stock: 8,
    },
    {
      name: 'Bluetoothスピーカー',
      description: '防水機能付きのポータブルBluetoothスピーカー。どこでも音楽を楽しめます。',
      price: 8000,
      imageUrl: generateProductSvg('speaker'),
      stock: 15,
    },
  ];

  // 既存の商品を削除 (冪等性を保つため)
  await prisma.product.deleteMany({});
  console.log('Deleted existing products');

  for (const product of products) {
    await prisma.product.create({
      data: product,
    });
  }

  console.log('Created products with product-specific SVG placeholders');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
