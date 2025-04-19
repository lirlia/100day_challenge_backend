export const RP_ID = process.env.RP_ID;
export const RP_ORIGIN = process.env.RP_ORIGIN;

if (!RP_ID) {
  throw new Error('RP_ID is not defined in environment variables');
}

if (!RP_ORIGIN) {
  throw new Error('RP_ORIGIN is not defined in environment variables');
}

console.log('Passkey Config Loaded:');
console.log(`  RP_ID: ${RP_ID}`);
console.log(`  RP_ORIGIN: ${RP_ORIGIN}`);
