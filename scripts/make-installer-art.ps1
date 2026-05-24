# Generate the NSIS installer header (150x57) BMP from the project logo,
# rendered onto a soft gradient background to look polished in the installer
# title bar. The welcome/finish sidebar image was intentionally removed.

param(
    [string]$LogoPath = (Join-Path $PSScriptRoot '..\logo-rounded.png'),
    [string]$OutDir   = (Join-Path $PSScriptRoot '..\src-tauri\icons')
)

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$LogoPath = (Resolve-Path $LogoPath).Path
$OutDir   = (Resolve-Path $OutDir).Path

$logo = [System.Drawing.Image]::FromFile($LogoPath)

function New-GradientBitmap {
    param(
        [int]$Width,
        [int]$Height,
        [System.Drawing.Color]$ColorTop,
        [System.Drawing.Color]$ColorBottom
    )
    $bmp = New-Object System.Drawing.Bitmap $Width, $Height
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $rect  = New-Object System.Drawing.Rectangle 0, 0, $Width, $Height
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $ColorTop, $ColorBottom, ([System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
    $g.FillRectangle($brush, $rect)
    $brush.Dispose()
    return @{ Bitmap = $bmp; Graphics = $g }
}

function Save-Bmp24 {
    param(
        [System.Drawing.Bitmap]$Source,
        [string]$Destination
    )
    # NSIS MUI requires a 24-bit BMP. Bitmap.Save with Bmp produces 32-bit
    # if the source has alpha, so we copy onto a 24bpp surface explicitly.
    $bmp24 = New-Object System.Drawing.Bitmap $Source.Width, $Source.Height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g     = [System.Drawing.Graphics]::FromImage($bmp24)
    $g.Clear([System.Drawing.Color]::White)
    $g.DrawImage($Source, 0, 0, $Source.Width, $Source.Height)
    $g.Dispose()
    $bmp24.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Bmp)
    $bmp24.Dispose()
}

# --- Header image: 150 x 57 -------------------------------------------------
$headerW = 150
$headerH = 57
$colorTop    = [System.Drawing.Color]::FromArgb(255, 245, 247, 255)
$colorBottom = [System.Drawing.Color]::FromArgb(255, 222, 232, 255)
$header = New-GradientBitmap -Width $headerW -Height $headerH -ColorTop $colorTop -ColorBottom $colorBottom
$hg = $header.Graphics

# Draw logo on the left
$logoSize = 44
$logoX    = 6
$logoY    = [int](($headerH - $logoSize) / 2)
$hg.DrawImage($logo, $logoX, $logoY, $logoSize, $logoSize)

$headerOut = Join-Path $OutDir 'installer-header.bmp'
Save-Bmp24 -Source $header.Bitmap -Destination $headerOut
$hg.Dispose()
$header.Bitmap.Dispose()
Write-Host "Wrote $headerOut"

$logo.Dispose()
