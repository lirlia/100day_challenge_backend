const { PrismaClient } = require('../app/generated/prisma');

const prisma = new PrismaClient();

// 約50種類のデバイスタイプに対応するSVGアイコンを生成
const generateProductSvg = (type: string, index: number) => {
  let svgContent = '';
  const width = 100;
  const height = 100;
  const bgColor = `hsl(220, 15%, ${85 + (index % 10)}%)`;
  const fgColor = `hsl(220, 15%, ${35 + (index % 10)}%)`;
  const accentColor = `hsl(${(index * 15) % 360}, 60%, 60%)`;
  const accentColor2 = `hsl(${(index * 15 + 180) % 360}, 50%, 50%)`;

  svgContent += `<rect width="${width}" height="${height}" fill="${bgColor}" rx="10" ry="10"/>`;

  // --- SVG Generation Logic for ~50 Device Types ---
  // (This will be extensive, adding cases for each type)
  // Example cases (add many more):
  switch (type) {
    // --- Smartphones ---
    case 'smartphone_standard':
    case 'smartphone_pro':
    case 'smartphone_mini':
      const phoneWidth = type === 'smartphone_mini' ? 55 : (type === 'smartphone_pro' ? 65 : 60);
      const phoneHeight = type === 'smartphone_mini' ? 75 : (type === 'smartphone_pro' ? 85 : 80);
      svgContent += `
        <rect x="${(width - phoneWidth) / 2}" y="${(height - phoneHeight) / 2}" width="${phoneWidth}" height="${phoneHeight}" fill="${fgColor}" rx="8" ry="8"/>
        <rect x="${(width - phoneWidth) / 2 + 5}" y="${(height - phoneHeight) / 2 + 5}" width="${phoneWidth - 10}" height="${phoneHeight - 20}" fill="${bgColor}" rx="3" ry="3"/>
        <circle cx="50" cy="${(height + phoneHeight) / 2 - 8}" r="${type === 'smartphone_pro' ? 4 : 3}" fill="${accentColor}"/>
        ${type === 'smartphone_pro' ? `<circle cx="${(width - phoneWidth) / 2 + 10}" cy="${(height - phoneHeight) / 2 + 10}" r="2" fill="${accentColor2}"/><circle cx="${(width - phoneWidth) / 2 + 18}" cy="${(height - phoneHeight) / 2 + 10}" r="2" fill="${accentColor2}"/>` : ''}
      `;
      break;

    // --- Laptops ---
    case 'laptop_business': // Standard Clamshell
      svgContent += `
            <rect x="10" y="10" width="80" height="55" fill="${fgColor}" rx="3" ry="3"/>
            <rect x="12" y="12" width="76" height="51" fill="${bgColor}" rx="1" ry="1"/>
            <rect x="5" y="67" width="90" height="28" fill="${fgColor}" rx="3" ry="3"/>
            <rect x="15" y="72" width="70" height="15" fill="${bgColor}" rx="2" ry="2"/>
            <line x1="5" y1="67" x2="95" y2="67" stroke="${accentColor}" stroke-width="3"/>
          `;
      break;
    case 'laptop_ultrabook': // Thin & Light
       svgContent += `
            <rect x="5" y="15" width="90" height="60" fill="${fgColor}" rx="2" ry="2"/>
            <rect x="7" y="17" width="86" height="56" fill="${bgColor}" rx="1" ry="1"/>
            <rect x="2" y="77" width="96" height="10" fill="${fgColor}" rx="2" ry="2"/>
            <rect x="20" y="79" width="60" height="5" fill="${bgColor}" rx="1" ry="1"/>
            <line x1="2" y1="77" x2="98" y2="77" stroke="${accentColor}" stroke-width="1"/>
          `;
      break;
     case 'laptop_gaming':
          svgContent += `
            <polygon points="5,10 95,10 88,65 12,65" fill="${fgColor}"/>
            <rect x="14" y="12" width="72" height="51" fill="${bgColor}" rx="1" ry="1"/>
            <polygon points="0,70 100,70 92,95 8,95" fill="${fgColor}"/>
            <rect x="20" y="75" width="60" height="15" fill="${bgColor}" rx="2" ry="2"/>
            <polygon points="10,75 15,75 18,90 7,90" fill="${accentColor}"/>
            <polygon points="90,75 85,75 82,90 93,90" fill="${accentColor}"/>
            <line x1="8" y1="70" x2="92" y2="70" stroke="${accentColor2}" stroke-width="3"/>
          `;
      break;
    case 'laptop_2in1':
          svgContent += `
            <rect x="5" y="5" width="90" height="90" fill="${fgColor}" rx="8" ry="8"/>
            <rect x="12" y="12" width="76" height="76" fill="${bgColor}" rx="3" ry="3"/>
            <circle cx="50" cy="90" r="4" fill="${accentColor}"/>
            <rect x="45" y="8" width="10" height="4" fill="${accentColor2}" rx="1" ry="1"/>
          `;
      break;
    case 'laptop_workstation': // Desktop Replacement Style
          svgContent += `
            <rect x="20" y="5" width="60" height="50" fill="${fgColor}" rx="3" ry="3"/>
            <rect x="22" y="7" width="56" height="46" fill="${bgColor}" rx="1" ry="1"/>
            <rect x="0" y="57" width="100" height="43" fill="${fgColor}" rx="5" ry="5"/>
            <rect x="10" y="65" width="80" height="25" fill="${bgColor}" rx="2" ry="2"/>
            <rect x="5" y="85" width="15" height="10" fill="${accentColor}" rx="1" ry="1"/>
            <rect x="25" y="85" width="15" height="10" fill="${accentColor}" rx="1" ry="1"/>
            <rect x="60" y="85" width="35" height="10" fill="${accentColor2}" rx="1" ry="1"/>
            <line x1="0" y1="57" x2="100" y2="57" stroke="#fff" stroke-width="2"/>
          `;
      break;

    // --- Tablets ---
    case 'tablet_standard':
    case 'tablet_pro':
       const tabWidth = type === 'tablet_pro' ? 75 : 70;
       const tabHeight = type === 'tablet_pro' ? 95 : 90;
        svgContent += `
          <rect x="${(width - tabWidth) / 2}" y="${(height - tabHeight) / 2}" width="${tabWidth}" height="${tabHeight}" fill="${fgColor}" rx="5" ry="5"/>
          <rect x="${(width - tabWidth) / 2 + 4}" y="${(height - tabHeight) / 2 + 4}" width="${tabWidth - 8}" height="${tabHeight - 8}" fill="${bgColor}" rx="2" ry="2"/>
          ${type === 'tablet_pro' ? `<circle cx="${(width - tabWidth) / 2 + 10}" cy="${(height - tabHeight) / 2 + 10}" r="3" fill="${accentColor}"/>` : ''}
        `;
      break;

    // --- Desktops ---
    case 'desktop_tower':
      svgContent += `
        <rect x="20" y="5" width="60" height="90" fill="${fgColor}" rx="5" ry="5"/>
        <rect x="25" y="15" width="50" height="10" fill="${bgColor}" /> {/* Drive Bay? */}
        <rect x="25" y="30" width="50" height="5" fill="${bgColor}" />
        <circle cx="50" cy="80" r="5" fill="${accentColor}" /> {/* Power Button */}
        <line x1="20" y1="60" x2="80" y2="60" stroke="${bgColor}" stroke-width="2"/>
      `;
      break;
    case 'desktop_mini':
      svgContent += `
        <rect x="15" y="25" width="70" height="50" fill="${fgColor}" rx="5" ry="5"/>
        <circle cx="30" cy="50" r="4" fill="${accentColor}"/>
        <circle cx="70" cy="50" r="4" fill="${bgColor}"/>
      `;
      break;
    case 'desktop_aio': // All-in-One
      svgContent += `
        <rect x="5" y="5" width="90" height="65" fill="${fgColor}" rx="3" ry="3"/> {/* Screen */}
        <rect x="7" y="7" width="86" height="61" fill="${bgColor}" rx="1" ry="1"/>
        <polygon points="30,70 70,70 80,95 20,95" fill="${fgColor}"/> {/* Stand */}
        <circle cx="50" cy="60" r="2" fill="${accentColor}"/> {/* Camera */}
      `;
      break;

    // --- Monitors ---
    case 'monitor_standard':
    case 'monitor_wide':
    case 'monitor_curved':
        const monWidth = type === 'monitor_wide' || type === 'monitor_curved' ? 94 : 80;
        const monX = (width - monWidth) / 2;
        svgContent += `
            <rect x="${monX}" y="5" width="${monWidth}" height="60" fill="${fgColor}" rx="${type === 'monitor_curved' ? 15 : 3}" ry="${type === 'monitor_curved' ? 5 : 3}"/>
            <rect x="${monX + 2}" y="7" width="${monWidth - 4}" height="56" fill="${bgColor}" rx="${type === 'monitor_curved' ? 13 : 1}" ry="${type === 'monitor_curved' ? 4 : 1}"/>
             <polygon points="40,65 60,65 70,95 30,95" fill="${fgColor}"/> {/* Stand */}
             ${type === 'monitor_curved' ? `<path d="M${monX},35 Q50,45 ${monX + monWidth},35" stroke="${accentColor}" stroke-width="1" fill="none"/>` : ''}
        `;
        break;

    // --- Peripherals ---
    case 'keyboard':
      svgContent += `
        <rect x="5" y="30" width="90" height="40" fill="${fgColor}" rx="5" ry="5"/>
        <g fill="${bgColor}">
        ${[...Array(6)].map((_, row) =>
           [...Array(12)].map((_, col) => `<rect x="${10 + col * 7}" y="${35 + row * 5}" width="5" height="3" rx="1" ry="1"/>`).join('')
        ).join('')}
        </g>
      `;
      break;
    case 'mouse':
      svgContent += `
        <ellipse cx="50" cy="50" rx="30" ry="40" fill="${fgColor}"/>
        <line x1="50" y1="10" x2="50" y2="50" stroke="${bgColor}" stroke-width="3"/>
        <ellipse cx="50" cy="45" rx="5" ry="8" fill="${accentColor}"/> {/* Scroll wheel */}
      `;
      break;
    case 'webcam':
       svgContent += `
        <rect x="30" y="30" width="40" height="30" fill="${fgColor}" rx="5" ry="5"/>
        <circle cx="50" cy="45" r="10" fill="${accentColor2}"/>
        <circle cx="50" cy="45" r="5" fill="#000"/>
        <rect x="40" y="60" width="20" height="15" fill="${fgColor}"/> {/* Mount */}
      `;
      break;
    case 'headset':
       svgContent += `
        <path d="M20,70 C20,30 80,30 80,70" stroke="${fgColor}" stroke-width="8" fill="none"/>
        <rect x="10" y="65" width="20" height="25" fill="${fgColor}" rx="5" ry="5"/> {/* Left Earcup */}
        <rect x="70" y="65" width="20" height="25" fill="${fgColor}" rx="5" ry="5"/> {/* Right Earcup */}
        <line x1="30" y1="80" x2="40" y2="90" stroke="${fgColor}" stroke-width="4"/> {/* Mic Boom */}
        <circle cx="40" cy="90" r="3" fill="${accentColor}"/> {/* Mic */}
      `;
      break;

    // --- Other Electronics ---
    case 'vr_headset':
      svgContent += `
        <rect x="10" y="25" width="80" height="50" fill="${fgColor}" rx="15" ry="15"/> {/* Main headset */}
        <rect x="25" y="35" width="25" height="30" fill="${bgColor}" rx="5" ry="5"/> {/* Left Lens */}
        <rect x="50" y="35" width="25" height="30" fill="${bgColor}" rx="5" ry="5"/> {/* Right Lens */}
        <rect x="30" y="15" width="40" height="10" fill="${fgColor}" rx="3" ry="3"/> {/* Top Strap mount */}
        <rect x="40" y="75" width="20" height="10" fill="${accentColor}"/> {/* Nose area? */}
      `;
      break;
    case 'drone':
      svgContent += `
        <rect x="30" y="40" width="40" height="20" fill="${fgColor}" rx="5" ry="5"/> {/* Body */}
        <line x1="10" y1="30" x2="30" y2="40" stroke="${fgColor}" stroke-width="3"/> {/* Arm TL */}
        <line x1="70" y1="40" x2="90" y2="30" stroke="${fgColor}" stroke-width="3"/> {/* Arm TR */}
        <line x1="10" y1="70" x2="30" y2="60" stroke="${fgColor}" stroke-width="3"/> {/* Arm BL */}
        <line x1="70" y1="60" x2="90" y2="70" stroke="${fgColor}" stroke-width="3"/> {/* Arm BR */}
        <circle cx="10" cy="30" r="5" fill="${accentColor}"/> {/* Prop TL */}
        <circle cx="90" cy="30" r="5" fill="${accentColor}"/> {/* Prop TR */}
        <circle cx="10" cy="70" r="5" fill="${accentColor}"/> {/* Prop BL */}
        <circle cx="90" cy="70" r="5" fill="${accentColor}"/> {/* Prop BR */}
        <circle cx="50" cy="50" r="3" fill="${accentColor2}"/> {/* Camera/Sensor */}
      `;
      break;
    case 'action_camera':
       svgContent += `
        <rect x="25" y="25" width="50" height="40" fill="${fgColor}" rx="5" ry="5"/>
        <circle cx="40" cy="45" r="10" fill="#000"/> {/* Lens */}
        <circle cx="40" cy="45" r="6" fill="${accentColor2}"/>
        <rect x="65" y="30" width="5" height="10" fill="${accentColor}"/> {/* Button */}
        <rect x="25" y="65" width="50" height="10" fill="${bgColor}"/> {/* Mount Area */}
      `;
      break;
    case 'smart_speaker':
      svgContent += `
        <rect x="25" y="15" width="50" height="70" fill="${fgColor}" rx="10" ry="10"/> {/* Cylinder */}
        <ellipse cx="50" cy="15" rx="25" ry="5" fill="${accentColor}"/> {/* Top Light */}
        <g fill="${bgColor}" opacity="0.5">
            <circle cx="50" cy="35" r="15"/>
            <circle cx="50" cy="55" r="15"/>
            <circle cx="50" cy="75" r="15"/>
        </g>
      `;
      break;
    case 'router':
      svgContent += `
        <rect x="10" y="40" width="80" height="30" fill="${fgColor}" rx="5" ry="5"/> {/* Body */}
        <line x1="30" y1="40" x2="25" y2="20" stroke="${fgColor}" stroke-width="4"/> {/* Antenna 1 */}
        <line x1="50" y1="40" x2="50" y2="15" stroke="${fgColor}" stroke-width="4"/> {/* Antenna 2 */}
        <line x1="70" y1="40" x2="75" y2="20" stroke="${fgColor}" stroke-width="4"/> {/* Antenna 3 */}
        <circle cx="30" cy="55" r="2" fill="${accentColor}"/> {/* LED 1 */}
        <circle cx="40" cy="55" r="2" fill="${accentColor}"/> {/* LED 2 */}
        <circle cx="50" cy="55" r="2" fill="${bgColor}"/> {/* LED 3 (off) */}
        <circle cx="60" cy="55" r="2" fill="${accentColor2}"/> {/* LED 4 (alert?) */}
      `;
      break;
    case 'nas': // Network Attached Storage
      svgContent += `
        <rect x="15" y="10" width="70" height="80" fill="${fgColor}" rx="5" ry="5"/> {/* Main Box */}
        <rect x="25" y="20" width="50" height="25" fill="${bgColor}" rx="2" ry="2"/> {/* Drive Bay 1 */}
        <rect x="25" y="50" width="50" height="25" fill="${bgColor}" rx="2" ry="2"/> {/* Drive Bay 2 */}
        <circle cx="30" cy="80" r="2" fill="${accentColor}"/> {/* LED 1 */}
        <circle cx="35" cy="80" r="2" fill="${accentColor}"/> {/* LED 2 */}
      `;
      break;
    case 'external_ssd':
      svgContent += `
        <rect x="20" y="30" width="60" height="40" fill="${fgColor}" rx="5" ry="5"/>
        <rect x="65" y="45" width="10" height="10" fill="${accentColor}"/> {/* Port */}
        <line x1="25" y1="35" x2="35" y2="35" stroke="${accentColor2}" stroke-width="2"/>
      `;
      break;
    case 'usb_drive':
       svgContent += `
        <rect x="30" y="20" width="40" height="60" fill="${fgColor}" rx="3" ry="3"/> {/* Body */}
        <rect x="35" y="5" width="30" height="15" fill="${accentColor}"/> {/* Connector */}
        <circle cx="50" cy="50" r="5" fill="${bgColor}"/> {/* Logo/Detail */}
      `;
      break;
    case 'charger':
       svgContent += `
        <rect x="30" y="20" width="40" height="50" fill="${fgColor}" rx="5" ry="5"/> {/* Body */}
        <rect x="35" y="70" width="10" height="10" fill="${accentColor2}"/> {/* Prong 1 */}
        <rect x="55" y="70" width="10" height="10" fill="${accentColor2}"/> {/* Prong 2 */}
        <rect x="40" y="30" width="20" height="10" fill="${accentColor}"/> {/* USB Port */}
      `;
      break;
    case 'power_bank':
      svgContent += `
        <rect x="15" y="25" width="70" height="50" fill="${fgColor}" rx="8" ry="8"/>
        <rect x="25" y="30" width="10" height="10" fill="${accentColor}"/> {/* USB-A Port */}
        <rect x="40" y="30" width="8" height="10" fill="${accentColor2}"/> {/* USB-C Port? */}
        <circle cx="75" cy="35" r="3" fill="${bgColor}"/> {/* LED 1 */}
        <circle cx="75" cy="45" r="3" fill="${bgColor}"/> {/* LED 2 */}
        <circle cx="75" cy="55" r="3" fill="${bgColor}"/> {/* LED 3 */}
        <circle cx="75" cy="65" r="3" fill="${bgColor}"/> {/* LED 4 */}
      `;
      break;
    case 'projector':
       svgContent += `
        <rect x="10" y="30" width="80" height="50" fill="${fgColor}" rx="10" ry="10"/> {/* Body */}
        <circle cx="35" cy="55" r="15" fill="#000"/> {/* Lens housing */}
        <circle cx="35" cy="55" r="10" fill="${accentColor2}"/> {/* Lens */}
        <rect x="60" y="40" width="20" height="5" fill="${bgColor}"/> {/* Vent 1 */}
        <rect x="60" y="50" width="20" height="5" fill="${bgColor}"/> {/* Vent 2 */}
        <rect x="60" y="60" width="20" height="5" fill="${bgColor}"/> {/* Vent 3 */}
      `;
      break;
    case 'game_console': // Generic console
       svgContent += `
        <rect x="10" y="25" width="80" height="50" fill="${fgColor}" rx="5" ry="5"/>
        <rect x="15" y="30" width="30" height="40" fill="${bgColor}"/> {/* Left Side Detail */}
        <circle cx="70" cy="50" r="10" fill="${accentColor}"/> {/* Button/Light */}
      `;
      break;
    case 'game_controller':
       svgContent += `
        <path d="M20,50 C0,60 0,80 20,80 L80,80 C100,80 100,60 80,50 A 30 30 0 0 1 20,50 Z" fill="${fgColor}"/> {/* Main body shape */}
        <circle cx="30" cy="60" r="8" fill="${accentColor}"/> {/* Left Stick/DPad */}
        <circle cx="70" cy="60" r="8" fill="${accentColor}"/> {/* Right Stick */}
        <circle cx="60" cy="50" r="4" fill="${bgColor}"/> {/* Button 1 */}
        <circle cx="75" cy="45" r="4" fill="${bgColor}"/> {/* Button 2 */}
      `;
      break;

    // Add ~25 more cases here for other device types...
    // To save space for now, use a default placeholder for un-implemented types
    case 'tablet_mini':
      const miniTabWidth = 60;
      const miniTabHeight = 80;
      svgContent += `
        <rect x="${(width - miniTabWidth) / 2}" y="${(height - miniTabHeight) / 2}" width="${miniTabWidth}" height="${miniTabHeight}" fill="${fgColor}" rx="4" ry="4"/>
        <rect x="${(width - miniTabWidth) / 2 + 3}" y="${(height - miniTabHeight) / 2 + 3}" width="${miniTabWidth - 6}" height="${miniTabHeight - 6}" fill="${bgColor}" rx="1" ry="1"/>
      `;
      break;
    case 'desktop_gaming':
      svgContent += `
        <polygon points="15,5 85,5 95,95 5,95" fill="${fgColor}"/>
        <rect x="25" y="15" width="50" height="10" fill="${accentColor}" />
        <rect x="25" y="30" width="50" height="5" fill="${bgColor}" />
        <circle cx="50" cy="80" r="6" fill="${accentColor2}" />
        <line x1="15" y1="60" x2="85" y2="60" stroke="${bgColor}" stroke-width="3"/>
        <polygon points="20,10 25,15 75,15 80,10" fill="${accentColor}"/>
      `;
      break;
    case 'monitor_gaming':
        const gamMonWidth = 96;
        const gamMonX = (width - gamMonWidth) / 2;
        svgContent += `
            <rect x="${gamMonX}" y="5" width="${gamMonWidth}" height="55" fill="${fgColor}" rx="3" ry="3"/>
            <rect x="${gamMonX + 2}" y="7" width="${gamMonWidth - 4}" height="51" fill="${bgColor}" rx="1" ry="1"/>
            <polygon points="35,60 65,60 80,95 20,95" fill="${fgColor}"/> {/* Aggressive Stand */}
            <line x1="50" y1="60" x2="50" y2="90" stroke="${accentColor}" stroke-width="3"/>
        `;
        break;
    case 'keyboard_mechanical':
      svgContent += `
        <rect x="3" y="25" width="94" height="50" fill="${fgColor}" rx="6" ry="6"/>
        <g fill="${bgColor}">
        ${[...Array(5)].map((_, row) =>
           [...Array(14)].map((_, col) => `<rect x="${7 + col * 6}" y="${30 + row * 8}" width="4" height="6" rx="1" ry="1"/>`).join('') // Taller keys
        ).join('')}
        </g>
        <rect x="80" y="65" width="15" height="5" fill="${accentColor}"/> {/* Wrist rest? */}
      `;
      break;
    case 'keyboard_wireless':
      // Same as keyboard, maybe slightly thinner base or different accent
      svgContent += `
        <rect x="5" y="35" width="90" height="30" fill="${fgColor}" rx="4" ry="4"/>
        <g fill="${bgColor}">
        ${[...Array(5)].map((_, row) =>
           [...Array(12)].map((_, col) => `<rect x="${10 + col * 7}" y="${38 + row * 4}" width="5" height="2.5" rx="1" ry="1"/>`).join('')
        ).join('')}
        </g>
        <circle cx="90" cy="40" r="2" fill="${accentColor}"/> {/* Wireless indicator? */}
      `;
      break;
     case 'mouse_gaming':
        svgContent += `
          <path d="M30,20 C0,30 0,80 30,90 L70,90 C100,80 100,30 70,20 A 40 40 0 0 0 30,20 Z" fill="${fgColor}"/> {/* Angular Shape */}
          <line x1="50" y1="20" x2="50" y2="60" stroke="${bgColor}" stroke-width="4"/>
          <ellipse cx="50" cy="55" rx="6" ry="9" fill="${accentColor}"/> {/* Scroll wheel */}
          <polygon points="30,40 20,50 30,60" fill="${accentColor2}"/> {/* Side button 1 */}
          <polygon points="70,40 80,50 70,60" fill="${accentColor2}"/> {/* Side button 2 */}
        `;
      break;
    case 'mouse_wireless':
        // Same as mouse, maybe small indicator
       svgContent += `
        <ellipse cx="50" cy="50" rx="30" ry="40" fill="${fgColor}"/>
        <line x1="50" y1="10" x2="50" y2="50" stroke="${bgColor}" stroke-width="3"/>
        <ellipse cx="50" cy="45" rx="5" ry="8" fill="${accentColor}"/> {/* Scroll wheel */}
        <circle cx="40" cy="20" r="2" fill="${accentColor2}"/> {/* Wireless indicator? */}
      `;
      break;
    case 'microphone_usb':
       svgContent += `
        <rect x="40" y="10" width="20" height="50" fill="${fgColor}" rx="10" ry="10"/> {/* Mic Body */}
        <rect x="42" y="12" width="16" height="30" fill="${bgColor}"/> {/* Grill */}
        <rect x="30" y="60" width="40" height="10" fill="${fgColor}" rx="3" ry="3"/> {/* Base */}
        <rect x="45" y="70" width="10" height="10" fill="${accentColor}"/> {/* USB Port */}
        <line x1="50" y1="70" x2="50" y2="95" stroke="${fgColor}" stroke-width="3"/> {/* Stand */}
        <rect x="35" y="90" width="30" height="5" fill="${fgColor}" rx="2" ry="2"/> {/* Stand Base */}
      `;
      break;
     case 'microphone_xlr': // Similar to USB but maybe different base/connector visual
       svgContent += `
        <rect x="35" y="5" width="30" height="60" fill="${fgColor}" rx="15" ry="15"/> {/* Mic Body */}
        <rect x="38" y="8" width="24" height="40" fill="${bgColor}"/> {/* Grill */}
        <rect x="45" y="65" width="10" height="10" fill="${accentColor2}"/> {/* XLR Port indicator */}
        <circle cx="47" cy="70" r="1" fill="${bgColor}"/>
        <circle cx="53" cy="70" r="1" fill="${bgColor}"/>
        <circle cx="50" cy="67" r="1" fill="${bgColor}"/>
        <line x1="50" y1="75" x2="50" y2="95" stroke="${fgColor}" stroke-width="4"/> {/* Stand */}
        <ellipse cx="50" cy="95" rx="20" ry="5" fill="${fgColor}"/> {/* Stand Base */}
      `;
      break;
    case 'headphones_studio':
       svgContent += `
        <path d="M15,65 C15,25 85,25 85,65" stroke="${fgColor}" stroke-width="10" fill="none"/> {/* Thicker band */}
        <rect x="5" y="60" width="30" height="35" fill="${fgColor}" rx="8" ry="8"/> {/* Larger Left Earcup */}
        <rect x="65" y="60" width="30" height="35" fill="${fgColor}" rx="8" ry="8"/> {/* Larger Right Earcup */}
        <circle cx="20" cy="77.5" r="10" fill="${bgColor}"/> {/* Earcup Detail L */}
        <circle cx="80" cy="77.5" r="10" fill="${bgColor}"/> {/* Earcup Detail R */}
      `;
      break;
    case 'earbuds_wired':
       svgContent += `
        <circle cx="30" cy="40" r="10" fill="${fgColor}"/> {/* Left Bud */}
        <circle cx="70" cy="40" r="10" fill="${fgColor}"/> {/* Right Bud */}
        <path d="M30,50 Q50,70 70,50" stroke="${fgColor}" stroke-width="2" fill="none"/> {/* Wire */}
        <line x1="50" y1="60" x2="50" y2="80" stroke="${fgColor}" stroke-width="2"/> {/* Main cable */}
        <rect x="47" y="80" width="6" height="10" fill="${accentColor}"/> {/* Jack */}
      `;
      break;
    case 'camera_dslr':
      svgContent += `
        <rect x="10" y="25" width="80" height="50" fill="${fgColor}" rx="5" ry="5"/> {/* Body */}
        <rect x="35" y="10" width="30" height="15" fill="${fgColor}" rx="2" ry="2"/> {/* Viewfinder/Pentaprism */}
        <circle cx="50" cy="50" r="20" fill="#222"/> {/* Lens Mount */}
        <circle cx="50" cy="50" r="15" fill="${accentColor}"/> {/* Lens */}
        <rect x="70" y="30" width="15" height="20" fill="${bgColor}" rx="3" ry="3"/> {/* Grip */}
      `;
      break;
    case 'camera_mirrorless':
      svgContent += `
        <rect x="15" y="30" width="70" height="45" fill="${fgColor}" rx="4" ry="4"/> {/* Slimmer Body */}
        <rect x="20" y="20" width="20" height="10" fill="${fgColor}" rx="2" ry="2"/> {/* Viewfinder (smaller/optional) */}
        <circle cx="50" cy="52.5" r="18" fill="#222"/> {/* Lens Mount */}
        <circle cx="50" cy="52.5" r="13" fill="${accentColor2}"/> {/* Lens */}
        <rect x="75" y="35" width="5" height="15" fill="${bgColor}" rx="1" ry="1"/> {/* Grip */}
      `;
      break;
    case 'camera_compact':
       svgContent += `
        <rect x="20" y="30" width="60" height="40" fill="${fgColor}" rx="8" ry="8"/> {/* Compact Body */}
        <circle cx="45" cy="50" r="12" fill="#111"/> {/* Lens */}
        <circle cx="45" cy="50" r="7" fill="${accentColor}"/>
        <rect x="65" y="35" width="10" height="5" fill="${bgColor}"/> {/* Flash/Sensor */}
        <rect x="25" y="35" width="5" height="5" fill="${accentColor2}"/> {/* Button */}
      `;
      break;
    case 'smart_display':
       svgContent += `
        <rect x="10" y="15" width="80" height="60" fill="${fgColor}" rx="5" ry="5"/> {/* Screen */}
        <rect x="13" y="18" width="74" height="54" fill="${bgColor}" rx="2" ry="2"/>
        <polygon points="20,75 80,75 70,90 30,90" fill="${fgColor}"/> {/* Base/Speaker */}
        <circle cx="50" cy="25" r="3" fill="${accentColor}"/> {/* Camera */}
        <circle cx="30" cy="82.5" r="3" fill="${bgColor}" opacity="0.5"/> {/* Speaker dot 1 */}
        <circle cx="40" cy="82.5" r="3" fill="${bgColor}" opacity="0.5"/>
        <circle cx="50" cy="82.5" r="3" fill="${bgColor}" opacity="0.5"/>
        <circle cx="60" cy="82.5" r="3" fill="${bgColor}" opacity="0.5"/>
        <circle cx="70" cy="82.5" r="3" fill="${bgColor}" opacity="0.5"/>
      `;
      break;
    case 'wifi_extender':
      svgContent += `
        <rect x="35" y="20" width="30" height="40" fill="${fgColor}" rx="5" ry="5"/> {/* Body */}
        <rect x="40" y="60" width="8" height="10" fill="${accentColor2}"/> {/* Prong 1 */}
        <rect x="52" y="60" width="8" height="10" fill="${accentColor2}"/> {/* Prong 2 */}
        <circle cx="50" cy="30" r="3" fill="${accentColor}"/> {/* LED */}
        <line x1="35" y1="40" x2="25" y2="30" stroke="${fgColor}" stroke-width="3"/> {/* Antenna stub */}
        <line x1="65" y1="40" x2="75" y2="30" stroke="${fgColor}" stroke-width="3"/> {/* Antenna stub */}
      `;
      break;
    case 'network_switch':
      svgContent += `
        <rect x="5" y="40" width="90" height="25" fill="${fgColor}" rx="3" ry="3"/> {/* Flat Box */}
        <g fill="${accentColor}">
          ${[...Array(8)].map((_, i) => `<rect x="${10 + i * 10}" y="45" width="7" height="5" rx="1" ry="1"/>`).join('')} {/* Ports */}
        </g>
         <g fill="${bgColor}">
          ${[...Array(8)].map((_, i) => `<circle cx="${13.5 + i * 10}" cy="55" r="1.5"/>`).join('')} {/* LEDs */}
        </g>
      `;
      break;
    case 'external_hdd': // Slightly thicker than SSD
      svgContent += `
        <rect x="15" y="25" width="70" height="50" fill="${fgColor}" rx="5" ry="5"/>
        <rect x="70" y="45" width="10" height="10" fill="${accentColor}"/> {/* Port */}
        <line x1="20" y1="30" x2="65" y2="30" stroke="${bgColor}" stroke-width="1"/> {/* Vent Lines */}
        <line x1="20" y1="35" x2="65" y2="35" stroke="${bgColor}" stroke-width="1"/>
        <line x1="20" y1="65" x2="65" y2="65" stroke="${bgColor}" stroke-width="1"/>
        <line x1="20" y1="70" x2="65" y2="70" stroke="${bgColor}" stroke-width="1"/>
      `;
      break;
    case 'sd_card':
       svgContent += `
        <polygon points="25,15 75,15 75,85 35,85 25,75" fill="${fgColor}"/> {/* Main shape with notch */}
        <rect x="30" y="20" width="10" height="5" fill="${accentColor2}"/> {/* Contact 1 */}
        <rect x="42" y="20" width="10" height="5" fill="${accentColor2}"/> {/* Contact 2 */}
        <rect x="54" y="20" width="10" height="5" fill="${accentColor2}"/> {/* Contact 3 */}
        <rect x="66" y="20" width="5" height="5" fill="${accentColor2}"/> {/* Contact 4 */}
        <text x="50" y="60" font-family="sans-serif" font-size="8" fill="${bgColor}" text-anchor="middle">SD</text>
      `;
      break;
    // --- Cases for commented out types (optional, could be added if uncommented later) ---
    // case 'graphics_card': ... break;
    // case 'cpu': ... break;
    // case 'motherboard': ... break;
    // case 'ram_module': ... break;
    // case 'power_supply': ... break;
    // case 'pc_case': ... break;
    // case 'cooling_fan': ... break;
    // case 'printer_inkjet': ... break;
    // case 'printer_laser': ... break;
    // case 'scanner': ... break;
    // case 'tv_4k': ... break;
    // case 'tv_8k': ... break;
    // case 'soundbar': ... break;
    // case 'blueray_player': ... break;
    // case 'smart_lightbulb': ... break;
    // case 'smart_plug': ... break;
    // case 'robot_vacuum': ... break;

    // --- End of added cases ---

    // ... and so on ...

    default:
      // Default remains empty or could have a very generic placeholder if needed
      // For now, assume all types in deviceTypes array are handled above.
      // svgContent += `<circle cx="50" cy="50" r="40" fill="${fgColor}" stroke="${accentColor}" stroke-width="2"/> <text x="50" y="60" font-family="sans-serif" font-size="10" fill="${bgColor}" text-anchor="middle">?</text>`;
      break;
  }

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
};

async function main() {
  const user1 = await prisma.user.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: 'テストユーザー1' },
  });
  const user2 = await prisma.user.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, name: 'テストユーザー2' },
  });
  console.log('Upserted users:', user1, user2);

  await prisma.product.deleteMany({});
  console.log('Deleted existing products');

  // --- Define ~50 Device Types (Add more specific types) ---
  const deviceTypes = [
    'smartphone_standard', 'smartphone_pro', 'smartphone_mini',
    'laptop_business', 'laptop_ultrabook', 'laptop_gaming', 'laptop_2in1', 'laptop_workstation',
    'tablet_standard', 'tablet_pro',
    'desktop_tower', 'desktop_mini', 'desktop_aio', 'desktop_gaming',
    'monitor_standard', 'monitor_wide', 'monitor_curved', 'monitor_gaming',
    'keyboard', 'keyboard_mechanical', 'keyboard_wireless',
    'mouse', 'mouse_gaming', 'mouse_wireless',
    'webcam', 'microphone_usb', 'headset', 'headphones_studio', 'earbuds_wired',
    'vr_headset', 'drone', 'action_camera', 'camera_dslr', 'camera_mirrorless', 'camera_compact',
    'smart_speaker', 'smart_display',
    'router', 'wifi_extender', 'network_switch', 'nas',
    'external_ssd', 'external_hdd', 'usb_drive', 'sd_card',
    'charger', 'power_bank', 'projector',
    'game_console', 'game_controller',
    // 'graphics_card', 'cpu', 'motherboard', 'ram_module', 'power_supply', 'pc_case', 'cooling_fan',
    // 'printer_inkjet', 'printer_laser', 'scanner', 'tv_4k', 'tv_8k', 'soundbar', 'blueray_player',
    // 'smart_lightbulb', 'smart_plug', 'robot_vacuum',
  ]; // Aim for ~50 distinct types

  const productBrands = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Omega', 'Sigma', 'Zeta', 'Epsilon'];
  const productAdjectives = ['高性能', '軽量', '多機能', 'スタイリッシュ', '高耐久', 'プロフェッショナル', 'エントリー', '最新鋭'];

  const productPromises = [];

  for (let i = 1; i <= 200; i++) {
    // Select device type cyclically from the expanded list
    const productType = deviceTypes[i % deviceTypes.length];

    // Generate name based on type and indices
    const brandIndex = i % productBrands.length;
    const adjectiveIndex = i % productAdjectives.length;
    const brandName = productBrands[brandIndex];
    const adjective = productAdjectives[adjectiveIndex];
    const modelNumber = `${String.fromCharCode(65 + (i % 26))}${i}`;

    // Simple type name for display (e.g., 'smartphone', 'laptop')
    const simpleTypeName = productType.split('_')[0];
    let displayName = simpleTypeName;
    if (simpleTypeName === 'smartphone') displayName = 'スマホ';
    else if (simpleTypeName === 'laptop') displayName = 'ノートPC';
    else if (simpleTypeName === 'earphones') displayName = 'イヤホン';
    else if (simpleTypeName === 'smartwatch') displayName = 'ウォッチ';
    else if (simpleTypeName === 'desktop') displayName = 'デスクトップPC';
    else if (simpleTypeName === 'monitor') displayName = 'モニター';
    else if (simpleTypeName === 'keyboard') displayName = 'キーボード';
    else if (simpleTypeName === 'mouse') displayName = 'マウス';
    else if (simpleTypeName === 'headset') displayName = 'ヘッドセット';
    // ... add more display names as needed

    const productName = `${adjective}${displayName} ${brandName}-${modelNumber}`;
    const description = `${productName} の詳細説明。モデル${modelNumber}は${adjective}で、最高の体験を提供します。`;
    const price = 5000 + Math.floor(Math.random() * 295000); // 5,000 - 300,000
    const stock = Math.floor(Math.random() * 100) + 1; // 1 - 100
    const imageUrl = generateProductSvg(productType, i);

    productPromises.push(
      prisma.product.create({
        data: {
          name: productName,
          description,
          price,
          imageUrl,
          stock,
        },
      })
    );
  }

  await Promise.all(productPromises);
  console.log(`Created ${productPromises.length} diverse products representing ~${deviceTypes.length} types with varied SVGs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
