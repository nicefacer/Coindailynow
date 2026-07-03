#!/usr/bin/env node
/**
 * Reset a CoinDaily admin password (local dev only).
 *
 * Run from the backend directory:
 *   node scripts/reset-admin-password.js [email]
 *
 * If no email is passed, defaults to admin@sygn.live (seeded super admin).
 *
 * Prompts twice for the new password — both inputs are echoed as `*` so
 * nothing lands in your shell history or scrollback. Updates User.passwordHash
 * with bcrypt cost 12 (matches authService.SALT_ROUNDS).
 *
 * The new password is never logged, never persisted anywhere outside the
 * hashed column.
 */

const readline = require('readline');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const DEFAULT_EMAIL = 'admin@sygn.live';
const SALT_ROUNDS = 12;

function promptPassword(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      historySize: 0,
    });
    const origWrite = rl._writeToOutput;
    rl._writeToOutput = function (str) {
      if (rl.line.length === 0) origWrite.call(this, str);
      else origWrite.call(this, '*');
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const email = (process.argv[2] || DEFAULT_EMAIL).trim().toLowerCase();
  const prisma = new PrismaClient();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, username: true, role: true, status: true },
  });
  if (!user) {
    console.error(`No user with email ${email}`);
    await prisma.$disconnect();
    process.exit(2);
  }

  console.log(`\nResetting password for:\n  ${user.email}  (${user.username} · ${user.role} · ${user.status})\n`);

  const pwd1 = await promptPassword('  New password: ');
  if (!pwd1 || pwd1.length < 10) {
    console.error('Password must be at least 10 characters.');
    await prisma.$disconnect();
    process.exit(3);
  }
  const pwd2 = await promptPassword('  Confirm:      ');
  if (pwd1 !== pwd2) {
    console.error('Passwords did not match. Nothing changed.');
    await prisma.$disconnect();
    process.exit(4);
  }

  const passwordHash = await bcrypt.hash(pwd1, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, updatedAt: new Date() },
  });

  // Also revoke any active refresh tokens / sessions so anyone using the
  // old password gets booted at next refresh.
  await prisma.refreshToken.updateMany({
    where: { userId: user.id, isRevoked: false },
    data: { isRevoked: true },
  }).catch(() => { /* table may not exist on slimmer envs */ });

  console.log(`\n✔ Password updated for ${user.email}`);
  console.log(`  Log in at: http://localhost:3002/auth/sadmin (super admin) or /login (staff)\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Reset failed:', err.message);
  process.exit(1);
});
