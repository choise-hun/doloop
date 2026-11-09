# Keep native CLI pipes UTF-8 under Windows PowerShell 5.1.
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$entryPoint = $args[0]
$entryArgs = @($args | Select-Object -Skip 1)
& $entryPoint @entryArgs
exit $LASTEXITCODE
