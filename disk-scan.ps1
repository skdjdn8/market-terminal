# C盘用户目录
$userFolders = @(
    'C:\Users\32787\AppData\Local',
    'C:\Users\32787\AppData\Roaming',
    'C:\Users\32787\Desktop',
    'C:\Users\32787\Documents',
    'C:\Users\32787\Downloads',
    'C:\Users\32787\Pictures',
    'C:\Users\32787\Music',
    'C:\Users\32787\Videos',
    'C:\Users\32787\.cache'
)

Write-Output "========== C盘用户目录 =========="
foreach ($f in $userFolders) {
    if (Test-Path $f) {
        $size = (Get-ChildItem -Path $f -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1GB
        Write-Output ('{0,8:N2} GB  -  {1}' -f $size, $f)
    }
}

# C盘系统目录
Write-Output "`n========== C盘系统目录 =========="
$sysFolders = @(
    'C:\Program Files',
    'C:\Program Files (x86)',
    'C:\Windows',
    'C:\ProgramData'
)
foreach ($f in $sysFolders) {
    if (Test-Path $f) {
        $size = (Get-ChildItem -Path $f -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1GB
        Write-Output ('{0,8:N2} GB  -  {1}' -f $size, $f)
    }
}

# D盘
Write-Output "`n========== D盘根目录 =========="
$dFolders = Get-ChildItem -Path 'D:\' -Directory -ErrorAction SilentlyContinue
foreach ($f in $dFolders) {
    $size = (Get-ChildItem -Path $f.FullName -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1GB
    Write-Output ('{0,8:N2} GB  -  {1}' -f $size, $f.FullName)
}

Write-Output "`n========== 完成 =========="
