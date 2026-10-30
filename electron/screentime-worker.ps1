# Windows Foreground Window & Active App Tracker for Islet
# Emits real-time foreground process information over stdout
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$code = @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public class Win32ScreenHelper {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError=true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [StructLayout(LayoutKind.Sequential)]
    public struct LASTINPUTINFO {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll")]
    public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
}
'@

try {
    Add-Type -TypeDefinition $code -ErrorAction Stop
} catch {
    [Console]::Out.WriteLine('{"type":"error","message":"Win32ScreenHelper compilation failed"}')
    [Console]::Out.Flush()
    exit 1
}

$lii = New-Object Win32ScreenHelper+LASTINPUTINFO
$size = [System.Runtime.InteropServices.Marshal]::SizeOf($lii)
$lii.cbSize = [uint32]$size

[Console]::Out.WriteLine('{"type":"ready"}')
[Console]::Out.Flush()

while ($true) {
    try {
        $hwnd = [Win32ScreenHelper]::GetForegroundWindow()
        $pidVal = 0
        $null = [Win32ScreenHelper]::GetWindowThreadProcessId($hwnd, [ref]$pidVal)

        $procName = ""
        if ($pidVal -gt 0) {
            $p = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
            if ($p) {
                $procName = $p.ProcessName
            }
        }

        $idleSec = 0.0
        if ([Win32ScreenHelper]::GetLastInputInfo([ref]$lii)) {
            $diffMs = [Environment]::TickCount - $lii.dwTime
            if ($diffMs -ge 0) {
                $idleSec = [Math]::Round(($diffMs / 1000.0), 1)
            }
        }

        $obj = @{
            type = "tick"
            app = $procName
            idleSec = $idleSec
        }
        $json = $obj | ConvertTo-Json -Compress
        [Console]::Out.WriteLine($json)
        [Console]::Out.Flush()
    } catch {
        # ignore tick error
    }

    Start-Sleep -Seconds 1
}
