param(
  [string]$Region = "",
  [string]$StackName = "doctrine-rag-ec2",
  [string]$InstanceType = "t3.large",
  [string]$GitRepositoryUrl = "https://github.com/MIL-PROJECT/doctrine-rag-local.git",
  [string]$GitBranch = "main",
  [string]$AllowedCidr = "0.0.0.0/0",
  [string]$VpcId = "vpc-06dd1b55ba36467dc",
  [string]$SubnetId = "subnet-059fae8dd88f48388",
  [string]$KeyName = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Region)) {
  $Region = $env:AWS_REGION
}
if ([string]::IsNullOrWhiteSpace($Region)) {
  $Region = $env:AWS_DEFAULT_REGION
}
if ([string]::IsNullOrWhiteSpace($Region)) {
  $Region = (aws configure get region) 2>$null
}
if ([string]::IsNullOrWhiteSpace($Region)) {
  throw "리전을 지정하세요. 예: -Region ap-northeast-2"
}

# Prevent cp949 decoding issues with UTF-8 templates on Windows.
$env:PYTHONUTF8 = "1"
$env:AWS_CLI_FILE_ENCODING = "utf-8"
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$repoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$template = Join-Path $repoRoot "deploy\aws\cloudformation.yaml"

$params = @(
  "InstanceType=$InstanceType"
  "GitRepositoryUrl=$GitRepositoryUrl"
  "GitBranch=$GitBranch"
  "AllowedCidr=$AllowedCidr"
  "VpcId=$VpcId"
  "SubnetId=$SubnetId"
)
if (-not [string]::IsNullOrWhiteSpace($KeyName)) {
  $params += "KeyName=$KeyName"
}

Write-Host "Validating template..."
$templateUri = "file://$template"
aws cloudformation validate-template `
  --region $Region `
  --template-body $templateUri | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Warning "Template validation skipped due local encoding/file URI issue. Continuing with deploy using --template-file."
}

$stackStatus = ""
try {
  $stackStatus = aws cloudformation describe-stacks `
    --region $Region `
    --stack-name $StackName `
    --query "Stacks[0].StackStatus" `
    --output text 2>$null
} catch {
  $stackStatus = ""
}

if ($stackStatus -eq "ROLLBACK_COMPLETE") {
  Write-Host "Stack is ROLLBACK_COMPLETE. Deleting stack before redeploy..."
  aws cloudformation delete-stack `
    --region $Region `
    --stack-name $StackName
  aws cloudformation wait stack-delete-complete `
    --region $Region `
    --stack-name $StackName
}

Write-Host "Deploying stack $StackName in $Region ..."
aws cloudformation deploy `
  --region $Region `
  --stack-name $StackName `
  --template-file $template `
  --capabilities CAPABILITY_IAM `
  --parameter-overrides $params

Write-Host ""
aws cloudformation describe-stacks `
  --region $Region `
  --stack-name $StackName `
  --query "Stacks[0].Outputs" `
  --output table
