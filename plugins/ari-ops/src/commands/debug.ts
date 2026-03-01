/**
 * /ari-obs-debug on|off — toggle in-memory debug tracing flag.
 */

let debugMode = false;

export function isDebugMode(): boolean {
  return debugMode;
}

export async function handleDebugCommand(args?: string): Promise<{ text: string }> {
  const arg = args?.trim().toLowerCase();
  if (arg === "on") {
    debugMode = true;
    return { text: "Debug tracing enabled. All span events will include extra detail." };
  }
  if (arg === "off") {
    debugMode = false;
    return { text: "Debug tracing disabled." };
  }
  return {
    text: `Debug tracing is currently **${debugMode ? "ON" : "OFF"}**. Use \`/ari-obs-debug on\` or \`/ari-obs-debug off\`.`,
  };
}
