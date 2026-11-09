# UTF-8 source contains only ASCII for compatibility with Windows PowerShell 5.1.
# Example: .\scripts\Invoke-LlmHandoff.ps1 status --id demo
& python (Join-Path $PSScriptRoot 'llm-handoff.py') @args
exit $LASTEXITCODE
