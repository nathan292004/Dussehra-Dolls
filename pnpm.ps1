$env:PATH = "$PSScriptRoot/.tools/node_modules/node-win-x64/bin;$PSScriptRoot/.tools/node_modules/.bin;$env:PATH"
$env:npm_config_store_dir = "$PSScriptRoot/.tools/pnpm-store"
& "$PSScriptRoot/.tools/node_modules/node-win-x64/bin/node.exe" "$PSScriptRoot/.tools/node_modules/pnpm/bin/pnpm.cjs" @args
exit $LASTEXITCODE
