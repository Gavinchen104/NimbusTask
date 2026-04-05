import * as cdk from "aws-cdk-lib";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatch_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sns from "aws-cdk-lib/aws-sns";
import type { Construct } from "constructs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export class NimbusStack extends cdk.Stack {
  public readonly apiUrl: string;
  public readonly userPoolId: string;
  public readonly userPoolClientId: string;
  public readonly mongoSecretArn: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC },
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    const dbSg = new ec2.SecurityGroup(this, "AuroraSg", { vpc });

    const cluster = new rds.DatabaseCluster(this, "Aurora", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 4,
      writer: rds.ClusterInstance.serverlessV2("writer"),
      credentials: rds.Credentials.fromGeneratedSecret("nimbusadmin"),
      defaultDatabaseName: "nimbustask",
      storageEncrypted: true,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      securityGroups: [dbSg],
    });

    const proxy = new rds.DatabaseProxy(this, "RdsProxy", {
      proxyTarget: rds.ProxyTarget.fromCluster(cluster),
      secrets: [cluster.secret!],
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      clientPasswordAuthType: rds.ClientPasswordAuthType.POSTGRES_SCRAM_SHA_256,
    });

    cluster.connections.allowFrom(proxy, ec2.Port.tcp(5432), "RDS Proxy to Aurora");

    const checkpointTable = new dynamodb.Table(this, "ChangeStreamCheckpoint", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const mongoSecret = new secretsmanager.Secret(this, "MongoSecret", {
      description: "MongoDB Atlas connection string — replace secret value after deploy",
      secretStringValue: cdk.SecretValue.unsafePlainText(
        JSON.stringify({
          uri: "mongodb+srv://USER:PASSWORD@cluster.mongodb.net/?retryWrites=true&w=majority",
        })
      ),
    });

    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient("ApiClient", {
      authFlows: { userSrp: true },
    });

    const issuer = `https://cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com/${userPool.userPoolId}`;

    const jwtAuthorizer = new HttpJwtAuthorizer("CognitoJwt", issuer, {
      jwtAudience: [userPoolClient.userPoolClientId],
    });

    const lambdaSg = new ec2.SecurityGroup(this, "LambdaSg", { vpc });
    lambdaSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS");
    lambdaSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(5432), "Postgres");

    proxy.connections.allowFrom(
      lambdaSg,
      ec2.Port.tcp(5432),
      "Lambda to RDS Proxy"
    );

    const repoRoot = join(__dirname, "..", "..", "..");

    const apiFn = new lambda.DockerImageFunction(this, "ApiFunction", {
      code: lambda.DockerImageCode.fromImageAsset(repoRoot, {
        file: "docker/Dockerfile",
      }),
      memorySize: 512,
      timeout: cdk.Duration.seconds(29),
      tracing: lambda.Tracing.ACTIVE,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSg],
      environment: {
        NODE_ENV: "production",
        POSTGRES_SECRET_ARN: cluster.secret!.secretArn,
        POSTGRES_PROXY_HOST: proxy.endpoint,
        MONGO_SECRET_ARN: mongoSecret.secretArn,
        MONGO_DB_NAME: "nimbustask",
        CHANGE_STREAM_CHECKPOINT_TABLE: checkpointTable.tableName,
        POWERTOOLS_SERVICE_NAME: "nimbustask-api",
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    cluster.secret!.grantRead(apiFn);
    mongoSecret.grantRead(apiFn);
    checkpointTable.grantReadWriteData(apiFn);

    apiFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
      })
    );

    const changeFn = new lambda.DockerImageFunction(this, "ChangeStreamFunction", {
      code: lambda.DockerImageCode.fromImageAsset(repoRoot, {
        file: "docker/Dockerfile",
        cmd: ["dist/change-stream-handler.changeStreamHandler"],
      }),
      memorySize: 256,
      timeout: cdk.Duration.seconds(60),
      tracing: lambda.Tracing.ACTIVE,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSg],
      environment: {
        NODE_ENV: "production",
        MONGO_SECRET_ARN: mongoSecret.secretArn,
        MONGO_DB_NAME: "nimbustask",
        CHANGE_STREAM_CHECKPOINT_TABLE: checkpointTable.tableName,
        POWERTOOLS_SERVICE_NAME: "nimbustask-change-stream",
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    mongoSecret.grantRead(changeFn);
    checkpointTable.grantReadWriteData(changeFn);
    changeFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
      })
    );

    new events.Rule(this, "ChangeStreamSchedule", {
      schedule: events.Schedule.rate(cdk.Duration.minutes(2)),
      targets: [new targets.LambdaFunction(changeFn)],
    });

    const httpApi = new apigatewayv2.HttpApi(this, "HttpApi", {
      apiName: "nimbustask",
      corsPreflight: {
        allowHeaders: ["authorization", "content-type", "x-dev-user-id"],
        allowMethods: [apigatewayv2.CorsHttpMethod.ANY],
        allowOrigins: ["*"],
      },
    });

    const integration = new HttpLambdaIntegration("ApiIntegration", apiFn);

    new apigatewayv2.HttpRoute(this, "HealthRoute", {
      httpApi,
      routeKey: apigatewayv2.HttpRouteKey.with("/health", apigatewayv2.HttpMethod.GET),
      integration,
    });

    new apigatewayv2.HttpRoute(this, "RootRoute", {
      httpApi,
      routeKey: apigatewayv2.HttpRouteKey.with("/", apigatewayv2.HttpMethod.GET),
      integration,
    });

    new apigatewayv2.HttpRoute(this, "ProxyRoute", {
      httpApi,
      routeKey: apigatewayv2.HttpRouteKey.with("/{proxy+}", apigatewayv2.HttpMethod.ANY),
      integration,
      authorizer: jwtAuthorizer,
    });

    const alarmTopic = new sns.Topic(this, "AlarmTopic", {
      displayName: "NimbusTask alarms",
    });

    const errorAlarm = new cloudwatch.Alarm(this, "ApiLambdaErrors", {
      metric: apiFn.metricErrors({ period: cdk.Duration.minutes(1) }),
      threshold: 3,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    errorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

    const durationAlarm = new cloudwatch.Alarm(this, "ApiLambdaDuration", {
      metric: apiFn.metricDuration({ period: cdk.Duration.minutes(1) }),
      threshold: 25_000,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    durationAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

    this.apiUrl = httpApi.apiEndpoint;
    this.userPoolId = userPool.userPoolId;
    this.userPoolClientId = userPoolClient.userPoolClientId;
    this.mongoSecretArn = mongoSecret.secretArn;

    new cdk.CfnOutput(this, "HttpApiUrl", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, "MongoSecretArn", { value: mongoSecret.secretArn });
    new cdk.CfnOutput(this, "PostgresSecretArn", {
      value: cluster.secret!.secretArn,
    });
    new cdk.CfnOutput(this, "AlarmTopicArn", { value: alarmTopic.topicArn });
  }
}
