import { generateMarketBrief, DISCLAIMER } from "../brief-generator.js";

export async function handleMarketBriefCommand(): Promise<string> {
  try {
    const brief = generateMarketBrief();
    return `${DISCLAIMER}\n\n${brief.content.slice(0, 1500)}`;
  } catch (err) {
    return `❌ Market brief error: ${String(err).slice(0, 100)}`;
  }
}
