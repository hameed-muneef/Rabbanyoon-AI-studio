param([int]$StartPage = 1, [int]$EndPage = 180)
$ErrorActionPreference = 'Stop'
$pages = [System.Collections.Generic.List[object]]::new()
for ($number = $StartPage; $number -le $EndPage; $number++) {
  $address = "https://shamela.ws/book/37562/$number"
  $html = (Invoke-WebRequest -Uri $address -UseBasicParsing -TimeoutSec 30).Content
  $match = [regex]::Match($html, '<div class="nass[^>]*data-page-id="(?<id>\d+)"[^>]*data-page-num="(?<printed>\d+)"[^>]*>(?<body>.*?)</div>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if (-not $match.Success) { throw "Missing page body: $number" }
  $paragraphs = [System.Collections.Generic.List[string]]::new()
  foreach ($paragraph in [regex]::Matches($match.Groups['body'].Value, '<p(?<attributes>[^>]*)>(?<text>.*?)</p>', [System.Text.RegularExpressions.RegexOptions]::Singleline)) {
    if ($paragraph.Groups['attributes'].Value -match 'hamesh') { continue }
    $content = [regex]::Replace($paragraph.Groups['text'].Value, '<a\b[^>]*class="btn_tag[^>]*>.*?</a>', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    $content = [regex]::Replace($content, '<[^>]+>', '')
    $content = [System.Net.WebUtility]::HtmlDecode($content)
    $content = [regex]::Replace($content, '\s*\([0-9٠-٩]+\)', '')
    $content = [regex]::Replace($content, '\s+', ' ').Trim()
    if ($content) { $paragraphs.Add($content) }
  }
  $pages.Add([ordered]@{id=$number; printed=[int]$match.Groups['printed'].Value; url=$address; paragraphs=@($paragraphs)})
  if ($number % 20 -eq 0) { Write-Output "Imported $number pages" }
  Start-Sleep -Milliseconds 100
}
$result = [ordered]@{title='تعريف عام بدين الإسلام'; author='علي الطنطاوي'; source='https://shamela.ws/book/37562'; pages=@($pages)}
$json = ConvertTo-Json -InputObject $result -Depth 8
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot '../public/books/book-text.json'), $json, [System.Text.UTF8Encoding]::new($false))
Write-Output "Saved $($pages.Count) pages"
