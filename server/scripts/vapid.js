import * as webpush from 'web-push';
const k = webpush.generateVAPIDKeys();
console.log(`Add these to your .env file:\n\nVAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\n`);
