import { createLedger, memoryStore } from "@copenode/core";
import { AguiMeter } from "./meter.ts";

const store = memoryStore();
const ledger = createLedger({ store });
const meter = new AguiMeter({ sender: "dbg", tier: "owner" }, store);

console.log("consume RUN_STARTED:");
meter.consume({ type: "RUN_STARTED", data: { runId: "r" } });
console.log("rows:", ledger.trail().length);
console.log("meter rows:", meter.ledger.trail().length);
console.log("settled:", meter.settled);
meter.consume({ type: "RUN_FINISHED", data: {} });
console.log("after finish rows:", ledger.trail().length);
