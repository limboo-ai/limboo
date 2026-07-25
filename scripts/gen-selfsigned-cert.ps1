<#
.SYNOPSIS
  Generate a self-signed Authenticode certificate for signing Limboo's Windows
  build, and print it base64-encoded for use as a CI secret.

.DESCRIPTION
  This is the free Windows signing route. Read this before using it:

  A self-signed certificate DOES NOT remove SmartScreen warnings. It is not
  chained to a trusted root, so Windows treats the signature as untrusted — the
  "Windows protected your PC" screen still appears. What it does give you is a
  stable publisher identity and a tamper-evident binary for anyone who chooses
  to trust the certificate explicitly. The warning-free Windows route is the
  Microsoft Store channel (see docs/operations/microsoft-store.md); the
  warning-free direct-download route needs a paid, chain-trusted certificate
  (Azure Trusted Signing is already wired in scripts/signing.cjs).

  Because the certificate is untrusted, `win.publisherName` must stay unset in
  electron-builder.yml — otherwise electron-updater's Authenticode check runs,
  fails, and breaks every Windows auto-update. See that file for the full note.

  Generate the certificate ONCE and store it as a secret. Regenerating it on
  every build would change the publisher identity release to release, which is
  worse than not signing at all.

.EXAMPLE
  pwsh -File scripts/gen-selfsigned-cert.ps1 -Password 'a-strong-password'

  Then store the printed base64 as WINDOWS_SELF_SIGNED_PFX and the password as
  WINDOWS_SELF_SIGNED_PFX_PASSWORD in your CI secret store.
#>
[CmdletBinding()]
param(
  # Subject common name. Keep this stable across releases.
  [string]$Subject = 'CN=Limboo, O=Limboo, C=US',
  # Password protecting the exported .pfx. Required.
  [Parameter(Mandatory = $true)][string]$Password,
  # How long the certificate stays valid.
  [int]$ValidYears = 5,
  # Where to write the .pfx. Defaults to a temp file that is deleted after
  # printing, so the private key never lingers in the repo.
  [string]$OutFile
)

$ErrorActionPreference = 'Stop'

$temporary = -not $OutFile
if ($temporary) {
  $OutFile = Join-Path ([System.IO.Path]::GetTempPath()) "limboo-selfsigned-$([guid]::NewGuid()).pfx"
}

Write-Host "Generating a self-signed code-signing certificate for $Subject ..."

# CodeSigningCert is the type Authenticode requires; a plain SSL certificate is
# rejected by signtool.
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject $Subject `
  -KeyUsage DigitalSignature `
  -KeyAlgorithm RSA `
  -KeyLength 3072 `
  -CertStoreLocation 'Cert:\CurrentUser\My' `
  -NotAfter (Get-Date).AddYears($ValidYears)

$securePassword = ConvertTo-SecureString -String $Password -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $OutFile -Password $securePassword | Out-Null

# Remove the certificate from the personal store: the .pfx is the artifact we
# want, and leaving the private key installed on a shared machine is not.
Remove-Item -Path "Cert:\CurrentUser\My\$($cert.Thumbprint)" -DeleteKey -Force

$base64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($OutFile))

Write-Host ''
Write-Host "Thumbprint: $($cert.Thumbprint)"
Write-Host "Valid until: $($cert.NotAfter)"
Write-Host ''
Write-Host 'Store these as CI secrets:'
Write-Host '  WINDOWS_SELF_SIGNED_PFX           = (the base64 below)'
Write-Host '  WINDOWS_SELF_SIGNED_PFX_PASSWORD  = (the password you passed in)'
Write-Host ''
Write-Output $base64

if ($temporary) {
  Remove-Item -Path $OutFile -Force
  Write-Host ''
  Write-Host 'Temporary .pfx deleted. The base64 above is the only copy — save it now.'
} else {
  Write-Host ''
  Write-Host "Wrote $OutFile — treat it as a secret and do not commit it."
}
