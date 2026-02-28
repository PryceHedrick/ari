// scripts/discord/verify.ts
// Health-check: verifies all Discord channel env vars and webhook vars are set.
// Run: node --import tsx scripts/discord/verify.ts

const REQUIRED_CHANNELS: string[] = [
  "ARI_DISCORD_CHANNEL_MAIN",
  "ARI_DISCORD_CHANNEL_DEEP",
  "ARI_DISCORD_CHANNEL_MARKET_ALERTS",
  "ARI_DISCORD_CHANNEL_POKEMON",
  "ARI_DISCORD_CHANNEL_RESEARCH",
  "ARI_DISCORD_CHANNEL_PAYTHEPRICE",
  "ARI_DISCORD_CHANNEL_VIDEO_QUEUE",
  "ARI_DISCORD_CHANNEL_THUMBNAIL_LAB",
  "ARI_DISCORD_CHANNEL_PUBLISHED",
  "ARI_DISCORD_CHANNEL_LEADS",
  "ARI_DISCORD_CHANNEL_DEMO_FACTORY",
  "ARI_DISCORD_CHANNEL_OUTREACH_QUEUE",
  "ARI_DISCORD_CHANNEL_WINS",
  "ARI_DISCORD_CHANNEL_SYSTEM_STATUS",
  "ARI_DISCORD_CHANNEL_OPS_DASHBOARD",
  "ARI_DISCORD_CHANNEL_API_LOGS",
];

const OPTIONAL_WEBHOOKS: string[] = [
  "ARI_DISCORD_WEBHOOK_ARI",
  "ARI_DISCORD_WEBHOOK_NOVA",
  "ARI_DISCORD_WEBHOOK_CHASE",
  "ARI_DISCORD_WEBHOOK_PULSE",
  "ARI_DISCORD_WEBHOOK_DEX",
  "ARI_DISCORD_WEBHOOK_RUNE",
  "ARI_DISCORD_WEBHOOK_SYSTEM",
];

let allGood = true;

console.log("\n=== ARI Discord Configuration Verify ===\n");

console.log("--- Required Channel IDs ---");
for (const key of REQUIRED_CHANNELS) {
  const val = process.env[key];
  const status = val ? `✅ ${val}` : "❌ MISSING";
  if (!val) {
    allGood = false;
  }
  console.log(`  ${key}: ${status}`);
}

console.log("\n--- Optional Agent Webhooks (enables per-agent identity) ---");
for (const key of OPTIONAL_WEBHOOKS) {
  const val = process.env[key];
  const status = val ? "✅ configured" : "⚠️  not set (falls back to bot identity)";
  console.log(`  ${key}: ${status}`);
}

console.log("\n--- Discord Bot Credentials ---");
const token = process.env["DISCORD_BOT_TOKEN"];
const clientId = process.env["DISCORD_CLIENT_ID"];
const guildId = process.env["DISCORD_GUILD_ID"];
console.log(`  DISCORD_BOT_TOKEN: ${token ? "✅ set" : "❌ MISSING"}`);
console.log(`  DISCORD_CLIENT_ID: ${clientId ? `✅ ${clientId}` : "❌ MISSING"}`);
console.log(`  DISCORD_GUILD_ID:  ${guildId ? `✅ ${guildId}` : "❌ MISSING"}`);
if (!token || !clientId || !guildId) {
  allGood = false;
}

console.log(
  `\n${allGood ? "✅ All required config present" : "❌ Fix missing values in ~/.openclaw/.env"}\n`,
);
process.exit(allGood ? 0 : 1);
