#!/usr/bin/env bash
# AWS CLI로 CloudFormation 스택 생성/갱신 (EC2 + Docker + compose)
#
# 예 (Git Bash / WSL / macOS):
#   export AWS_REGION=ap-northeast-2
#   export KEY_NAME=my-key              # 선택; 비우면 SSM만
#   export GIT_REPO=https://github.com/ORG/repo.git
#   export GIT_BRANCH=main
#   ./deploy/aws/deploy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TEMPLATE="$ROOT/deploy/aws/cloudformation.yaml"
STACK_NAME="${STACK_NAME:-doctrine-rag-ec2}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"

if [[ -z "$REGION" ]]; then
  REGION="$(aws configure get region 2>/dev/null || true)"
fi
if [[ -z "$REGION" ]]; then
  echo "리전을 지정하세요: export AWS_REGION=ap-northeast-2" >&2
  exit 1
fi

INSTANCE_TYPE="${INSTANCE_TYPE:-t3.xlarge}"
GIT_REPO="${GIT_REPO:-https://github.com/MIL-PROJECT/doctrine-rag-local.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
ALLOWED_CIDR="${ALLOWED_CIDR:-0.0.0.0/0}"
KEY_NAME="${KEY_NAME:-}"

PO=(
  "InstanceType=$INSTANCE_TYPE"
  "GitRepositoryUrl=$GIT_REPO"
  "GitBranch=$GIT_BRANCH"
  "AllowedCidr=$ALLOWED_CIDR"
)
if [[ -n "$KEY_NAME" ]]; then
  PO+=("KeyName=$KEY_NAME")
fi

echo "Validating template..."
aws cloudformation validate-template \
  --region "$REGION" \
  --template-body "file://$TEMPLATE" >/dev/null

echo "Deploying stack $STACK_NAME in $REGION ..."
aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --template-file "$TEMPLATE" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides "${PO[@]}"

echo ""
aws cloudformation describe-stacks \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs' \
  --output table

echo ""
echo "부팅 후 설치 로그: sudo tail -f /var/log/doctrine-rag-bootstrap.log"
echo "SSM: aws ssm start-session --region $REGION --target <InstanceId>"
