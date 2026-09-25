import type { Config } from "./config";
import { Store } from "./store";
import { sendMessage, SendError } from "./sendblue";

export async function processOne(store: Store, config: Config, send = sendMessage, now = Date.now()) {
  const job = store.claim(now);
  if (!job) return false;
  if (!config.allowedChatIds.includes(job.chat_id) || !job.response) {
    store.complete(job);
    return true;
  }
  // Persist the send boundary before doing network I/O. Never auto-replay an uncertain send.
  if (!store.beginSend(job, now)) return true;
  try {
    const id = await send(config, job.chat_id, job.response);
    store.complete(job, id);
  } catch (error) {
    const failure = error instanceof SendError ? error : new SendError("unexpected_send_error", true);
    store.fail(job, failure.code, failure.uncertain);
    console.warn(JSON.stringify({ event: "send_failed", seq: job.seq, code: failure.code }));
  }
  return true;
}
