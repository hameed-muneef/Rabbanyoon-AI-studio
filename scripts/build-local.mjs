import { spawn } from 'node:child_process';
process.env.VITE_LOCAL_ONLY = 'true';
const run = (cmd, args) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: true, env: process.env });
  p.on('close', code => code === 0 ? resolve() : reject(new Error(cmd + ' exited ' + code)));
});
await run('npx', ['tsc', '-b']);
await run('npx', ['vite', 'build']);