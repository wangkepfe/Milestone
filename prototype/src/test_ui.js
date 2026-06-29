// Smoke-test the spectator server: serves the page + a valid replay.
import { createServer } from "./server.js";
const server = createServer();
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const html = await (await fetch(base + "/")).text();
const demo = await (await fetch(base + "/demo?a=googlitch&b=shallowseek")).json();
console.log("page:", html.length, "bytes · has #seatA:", html.includes('id="seatA"'), "· has script:", html.includes("newMatch"));
console.log("replay:", demo.turns.length, "turns · result:", JSON.stringify(demo.result), "·", demo.a, "vs", demo.b);
const t = demo.turns[0];
console.log("turn0:", t.seat, t.company, "T" + t.turnNumber, "actions:", JSON.stringify(t.actions), "· A.board:", t.A.board.length, "A.hand:", t.A.hand.length);
server.close();
console.log("UI server OK.");
