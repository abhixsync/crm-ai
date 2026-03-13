$body = @{
    action = "next"
    session_id = "llm_1773041115562_8w57hmixs"
    customer_message = "Yes, I'm interested in a personal loan"
    is_voice_call = $false
} | ConvertTo-Json

$response = Invoke-WebRequest -Uri "http://localhost:3000/api/loan-assistant/voice-conversation" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body `
    -UseBasicParsing -ErrorAction Stop

Write-Host "Status Code: $($response.StatusCode)"

$responseObj = $response.Content | ConvertFrom-Json
Write-Host "`nResponse:`n" 
Write-Host ($responseObj | ConvertTo-Json -Depth 10)
