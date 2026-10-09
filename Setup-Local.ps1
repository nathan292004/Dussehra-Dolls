$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
& npm.cmd install --prefix .tools --cache .tools/npm-cache --no-audit --no-fund pnpm@10.32.1 node-win-x64@24.21.0 '@embedded-postgres/windows-x64@16.14.0-beta.17'
if ($LASTEXITCODE -ne 0) { throw 'Local tools installation failed.' }
& "$PSScriptRoot/.tools/node_modules/node-win-x64/bin/node.exe" "$PSScriptRoot/.tools/node_modules/pnpm/bin/pnpm.cjs" install --store-dir .tools/pnpm-store --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Workspace dependencies installation failed.' }
& "$PSScriptRoot/.tools/node_modules/node-win-x64/bin/node.exe" scripts/local-dev.mjs --setup-db
if ($LASTEXITCODE -ne 0) { throw 'Local database setup failed.' }
