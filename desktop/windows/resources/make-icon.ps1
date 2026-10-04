$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$bitmap = [System.Drawing.Bitmap]::new(128, 128)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = 'AntiAlias'
$graphics.Clear([System.Drawing.Color]::Transparent)
$brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#126A63'))
$graphics.FillEllipse($brush, 3, 3, 122, 122)
$font = [System.Drawing.Font]::new('Microsoft YaHei UI', 59, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$format = [System.Drawing.StringFormat]::new()
$format.Alignment = 'Center'; $format.LineAlignment = 'Center'
$graphics.DrawString('伴', $font, [System.Drawing.Brushes]::White, [System.Drawing.RectangleF]::new(0, -2, 128, 128), $format)
$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [System.IO.File]::Create((Join-Path $PSScriptRoot 'ciban.ico'))
$icon.Save($stream); $stream.Dispose()
$bitmap.Save((Join-Path $PSScriptRoot 'ciban.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$icon.Dispose(); $format.Dispose(); $font.Dispose(); $brush.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
