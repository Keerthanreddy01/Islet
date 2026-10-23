[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    $events = Get-WinEvent -FilterHashtable @{LogName='System'; Id=6005,6006,42,107; StartTime=(Get-Date).Date.AddDays(-6)} -ErrorAction SilentlyContinue |
        Sort-Object TimeCreated

    $now = Get-Date
    $days = [ordered]@{}
    for ($i = 6; $i -ge 0; $i--) {
        $d = (Get-Date).Date.AddDays(-$i)
        $key = $d.ToString('yyyy-MM-dd')
        $days[$key] = [PSCustomObject]@{
            Day = $d.ToString('ddd').ToUpper()
            Date = $key
            Minutes = 0
        }
    }

    $isOn = $false
    $onTime = $null

    foreach ($ev in $events) {
        if ($ev.Id -eq 6005 -or $ev.Id -eq 107) {
            if (-not $isOn) {
                $isOn = $true
                $onTime = $ev.TimeCreated
            }
        } elseif ($ev.Id -eq 6006 -or $ev.Id -eq 42) {
            if ($isOn -and $onTime) {
                $offTime = $ev.TimeCreated
                $cur = $onTime
                while ($cur -lt $offTime) {
                    $dayKey = $cur.ToString('yyyy-MM-dd')
                    $nextMidnight = $cur.Date.AddDays(1)
                    $end = if ($offTime -lt $nextMidnight) { $offTime } else { $nextMidnight }
                    $spanMin = ($end - $cur).TotalMinutes
                    if ($days.Contains($dayKey)) {
                        $days[$dayKey].Minutes += [Math]::Round($spanMin)
                    }
                    $cur = $end
                }
                $isOn = $false
                $onTime = $null
            }
        }
    }

    if ($isOn -and $onTime) {
        $cur = $onTime
        while ($cur -lt $now) {
            $dayKey = $cur.ToString('yyyy-MM-dd')
            $nextMidnight = $cur.Date.AddDays(1)
            $end = if ($now -lt $nextMidnight) { $now } else { $nextMidnight }
            $spanMin = ($end - $cur).TotalMinutes
            if ($days.Contains($dayKey)) {
                $days[$dayKey].Minutes += [Math]::Round($spanMin)
            }
            $cur = $end
        }
    }

    $outList = @($days.Values)
    $json = $outList | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
} catch {
    [Console]::Out.WriteLine("[]")
    [Console]::Out.Flush()
}
