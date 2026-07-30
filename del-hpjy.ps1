$signature = @'
[DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
public static extern bool MoveFileEx(string lpExistingFileName, string lpNewFileName, uint dwFlags);
'@
$type = Add-Type -MemberDefinition $signature -Name "Win32MoveFile" -Namespace "Win32" -PassThru

$path = 'D:\Program Files\hpjy'
$files = Get-ChildItem $path -Recurse -File -ErrorAction SilentlyContinue
$count = 0
foreach ($f in $files) {
    if ($type::MoveFileEx($f.FullName, $null, 0x4)) { $count++ }
}
Write-Output "Marked $count files for deletion on reboot"

$dirs = Get-ChildItem $path -Recurse -Directory -ErrorAction SilentlyContinue | Sort-Object FullName -Descending
foreach ($d in $dirs) {
    $type::MoveFileEx($d.FullName, $null, 0x4) | Out-Null
}
$type::MoveFileEx($path, $null, 0x4) | Out-Null
Write-Output 'Done - hpjy will be deleted on next reboot'
