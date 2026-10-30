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

# Windows CoreAudio Endpoint Volume Interop
$audioInterop = @'
using System;
using System.Runtime.InteropServices;

namespace IsletAudio {
    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioEndpointVolume {
        int RegisterControlChangeNotify(IntPtr pNotify);
        int UnregisterControlChangeNotify(IntPtr pNotify);
        int GetChannelCount(out uint pnChannelCount);
        int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
        int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
        int GetMasterVolumeLevel(out float pfLevelDB);
        int GetMasterVolumeLevelScalar(out float pfLevel);
        int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
        int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
        int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
        int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
        int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
        int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
        int VolumeStepUp(Guid pguidEventContext);
        int VolumeStepDown(Guid pguidEventContext);
        int QueryHardwareSupport(out uint pdwHardwareSupportMask);
        int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice {
        int Activate(ref Guid id, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object val);
        int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
        int GetState(out int pdwState);
    }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint);
    }

    public static class AudioMaster {
        private static IAudioEndpointVolume GetEndpoint() {
            try {
                var t = Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"));
                var obj = Activator.CreateInstance(t);
                var enumerator = (IMMDeviceEnumerator)obj;
                IMMDevice dev = null;
                enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                if (dev == null) return null;
                var iid = typeof(IAudioEndpointVolume).GUID;
                object epvObj = null;
                dev.Activate(ref iid, 1, IntPtr.Zero, out epvObj);
                return (IAudioEndpointVolume)epvObj;
            } catch {
                return null;
            }
        }

        public static float Get() {
            try {
                var ep = GetEndpoint();
                if (ep == null) return -1f;
                float v = 0;
                ep.GetMasterVolumeLevelScalar(out v);
                return v;
            } catch {
                return -1f;
            }
        }

        public static bool Set(float v) {
            try {
                var ep = GetEndpoint();
                if (ep == null) return false;
                ep.SetMasterVolumeLevelScalar(v, Guid.Empty);
                return true;
            } catch {
                return false;
            }
        }

        public static bool GetMute() {
            try {
                var ep = GetEndpoint();
                if (ep == null) return false;
                bool m;
                ep.GetMute(out m);
                return m;
            } catch {
                return false;
            }
        }

        public static bool SetMute(bool m) {
            try {
                var ep = GetEndpoint();
                if (ep == null) return false;
                ep.SetMute(m, Guid.Empty);
                return true;
            } catch {
                return false;
            }
        }
    }
}
'@

try {
    Add-Type -TypeDefinition $audioInterop -ErrorAction SilentlyContinue
} catch {}

$cmdFile = Join-Path $artCacheDir "cmd.txt"
$lastStateSig = ""
$lastArtFile = ""
$lastArtSig = ""
$lastArtAttemptCount = 0
$consecutiveNullSnapshots = 0
$inCommandTransitionTicks = 0

function Get-ActiveMediaSession {
    $all = $mgr.GetSessions()
    $selectedSession = $null
    $selectedStatus = ""

    # Priority 1: Check if the system's current session is actively playing
    $curr = $mgr.GetCurrentSession()
    if ($curr) {
        $pInfo = $curr.GetPlaybackInfo()
        if ($pInfo -and $pInfo.PlaybackStatus.ToString().ToLower() -eq "playing") {
            $selectedSession = $curr
            $selectedStatus = "playing"
        }
    }

    # Priority 2: If current session is not playing, scan all sessions for any session that IS playing
    if (-not $selectedSession -and $all -and $all.Count -gt 0) {
        foreach ($s in $all) {
            $pInfo = $s.GetPlaybackInfo()
            if ($pInfo -and $pInfo.PlaybackStatus.ToString().ToLower() -eq "playing") {
                $selectedSession = $s
                $selectedStatus = "playing"
                break
            }
        }
    }

    # Priority 3: If no session is playing, prefer current session if paused
    if (-not $selectedSession -and $curr) {
        $pInfo = $curr.GetPlaybackInfo()
        if ($pInfo -and $pInfo.PlaybackStatus.ToString().ToLower() -eq "paused") {
            $selectedSession = $curr
            $selectedStatus = "paused"
        }
    }

    # Priority 4: If still no session, scan all sessions for any paused session
    if (-not $selectedSession -and $all -and $all.Count -gt 0) {
        foreach ($s in $all) {
            $pInfo = $s.GetPlaybackInfo()
            if ($pInfo -and $pInfo.PlaybackStatus.ToString().ToLower() -eq "paused") {
                $selectedSession = $s
                $selectedStatus = "paused"
                break
            }
        }
    }

    return @{ Session = $selectedSession; Status = $selectedStatus }
}

function Get-MediaSnapshot {
    $activeInfo = Get-ActiveMediaSession
    $session = $activeInfo.Session
    $status = $activeInfo.Status

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

    $playbackType = ""
    try {
        if ($prop.PlaybackType) {
            $playbackType = $prop.PlaybackType.ToString().ToLower()
        }
    } catch {}

    $sourceHint = ""
    $appLower = $app.ToLower()
    $titleLower = $title.ToLower()
    $artistLower = $artist.ToLower()
    $albumLower = $album.ToLower()

    # 1. Native application identification by SourceAppUserModelId
    if ($appLower -match "spotify") {
        $sourceHint = "spotify"
    } elseif ($appLower -match "apple|itunes") {
        $sourceHint = "apple-music"
    } elseif ($appLower -match "vlc") {
        $sourceHint = "vlc"
    } else {
        # 2. Check if the session is from a web browser
        $isBrowser = $appLower -match "brave|chrome|msedge|edge|firefox|opera|operagx|vivaldi|arc|zen|browser"

        # 3. Direct metadata signals (YouTube, Apple Music)
        if ($titleLower -match "youtube|youtu\.be" -or $artistLower -match "youtube" -or $albumLower -match "youtube") {
            $sourceHint = "youtube"
        } elseif ($titleLower -match "apple\s*music" -or $artistLower -match "apple\s*music") {
            $sourceHint = "apple-music"
        } elseif ($isBrowser) {
            # Browser process window inspection for active tab / window title
            $targetProcNames = @()
            if ($appLower -match "brave") { $targetProcNames = @("brave") }
            elseif ($appLower -match "chrome") { $targetProcNames = @("chrome") }
            elseif ($appLower -match "msedge|edge") { $targetProcNames = @("msedge") }
            elseif ($appLower -match "firefox") { $targetProcNames = @("firefox") }
            elseif ($appLower -match "opera") { $targetProcNames = @("opera", "operagx") }
            elseif ($appLower -match "vivaldi") { $targetProcNames = @("vivaldi") }
            elseif ($appLower -match "arc") { $targetProcNames = @("arc") }
            elseif ($appLower -match "zen") { $targetProcNames = @("zen") }
            else { $targetProcNames = @("brave", "chrome", "msedge", "firefox", "opera", "operagx", "vivaldi", "arc", "zen") }

            try {
                $browserProcs = Get-Process -Name $targetProcNames -ErrorAction SilentlyContinue |
                    Where-Object { $_.MainWindowTitle }

                # Check if any browser window title has YouTube
                foreach ($bp in $browserProcs) {
                    $wt = $bp.MainWindowTitle.ToLower()
                    if ($wt -match "youtube|youtu\.be") {
                        $sourceHint = "youtube"
                        break
                    }
                }

                # Check for Spotify Web: ONLY if the window title specifically indicates Spotify Web Player
                # (e.g. "Spotify - Web Player" or ends with "- Spotify" / "• Spotify")
                if (-not $sourceHint) {
                    foreach ($bp in $browserProcs) {
                        $wt = $bp.MainWindowTitle.ToLower()
                        if ($wt -match "spotify" -and ($wt -match "web\s*player" -or $wt -match "(?:-|\u2013|\u2014|\u2022)\s*spotify")) {
                            $sourceHint = "spotify"
                            break
                        }
                    }
                }
            } catch {}

            # If not explicitly YouTube or Spotify, but playbackType is video:
            if (-not $sourceHint) {
                if ($playbackType -eq "video") {
                    if ($titleLower -match "-\s*youtube") {
                        $sourceHint = "youtube"
                    } else {
                        $sourceHint = "browser"
                    }
                } else {
                    $sourceHint = "browser"
                }
            }
        } else {
            $sourceHint = "generic"
        }
    }

    $timeline = $session.GetTimelineProperties()
    $posMs = 0
    $durMs = 0
    $lastUpdatedEpochMs = [Math]::Round(([DateTimeOffset]::UtcNow - [DateTimeOffset]::FromUnixTimeMilliseconds(0)).TotalMilliseconds)
    if ($timeline) {
        $posMs = [Math]::Round($timeline.Position.TotalMilliseconds)
        $durMs = [Math]::Round($timeline.EndTime.TotalMilliseconds)

        if ($status -eq "playing" -and $timeline.LastUpdatedTime -and $timeline.LastUpdatedTime.Year -gt 2000) {
            try {
                $elapsedMs = ([DateTimeOffset]::UtcNow - $timeline.LastUpdatedTime.ToUniversalTime()).TotalMilliseconds
                if ($elapsedMs -gt 0 -and $elapsedMs -lt 86400000) {
                    $posMs = [Math]::Round($posMs + $elapsedMs)
                    if ($durMs -gt 0 -and $posMs -gt $durMs) {
                        $posMs = $durMs
                    }
                }
            } catch {}
        }
    }

    # Handle artwork
    $artSig = "$app::$sourceHint::$title::$artist"
    $artPath = ""
    $artFileValid = $false

    if (-not [string]::IsNullOrEmpty($script:lastArtFile)) {
        try {
            if (Test-Path -LiteralPath $script:lastArtFile) {
                $item = Get-Item -LiteralPath $script:lastArtFile -ErrorAction SilentlyContinue
                if ($item -and $item.Length -gt 0) {
                    $artFileValid = $true
                }
            }
        } catch {}
    }

    # Reset retry counter and artwork path on session/song change
    if ($artSig -ne $script:lastArtSig) {
        $script:lastArtSig = $artSig
        $script:lastArtAttemptCount = 0
        $script:lastArtFile = ""
        $artFileValid = $false
        $artPath = ""
    }

    # If artwork file is not yet valid and we haven't exceeded retry attempts (~1s)
    if (-not $artFileValid -and $script:lastArtAttemptCount -lt 6) {
        $script:lastArtAttemptCount++
        $hash = [Math]::Abs($artSig.GetHashCode())
        $filePath = Join-Path $artCacheDir "art-$hash.jpg"
        $thumbSaved = $false

        # 1. Check existing valid cached artwork for this track first
        if (Test-Path -LiteralPath $filePath) {
            $item = Get-Item -LiteralPath $filePath -ErrorAction SilentlyContinue
            if ($item -and $item.Length -gt 0) {
                $script:lastArtFile = $filePath
                $artPath = $filePath
                $thumbSaved = $true
            }
        }

        # 2. Extract from GSMTC Thumbnail stream if available
        if (-not $thumbSaved -and $prop.Thumbnail) {
            try {
                $stream = Await-WinRt ($prop.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
                if ($stream) {
                    $asStreamMethod = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1 }
                    $netStream = $asStreamMethod[0].Invoke($null, @($stream))
                    $tempPath = "$filePath.tmp"
                    $fileStream = [System.IO.File]::Open($tempPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
                    $netStream.CopyTo($fileStream)
                    $fileStream.Dispose()
                    $netStream.Dispose()
                    if (Test-Path -LiteralPath $tempPath) {
                        Move-Item -LiteralPath $tempPath -Destination $filePath -Force -ErrorAction SilentlyContinue
                    }
                    if (Test-Path -LiteralPath $filePath) {
                        $item = Get-Item -LiteralPath $filePath -ErrorAction SilentlyContinue
                        if ($item -and $item.Length -gt 0) {
                            $script:lastArtFile = $filePath
                            $artPath = $filePath
                            $thumbSaved = $true
                        }
                    }
                }
            } catch {
                # Thumbnail fallback
            }
        }

        if (-not $thumbSaved) {
            $artPath = ""
        }
    } else {
        $artPath = if ($artFileValid) { $script:lastArtFile } else { "" }
    }

    $volScalar = -1
    $isMuted = $false
    try {
        $volScalar = [IsletAudio.AudioMaster]::Get()
        $isMuted = [IsletAudio.AudioMaster]::GetMute()
    } catch {}

    $volInt = if ($volScalar -ge 0) { [Math]::Round($volScalar * 100) } else { 50 }

    return [PSCustomObject]@{
        type = "media"
        app = $app
        sourceHint = $sourceHint
        playbackType = $playbackType
        title = $title
        artist = $artist
        album = $album
        status = $status
        positionMs = $posMs
        durationMs = $durMs
        lastUpdatedMs = $lastUpdatedEpochMs
        artworkPath = $artPath
        volume = $volInt
        isMuted = $isMuted
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

            if ($cmd -match "^set-volume:([0-9\.]+)$") {
                try {
                    $pct = [float]$matches[1]
                    $scalar = [Math]::Max(0.0, [Math]::Min(1.0, $pct / 100.0))
                    [void][IsletAudio.AudioMaster]::Set($scalar)
                } catch {}
            } elseif ($cmd -eq "volume-mute") {
                try {
                    $cur = [IsletAudio.AudioMaster]::GetMute()
                    [void][IsletAudio.AudioMaster]::SetMute(-not $cur)
                } catch {
                    try { (New-Object -ComObject WScript.Shell).SendKeys([char]173) } catch {}
                }
            } elseif ($cmd -eq "volume-up") {
                try {
                    $cur = [IsletAudio.AudioMaster]::Get()
                    if ($cur -ge 0) {
                        [void][IsletAudio.AudioMaster]::Set([Math]::Min(1.0, $cur + 0.05))
                    } else {
                        (New-Object -ComObject WScript.Shell).SendKeys([char]175)
                    }
                } catch {
                    try { (New-Object -ComObject WScript.Shell).SendKeys([char]175) } catch {}
                }
            } elseif ($cmd -eq "volume-down") {
                try {
                    $cur = [IsletAudio.AudioMaster]::Get()
                    if ($cur -ge 0) {
                        [void][IsletAudio.AudioMaster]::Set([Math]::Max(0.0, $cur - 0.05))
                    } else {
                        (New-Object -ComObject WScript.Shell).SendKeys([char]174)
                    }
                } catch {
                    try { (New-Object -ComObject WScript.Shell).SendKeys([char]174) } catch {}
                }
            } else {
                $activeInfo = Get-ActiveMediaSession
                $session = $activeInfo.Session
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
                    } elseif ($cmd -match "^seek:(\d+)$") {
                        try {
                            $seekMs = [long]$matches[1]
                            $ticks = $seekMs * 10000
                            [void]$session.TryChangePlaybackPositionAsync($ticks)
                        } catch {}
                    }
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
            $sig = "$($snapshot.app):$($snapshot.title):$($snapshot.artist):$($snapshot.status):$([Math]::Floor($snapshot.positionMs / 1000)):$($snapshot.volume):$($snapshot.isMuted):$($snapshot.artworkPath)"
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
