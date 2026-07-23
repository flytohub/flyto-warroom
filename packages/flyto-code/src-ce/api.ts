import type {
  BootstrapStatus,
  Finding,
  FindingGroups,
  Project,
  Repository,
  Scan,
  Session,
  User,
  WorkflowSummary,
} from "./types";

const TOKEN_KEY = "flyto-warroom-ce-token";

interface OrganizationList {
  organizations: Project[];
  count: number;
}

interface RepositoryList {
  repos: Repository[];
  count: number;
}

interface ScanList {
  scans: Scan[];
  count: number;
}

interface APIErrorBody {
  error?: string | { code?: string; message?: string };
}

export class APIError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function apiErrorMessage(body: APIErrorBody | null, fallback: string): string {
  if (typeof body?.error === "string") return body.error;
  if (body?.error && typeof body.error === "object") {
    return body.error.message || body.error.code || fallback;
  }
  return fallback;
}

export class CEClient {
  private token = window.localStorage.getItem(TOKEN_KEY) || "";

  authenticated(): boolean {
    return this.token !== "";
  }

  saveSession(session: Session): Session {
    this.token = session.accessToken;
    window.localStorage.setItem(TOKEN_KEY, session.accessToken);
    return session;
  }

  signOut(): void {
    this.token = "";
    window.localStorage.removeItem(TOKEN_KEY);
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    authenticated = true,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body) headers.set("Content-Type", "application/json");
    if (authenticated && this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }
    const response = await fetch(path, { ...init, headers });
    if (!response.ok) {
      const body = (await response
        .json()
        .catch(() => null)) as APIErrorBody | null;
      if (response.status === 401) this.signOut();
      throw new APIError(
        apiErrorMessage(body, `Request failed (${response.status})`),
        response.status,
      );
    }
    return (await response.json()) as T;
  }

  bootstrapStatus(): Promise<BootstrapStatus> {
    return this.request<BootstrapStatus>(
      "/api/v1/auth/local/bootstrap",
      {},
      false,
    );
  }

  bootstrap(
    email: string,
    password: string,
    displayName: string,
  ): Promise<Session> {
    return this.request<Session>(
      "/api/v1/auth/local/bootstrap",
      {
        method: "POST",
        body: JSON.stringify({ email, password, displayName }),
      },
      false,
    ).then((session) => this.saveSession(session));
  }

  login(email: string, password: string): Promise<Session> {
    return this.request<Session>(
      "/api/v1/auth/local/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
      false,
    ).then((session) => this.saveSession(session));
  }

  me(): Promise<User> {
    return this.request<User>("/api/v1/me");
  }

  projects(): Promise<Project[]> {
    return this.request<OrganizationList>("/api/v1/code/orgs").then(
      (response) => response.organizations || [],
    );
  }

  createProject(name: string, slug: string): Promise<Project> {
    return this.request<Project>("/api/v1/code/orgs", {
      method: "POST",
      body: JSON.stringify({ name, slug, project_type: "all" }),
    });
  }

  repositories(projectID: string): Promise<Repository[]> {
    return this.request<RepositoryList>(
      `/api/v1/code/orgs/${encodeURIComponent(projectID)}/repos`,
    ).then((response) => response.repos || []);
  }

  connectRepository(
    projectID: string,
    cloneURL: string,
  ): Promise<Repository> {
    return this.request<Repository>(
      `/api/v1/code/orgs/${encodeURIComponent(projectID)}/repos`,
      {
        method: "POST",
        body: JSON.stringify({
          provider: "git",
          clone_url: cloneURL,
          htmlUrl: cloneURL,
          isPrivate: false,
        }),
      },
    );
  }

  startScan(repoID: string): Promise<Scan> {
    return this.request<Scan>(
      `/api/v1/code/repos/${encodeURIComponent(repoID)}/scans`,
      { method: "POST" },
    );
  }

  scans(repoID: string): Promise<Scan[]> {
    return this.request<ScanList>(
      `/api/v1/code/repos/${encodeURIComponent(repoID)}/scans?limit=20`,
    ).then((response) => response.scans || []);
  }

  findings(repoID: string): Promise<Finding[]> {
    return this.request<FindingGroups>(
      `/api/v1/code/repos/${encodeURIComponent(repoID)}/findings`,
    ).then((response) => [
      ...(response.secrets || []),
      ...(response.sast_findings || []),
      ...(response.taint_flows || []),
      ...(response.dead_code || []),
      ...(response.complex_functions || []),
    ]);
  }

  workflow(projectID: string): Promise<WorkflowSummary> {
    return this.request<WorkflowSummary>(
      `/api/v1/code/orgs/${encodeURIComponent(projectID)}/workflow`,
    );
  }

  verifyRemediation(
    projectID: string,
    remediationID: string,
  ): Promise<Scan> {
    return this.request<Scan>(
      `/api/v1/code/orgs/${encodeURIComponent(projectID)}/remediations/${encodeURIComponent(remediationID)}/verify`,
      { method: "POST" },
    );
  }

  async openLatestReport(projectID: string): Promise<void> {
    const response = await fetch(
      `/api/v1/code/orgs/${encodeURIComponent(projectID)}/reports/latest.html`,
      { headers: { Authorization: `Bearer ${this.token}` } },
    );
    if (!response.ok) {
      throw new APIError(
        response.status === 404
          ? "No completed evidence report is available yet."
          : `Report request failed (${response.status})`,
        response.status,
      );
    }
    const blobURL = URL.createObjectURL(await response.blob());
    window.open(blobURL, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(blobURL), 60_000);
  }
}

export const ceClient = new CEClient();
