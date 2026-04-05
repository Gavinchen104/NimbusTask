# Multi-region deployment (repeatable)

This project ships a **single-region** stack by default (`NimbusStack` in your chosen `AWS_REGION`). For portfolio or DR stories, you can **repeat** the same infrastructure in another region:

1. Bootstrap CDK in the second region:  
   `cdk bootstrap aws://ACCOUNT_ID/eu-west-1`
2. Deploy with the target region set (CLI profile or env):  
   `cd infra && AWS_REGION=eu-west-1 npx cdk deploy NimbusStack`
3. **Separate data:** Each stack has its own RDS instance, Secrets Manager secrets, and Cognito pool unless you refactor to shared resources. For a true multi-region **active/active** story you would add global routing (Route 53), replicated or multi-region data stores, and stricter RPO/RTO — that is **not** automated in this repo.

Treat “multi-region” here as **repeatable regional stacks**, not one-click active/active.
