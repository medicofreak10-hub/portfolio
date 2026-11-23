import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

const env = process.env;
export const config = {
  root: ROOT,
  port: Number(env.PORT || 8080),
  dataMode: process.argv.includes('--demo') || (env.DATA_MODE || 'live').toLowerCase() === 'demo' ? 'demo' : 'live',
  dataDir: env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(ROOT, 'data'),
  gmailUser: env.GMAIL_USER || '',
  gmailPass: env.GMAIL_APP_PASSWORD || '',
  emailTo: env.EMAIL_TO || env.GMAIL_USER || '',
  vapidPublic: env.VAPID_PUBLIC_KEY || '',
  vapidPrivate: env.VAPID_PRIVATE_KEY || '',
  // Apple's push service rejects 'localhost' subjects, so fall back to a real-looking address
  vapidSubject: env.VAPID_SUBJECT || (env.GMAIL_USER ? 'mailto:' + env.GMAIL_USER : 'mailto:portfolio@example.com'),
  disableJobs: env.DISABLE_JOBS === '1',
  appPin: env.APP_PIN || '',
};
