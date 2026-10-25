param(
  [string]$Message = "Update site"
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

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
foreach ($file in Get-ChildItem -Path . -Filter *.html) {
  $text = [IO.File]::ReadAllText($file.FullName)
  if ($text -match $pattern) {
    [IO.File]::WriteAllText($file.FullName, [regex]::Replace($text, $pattern, $replacement), $utf8)
  }
}

git add -- *.html
git commit -m $Message -m "Terakhir diperbarui: $label" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
if ($LASTEXITCODE -ne 0) { throw "Commit gagal." }

$server = 'deployer@147.139.130.126'
$remoteDir = '/var/www/kost-tiga-a.web.id'

git push origin "HEAD:refs/heads/$branch"
if ($LASTEXITCODE -ne 0) { throw "Push branch '$branch' ke GitHub gagal." }

# cmd digunakan agar data tar mengalir sebagai biner tanpa diubah PowerShell
cmd /c "git archive --format=tar HEAD | ssh $server tar -x -C $remoteDir --no-same-owner --exclude=deploy.ps1 --exclude=.gitattributes --exclude=test --exclude=README.md"
if ($LASTEXITCODE -ne 0) { throw "Pengiriman file ke VPS gagal." }

Write-Output "Deploy selesai. Terakhir diperbarui: $label"
