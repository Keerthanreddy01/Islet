Add-Type -AssemblyName System.Drawing

$srcPath = Resolve-Path "assets/logo.png"
$src = [System.Drawing.Image]::FromFile($srcPath)
$sizes = @(256, 128, 64, 48, 32, 16)
$pngFrames = @()

foreach ($sz in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $sz, $sz
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, $sz, $sz)
    $g.Dispose()

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $bytes = $ms.ToArray()
    $ms.Dispose()

    $pngFrames += @{
        Size = $sz
        Bytes = $bytes
    }
}
$src.Dispose()

$outStream = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $outStream

# Header: 0, 1 (ICO), count
$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]$pngFrames.Count)

$offset = 6 + ($pngFrames.Count * 16)

foreach ($frame in $pngFrames) {
    $w = if ($frame.Size -eq 256) { [byte]0 } else { [byte]$frame.Size }
    $h = if ($frame.Size -eq 256) { [byte]0 } else { [byte]$frame.Size }
    $bw.Write($w)
    $bw.Write($h)
    $bw.Write([byte]0) # colors
    $bw.Write([byte]0) # reserved
    $bw.Write([uint16]1) # planes
    $bw.Write([uint16]32) # bpp
    $bw.Write([uint32]$frame.Bytes.Length)
    $bw.Write([uint32]$offset)
    $offset += $frame.Bytes.Length
}

foreach ($frame in $pngFrames) {
    $bw.Write($frame.Bytes)
}

$bw.Flush()
[System.IO.File]::WriteAllBytes("build/icon.ico", $outStream.ToArray())
$bw.Dispose()
$outStream.Dispose()
Write-Output "Generated build/icon.ico successfully with $($pngFrames.Count) frames"
