import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import * as readline from 'readline';
import OneZeroScraper from '../src/scrapers/one-zero';
import { generateDashboardHtml } from './generate-html';

dotenv.config();

const {
  ONE_ZERO_EMAIL,
  ONE_ZERO_PASSWORD,
  ONE_ZERO_OTP_LONG_TERM_TOKEN,
  ONE_ZERO_PHONE_NUMBER,
  PERSON1_NAME,
  PERSON2_NAME,
} = process.env;

function readLineFromStdin(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  if (!ONE_ZERO_EMAIL || !ONE_ZERO_PASSWORD) {
    console.error('❌  Missing required env vars: ONE_ZERO_EMAIL, ONE_ZERO_PASSWORD');
    console.error('    Copy .env.example to .env and fill in your credentials.');
    process.exit(1);
  }

  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);

  const scraper = new OneZeroScraper({ startDate });

  type Credentials = Parameters<typeof scraper.login>[0];

  let credentials: Credentials;

  if (ONE_ZERO_OTP_LONG_TERM_TOKEN) {
    credentials = {
      email: ONE_ZERO_EMAIL,
      password: ONE_ZERO_PASSWORD,
      otpLongTermToken: ONE_ZERO_OTP_LONG_TERM_TOKEN,
    };
  } else if (ONE_ZERO_PHONE_NUMBER) {
    credentials = {
      email: ONE_ZERO_EMAIL,
      password: ONE_ZERO_PASSWORD,
      phoneNumber: ONE_ZERO_PHONE_NUMBER,
      otpCodeRetriever: () => readLineFromStdin('📱  Enter the OTP code from your SMS: '),
    };
  } else {
    console.error(
      '❌  Provide either ONE_ZERO_OTP_LONG_TERM_TOKEN or ONE_ZERO_PHONE_NUMBER in .env',
    );
    process.exit(1);
  }

  console.log('🔐  Logging in to One Zero…');
  const loginResult = await scraper.login(credentials);

  if (!loginResult.success) {
    console.error('❌  Login failed:', (loginResult as { errorMessage?: string }).errorMessage);
    process.exit(1);
  }

  if (loginResult.persistentOtpToken) {
    console.log('\n✅  Login successful! Save this token in your .env to skip SMS next time:');
    console.log(`    ONE_ZERO_OTP_LONG_TERM_TOKEN=${loginResult.persistentOtpToken}\n`);
  }

  console.log('📥  Fetching transactions (up to 1 year back)…');
  const result = await scraper.fetchData();

  if (!result.success || !result.accounts) {
    console.error('❌  Scraping failed:', (result as { errorMessage?: string }).errorMessage);
    process.exit(1);
  }

  const totalTxns = result.accounts.reduce((n, a) => n + a.txns.length, 0);
  console.log(`✅  Fetched ${totalTxns} transactions across ${result.accounts.length} account(s).`);

  const html = generateDashboardHtml(result.accounts, PERSON1_NAME, PERSON2_NAME);
  const outputPath = path.join(__dirname, '..', 'dashboard.html');
  fs.writeFileSync(outputPath, html, 'utf-8');

  console.log(`\n🎉  Dashboard ready! Open this file in your browser:\n    ${outputPath}\n`);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
