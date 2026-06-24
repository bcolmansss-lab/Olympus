/**
 * OrgIntelligence — org chart analysis, team topology, span of control,
 * collaboration graphs, and organizational health metrics.
 *
 * No events — pure analytical layer over org data.
 */

import { randomUUID } from "node:crypto";

export type TeamTopology = "stream_aligned" | "platform" | "enabling" | "complicated_subsystem";
export type OrgHealthDimension = "span_of_control" | "layer_depth" | "team_size" | "manager_ratio";

export interface Team {
  id: string;
  name: string;
  topology: TeamTopology;
  managerId: string;
  memberIds: string[];
  parentTeamId?: string;
  missionStatement?: string;
  createdAt: string;
}

export interface SpanAnalysis {
  managerId: string;
  managerName?: string;
  directReports: number;
  recommendation: "too_narrow" | "healthy" | "too_wide"; // <3 narrow, 3-8 healthy, >8 wide
}

export interface OrgHealthReport {
  totalHeadcount: number;
  totalManagers: number;
  avgSpanOfControl: number;
  maxOrgDepth: number;
  managerRatio: number; // managers / ICs
  teamsByTopology: Partial<Record<TeamTopology, number>>;
  spanAnalyses: SpanAnalysis[];
  healthScore: number; // 0-100 composite
}

export class OrgIntelligence {
  private teams = new Map<string, Team>();
  /** managerId → direct report memberIds (built from Team data) */
  private orgTree = new Map<string, string[]>();

  addTeam(input: Omit<Team, "id" | "createdAt"> & { id?: string }): Team {
    const team: Team = {
      id: input.id ?? randomUUID(),
      name: input.name,
      topology: input.topology,
      managerId: input.managerId,
      memberIds: input.memberIds,
      parentTeamId: input.parentTeamId,
      missionStatement: input.missionStatement,
      createdAt: new Date().toISOString(),
    };
    this.teams.set(team.id, team);
    // Update orgTree: manager -> members
    const existing = this.orgTree.get(team.managerId) ?? [];
    const merged = Array.from(new Set([...existing, ...team.memberIds]));
    this.orgTree.set(team.managerId, merged);
    return team;
  }

  getTeam(id: string): Team | undefined {
    return this.teams.get(id);
  }

  listTeams(topology?: TeamTopology): Team[] {
    const list = Array.from(this.teams.values());
    if (topology !== undefined) return list.filter((t) => t.topology === topology);
    return list;
  }

  getSubtree(teamId: string): Team[] {
    const root = this.teams.get(teamId);
    if (!root) return [];
    const result: Team[] = [root];
    const queue = [teamId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const team of this.teams.values()) {
        if (team.parentTeamId === current && team.id !== teamId) {
          result.push(team);
          queue.push(team.id);
        }
      }
    }
    return result;
  }

  analyzeSpans(): SpanAnalysis[] {
    const analyses: SpanAnalysis[] = [];
    for (const team of this.teams.values()) {
      const count = team.memberIds.length;
      let recommendation: SpanAnalysis["recommendation"];
      if (count < 3) recommendation = "too_narrow";
      else if (count <= 8) recommendation = "healthy";
      else recommendation = "too_wide";

      analyses.push({
        managerId: team.managerId,
        directReports: count,
        recommendation,
      });
    }
    return analyses;
  }

  computeOrgDepth(rootManagerId: string): number {
    // BFS through managerId → memberIds
    let maxDepth = 0;
    const queue: Array<{ id: string; depth: number }> = [{ id: rootManagerId, depth: 0 }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      if (depth > maxDepth) maxDepth = depth;

      const reports = this.orgTree.get(id) ?? [];
      for (const reportId of reports) {
        if (!visited.has(reportId)) {
          queue.push({ id: reportId, depth: depth + 1 });
        }
      }
    }
    return maxDepth;
  }

  generateHealthReport(): OrgHealthReport {
    const allTeams = Array.from(this.teams.values());
    const allManagerIds = new Set(allTeams.map((t) => t.managerId));
    const allMemberIds = new Set(allTeams.flatMap((t) => t.memberIds));

    // Headcount = unique members + managers not also members
    const headcountSet = new Set([...allManagerIds, ...allMemberIds]);
    const totalHeadcount = headcountSet.size;
    const totalManagers = allManagerIds.size;
    const icCount = totalHeadcount - totalManagers;
    const managerRatio = icCount > 0 ? totalManagers / icCount : totalManagers;

    const spanAnalyses = this.analyzeSpans();
    const avgSpanOfControl =
      spanAnalyses.length > 0
        ? spanAnalyses.reduce((s, a) => s + a.directReports, 0) / spanAnalyses.length
        : 0;

    // Compute max depth from all manager roots
    let maxOrgDepth = 0;
    for (const managerId of allManagerIds) {
      const depth = this.computeOrgDepth(managerId);
      if (depth > maxOrgDepth) maxOrgDepth = depth;
    }

    const teamsByTopology: Partial<Record<TeamTopology, number>> = {};
    for (const team of allTeams) {
      teamsByTopology[team.topology] = (teamsByTopology[team.topology] ?? 0) + 1;
    }

    // Health score
    let healthScore = 100;
    for (const analysis of spanAnalyses) {
      if (analysis.recommendation === "too_wide") healthScore -= 5;
      else if (analysis.recommendation === "too_narrow") healthScore -= 2;
    }
    if (maxOrgDepth > 6) healthScore -= 10;
    if (managerRatio > 0.4) healthScore -= 15;
    healthScore = Math.max(0, healthScore);

    return {
      totalHeadcount,
      totalManagers,
      avgSpanOfControl,
      maxOrgDepth,
      managerRatio,
      teamsByTopology,
      spanAnalyses,
      healthScore,
    };
  }

  getReportingChain(memberId: string): string[] {
    const chain: string[] = [];
    const visited = new Set<string>();

    // Find who manages this member
    const findManager = (id: string): string | undefined => {
      for (const team of this.teams.values()) {
        if (team.memberIds.includes(id)) {
          return team.managerId;
        }
      }
      return undefined;
    };

    let current = memberId;
    while (true) {
      if (visited.has(current)) break;
      visited.add(current);
      const manager = findManager(current);
      if (!manager || manager === current) break;
      chain.push(manager);
      current = manager;
    }

    return chain;
  }
}
