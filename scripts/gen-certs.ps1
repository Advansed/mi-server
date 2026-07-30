# Generate a local CA + server + client certs for mTLS testing (Windows / OpenSSL).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$certs = Join-Path $root "certs"
$openssl = $null
foreach ($c in @(
  "openssl",
  "C:\Program Files\Git\usr\bin\openssl.exe",
  "C:\Program Files\Git\bin\openssl.exe"
)) {
  if ($c -eq "openssl") {
    $cmd = Get-Command openssl -ErrorAction SilentlyContinue
    if ($cmd) { $openssl = $cmd.Source; break }
  } elseif (Test-Path $c) {
    $openssl = $c; break
  }
}
if (-not $openssl) { throw "openssl not found. Install OpenSSL or Git for Windows." }

New-Item -ItemType Directory -Force -Path $certs | Out-Null
Push-Location $certs
try {
  & $openssl genrsa -out ca.key 2048
  & $openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt -subj "/CN=mi-server-ca"

  & $openssl genrsa -out server.key 2048
  & $openssl req -new -key server.key -out server.csr -subj "/CN=localhost"
  & $openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 825 -sha256

  & $openssl genrsa -out client.key 2048
  & $openssl req -new -key client.key -out client.csr -subj "/CN=mi-client"
  & $openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out client.crt -days 825 -sha256

  Remove-Item server.csr, client.csr, ca.srl -ErrorAction SilentlyContinue
  Write-Host "Certs written to $certs"
} finally {
  Pop-Location
}
