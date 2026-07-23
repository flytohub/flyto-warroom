import type { ServiceBoundary, WorkflowSummary } from "./types";

export const emptyWorkflow: WorkflowSummary = {
  attack_paths: [],
  evidence: [],
  remediations: [],
  reports: [],
};

export const communityServices: ServiceBoundary[] = [
  {
    name: "engine-ce",
    port: 8080,
    source: "ce/engine-ce",
    responsibility: "Local identity, projects, repositories, API and policy boundary",
  },
  {
    name: "worker-ce",
    port: 8081,
    source: "ce/worker-ce",
    responsibility: "Credential-free clone, secret, SAST, IaC and dependency scans",
  },
  {
    name: "scheduler-ce",
    port: 8082,
    source: "ce/scheduler-ce",
    responsibility: "Durable recurring scan scheduling with one-active-scan safety",
  },
  {
    name: "analysis-ce",
    port: 8083,
    source: "ce/analysis-ce",
    responsibility: "Evidence digests, recommendations and risk-chain hypotheses",
  },
  {
    name: "report-ce",
    port: 8084,
    source: "ce/report-ce",
    responsibility: "Portable local HTML evidence reports",
  },
];
