# 울산 선수 공식 배너(1024x576, 얼굴이 왼쪽)에서 머리만 정사각으로 오려 img/{번호}.jpg 로 저장한다.
# 사용: powershell -ExecutionPolicy Bypass -File tools/crop-faces.ps1
Add-Type -AssemblyName System.Drawing
$src = "C:\Users\robin\Desktop\울산 선수 프로필"
$out = Join-Path $PSScriptRoot "..\img"
New-Item -ItemType Directory -Force $out | Out-Null

# 파일 이름 -> 등번호
$map = @{
  "10_이동경" = 10; "11_에릭" = 11; "14_이진현" = 14; "15_정승현" = 15; "19_김영권" = 19;
  "21_조현우" = 21; "24_이규성" = 24; "99_야고" = 99;
  "조현택" = 26; "박용우" = 38; "토마스" = 55; "최석현" = 96
}
# 공통 머리 박스 (x, y, size). 얼굴 위치가 다른 선수는 여기서 개별 조정.
$defaultBox = @(120, 0, 250)
$boxes = @{}

$size = 256
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]85)

foreach ($name in $map.Keys) {
  $num = $map[$name]
  $box = if ($boxes.ContainsKey($num)) { $boxes[$num] } else { $defaultBox }
  $img = [System.Drawing.Image]::FromFile((Join-Path $src "$name.jpg"))
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $dst = New-Object System.Drawing.Rectangle 0, 0, $size, $size
  $srcRect = New-Object System.Drawing.Rectangle $box[0], $box[1], $box[2], $box[2]
  $g.DrawImage($img, $dst, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $bmp.Save((Join-Path $out "$num.jpg"), $codec, $params)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
  Write-Output ("{0} -> img/{1}.jpg" -f $name, $num)
}
