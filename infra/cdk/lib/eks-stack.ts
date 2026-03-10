import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "node:path";
import * as fs from "node:fs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as eks from "aws-cdk-lib/aws-eks";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as lambdaLayerKubectlV29 from "@aws-cdk/lambda-layer-kubectl-v29";
import { config } from "./config.js";

export class EksStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- Networking (VPC) ---
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 3,
      natGateways: 1,
    });

    // --- ECR repo for your app ---
    const appRepo = new ecr.Repository(this, "AppEcrRepo", {
      repositoryName: config.ecrRepoName,
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // --- EKS cluster ---
    const cluster = new eks.Cluster(this, "EksCluster", {
      clusterName: config.clusterName,
      version: eks.KubernetesVersion.V1_29,
      vpc,
      defaultCapacity: 0,
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
      kubectlLayer: new lambdaLayerKubectlV29.KubectlV29Layer(
        this,
        "KubectlLayer"
      ),
    });

    // Dedicated SG for DB + allow Postgres access from cluster SG
    const dbSg = new ec2.SecurityGroup(this, "DbSecurityGroup", {
      vpc,
      allowAllOutbound: true,
      description: "Security group for Postgres RDS",
    });
    dbSg.addIngressRule(
      cluster.clusterSecurityGroup,
      ec2.Port.tcp(config.postgres.port),
      "Allow Postgres from EKS cluster security group"
    );

    // Managed DB credentials in Secrets Manager
    const dbCredentialsSecret = new rds.DatabaseSecret(
      this,
      "DbCredentialsSecret",
      {
        username: config.postgres.username,
      }
    );

    // RDS Postgres
    const db = new rds.DatabaseInstance(this, "AppPostgres", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [dbSg],
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_4,
      }),
      credentials: rds.Credentials.fromSecret(dbCredentialsSecret),
      databaseName: config.postgres.dbName,
      port: config.postgres.port,
      instanceType: new ec2.InstanceType(config.postgres.instanceType),
      allocatedStorage: config.postgres.allocatedStorage,
      maxAllocatedStorage: config.postgres.maxAllocatedStorage,
      multiAz: config.postgres.multiAz,
      backupRetention: cdk.Duration.days(config.postgres.backupRetentionDays),
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      publiclyAccessible: false,
    });

    // Secret consumed by workloads (JSON with DATABASE_URL key)
    const databaseUrlSecret = new secretsmanager.Secret(this, "DatabaseUrlSecret", {
      description:
        "Application database connection string in DATABASE_URL format",
      secretObjectValue: {
        DATABASE_URL: cdk.SecretValue.unsafePlainText(
          `postgresql://${config.postgres.username}:${dbCredentialsSecret.secretValueFromJson(
            "password"
          ).unsafeUnwrap()}@${db.dbInstanceEndpointAddress}:${db.dbInstanceEndpointPort}/${config.postgres.dbName}?sslmode=require`
        ),
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Managed node group
    cluster.addNodegroupCapacity("DefaultNodeGroup", {
      desiredSize: 2,
      minSize: 1,
      maxSize: 4,
      instanceTypes: [new ec2.InstanceType("t3.medium")],
    });

    // Namespace + Kubernetes .env secret in one manifest to guarantee apply order
    cluster.addManifest("AppsNamespaceAndExpressServerEnvSecret", {
      apiVersion: "v1",
      kind: "List",
      items: [
        {
          apiVersion: "v1",
          kind: "Namespace",
          metadata: { name: config.namespace },
        },
        {
          apiVersion: "v1",
          kind: "Secret",
          metadata: {
            name: "express-server-db",
            namespace: config.namespace,
          },
          type: "Opaque",
          stringData: {
            ".env": `NODE_ENV=production
DATABASE_URL=${databaseUrlSecret
              .secretValueFromJson("DATABASE_URL")
              .unsafeUnwrap()}`,
          },
        },
      ],
    });

    // --- AWS Load Balancer Controller ---
    const albSa = cluster.addServiceAccount("AwsLbControllerSA", {
      name: "aws-load-balancer-controller",
      namespace: "kube-system",
    });

    const albControllerPolicyPath = path.join(
      process.cwd(),
      "policies",
      "aws-load-balancer-controller-iam-policy.json"
    );

    const albControllerPolicyDoc = iam.PolicyDocument.fromJson(
      JSON.parse(fs.readFileSync(albControllerPolicyPath, "utf8"))
    );

    const albControllerManagedPolicy = new iam.ManagedPolicy(
      this,
      "AwsLoadBalancerControllerManagedPolicy",
      {
        managedPolicyName: `${cdk.Stack.of(this).stackName}-AWSLoadBalancerController`,
        document: albControllerPolicyDoc,
      }
    );

    albSa.role.addManagedPolicy(albControllerManagedPolicy);

    cluster.addHelmChart("AwsLoadBalancerController", {
      chart: "aws-load-balancer-controller",
      repository: "https://aws.github.io/eks-charts",
      namespace: "kube-system",
      release: "aws-load-balancer-controller",
      values: {
        clusterName: config.clusterName,
        serviceAccount: {
          create: false,
          name: albSa.serviceAccountName,
        },
      },
    });

    // --- GitHub Actions -> AWS (OIDC) IAM role ---
    const githubOidcProvider = new iam.OpenIdConnectProvider(
      this,
      "GitHubOidc",
      {
        url: "https://token.actions.githubusercontent.com",
        clientIds: ["sts.amazonaws.com"],
        thumbprints: ["6938fd4d98bab03faadb97b34396831e3780aea1"],
      }
    );

    const ghRole = new iam.Role(this, "GitHubActionsRole", {
      roleName: `${config.clusterName}-github-actions`,
      assumedBy: new iam.WebIdentityPrincipal(
        githubOidcProvider.openIdConnectProviderArn,
        {
          StringLike: {
            "token.actions.githubusercontent.com:sub": `repo:${config.github.owner}/${config.github.repo}:ref:refs/heads/${config.github.branch}`,
          },
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          },
        }
      ),
    });

    // ECR push/pull for this repo
    appRepo.grantPullPush(ghRole);

    // Allow describe cluster (needed for aws eks update-kubeconfig token flow)
    ghRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["eks:DescribeCluster"],
        resources: [cluster.clusterArn],
      })
    );

    // Optional: allow CI to read DB URL secret (not required for runtime mount flow, but useful)
    databaseUrlSecret.grantRead(ghRole);

    // Map GitHub role to Kubernetes RBAC (cluster-admin)
    cluster.awsAuth.addRoleMapping(ghRole, {
      groups: ["system:masters"],
      username: "github-actions",
    });

    // --- Outputs ---
    new cdk.CfnOutput(this, "ClusterName", { value: config.clusterName });
    new cdk.CfnOutput(this, "AppEcrRepoUri", {
      value: appRepo.repositoryUri,
    });
    new cdk.CfnOutput(this, "GitHubRoleArn", { value: ghRole.roleArn });
    new cdk.CfnOutput(this, "Namespace", { value: config.namespace });

    new cdk.CfnOutput(this, "DatabaseEndpoint", {
      value: db.dbInstanceEndpointAddress,
    });
    new cdk.CfnOutput(this, "DatabasePort", {
      value: db.dbInstanceEndpointPort,
    });
    new cdk.CfnOutput(this, "DatabaseName", {
      value: config.postgres.dbName,
    });
    new cdk.CfnOutput(this, "DatabaseCredentialsSecretArn", {
      value: dbCredentialsSecret.secretArn,
    });
    new cdk.CfnOutput(this, "DatabaseUrlSecretArn", {
      value: databaseUrlSecret.secretArn,
    });
    new cdk.CfnOutput(this, "KubernetesDatabaseSecretName", {
      value: "express-server-db",
    });
  }
}
