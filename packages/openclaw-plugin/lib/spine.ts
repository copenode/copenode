/**
 * The spine client: one job — carry an attested spawn request to the
 * copenode ingress and bring the decision back.
 *
 * The OpenClaw plugin NEVER decides policy. It attests who is asking
 * (requesterSenderId, provided by OpenClaw's trusted runtime context) and
 * relays the spine's verdict. Authorization rides the shared secret; the
 * policy, the budget, and the ledger live on the spine.
 */

export interface SpineConfig {
  ingressUrl: string;
  token: string;
}

export interface SpawnRequest {
  channel: string;
  senderId: string;
  text: string;
  threadRef?: string;
}

/** Pure: assemble the request body exactly as the spine expects. */
export function buildSpawnRequest(req: SpawnRequest): SpawnRequestBody {
  return {
    channel: req.channel,
    senderId: req.senderId,
    text: req.text,
    ...(req.threadRef !== undefined ? { threadRef: req.threadRef } : {}),
  };
}

export type SpawnDecision = import("../shared/protocol.ts").SpawnResponseBody;

export async function spawnAtSpine(
  config: SpineConfig,
  req: SpawnRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: number; body: SpawnDecision | { error: string } }> {
  const res = await fetchImpl(`${config.ingressUrl}/spawn`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-copenode-token": config.token,
    },
    body: JSON.stringify(buildSpawnRequest(req)),
  });
  const body = (await res.json()) as SpawnDecision | { error: string };
  return { status: res.status, body };
}

export async function spineHealth(
  config: SpineConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; verify?: boolean }> {
  const res = await fetchImpl(`${config.ingressUrl}/health`);
  return (await res.json()) as { ok: boolean; verify?: boolean };
}
