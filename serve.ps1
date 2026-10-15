# Tiny static web server for the DJ Tool (no Python/Node needed).
# Serves this folder at http://localhost:5500/  -- close the window or press Ctrl+C to stop.
param([int]$Port = 5500)
$root = (Split-Path -Parent $MyInvocation.MyCommand.Path).TrimEnd('\') + '\'
$mime = @{
  '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8';
  '.js'='application/javascript; charset=utf-8'; '.json'='application/json; charset=utf-8';
  '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.gif'='image/gif';
  '.svg'='image/svg+xml'; '.ico'='image/x-icon'; '.txt'='text/plain; charset=utf-8'; '.md'='text/plain; charset=utf-8'
}
$blocked = @('.ps1','.bat','.cmd')
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() }
catch {
  Write-Host "Could not start the server on port $Port : $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Is another copy already running? If so, just open http://localhost:$Port/ in your browser."
  exit 1
}
Write-Host "DJ Tool running at http://localhost:$Port/  (Ctrl+C or close this window to stop)" -ForegroundColor Cyan
try {
  while ($listener.IsListening) {
    $task = $listener.GetContextAsync()
    while (-not $task.AsyncWaitHandle.WaitOne(250)) { }   # lets Ctrl+C work
    $ctx = $task.GetAwaiter().GetResult()
    $res = $ctx.Response
    try {
      $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ($rel -eq '') { $rel = 'index.html' }
      $full = [IO.Path]::GetFullPath((Join-Path $root ($rel.Replace('/', '\'))))
      $ext = [IO.Path]::GetExtension($full).ToLower()
      if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or $blocked -contains $ext) {
        $res.StatusCode = 403
        $b = [Text.Encoding]::UTF8.GetBytes('Forbidden')
        $res.OutputStream.Write($b, 0, $b.Length)
      } elseif (Test-Path -LiteralPath $full -PathType Leaf) {
        $bytes = [IO.File]::ReadAllBytes($full)
        $ct = $mime[$ext]; if (-not $ct) { $ct = 'application/octet-stream' }
        $res.ContentType = $ct
        $res.Headers.Add('Cache-Control', 'no-cache')
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
        $b = [Text.Encoding]::UTF8.GetBytes('Not found')
        $res.OutputStream.Write($b, 0, $b.Length)
      }
    } catch {
      try { $res.StatusCode = 500 } catch {}
    } finally {
      try { $res.OutputStream.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
}