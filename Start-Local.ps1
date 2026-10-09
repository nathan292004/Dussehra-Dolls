Set-Location $PSScriptRoot
& "$PSScriptRoot/.tools/node_modules/node-win-x64/bin/node.exe" scripts/local-dev.mjs @args
exit $LASTEXITCODE
