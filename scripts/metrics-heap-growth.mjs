import { spawnSync } from "node:child_process";

function buildFlows(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      from: i % 128,
      to: (i + 17) % 128,
      fromName: "Civ" + (i % 128),
      toName: "Civ" + ((i + 17) % 128),
      fromCity: "S" + i,
      toCity: "D" + i,
      people: 500 + (i % 1000),
      byCause: { war: 500 + (i % 1000) }
    });
  }
  return out;
}

const args = process.argv.slice(2);
const itersIdx = args.indexOf("--iterations");
const iterations = itersIdx >= 0 ? Math.max(10, Number(args[itersIdx + 1]) || 100) : 100;
const asJson = args.includes("--json");

const childProgram = `
import { flowNetwork } from '/emigration/ui/emigration-views.js';
function buildFlows(n){
  const out=[];
  for(let i=0;i<n;i++) out.push({from:i%128,to:(i+17)%128,fromName:'Civ'+(i%128),toName:'Civ'+((i+17)%128),fromCity:'S'+i,toCity:'D'+i,people:500+(i%1000),byCause:{war:500+(i%1000)}});
  return out;
}
const iterations=${iterations};
if (typeof globalThis.gc === 'function') globalThis.gc();
const start=process.memoryUsage().heapUsed;
const flows=buildFlows(20000);
for(let i=0;i<iterations;i++) flowNetwork(flows,16);
if (typeof globalThis.gc === 'function') globalThis.gc();
const end=process.memoryUsage().heapUsed;
const deltaMb=(end-start)/(1024*1024);
const per100=Number(((deltaMb/iterations)*100).toFixed(4));
console.log(JSON.stringify({heap_start_mb:Number((start/(1024*1024)).toFixed(2)),heap_end_mb:Number((end/(1024*1024)).toFixed(2)),delta_mb:Number(deltaMb.toFixed(4)),value:per100,gc_enabled:typeof globalThis.gc==='function'}));
`;

const r = spawnSync("node", ["--expose-gc", "--loader", "./tests/loader.mjs", "--input-type=module", "-e", childProgram], {
  cwd: process.cwd(),
  encoding: "utf8"
});

if (r.status !== 0) {
  console.error(r.stderr || r.stdout || "heap collector failed");
  process.exit(r.status || 1);
}

const measured = JSON.parse((r.stdout || "{}").trim().split(/\r?\n/).pop() || "{}");
const out = {
  metric: "long_session_heap_growth_mb_per_100_turns",
  iterations,
  ...measured,
  measuredAt: new Date().toISOString(),
  note: "Synthetic stress over flowNetwork hot path; proxy for long-session heap growth trend."
};

if (asJson) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`value=${out.value}`);
  console.log(`delta_mb=${out.delta_mb}`);
}
