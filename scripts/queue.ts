import "./env";
import { Store } from "../src/lib/messaging/store";
const store = new Store(process.env.ARA_DATABASE_PATH || "./data/ara-sendblue.db");
try {
  const [action, value, outcome, handle] = process.argv.slice(2);
  if (action === "retry" && /^\d+$/.test(value ?? "")) {
    console.log({ retried: store.retry(Number(value)) });
  } else if (action === "resolve" && /^\d+$/.test(value ?? "") && (outcome === "sent" || outcome === "not-sent")) {
    console.log({ resolved: store.resolve(Number(value), outcome, handle) });
  } else if (!action || action === "list") {
    console.table(store.list());
  } else {
    throw new Error("Usage: npm run queue -- [list | retry SEQ | resolve SEQ sent HANDLE | resolve SEQ not-sent]");
  }
} finally { store.close(); }
