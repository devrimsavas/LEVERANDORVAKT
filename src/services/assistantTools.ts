import {
  getCompanyAccounts,
  getCompanyChanges,
  getCompanyRisk,
  getWatchlist,
  NotWatchingError,
  CompanyNotFoundError,
} from "./watchlistService.js";
import { getNotifications } from "./notificationService.js";
import {
  getAnnualAccounts,
  getCompanyRoles,
  lookupCompany,
  searchCompanies,
} from "./brregService.js";
import { assessCompanyLive } from "./riskService.js";
import { findConnections } from "./connectionsService.js";
import {
  getIndustryBreakdown,
  getMunicipalities,
  getRegistrationTrend,
  parseTrendParams,
  TrendInputError,
} from "./trendsService.js";
import { isValidOrgNumber } from "../utils/orgNumber.js";
import type { AnnualAccounts } from "../types/annualAccounts.js";
import type { RiskAssessment } from "../types/risk.js";
import type { ToolDefinition } from "../types/llm.js";

// The tools the assistant can use. They only read data: anything that
// changes data is done by the user through the normal API.
// Results are kept short: only what an answer needs, which saves tokens
// and keeps small local models on track.

// Who is asking. Comes from the login token, never from the model.
export interface ToolContext {
  userPublicId: string;
}

const ORG_NUMBER_PARAMETER = {
  type: "string",
  description: "The 9-digit Norwegian organization number",
};

export const ASSISTANT_TOOLS: ToolDefinition[] = [
  {
    name: "list_watchlist",
    description:
      "List the companies the user follows, with their risk level and when they last changed.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "search_companies",
    description:
      "Search the Norwegian company register by company name. Use it to find a company's organization number.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The company name, or part of it",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "get_company",
    description:
      "Get a company's register data: form, address, industry, employees, founding date, bankruptcy and liquidation flags.",
    parameters: {
      type: "object",
      properties: { orgNumber: ORG_NUMBER_PARAMETER },
      required: ["orgNumber"],
    },
  },
  {
    name: "get_company_risk",
    description:
      "Get the risk assessment of a company: level, score, the signals behind it and what could not be checked.",
    parameters: {
      type: "object",
      properties: { orgNumber: ORG_NUMBER_PARAMETER },
      required: ["orgNumber"],
    },
  },
  {
    name: "get_company_changes",
    description:
      "Get the recorded changes of a company the user follows (CEO, board, address, bankruptcy, annual accounts, risk level), newest first.",
    parameters: {
      type: "object",
      properties: { orgNumber: ORG_NUMBER_PARAMETER },
      required: ["orgNumber"],
    },
  },
  {
    name: "get_company_accounts",
    description:
      "Get key figures from a company's annual accounts (revenue, profit, equity, debt), newest first.",
    parameters: {
      type: "object",
      properties: { orgNumber: ORG_NUMBER_PARAMETER },
      required: ["orgNumber"],
    },
  },
  {
    name: "get_company_roles",
    description:
      "Get a company's current CEO, board chair, board members and auditor.",
    parameters: {
      type: "object",
      properties: { orgNumber: ORG_NUMBER_PARAMETER },
      required: ["orgNumber"],
    },
  },
  {
    name: "find_connections",
    description:
      "Find people and organizations (e.g. an audit firm) that hold roles in two or more of the user's followed companies. With orgNumber, only the connections between that company and the followed companies.",
    parameters: {
      type: "object",
      properties: {
        orgNumber: {
          type: "string",
          description:
            "Optional: a company the user is considering, to compare with the followed companies",
        },
      },
    },
  },
  {
    name: "get_registration_trends",
    description:
      "Count new companies registered per month, compared with the same months a year earlier. Can be filtered by municipality, industry and organization form, and can list the most common industries.",
    parameters: {
      type: "object",
      properties: {
        municipality: {
          type: "string",
          description: 'Municipality name (e.g. "Alta") or 4-digit number',
        },
        industry: {
          type: "string",
          description:
            'Industry code or its start, e.g. "55" for accommodation, "56" for food service, "79" for travel agencies',
        },
        form: { type: "string", description: 'Organization form, e.g. "AS"' },
        from: { type: "string", description: "First month, e.g. 2026-01" },
        to: { type: "string", description: "Last month, e.g. 2026-10" },
        includeIndustries: {
          type: "boolean",
          description: "Also list the most common industries",
        },
      },
    },
  },
  {
    name: "get_notifications",
    description:
      "Get the user's latest notifications about changes in followed companies.",
    parameters: {
      type: "object",
      properties: {
        unreadOnly: {
          type: "boolean",
          description: "Only unread notifications",
        },
      },
    },
  },
];

// A problem the model can fix itself, e.g. an invalid organization number.
// Sent back to the model as { error } instead of failing the question.
class ToolInputError extends Error {}

function orgNumberArgument(args: Record<string, unknown>): string {
  const value = args.orgNumber;
  // Models sometimes write numbers with spaces ("923 609 016")
  const orgNumber =
    typeof value === "string" || typeof value === "number"
      ? String(value).replace(/\s/g, "")
      : "";
  if (!isValidOrgNumber(orgNumber)) {
    throw new ToolInputError("orgNumber must be a 9-digit organization number");
  }
  return orgNumber;
}

function compactAccounts(accounts: AnnualAccounts[]) {
  return accounts.slice(0, 6).map((a) => ({
    year: a.year,
    type: a.type,
    currency: a.currency,
    audited: a.audited,
    liquidation: a.liquidation,
    revenue: a.figures.revenue,
    operatingProfit: a.figures.operatingProfit,
    netProfit: a.figures.netProfit,
    equity: a.figures.equity,
    totalAssets: a.figures.totalAssets,
    totalDebt: a.figures.totalDebt,
    cash: a.figures.cash,
  }));
}

function compactRisk(risk: RiskAssessment) {
  return {
    name: risk.name,
    level: risk.level,
    score: risk.score,
    signals: risk.signals.map((s) => ({
      code: s.code,
      severity: s.severity,
      points: s.points,
      detail: s.detail,
    })),
    limitations: risk.limitations.map((l) => l.reason),
    disclaimer: risk.disclaimer,
  };
}

// Runs a followed-company function, or the fallback for other companies
async function followedOr<T>(
  followed: () => Promise<T>,
  other: () => Promise<T>,
): Promise<T> {
  try {
    return await followed();
  } catch (error) {
    if (error instanceof NotWatchingError) {
      return other();
    }
    throw error;
  }
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<unknown> {
  const { userPublicId } = context;

  switch (name) {
    case "list_watchlist": {
      const items = await getWatchlist(userPublicId, "risk");
      // The user's private notes are left out on purpose
      return items.map((item) => ({
        orgNumber: item.orgNumber,
        name: item.name,
        riskLevel: item.risk.level,
        riskScore: item.risk.score,
        lastChangedAt: item.lastChangedAt,
        struckOff: item.deletedFromRegistryAt !== null,
      }));
    }

    case "search_companies": {
      const query = typeof args.name === "string" ? args.name.trim() : "";
      if (query.length < 2) {
        throw new ToolInputError("name must be at least 2 characters");
      }
      const companies = await searchCompanies(query, 10);
      return companies.map((c) => ({
        orgNumber: c.orgNumber,
        name: c.name,
        organizationForm: c.organizationForm,
        municipality: c.address?.municipality ?? null,
        isBankrupt: c.isBankrupt,
      }));
    }

    case "get_company": {
      const lookup = await lookupCompany(orgNumberArgument(args));
      if (lookup.status === "notFound") {
        return { error: "No company with this organization number" };
      }
      if (lookup.status === "deleted") {
        return { struckOff: true, deletedDate: lookup.deletedDate };
      }
      return lookup.company;
    }

    case "get_company_risk": {
      const orgNumber = orgNumberArgument(args);
      const risk = await followedOr(
        () => getCompanyRisk(userPublicId, orgNumber),
        () => assessCompanyLive(orgNumber),
      );
      return risk
        ? compactRisk(risk)
        : { error: "No company with this organization number" };
    }

    case "get_company_changes": {
      const orgNumber = orgNumberArgument(args);
      return followedOr<unknown>(
        async () => {
          const page = await getCompanyChanges(userPublicId, orgNumber, {
            page: 1,
            pageSize: 20,
          });
          return page.items;
        },
        async () => ({
          error:
            "Changes are only recorded for companies the user follows. This company is not on the watchlist.",
        }),
      );
    }

    case "get_company_accounts": {
      const orgNumber = orgNumberArgument(args);
      // Stored accounts also include years Brreg no longer lists
      const result = await followedOr(
        () => getCompanyAccounts(userPublicId, orgNumber),
        () => getAnnualAccounts(orgNumber),
      );
      if (result.status === "unsupported") {
        return {
          error:
            "The accounts register does not give key figures for this kind of company (e.g. banks).",
        };
      }
      return compactAccounts(result.accounts);
    }

    case "get_company_roles": {
      const roles = await getCompanyRoles(orgNumberArgument(args));
      return roles ?? { error: "No roles registered for this company" };
    }

    case "find_connections": {
      const candidate =
        args.orgNumber === undefined || args.orgNumber === ""
          ? null
          : orgNumberArgument(args);
      let result;
      try {
        result = await findConnections(userPublicId, candidate);
      } catch (error) {
        if (error instanceof CompanyNotFoundError) {
          return { error: "No company with this organization number" };
        }
        throw error;
      }
      return result.connections.length === 0 && result.limitations.length === 0
        ? { connections: [], note: "No shared people or organizations found" }
        : result;
    }

    case "get_registration_trends": {
      // Models usually know the municipality by name, not by number
      let municipality = args.municipality;
      if (
        typeof municipality === "string" &&
        !/^\d{4}$/.test(municipality.trim())
      ) {
        const name = municipality.trim().toLocaleLowerCase("nb");
        const match = (await getMunicipalities()).find(
          (m) => m.name.toLocaleLowerCase("nb") === name,
        );
        if (!match) {
          throw new ToolInputError(`Unknown municipality: ${municipality}`);
        }
        municipality = match.number;
      }

      let params;
      try {
        params = parseTrendParams({ ...args, municipality });
      } catch (error) {
        if (error instanceof TrendInputError) {
          throw new ToolInputError(error.message);
        }
        throw error;
      }

      const trend = await getRegistrationTrend(params);
      return {
        from: trend.from,
        to: trend.to,
        months: trend.months,
        total: trend.total,
        previousYearTotal: trend.previousYearTotal,
        changePercent: trend.changePercent,
        ...(args.includeIndustries === true
          ? { industries: await getIndustryBreakdown(params) }
          : {}),
      };
    }

    case "get_notifications": {
      const page = await getNotifications(
        userPublicId,
        { unreadOnly: args.unreadOnly === true },
        { page: 1, pageSize: 10 },
      );
      return page.items.map((n) => ({
        company: n.company.name,
        orgNumber: n.company.orgNumber,
        field: n.change.field,
        oldValue: n.change.oldValue,
        newValue: n.change.newValue,
        severity: n.change.severity,
        detectedAt: n.change.detectedAt,
        read: n.readAt !== null,
      }));
    }

    default:
      throw new ToolInputError(`Unknown tool: ${name}`);
  }
}

// Runs one tool call. Problems the model can act on are returned as
// { error } so it can correct itself; the answer then says what failed.
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<unknown> {
  try {
    return await runTool(name, args, context);
  } catch (error) {
    if (error instanceof ToolInputError) {
      return { error: error.message };
    }
    // Brreg or the database failed; the model can tell the user
    console.error(`Assistant tool ${name} failed`, error);
    return {
      error: "The data could not be loaded right now. Try again later.",
    };
  }
}
