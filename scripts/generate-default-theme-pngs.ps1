Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$outputDir = Join-Path $PSScriptRoot '..\public\theme\defaults'
$outputDir = [System.IO.Path]::GetFullPath($outputDir)
if (!(Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

function New-GradientBackground {
  param(
    [System.Drawing.Graphics]$Graphics,
    [int]$Width,
    [int]$Height,
    [string]$StartColor,
    [string]$EndColor
  )

  $rect = New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.ColorTranslator]::FromHtml($StartColor), [System.Drawing.ColorTranslator]::FromHtml($EndColor), 35)
  $Graphics.FillRectangle($brush, $rect)
  $brush.Dispose()
}

function Save-LogoPng {
  $w = 1200
  $h = 300
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  New-GradientBackground -Graphics $g -Width $w -Height $h -StartColor '#F8FAFC' -EndColor '#EAF2FF'

  $iconRect = New-Object System.Drawing.Rectangle(36, 36, 228, 228)
  $iconBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($iconRect, [System.Drawing.ColorTranslator]::FromHtml('#2563EB'), [System.Drawing.ColorTranslator]::FromHtml('#22C55E'), 35)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $r = 48
  $x = $iconRect.X; $y = $iconRect.Y; $ww = $iconRect.Width; $hh = $iconRect.Height
  $path.AddArc($x, $y, $r, $r, 180, 90)
  $path.AddArc($x + $ww - $r, $y, $r, $r, 270, 90)
  $path.AddArc($x + $ww - $r, $y + $hh - $r, $r, $r, 0, 90)
  $path.AddArc($x, $y + $hh - $r, $r, $r, 90, 90)
  $path.CloseFigure()
  $g.FillPath($iconBrush, $path)

  $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $innerBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#0F172A'))
  $g.FillEllipse($whiteBrush, 92, 88, 116, 116)
  $g.FillEllipse($innerBrush, 128, 124, 44, 44)

  $titleFont = New-Object System.Drawing.Font('Segoe UI', 56, [System.Drawing.FontStyle]::Bold)
  $subFont = New-Object System.Drawing.Font('Segoe UI', 36, [System.Drawing.FontStyle]::Regular)
  $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#0F172A'))
  $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#475569'))

  $g.DrawString('Loan Enterprise', $titleFont, $titleBrush, 300, 84)
  $g.DrawString('CRM', $subFont, $subBrush, 304, 164)

  $outPath = Join-Path $outputDir 'logo.png'
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $subBrush.Dispose(); $titleBrush.Dispose(); $subFont.Dispose(); $titleFont.Dispose(); $innerBrush.Dispose(); $whiteBrush.Dispose(); $path.Dispose(); $iconBrush.Dispose(); $g.Dispose(); $bmp.Dispose()
}

function Save-FaviconPng {
  $w = 64
  $h = 64
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  New-GradientBackground -Graphics $g -Width $w -Height $h -StartColor '#2563EB' -EndColor '#22C55E'
  $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $darkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#0F172A'))
  $g.FillEllipse($whiteBrush, 16, 16, 32, 32)
  $g.FillEllipse($darkBrush, 27, 27, 10, 10)

  $outPath = Join-Path $outputDir 'favicon.png'
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $darkBrush.Dispose(); $whiteBrush.Dispose(); $g.Dispose(); $bmp.Dispose()
}

function Save-LoginBackgroundPng {
  $w = 1920
  $h = 1080
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

  New-GradientBackground -Graphics $g -Width $w -Height $h -StartColor '#0F172A' -EndColor '#0EA5E9'

  $c1 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 34, 197, 94))
  $c2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 59, 130, 246))
  $c3 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(60, 255, 255, 255))
  $g.FillEllipse($c1, -220, -180, 900, 620)
  $g.FillEllipse($c2, 1220, 560, 900, 620)

  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(25, 255, 255, 255), 1)
  for ($y = 120; $y -lt $h; $y += 120) { $g.DrawLine($pen, 0, $y, $w, $y) }
  for ($x = 120; $x -lt $w; $x += 120) { $g.DrawLine($pen, $x, 0, $x, $h) }

  $titleFont = New-Object System.Drawing.Font('Segoe UI', 64, [System.Drawing.FontStyle]::Bold)
  $subFont = New-Object System.Drawing.Font('Segoe UI', 28, [System.Drawing.FontStyle]::Regular)
  $g.DrawString('Loan Enterprise CRM', $titleFont, $c3, 96, 92)
  $g.DrawString('Smart lead management with AI-powered workflows', $subFont, $c3, 102, 176)

  $outPath = Join-Path $outputDir 'login-background.png'
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $subFont.Dispose(); $titleFont.Dispose(); $pen.Dispose(); $c3.Dispose(); $c2.Dispose(); $c1.Dispose(); $g.Dispose(); $bmp.Dispose()
}

function Save-ApplicationBackgroundPng {
  $w = 1920
  $h = 1080
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

  New-GradientBackground -Graphics $g -Width $w -Height $h -StartColor '#F8FAFC' -EndColor '#ECFDF5'

  $c1 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 147, 197, 253))
  $c2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(80, 134, 239, 172))
  $gridPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(38, 148, 163, 184), 1)

  $g.FillEllipse($c1, -120, -160, 760, 520)
  $g.FillEllipse($c2, 1220, 620, 760, 520)

  for ($y = 160; $y -lt $h; $y += 160) { $g.DrawLine($gridPen, 0, $y, $w, $y) }
  for ($x = 160; $x -lt $w; $x += 160) { $g.DrawLine($gridPen, $x, 0, $x, $h) }

  $outPath = Join-Path $outputDir 'application-background.png'
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $gridPen.Dispose(); $c2.Dispose(); $c1.Dispose(); $g.Dispose(); $bmp.Dispose()
}

Save-LogoPng
Save-FaviconPng
Save-LoginBackgroundPng
Save-ApplicationBackgroundPng

Write-Host '✅ Generated PNG default theme assets:'
Write-Host "- $outputDir\\logo.png"
Write-Host "- $outputDir\\favicon.png"
Write-Host "- $outputDir\\login-background.png"
Write-Host "- $outputDir\\application-background.png"
