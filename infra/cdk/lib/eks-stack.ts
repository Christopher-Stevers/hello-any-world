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
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cr from "aws-cdk-lib/custom-resources";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
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

    const bootstrapLambdaSg = new ec2.SecurityGroup(this, "BootstrapLambdaSecurityGroup", {
      vpc,
      allowAllOutbound: true,
      description: "Security group for DB bootstrap Lambdas",
    });
    dbSg.addIngressRule(
      bootstrapLambdaSg,
      ec2.Port.tcp(config.postgres.port),
      "Allow Postgres from DB bootstrap Lambda security group"
    );

    // Master/admin credentials for instance bootstrap/admin operations
    const dbCredentialsSecret = new rds.DatabaseSecret(
      this,
      "DbCredentialsSecret",
      {
        username: config.postgres.username,
      }
    );

    // RDS Postgres instance (instance-level defaults stay on postgres.*)
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

    // Service-owned Express DB credentials (for express_user)
    const expressDbCredentialsSecret = new rds.DatabaseSecret(
      this,
      "ExpressDbCredentialsSecret",
      {
        username: config.postgres.express.username,
      }
    );

    // Service-owned Python DB credentials (for python_user)
    const pythonDbCredentialsSecret = new rds.DatabaseSecret(
      this,
      "PythonDbCredentialsSecret",
      {
        username: config.postgres.python.username,
      }
		);

    // Service-owned Nextjs DB credentials (for nextjs_user)
    const nextjsDbCredentialsSecret = new rds.DatabaseSecret(
      this,
      "NextjsDbCredentialsSecret",
      {
        username: config.postgres.nextjs.username,
      }
    );


    // Lambda-backed custom resource: idempotent bootstrap for express_db + express_user grants
    const expressBootstrapFn = new lambdaNodejs.NodejsFunction(
      this,
      "ExpressDbBootstrapFn",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          process.cwd(),
          "lib",
          "lambda",
          "express-db-bootstrap.ts"
        ),
        handler: "handler",
        timeout: cdk.Duration.minutes(2),
        memorySize: 256,
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [bootstrapLambdaSg],
        bundling: {
          target: "node20",
          format: lambdaNodejs.OutputFormat.CJS,
          minify: true,
          sourceMap: false,
          externalModules: ["@aws-sdk/*"],
          nodeModules: ["pg"],
        },
      }
    );

    // Lambda-backed custom resource: idempotent bootstrap for python_db + python_user grants
    const pythonBootstrapFn = new lambdaNodejs.NodejsFunction(
      this,
      "PythonDbBootstrapFn",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          process.cwd(),
          "lib",
          "lambda",
          "python-db-bootstrap.ts"
        ),
        handler: "handler",
        timeout: cdk.Duration.minutes(2),
        memorySize: 256,
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [bootstrapLambdaSg],
        bundling: {
          target: "node20",
          format: lambdaNodejs.OutputFormat.CJS,
          minify: true,
          sourceMap: false,
          externalModules: ["@aws-sdk/*"],
          nodeModules: ["pg"],
        },
      }
		);

    const nextJsBootstrapFn= new lambdaNodejs.NodejsFunction(
      this,
      "NextjsDbBootstrapFn",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(
          process.cwd(),
          "lib",
          "lambda",
          "nextjs-db-bootstrap.ts"
        ),
        handler: "handler",
        timeout: cdk.Duration.minutes(2),
        memorySize: 256,
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [bootstrapLambdaSg],
        bundling: {
          target: "node20",
          format: lambdaNodejs.OutputFormat.CJS,
          minify: true,
          sourceMap: false,
          externalModules: ["@aws-sdk/*"],
          nodeModules: ["pg"],
        },
      }
		);
    dbCredentialsSecret.grantRead(expressBootstrapFn);
    expressDbCredentialsSecret.grantRead(expressBootstrapFn);

    dbCredentialsSecret.grantRead(pythonBootstrapFn);
		pythonDbCredentialsSecret.grantRead(pythonBootstrapFn);

		dbCredentialsSecret.grantRead(nextJsBootstrapFn);
		nextjsDbCredentialsSecret.grantRead(nextJsBootstrapFn);


		const expressBootstrapProvider = new cr.Provider(this, "ExpressDbBootstrapProvider", {
      onEventHandler: expressBootstrapFn,
    });

    const pythonBootstrapProvider = new cr.Provider(this, "PythonDbBootstrapProvider", {
      onEventHandler: pythonBootstrapFn,
		});


    const nextJsBootstrapProvider = new cr.Provider(this, "NextJsDbBootstrapProvider", {
      onEventHandler: nextJsBootstrapFn,
    });


    const expressDbBootstrap = new cdk.CustomResource(this, "ExpressDbBootstrap", {
      serviceToken: expressBootstrapProvider.serviceToken,
      properties: {
        DbHost: db.dbInstanceEndpointAddress,
        DbPort: db.dbInstanceEndpointPort,
        AdminSecretArn: dbCredentialsSecret.secretArn,
        ExpressSecretArn: expressDbCredentialsSecret.secretArn,
        ExpressDbName: config.postgres.express.dbName,
        ExpressUsername: config.postgres.express.username,
      },
    });
    expressDbBootstrap.node.addDependency(db);
    expressDbBootstrap.node.addDependency(expressDbCredentialsSecret);

    const pythonDbBootstrap = new cdk.CustomResource(this, "PythonDbBootstrap", {
      serviceToken: pythonBootstrapProvider.serviceToken,
      properties: {
        DbHost: db.dbInstanceEndpointAddress,
        DbPort: db.dbInstanceEndpointPort,
        AdminSecretArn: dbCredentialsSecret.secretArn,
        PythonSecretArn: pythonDbCredentialsSecret.secretArn,
        PythonDbName: config.postgres.python.dbName,
        PythonUsername: config.postgres.python.username,
      },
    });
    pythonDbBootstrap.node.addDependency(db);
    pythonDbBootstrap.node.addDependency(pythonDbCredentialsSecret);


    const nextjsDbBootstrap = new cdk.CustomResource(this, "NextJsDbBootstrap", {
      serviceToken: nextJsBootstrapProvider.serviceToken,
      properties: {
        DbHost: db.dbInstanceEndpointAddress,
        DbPort: db.dbInstanceEndpointPort,
        AdminSecretArn: dbCredentialsSecret.secretArn,
        NextJsSecretArn: nextjsDbCredentialsSecret.secretArn,
        NextJsDbName: config.postgres.nextjs.dbName,
        NextJsUsername: config.postgres.nextjs.username,
      },
    });
    nextjsDbBootstrap.node.addDependency(db);
		nextjsDbBootstrap.node.addDependency(nextjsDbCredentialsSecret);


    // Express-specific app secret containing DATABASE_URL
    const expressDatabaseUrlSecret = new secretsmanager.Secret(
      this,
      "ExpressDatabaseUrlSecret",
      {
        description:
          "Express application database connection string in DATABASE_URL format",
        secretObjectValue: {
          DATABASE_URL: cdk.SecretValue.unsafePlainText(
            `postgresql://${config.postgres.express.username}:${expressDbCredentialsSecret
              .secretValueFromJson("password")
              .unsafeUnwrap()}@${db.dbInstanceEndpointAddress}:${
              db.dbInstanceEndpointPort
            }/${config.postgres.express.dbName}?sslmode=require`
          ),
        },
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      }
    );
    expressDatabaseUrlSecret.node.addDependency(expressDbBootstrap);

    // Python-specific app secret containing DATABASE_URL
    const pythonDatabaseUrlSecret = new secretsmanager.Secret(
      this,
      "PythonDatabaseUrlSecret",
      {
        description:
          "Python application database connection string in DATABASE_URL format",
        secretObjectValue: {
          DATABASE_URL: cdk.SecretValue.unsafePlainText(
            `postgresql://${config.postgres.python.username}:${pythonDbCredentialsSecret
              .secretValueFromJson("password")
              .unsafeUnwrap()}@${db.dbInstanceEndpointAddress}:${
              db.dbInstanceEndpointPort
            }/${config.postgres.python.dbName}?sslmode=require`
          ),
        },
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      }
    );
		pythonDatabaseUrlSecret.node.addDependency(pythonDbBootstrap);

		const nextjsDatabaseUrlSecret = new secretsmanager.Secret(
      this,
      "nextjsDatabaseUrlSecret",
      {
        description:
          "nextjs application database connection string in DATABASE_URL format",
        secretObjectValue: {
          DATABASE_URL: cdk.SecretValue.unsafePlainText(
            `postgresql://${config.postgres.nextjs.username}:${nextjsDbCredentialsSecret
              .secretValueFromJson("password")
              .unsafeUnwrap()}@${db.dbInstanceEndpointAddress}:${
              db.dbInstanceEndpointPort
            }/${config.postgres.nextjs.dbName}?sslmode=require`
          ),
        },
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      }
    );
nextjsDatabaseUrlSecret.node.addDependency(nextjsDbBootstrap);
		// Managed node group
    cluster.addNodegroupCapacity("DefaultNodeGroup", {
      desiredSize: 2,
      minSize: 1,
      maxSize: 4,
      instanceTypes: [new ec2.InstanceType("t3.medium")],
    });

    // Namespace + Kubernetes .env secret as separate manifests to avoid kubectl
    // provider issues with top-level `List` objects.
    const appsNamespaceManifest = new eks.KubernetesManifest(this, "AppsNamespace", {
      cluster,
      overwrite: true,
      manifest: [
        {
          apiVersion: "v1",
          kind: "Namespace",
          metadata: { name: config.namespace },
        },
      ],
    });

    const expressServerEnvSecretManifest = new eks.KubernetesManifest(
      this,
      "ExpressServerEnvSecret",
      {
        cluster,
        overwrite: true,
        manifest: [
          {
            apiVersion: "v1",
            kind: "Secret",
            metadata: {
              name: config.expressDbSecretName,
              namespace: config.namespace,
            },
            type: "Opaque",
            stringData: {
              ".env": `NODE_ENV=production
DATABASE_URL=${expressDatabaseUrlSecret
                .secretValueFromJson("DATABASE_URL")
                .unsafeUnwrap()}
EXPRESS_DATABASE_URL=${expressDatabaseUrlSecret
                .secretValueFromJson("DATABASE_URL")
                .unsafeUnwrap()}`,
            },
          },
        ],
      }
    );
    expressServerEnvSecretManifest.node.addDependency(appsNamespaceManifest);
    expressServerEnvSecretManifest.node.addDependency(expressDbBootstrap);

    const pythonServerEnvSecretManifest = new eks.KubernetesManifest(
      this,
      "PythonServerEnvSecret",
      {
        cluster,
        overwrite: true,
        manifest: [
          {
            apiVersion: "v1",
            kind: "Secret",
            metadata: {
              name: config.pythonDbSecretName,
              namespace: config.namespace,
            },
            type: "Opaque",
            stringData: {
              ".env": `NODE_ENV=production
DATABASE_URL=${pythonDatabaseUrlSecret
                .secretValueFromJson("DATABASE_URL")
                .unsafeUnwrap()}
PYTHON_DATABASE_URL=${pythonDatabaseUrlSecret
                .secretValueFromJson("DATABASE_URL")
                .unsafeUnwrap()}`,
            },
          },
        ],
      }
    );
    pythonServerEnvSecretManifest.node.addDependency(appsNamespaceManifest);
		pythonServerEnvSecretManifest.node.addDependency(pythonDbBootstrap);

		const nextJsServerEnvSecretManifest = new eks.KubernetesManifest(this, "NextJsServerEnvSecret", {
      cluster,
      overwrite: true,
      manifest: [
        {
          apiVersion: "v1",
          kind: "Secret",
          metadata: {
            name: config.nextjsDbSecretName,
            namespace: config.namespace,
          },
          type: "Opaque",
          stringData: {
            ".env": `NODE_ENV=production
DATABASE_URL=${nextjsDatabaseUrlSecret
                .secretValueFromJson("DATABASE_URL")
                .unsafeUnwrap()}
NEXTJS_DATABASE_URL=${nextjsDatabaseUrlSecret
                .secretValueFromJson("DATABASE_URL")
                .unsafeUnwrap()}`,
          },
        },
      ],
    });
    nextJsServerEnvSecretManifest.node.addDependency(appsNamespaceManifest);
    nextJsServerEnvSecretManifest.node.addDependency(nextjsDbBootstrap);

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

    // Allow CDK bootstrap version check via SSM parameter
    ghRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [
          `arn:${cdk.Stack.of(this).partition}:ssm:${cdk.Stack.of(this).region}:${
            cdk.Stack.of(this).account
          }:parameter/cdk-bootstrap/hnb659fds/version`,
        ],
      })
    );

    // Allow GitHub Actions role to assume CDK bootstrap deployment roles
    ghRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [
          `arn:${cdk.Stack.of(this).partition}:iam::${cdk.Stack.of(this).account}:role/cdk-hnb659fds-deploy-role-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
          `arn:${cdk.Stack.of(this).partition}:iam::${cdk.Stack.of(this).account}:role/cdk-hnb659fds-file-publishing-role-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
          `arn:${cdk.Stack.of(this).partition}:iam::${cdk.Stack.of(this).account}:role/cdk-hnb659fds-image-publishing-role-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
          `arn:${cdk.Stack.of(this).partition}:iam::${cdk.Stack.of(this).account}:role/cdk-hnb659fds-lookup-role-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
        ],
      })
    );

    // Optional: allow CI to read DB URL secrets
    expressDatabaseUrlSecret.grantRead(ghRole);
		pythonDatabaseUrlSecret.grantRead(ghRole);
		nextjsDatabaseUrlSecret.grantRead(ghRole)

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

    new cdk.CfnOutput(this, "ExpressDatabaseName", {
      value: config.postgres.express.dbName,
    });
    new cdk.CfnOutput(this, "PythonDatabaseName", {
      value: config.postgres.python.dbName,
		});
    new cdk.CfnOutput(this, "NextJsDatabaseName", {
      value: config.postgres.nextjs.dbName,
    });

    new cdk.CfnOutput(this, "DatabaseCredentialsSecretArn", {
      value: dbCredentialsSecret.secretArn,
    });

    new cdk.CfnOutput(this, "ExpressDbCredentialsSecretArn", {
      value: expressDbCredentialsSecret.secretArn,
    });
    new cdk.CfnOutput(this, "PythonDbCredentialsSecretArn", {
      value: pythonDbCredentialsSecret.secretArn,
		});

    new cdk.CfnOutput(this, "NextJsDbCredentialsSecretArn", {
      value: nextjsDbCredentialsSecret.secretArn,
    });

    new cdk.CfnOutput(this, "ExpressDatabaseUrlSecretArn", {
      value: expressDatabaseUrlSecret.secretArn,
    });
    new cdk.CfnOutput(this, "PythonDatabaseUrlSecretArn", {
      value: pythonDatabaseUrlSecret.secretArn,
    });
    new cdk.CfnOutput(this, "NextJsDatabaseUrlSecretArn", {
      value: nextjsDatabaseUrlSecret.secretArn,
    });

    new cdk.CfnOutput(this, "ExpressKubernetesDatabaseSecretName", {
      value: config.expressDbSecretName,
    });
    new cdk.CfnOutput(this, "PythonKubernetesDatabaseSecretName", {
      value: config.pythonDbSecretName,
		});
    new cdk.CfnOutput(this, "NextJsKubernetesDatabaseSecretName", {
      value: config.nextjsDbSecretName,
    });
  }
}
