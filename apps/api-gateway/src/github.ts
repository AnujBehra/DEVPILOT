import {
  GitHubCommit,
  GitHubPullRequest,
  listGitHubCommits,
  listGitHubPullRequests,
  listGitHubRepositories,
  replaceGitHubCommits,
  replaceGitHubPullRequests,
  upsertGitHubRepository,
} from './store';

const githubHeaders = () => {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'devpilot-ai-local',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
};

const githubJson = async <T>(url: string) => {
  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) {
    throw new Error(`GitHub request failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
};

export const parseGitHubRepository = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://github.com/${raw}`);
    const [owner, repo] = url.pathname.replace(/^\/+/, '').split('/');
    if (owner && repo) return { owner, repo: repo.replace(/\.git$/, '') };
  } catch {
    const [owner, repo] = raw.replace(/^github:/i, '').replace(/^\/+/, '').split('/');
    if (owner && repo) return { owner, repo: repo.replace(/\.git$/, '') };
  }
  return undefined;
};

export const fetchGitHubRepositoryMetrics = async (repositoryValue: string) => {
  const parsed = parseGitHubRepository(repositoryValue);
  if (!parsed) throw new Error('Repository must look like owner/repo or https://github.com/owner/repo');
  const { owner, repo } = parsed;
  const [repository, commits, pullRequests] = await Promise.all([
    githubJson<any>(`https://api.github.com/repos/${owner}/${repo}`),
    githubJson<any[]>(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=30`),
    githubJson<any[]>(`https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=30`),
  ]);
  const mergedPullRequests = pullRequests.filter((pr) => pr.merged_at);
  const leadTimes = mergedPullRequests
    .map((pr) => (new Date(pr.merged_at).getTime() - new Date(pr.created_at).getTime()) / 3600000)
    .filter((hours) => Number.isFinite(hours) && hours >= 0);
  return {
    owner,
    repo,
    fullName: repository.full_name || `${owner}/${repo}`,
    defaultBranch: repository.default_branch || 'main',
    sourceUrl: repository.html_url || `https://github.com/${owner}/${repo}`,
    commits: commits.length,
    pullRequests: pullRequests.length,
    openIssues: Number(repository.open_issues_count || 0),
    deploymentFrequency: Number((commits.length / 7).toFixed(2)),
    leadTimeHours: Number((leadTimes.reduce((sum, value) => sum + value, 0) / Math.max(leadTimes.length, 1)).toFixed(1)),
  };
};

export const syncGitHubRepository = async (owner: string, repo: string) => {
  const [repository, commits, pullRequests] = await Promise.all([
    githubJson<any>(`https://api.github.com/repos/${owner}/${repo}`),
    githubJson<any[]>(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=10`),
    githubJson<any[]>(`https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=10`),
  ]);

  const repositoryId = await upsertGitHubRepository({
    owner,
    name: repo,
    fullName: repository.full_name,
    defaultBranch: repository.default_branch,
    stars: repository.stargazers_count,
    openIssues: repository.open_issues_count,
  });

  const normalizedCommits: GitHubCommit[] = commits.map((commit) => ({
    sha: commit.sha,
    repositoryId,
    message: commit.commit?.message || 'No commit message',
    author: commit.commit?.author?.name || commit.author?.login || 'Unknown',
    committedAt: commit.commit?.author?.date || new Date().toISOString(),
    url: commit.html_url,
  }));

  const normalizedPrs: GitHubPullRequest[] = pullRequests.map((pr) => ({
    id: String(pr.id),
    repositoryId,
    number: pr.number,
    title: pr.title,
    state: pr.merged_at ? 'merged' : pr.state,
    author: pr.user?.login || 'Unknown',
    createdAt: pr.created_at,
    mergedAt: pr.merged_at,
    url: pr.html_url,
  }));

  await replaceGitHubCommits(repositoryId, normalizedCommits);
  await replaceGitHubPullRequests(repositoryId, normalizedPrs);

  return githubSnapshot();
};

export const githubSnapshot = async () => ({
  repositories: await listGitHubRepositories(),
  commits: await listGitHubCommits(),
  pullRequests: await listGitHubPullRequests(),
});
