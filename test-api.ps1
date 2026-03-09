$body = @{
    action = "init"
    customer_profile = @{
        name = "Test Customer"
        city = "Delhi"
        monthly_income = 50000
        employment_type = "Employed"
        credit_score = 750
    }
    company_name = "XYZ Finance"
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
