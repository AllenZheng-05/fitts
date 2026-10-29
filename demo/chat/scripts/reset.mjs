// Reseeds a running demo/chat dev server (pnpm --filter demo-chat reset).
const port = process.env.PORT ?? '5173';
const res = await fetch(`http://localhost:${port}/api/__reset`, { method: 'POST' });
console.log(res.ok ? 'demo-chat reseeded' : `reset failed: ${res.status}`);
process.exit(res.ok ? 0 : 1);
