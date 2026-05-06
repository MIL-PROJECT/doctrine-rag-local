# GitHub Actions AWS 배포 설정

아래 3가지를 설정하면 `.github/workflows/deploy-aws.yml`로 CI/CD 배포가 동작합니다.

## 1) AWS IAM OIDC Role 생성

GitHub OIDC 공급자와 연결된 IAM Role이 필요합니다.

- Trusted entity: `token.actions.githubusercontent.com`
- Condition 예시
  - `token.actions.githubusercontent.com:aud = sts.amazonaws.com`
  - `token.actions.githubusercontent.com:sub = repo:<OWNER>/<REPO>:*`

Role 정책에는 최소한 다음 권한이 필요합니다.

- CloudFormation: 스택 생성/갱신/조회/검증
- EC2: 인스턴스/보안그룹/볼륨 관련 생성 권한
- IAM: Role/InstanceProfile 생성 및 `iam:PassRole`
- SSM: AMI 파라미터 조회 (`/aws/service/ami-amazon-linux-latest/*`)

이 저장소에는 아래 정책 템플릿 파일이 포함되어 있습니다.

- 신뢰 정책: `deploy/aws/iam-github-oidc-trust-policy.json`
- 권한 정책: `deploy/aws/iam-github-cfn-deploy-policy.json`

아래 자리표시자를 실제 값으로 치환해서 사용하세요.

- `<ACCOUNT_ID>`
- `<OWNER>`
- `<REPO>`

예시 생성 절차 (AWS CLI):

```bash
# 0) GitHub OIDC provider가 없다면 먼저 생성 (최초 1회)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# 1) Role 생성
aws iam create-role \
  --role-name github-actions-doctrine-rag-deploy \
  --assume-role-policy-document file://deploy/aws/iam-github-oidc-trust-policy.json

# 2) 권한 정책 생성
aws iam create-policy \
  --policy-name github-actions-doctrine-rag-cfn-deploy \
  --policy-document file://deploy/aws/iam-github-cfn-deploy-policy.json

# 3) Role에 정책 연결
aws iam attach-role-policy \
  --role-name github-actions-doctrine-rag-deploy \
  --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/github-actions-doctrine-rag-cfn-deploy
```

## 2) GitHub Secrets/Variables 설정

저장소 Settings -> Secrets and variables -> Actions 에서 설정:

- **Secret**
  - `AWS_ROLE_TO_ASSUME`: OIDC용 Role ARN
    - 예: `arn:aws:iam::<account-id>:role/github-actions-doctrine-rag-deploy`

- **Variables (권장)**
  - `AWS_REGION` (예: `ap-northeast-2`)
  - `CFN_STACK_NAME` (예: `doctrine-rag-ec2`)
  - `INSTANCE_TYPE` (예: `t3.large`)
  - `ALLOWED_CIDR` (예: `0.0.0.0/0`)
  - `VPC_ID` (예: `vpc-06dd1b55ba36467dc`)
  - `SUBNET_ID` (예: `subnet-059fae8dd88f48388`)
  - `KEY_NAME` (선택, SSH 키페어 이름)
  - `GIT_REPO` (선택, 기본은 현재 GitHub 저장소 URL)

## 3) 워크플로 실행

- 자동 실행: `main` 브랜치 푸시 시
- 수동 실행: Actions 탭 -> `Deploy AWS CloudFormation` -> `Run workflow`

배포가 끝나면 스택 Outputs (`PublicIp`, `UrlHint`)가 로그에 출력됩니다.
