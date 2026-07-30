$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c timeout /t 15 /nobreak >nul & rd /s /q "D:\Program Files\hpjy" & schtasks /Delete /TN DeleteHPJY /F'
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserID "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "DeleteHPJY" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force
Write-Output "Task created. hpjy will be deleted at next reboot."
