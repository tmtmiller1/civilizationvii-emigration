function parseArgs(argv) {
  const out = { metric: "unknown_metric", reason: "instrumentation pending", json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--metric" && i + 1 < argv.length) out.metric = argv[++i];
    else if (a === "--reason" && i + 1 < argv.length) out.reason = argv[++i];
    else if (a === "--json") out.json = true;
  }
  return out;
}

const { metric, reason, json } = parseArgs(process.argv.slice(2));
const result = {
  metric,
  value: null,
  status: "pending_instrumentation",
  reason,
  measuredAt: new Date().toISOString()
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`${metric}=null`);
  console.log(`status=pending_instrumentation reason=${reason}`);
}

process.exit(0);
