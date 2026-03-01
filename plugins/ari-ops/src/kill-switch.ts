/**
 * ARI Ops Kill Switch — env-flag + runtime toggle for emergency stops.
 *
 * Scopes:
 *   skills  — block all marketplace skill tool calls
 *   network — block all outbound network tool calls
 *   all     — block everything (superset of skills+network)
 *
 * Env flags checked at call time (not cached), so changes take effect immediately:
 *   ARI_KILL_ALL=true, ARI_KILL_SKILLS=true, ARI_KILL_NETWORK=true
 */

import { ariBus } from "../../ari-shared/src/event-bus.js";
import { emitSpan } from "./tracer.js";

type KillScope = "skills" | "network" | "all";

const runtimeFlags = new Map<KillScope, boolean>();

export const killSwitch = {
  /** Check if a given scope is currently active (env OR runtime flag). */
  isActive(scope: KillScope): boolean {
    if (process.env.ARI_KILL_ALL === "true") {
      return true;
    }
    if (scope === "skills" && process.env.ARI_KILL_SKILLS === "true") {
      return true;
    }
    if (scope === "network" && process.env.ARI_KILL_NETWORK === "true") {
      return true;
    }
    return runtimeFlags.get(scope) ?? false;
  },

  /** Activate a kill scope at runtime. Broadcasts on ariBus. */
  activate(scope: KillScope, reason: string): void {
    runtimeFlags.set(scope, true);
    const ts = new Date().toISOString();
    ariBus.emit("ari:ops:kill_switch", { scope, reason, ts });
    emitSpan({ event: "kill_switch", summary: `scope=${scope} reason=${reason.slice(0, 100)}` });
  },

  /** Deactivate a runtime kill scope (does NOT clear env vars). */
  deactivate(scope: KillScope): void {
    runtimeFlags.delete(scope);
  },

  /** Current state of all scopes (runtime flags only; env is checked at isActive time). */
  state(): Record<KillScope, boolean> {
    return {
      skills: this.isActive("skills"),
      network: this.isActive("network"),
      all: this.isActive("all"),
    };
  },
};
