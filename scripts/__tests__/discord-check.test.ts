import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  checkEnvVar,
  checkRequiredEnv,
  checkChannelIds,
  isNumericSnowflake,
} from "../discord-check.js";

describe("isNumericSnowflake", () => {
  it("accepts valid 18-digit snowflake", () => {
    expect(isNumericSnowflake("123456789012345678")).toBe(true);
  });

  it("accepts 15-digit snowflake (lower bound)", () => {
    expect(isNumericSnowflake("123456789012345")).toBe(true);
  });

  it("accepts 20-digit snowflake (upper bound)", () => {
    expect(isNumericSnowflake("12345678901234567890")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isNumericSnowflake("")).toBe(false);
  });

  it("rejects non-numeric string", () => {
    expect(isNumericSnowflake("not-a-snowflake")).toBe(false);
  });

  it("rejects too-short numeric string (14 digits)", () => {
    expect(isNumericSnowflake("12345678901234")).toBe(false);
  });

  it("rejects too-long numeric string (21 digits)", () => {
    expect(isNumericSnowflake("123456789012345678901")).toBe(false);
  });

  it("rejects numeric string with letters", () => {
    expect(isNumericSnowflake("12345678901234abc")).toBe(false);
  });
});

describe("checkEnvVar", () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL)) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete process.env[key];
      }
    }
    Object.assign(process.env, ORIGINAL);
  });

  it("returns true when var is set and non-empty", () => {
    process.env["TEST_CHECK_VAR"] = "some-value";
    expect(checkEnvVar("TEST_CHECK_VAR")).toBe(true);
  });

  it("returns false when var is missing", () => {
    delete process.env["TEST_CHECK_VAR"];
    expect(checkEnvVar("TEST_CHECK_VAR")).toBe(false);
  });

  it("returns false when var is empty string", () => {
    process.env["TEST_CHECK_VAR"] = "";
    expect(checkEnvVar("TEST_CHECK_VAR")).toBe(false);
  });

  it("returns false when var is whitespace only", () => {
    process.env["TEST_CHECK_VAR"] = "   ";
    expect(checkEnvVar("TEST_CHECK_VAR")).toBe(false);
  });
});

describe("checkRequiredEnv", () => {
  const KEYS = [
    "ANTHROPIC_API_KEY",
    "DISCORD_BOT_TOKEN",
    "DISCORD_CLIENT_ID",
    "DISCORD_GUILD_ID",
    "PRYCE_USER_ID",
    "OPENCLAW_GATEWAY_TOKEN",
  ];

  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it("returns no failures when all required vars are set", () => {
    for (const key of KEYS) {
      process.env[key] = "some-value";
    }
    const { failures } = checkRequiredEnv();
    expect(failures).toHaveLength(0);
  });

  it("reports missing var in failures", () => {
    for (const key of KEYS) {
      process.env[key] = "some-value";
    }
    delete process.env["ANTHROPIC_API_KEY"];
    const { failures } = checkRequiredEnv();
    expect(failures).toContain("ANTHROPIC_API_KEY");
  });

  it("reports all missing vars", () => {
    for (const key of KEYS) {
      delete process.env[key];
    }
    const { failures } = checkRequiredEnv();
    expect(failures.length).toBe(KEYS.length);
  });
});

describe("checkChannelIds", () => {
  const REQUIRED_CHANNEL_KEYS = [
    "ARI_DISCORD_CHANNEL_MAIN",
    "ARI_DISCORD_CHANNEL_DEEP",
    "ARI_DISCORD_CHANNEL_MARKET_ALERTS",
    "ARI_DISCORD_CHANNEL_POKEMON",
    "ARI_DISCORD_CHANNEL_PAYTHEPRICE",
    "ARI_DISCORD_CHANNEL_BATTLE_PLANS",
    "ARI_DISCORD_CHANNEL_SYSTEM_STATUS",
  ];

  const VALID_SNOWFLAKE = "123456789012345678";
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of REQUIRED_CHANNEL_KEYS) {
      saved[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of REQUIRED_CHANNEL_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it("returns no failures when all required channel IDs are valid snowflakes", () => {
    for (const key of REQUIRED_CHANNEL_KEYS) {
      process.env[key] = VALID_SNOWFLAKE;
    }
    const { failures } = checkChannelIds();
    expect(failures).toHaveLength(0);
  });

  it("reports missing required channel ID as failure", () => {
    for (const key of REQUIRED_CHANNEL_KEYS) {
      process.env[key] = VALID_SNOWFLAKE;
    }
    delete process.env["ARI_DISCORD_CHANNEL_MAIN"];
    const { failures } = checkChannelIds();
    expect(failures).toContain("ARI_DISCORD_CHANNEL_MAIN");
  });

  it("reports non-numeric channel ID as failure", () => {
    for (const key of REQUIRED_CHANNEL_KEYS) {
      process.env[key] = VALID_SNOWFLAKE;
    }
    process.env["ARI_DISCORD_CHANNEL_MAIN"] = "not-a-number";
    const { failures } = checkChannelIds();
    expect(failures.some((f) => f.startsWith("ARI_DISCORD_CHANNEL_MAIN"))).toBe(true);
  });

  it("warns (not fails) for unset optional channel", () => {
    for (const key of REQUIRED_CHANNEL_KEYS) {
      process.env[key] = VALID_SNOWFLAKE;
    }
    delete process.env["ARI_DISCORD_CHANNEL_THUMBNAIL_LAB"];
    const { failures, warnings } = checkChannelIds();
    expect(failures.some((f) => f.startsWith("ARI_DISCORD_CHANNEL_THUMBNAIL_LAB"))).toBe(false);
    expect(warnings).toContain("ARI_DISCORD_CHANNEL_THUMBNAIL_LAB");
  });
});
