import * as cdk from "aws-cdk-lib";
import { EksStack } from "../lib/eks-stack.js";
import { config } from "../lib/config.js";

const app = new cdk.App();

new EksStack(app, "EksStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: config.region,
  },
});
