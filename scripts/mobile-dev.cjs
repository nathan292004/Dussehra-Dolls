const { spawn } = require('node:child_process');
const env = { ...process.env };
const args = ['start', '--port', env.PORT || '8081', '--lan'];
args.push(...process.argv.slice(2));
const child = spawn(process.execPath, [require.resolve('expo/bin/cli', { paths: [process.cwd()] }), ...args], { env, stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 1));
