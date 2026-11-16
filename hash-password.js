import bcrypt from 'bcryptjs';
const p=process.argv[2];if(!p||p.length<12){console.error('Usage: npm run hash-password -- "A-long-password-12+" (minimum 12 chars)');process.exit(1)}
console.log(await bcrypt.hash(p,12));
