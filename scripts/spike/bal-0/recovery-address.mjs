// Prints ONLY the public address of the FC payouts wallet (the spike's recovery target). Never prints the key.
import { readFileSync } from 'fs';
import { privateKeyToAccount } from 'viem/accounts';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const pk = env.FC_PAYOUT_PRIVATE_KEY;
if (!pk) { console.error('FC_PAYOUT_PRIVATE_KEY not set in .env.local'); process.exit(1); }
console.log(privateKeyToAccount(pk.startsWith('0x') ? pk : '0x'+pk).address);
