# Windows GSMTC Media Worker for Islet
# Communicates with Electron main process via stdout (JSON events) and command file

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
}

function Await-WinRt($asyncOp, $type) {
    if (-not $asyncOp) { return $null }
    try {
        $method = $asTaskGeneric.MakeGenericMethod($type)
        $task = $method.Invoke($null, @($asyncOp))
        $task.Wait()
        return $task.Result
    } catch {
        return $null
    }
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime] | Out-Null

$mgrOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
$mgr = Await-WinRt $mgrOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

if (-not $mgr) {
    [Console]::Out.WriteLine('{"type":"error","message":"GSMTC manager unavailable"}')
    [Console]::Out.Flush()
    exit 1
}

$artCacheDir = Join-Path $env:TEMP "islet-media-art"
if (-not (Test-Path $artCacheDir)) {
    New-Item -ItemType Directory -Path $artCacheDir -Force | Out-Null
}

$cmdFile = Join-Path $artCacheDir "cmd.txt"
$lastStateSig = ""
$lastArtFile = ""
$lastArtSig = ""
$consecutiveNullSnapshots = 0
$inCommandTransitionTicks = 0

function Get-MediaSnapshot {
    $session = $mgr.GetCurrentSession()
    $status = ""
    if ($session) {
        $info = $session.GetPlaybackInfo()
        if ($info) {
            $status = $info.PlaybackStatus.ToString().ToLower()
        }
    }

    # If no current session or current session is closed/stopped, check all sessions
    if (-not $session -or $status -eq "closed" -or $status -eq "stopped") {
        $session = $null
        $all = $mgr.GetSessions()
        if ($all -and $all.Count -gt 0) {
            # Priority 1: session currently playing
            foreach ($s in $all) {
                $pInfo = $s.GetPlaybackInfo()
                if ($pInfo -and $pInfo.PlaybackStatus.ToString().ToLower() -eq "playing") {
                    $session = $s
                    $status = "playing"
                    break
                }
            }
            # Priority 2: session currently paused
            if (-not $session) {
                foreach ($s in $all) {
                    $pInfo = $s.GetPlaybackInfo()
                    if ($pInfo -and $pInfo.PlaybackStatus.ToString().ToLower() -eq "paused") {
                        $session = $s
                        $status = "paused"
                        break
                    }
                }
            }
        }
    }

    # If no session or status is neither playing nor paused, no active media
    if (-not $session -or ($status -ne "playing" -and $status -ne "paused")) {
        return $null
    }

    $propOp = $session.TryGetMediaPropertiesAsync()
    $prop = Await-WinRt $propOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    if (-not $prop) {
        return $null
    }

    $title = if ($prop.Title) { $prop.Title } else { "" }
    $artist = if ($prop.Artist) { $prop.Artist } else { "" }
    $album = if ($prop.AlbumTitle) { $prop.AlbumTitle } else { "" }
    $app = if ($session.SourceAppUserModelId) { $session.SourceAppUserModelId } else { "Media" }

    if (-not $title -and -not $artist) {
        return $null
    }

    $timeline = $session.GetTimelineProperties()
    $posMs = if ($timeline) { [Math]::Round($timeline.Position.TotalMilliseconds) } else { 0 }
    $durMs = if ($timeline) { [Math]::Round($timeline.EndTime.TotalMilliseconds) } else { 0 }

    # Handle artwork
    $artSig = "$title::$artist"
    $artPath = $script:lastArtFile

    if ($artSig -ne $script:lastArtSig -or -not (Test-Path $script:lastArtFile)) {
        $script:lastArtSig = $artSig
        $thumbSaved = $false
        if ($prop.Thumbnail) {
            try {
                $stream = Await-WinRt ($prop.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
                if ($stream) {
                    $asStreamMethod = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1 }
                    $netStream = $asStreamMethod[0].Invoke($null, @($stream))
                    $hash = [Math]::Abs($artSig.GetHashCode())
                    $filePath = Join-Path $artCacheDir "art-$hash.jpg"
                    $fileStream = [System.IO.File]::Create($filePath)
                    $netStream.CopyTo($fileStream)
                    $fileStream.Dispose()
                    $netStream.Dispose()
                    $script:lastArtFile = $filePath
                    $artPath = $filePath
                    $thumbSaved = $true
                }
            } catch {
                # Thumbnail fallback
            }
        }
        if (-not $thumbSaved) {
            $script:lastArtFile = ""
            $artPath = ""
        }
    }

    return [PSCustomObject]@{
        type = "media"
        app = $app
        title = $title
        artist = $artist
        album = $album
        status = $status
        positionMs = $posMs
        durationMs = $durMs
        artworkPath = $artPath
    }
}

# Main fast-poll loop (100ms cycle)
$pollCounter = 0
while ($true) {
    # 1. Check for command file with priority
    if (Test-Path $cmdFile) {
        try {
            $cmd = (Get-Content $cmdFile -Raw -ErrorAction SilentlyContinue).Trim().ToLower()
            Remove-Item $cmdFile -Force -ErrorAction SilentlyContinue
            $session = $mgr.GetCurrentSession()
            if (-not $session) {
                $all = $mgr.GetSessions()
                if ($all -and $all.Count -gt 0) {
                    $session = $all[0]
                }
            }
            if ($session -and $cmd) {
                $script:inCommandTransitionTicks = 12 # Guard ~1.2s during track command
                if ($cmd -eq "play-pause") {
                    [void]$session.TryTogglePlayPauseAsync()
                } elseif ($cmd -eq "play") {
                    [void]$session.TryPlayAsync()
                } elseif ($cmd -eq "pause") {
                    [void]$session.TryPauseAsync()
                } elseif ($cmd -eq "next") {
                    [void]$session.TrySkipNextAsync()
                } elseif ($cmd -eq "previous") {
                    [void]$session.TrySkipPreviousAsync()
                }
            }
        } catch {
            # Ignore command read errors
        }
    }

    if ($script:inCommandTransitionTicks -gt 0) {
        $script:inCommandTransitionTicks--
    }

    # 2. Check snapshot every ~200ms (every 2 ticks)
    $pollCounter++
    if ($pollCounter -ge 2) {
        $pollCounter = 0
        $snapshot = Get-MediaSnapshot
        if ($snapshot) {
            $script:consecutiveNullSnapshots = 0
            $json = $snapshot | ConvertTo-Json -Compress
            $sig = "$($snapshot.app):$($snapshot.title):$($snapshot.artist):$($snapshot.status):$([Math]::Floor($snapshot.positionMs / 1000))"
            if ($sig -ne $lastStateSig) {
                $lastStateSig = $sig
                [Console]::Out.WriteLine($json)
                [Console]::Out.Flush()
            }
        } else {
            # In command transition (e.g. Next/Prev clicked), suppress stopped event
            if ($script:inCommandTransitionTicks -eq 0) {
                $script:consecutiveNullSnapshots++
                # Require 2 consecutive null checks (~400ms) before reporting stopped
                if ($script:consecutiveNullSnapshots -ge 2) {
                    if ($lastStateSig -ne "none") {
                        $lastStateSig = "none"
                        [Console]::Out.WriteLine('{"type":"media","status":"stopped"}')
                        [Console]::Out.Flush()
                    }
                }
            }
        }
    }

    Start-Sleep -Milliseconds 100
}
