import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const COGNITIVE_FRAMEWORK_BLOCK = [
  "[ARI-COGNITIVE-FRAMEWORK]",
  "Use LOGOS (evidence and math), ETHOS (trust, risk, ethics), PATHOS (audience energy and retention).",
  "When producing recommendations:",
  "1) State confidence and uncertainty.",
  "2) Separate facts from assumptions.",
  "3) Include counter-arguments.",
  "4) End with an actionable decision and expected value framing.",
].join("\n");

export function buildCognitivePromptBlock(): string {
  return COGNITIVE_FRAMEWORK_BLOCK;
}

export function registerCognitiveHooks(api: OpenClawPluginApi): void {
  api.on("before_prompt_build", () => {
    return {
      prependContext: buildCognitivePromptBlock(),
    };
  });
}
