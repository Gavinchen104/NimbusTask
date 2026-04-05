#!/usr/bin/env node
import "source-map-support/register.js";
import * as cdk from "aws-cdk-lib";
import { NimbusStack } from "../lib/nimbus-stack.js";
import { PipelineStack } from "../lib/pipeline-stack.js";

const app = new cdk.App();

const githubConnectionArn = app.node.tryGetContext("githubConnectionArn") as
  | string
  | undefined;
const githubRepo = (app.node.tryGetContext("githubRepo") as string) ?? "owner/nimbustask";
const githubBranch = (app.node.tryGetContext("githubBranch") as string) ?? "main";

new NimbusStack(app, "NimbusStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
  description: "NimbusTask serverless API (Lambda, API Gateway, Aurora, MongoDB secrets)",
});

if (githubConnectionArn) {
  new PipelineStack(app, "NimbusPipelineStack", {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
    },
    connectionArn: githubConnectionArn,
    repoFullName: githubRepo,
    branch: githubBranch,
  });
}

app.synth();
