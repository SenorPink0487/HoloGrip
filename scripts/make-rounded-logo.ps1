# Produces a rounded-corner copy of the project logo with a transparent
# background. The output is then used as the source for `npx tauri icon`,
# so every generated platform icon (Windows tiles, ICO, ICNS, Android,
# iOS, etc.) inherits the rounded shape.

param(
    [string]$LogoPath = (Join-Path $PSScriptRoot '..\src-tauri\logo.png'),
    [string]$OutPath  = (Join-Path $PSScriptRoot '..\src-tauri\logo-rounded.png'),

    # Apple/iOS HIG corner radius is ~22.37% of the icon edge. We use the
    # same ratio so the result feels native on every modern platform.
    [double]$RadiusRatio = 0.2237
)

Add-Type -AssemblyName System.Drawing

$LogoPath = (Resolve-Path $LogoPath).Path
$src = [System.Drawing.Image]::FromFile($LogoPath)

$w = $src.Width
$h = $src.Height
$radius = [int]([Math]::Min($w, $h) * $RadiusRatio)

# Build a rounded rectangle path matching the image bounds.
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(0,            0,            $radius * 2, $radius * 2, 180, 90)
$path.AddArc($w - $radius * 2, 0,            $radius * 2, $radius * 2, 270, 90)
$path.AddArc($w - $radius * 2, $h - $radius * 2, $radius * 2, $radius * 2, 0,   90)
$path.AddArc(0,            $h - $radius * 2, $radius * 2, $radius * 2, 90,  90)
$path.CloseFigure()

$dst = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

$g.SetClip($path)
$g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $w, $h))
$g.ResetClip()

$dst.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$dst.Dispose()
$path.Dispose()
$src.Dispose()

Write-Host "Wrote $OutPath ($($w)x$($h), radius $radius px)"
