const { spawn } = require('node:child_process');
const env = { ...process.env };
const args = ['start', '--port', env.PORT || '8081'];
if (env.REPLIT_DEV_DOMAIN) {
  env.EXPO_PACKAGER_PROXY_URL = `https://${env.REPLIT_EXPO_DEV_DOMAIN}`;
  env.EXPO_PUBLIC_DOMAIN = env.REPLIT_DEV_DOMAIN;
  env.EXPO_PUBLIC_REPL_ID = env.REPL_ID;
  env.REACT_NATIVE_PACKAGER_HOSTNAME = env.REPLIT_DEV_DOMAIN;
  args.push('--localhost');
} else {
  args.push('--lan');
}
args.push(...process.argv.slice(2));
const child = spawn(process.execPath, [require.resolve('expo/bin/cli', { paths: [process.cwd()] }), ...args], { env, stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 1));
