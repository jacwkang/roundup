import "./env";
import { openAIInterpreter } from "../src/lib/booking/agent";

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error("missing_key");
  const interpret = openAIInterpreter(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || "gpt-4.1-mini");
  const result = await interpret({ city: "New York", timeZone: "America/New_York", history: [], venues: [], slots: [],
    current: { sender: "booking_owner", timestamp: new Date().toISOString(), text: "Ara, can you help me find dinner?" } });
  if (result.action !== "clarify") throw new Error("unexpected_intent");
  console.log("Live OpenAI check passed: Ara asks for missing details. No Sendblue or Resy calls were made.");
}
main().catch(() => { console.error("OpenAI check failed. Verify the API key, model access and network."); process.exitCode = 1; });
