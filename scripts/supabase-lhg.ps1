# supabase-lhg.ps1 - Helper para LHG Suprimentos (pjwsmmxnwkfklycwnptf)
# Uso: . .\scripts\supabase-lhg.ps1
#
# Requer a variavel de ambiente SUPABASE_LHG_TOKEN no .env.local ou no perfil do PowerShell.
# Alternativa: passe o token diretamente ao fazer o dot-source:
#   $env:SUPABASE_LHG_TOKEN = "sbp_..."; . .\scripts\supabase-lhg.ps1

$LHG_TOKEN = $env:SUPABASE_LHG_TOKEN
if (-not $LHG_TOKEN) {
    # fallback: tenta ler do .env.local
    $envFile = Join-Path $PSScriptRoot "..\.env.local"
    if (Test-Path $envFile) {
        $line = Select-String -Path $envFile -Pattern "^SUPABASE_LHG_TOKEN=" | Select-Object -First 1
        if ($line) { $LHG_TOKEN = $line.Line.Split("=",2)[1].Trim() }
    }
}
if (-not $LHG_TOKEN) {
    Write-Host "ERRO: defina SUPABASE_LHG_TOKEN no .env.local ou como variavel de ambiente." -ForegroundColor Red
    return
}

$LHG_PROJECT = "pjwsmmxnwkfklycwnptf"
$LHG_HEADERS = @{
    "Authorization" = "Bearer $LHG_TOKEN"
    "Content-Type"  = "application/json"
}

function Invoke-LhgSql([string]$Query) {
    $body = ConvertTo-Json @{ query = $Query } -Compress
    Invoke-RestMethod -Method POST `
        -Uri "https://api.supabase.com/v1/projects/$LHG_PROJECT/database/query" `
        -Headers $LHG_HEADERS `
        -Body $body
}

function Apply-LhgMigration([string]$Name, [string]$Query) {
    Write-Host "Aplicando migracao '$Name'..." -ForegroundColor Cyan
    Invoke-LhgSql -Query $Query | Out-Null
    Write-Host "OK - Migracao '$Name' aplicada." -ForegroundColor Green
}

function Get-LhgTables {
    $q = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
    Invoke-LhgSql -Query $q
}

function Get-LhgColumns([string]$TableName) {
    $q = "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '$TableName' ORDER BY ordinal_position;"
    Invoke-LhgSql -Query $q
}

function Get-LhgTypes {
    Write-Host "Gerando TypeScript types..." -ForegroundColor Cyan
    $r = Invoke-RestMethod -Method GET `
        -Uri "https://api.supabase.com/v1/projects/$LHG_PROJECT/types/typescript" `
        -Headers $LHG_HEADERS
    return $r.types
}

Write-Host "supabase-lhg carregado - projeto: $LHG_PROJECT" -ForegroundColor Green
