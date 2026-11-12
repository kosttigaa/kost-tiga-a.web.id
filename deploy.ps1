param(
  [string]$Message = "Update site"
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$sshKey = Join-Path $HOME '.ssh\kost-tiga-a-admin'
if (-not (Test-Path $sshKey)) {
  Write-Error "SSH key tidak ditemukan: $sshKey"
}

$dirty = git status --porcelain
if ($dirty) {
  Write-Error "Ada perubahan yang belum di-commit. Commit atau batalkan dulu sebelum deploy."
}

$branch = git branch --show-current
if (-not $branch) {
  Write-Error "Tidak bisa deploy dari detached HEAD. Pindah ke branch terlebih dahulu."
}

$wib = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'SE Asia Standard Time')
$months = 'Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'
$iso = $wib.ToString("yyyy-MM-dd'T'HH:mm:ss") + '+07:00'
$label = '{0} {1} {2}, {3} WIB' -f $wib.Day, $months[$wib.Month - 1], $wib.Year, $wib.ToString('HH:mm:ss')
$replacement = "Terakhir diperbarui: <time datetime=`"$iso`">$label</time>"
$pattern = 'Terakhir diperbarui: <time datetime="[^"]*">[^<]*</time>'

$utf8 = New-Object System.Text.UTF8Encoding($false)
$targetFiles = @(Get-ChildItem -Path . -Filter *.html) + @(Get-Item -Path .\server.js)
foreach ($file in $targetFiles) {
  $text = [IO.File]::ReadAllText($file.FullName)
  if ($text -match $pattern) {
    [IO.File]::WriteAllText($file.FullName, [regex]::Replace($text, $pattern, $replacement), $utf8)
  }
}

git add -- *.html server.js
git commit -m $Message -m "Terakhir diperbarui: $label" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
if ($LASTEXITCODE -ne 0) { throw "Commit gagal." }

$servers = @(
  @{ Name = 'VPS Utama'; Host = 'admin@147.139.130.126' },
  @{ Name = 'VPS Standby'; Host = 'admin@162.35.171.78' }
)
$remoteDir = '/var/www/kost-tiga-a.web.id'

git push origin "HEAD:refs/heads/$branch"
if ($LASTEXITCODE -ne 0) { throw "Push branch '$branch' ke GitHub gagal." }

foreach ($srv in $servers) {
  $target = $srv.Host
  $srvName = $srv.Name
  Write-Output "[$srvName] Mengirim file ke $target..."
  cmd /c "git archive --format=tar HEAD | ssh -i `"$sshKey`" -o IdentitiesOnly=yes $target tar -x -C $remoteDir --no-same-owner --exclude=deploy.ps1 --exclude=.gitattributes --exclude=test --exclude=README.md"
  if ($LASTEXITCODE -ne 0) { throw "Pengiriman file ke $srvName gagal." }

  Write-Output "[$srvName] Merestart PM2..."
  ssh -i $sshKey -o IdentitiesOnly=yes $target "pm2 restart kost-tiga-a"
  if ($LASTEXITCODE -ne 0) { throw "Restart PM2 di $srvName gagal." }

  ssh -i $sshKey -o IdentitiesOnly=yes $target "sleep 2; curl -fsS -o /dev/null http://127.0.0.1:3000/"
  if ($LASTEXITCODE -ne 0) { throw "Aplikasi kost-tiga-a tidak merespons di $srvName." }
  Write-Output "[$srvName] Berhasil diperbarui dan aktif."
}

Write-Output "Deploy selesai ke semua server. Terakhir diperbarui: $label"
