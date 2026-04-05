import * as cdk from "aws-cdk-lib";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

export interface PipelineStackProps extends cdk.StackProps {
  readonly connectionArn: string;
  readonly repoFullName: string;
  readonly branch: string;
}

/**
 * Deploys the repo via CodePipeline + CodeBuild (use after creating a CodeStar Connection to GitHub).
 */
export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const [owner, repo] = props.repoFullName.split("/");
    if (!owner || !repo) {
      throw new Error("repoFullName must be owner/repo");
    }

    const sourceOutput = new codepipeline.Artifact("Source");

    const pipeline = new codepipeline.Pipeline(this, "Pipeline", {
      pipelineName: "NimbusTask",
      restartExecutionOnUpdate: true,
    });

    const sourceAction =
      new codepipeline_actions.CodeStarConnectionsSourceAction({
        actionName: "GitHub",
        owner,
        repo,
        branch: props.branch,
        connectionArn: props.connectionArn,
        output: sourceOutput,
        triggerOnPush: true,
      });

    const project = new codebuild.PipelineProject(this, "SynthDeploy", {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true,
        computeType: codebuild.ComputeType.MEDIUM,
      },
      environmentVariables: {
        NPM_CONFIG_PRODUCTION: { value: "false" },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          install: {
            "runtime-versions": { nodejs: "20" },
            commands: ["npm ci"],
          },
          build: {
            commands: ["npm run lint", "npm test", "npm run synth"],
          },
          post_build: {
            commands: [
              "cd infra && npx cdk deploy NimbusStack --require-approval never",
            ],
          },
        },
      }),
    });

    project.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["*"],
        resources: ["*"],
      })
    );

    const deployAction = new codepipeline_actions.CodeBuildAction({
      actionName: "Deploy",
      project,
      input: sourceOutput,
    });

    pipeline.addStage({
      stageName: "Source",
      actions: [sourceAction],
    });

    pipeline.addStage({
      stageName: "Deploy",
      actions: [deployAction],
    });
  }
}
