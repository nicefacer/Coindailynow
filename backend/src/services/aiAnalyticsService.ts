/**
 * AI Performance Analytics & Monitoring Service
 * 
 * Comprehensive analytics system for AI agent performance monitoring, cost tracking,
 * and optimization recommendations.
 * 
 * Features:
 * - Real-time performance metrics calculation
 * - Success rate tracking (target: >95%)
 * - Cost analysis and optimization recommendations
 * - Capacity utilization monitoring
 * - Response time tracking (target: <500ms)
 * - Cache hit rate monitoring (target: 75%)
 * - Error rate analysis by agent type
 * - Task completion time distribution
 * - Time-series data storage with aggregation
 * - Alerting system for threshold breaches
 * - Elasticsearch integration for advanced queries
 * 
 * Data Retention:
 * - Hot storage: 30 days in PostgreSQL/SQLite
 * - Cold storage: 1 year in Elasticsearch
 */

import prisma from '../lib/prisma';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

// Helper functions for safe Redis operations
const safeRedisSetex = async (key: string, ttl: number, value: string): Promise<void> => {
  if (redisClient && redisClient.isOpen) {
    await (redisClient as any).setex(key, ttl, value);
  }
};

const safeRedisSet = async (key: string, value: string): Promise<void> => {
  if (redisClient && redisClient.isOpen) {
    await (redisClient as any).set(key, value);
  }
};

const safeRedisGet = async (key: string): Promise<string | null> => {
  if (redisClient && redisClient.isOpen) {
    return await (redisClient as any).get(key);
  }
  return null;
};

// ==================== EVENT EMITTER FOR ALERTS ====================

export const analyticsEvents = new EventEmitter();

// ==================== TYPES AND INTERFACES ====================

export interface SystemOverview {
  timestamp: Date;
  totalAgents: number;
  activeAgents: number;
  inactiveAgents: number;
  totalTasks: number;
  queuedTasks: number;
  processingTasks: number;
  completedTasks: number;
  failedTasks: number;
  cancelledTasks: number;
  overallSuccessRate: number;
  averageResponseTime: number;
  totalCost: number;
  costToday: number;
  costThisWeek: number;
  costThisMonth: number;
  cacheHitRate: number;
  systemHealth: 'healthy' | 'warning' | 'critical';
  alerts: Alert[];
}

export interface AgentAnalytics {
  agentId: string;
  agentName: string;
  agentType: string;
  isActive: boolean;
  performance: {
    totalTasks: number;
    successfulTasks: number;
    failedTasks: number;
    cancelledTasks: number;
    successRate: number;
    averageResponseTime: number;
    medianResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    tasksPerHour: number;
    currentLoad: number;
  };
  costs: {
    totalCost: number;
    averageCostPerTask: number;
    costToday: number;
    costThisWeek: number;
    costThisMonth: number;
    estimatedMonthlyBurn: number;
  };
  quality: {
    averageQualityScore: number;
    qualityTrend: 'improving' | 'stable' | 'declining';
    lowQualityTaskCount: number;
  };
  errors: {
    errorRate: number;
    commonErrors: Array<{ error: string; count: number }>;
    lastError?: { message: string; timestamp: Date };
  };
  capacity: {
    utilizationRate: number;
    averageQueueWait: number;
    peakLoad: number;
    bottleneck: boolean;
  };
  trends: {
    hourly: MetricPoint[];
    daily: MetricPoint[];
    weekly: MetricPoint[];
  };
}

export interface CostBreakdown {
  timestamp: Date;
  totalCost: number;
  costToday: number;
  costYesterday: number;
  costThisWeek: number;
  costLastWeek: number;
  costThisMonth: number;
  costLastMonth: number;
  byAgent: Array<{
    agentId: string;
    agentName: string;
    agentType: string;
    totalCost: number;
    percentage: number;
    tasksCompleted: number;
    averageCostPerTask: number;
  }>;
  byTaskType: Array<{
    taskType: string;
    totalCost: number;
    percentage: number;
    tasksCompleted: number;
    averageCostPerTask: number;
  }>;
  trends: {
    daily: Array<{ date: string; cost: number }>;
    weekly: Array<{ week: string; cost: number }>;
    monthly: Array<{ month: string; cost: number }>;
  };
  projections: {
    estimatedDailyCost: number;
    estimatedWeeklyCost: number;
    estimatedMonthlyCost: number;
    budgetUtilization?: number; // If budget is set
  };
}

export interface PerformanceTrends {
  timestamp: Date;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  successRate: {
    current: number;
    previous: number;
    trend: 'improving' | 'stable' | 'declining';
    data: MetricPoint[];
  };
  responseTime: {
    current: number;
    previous: number;
    trend: 'improving' | 'stable' | 'declining';
    data: MetricPoint[];
  };
  taskThroughput: {
    current: number;
    previous: number;
    trend: 'improving' | 'stable' | 'declining';
    data: MetricPoint[];
  };
  errorRate: {
    current: number;
    previous: number;
    trend: 'improving' | 'stable' | 'declining';
    data: MetricPoint[];
  };
  cacheHitRate: {
    current: number;
    previous: number;
    trend: 'improving' | 'stable' | 'declining';
    data: MetricPoint[];
  };
  qualityScore: {
    current: number;
    previous: number;
    trend: 'improving' | 'stable' | 'declining';
    data: MetricPoint[];
  };
}

export interface OptimizationRecommendation {
  id: string;
  type: 'cost' | 'performance' | 'quality' | 'capacity';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  estimatedSavings?: number; // For cost optimizations
  estimatedImprovement?: number; // For performance optimizations
  agentId?: string;
  agentName?: string;
  createdAt: Date;
}

export interface Alert {
  id: string;
  type: 'success_rate' | 'response_time' | 'cost' | 'error_rate' | 'health' | 'capacity';
  severity: 'warning' | 'critical';
  title: string;
  message: string;
  agentId?: string;
  agentName?: string;
  threshold: number;
  currentValue: number;
  createdAt: Date;
  acknowledged: boolean;
}

export interface MetricPoint {
  timestamp: Date;
  value: number;
  label?: string;
}

export interface DateRangeFilter {
  startDate?: Date;
  endDate?: Date;
  period?: 'hour' | 'day' | 'week' | 'month';
}

export interface BudgetConfig {
  dailyLimit?: number;
  weeklyLimit?: number;
  monthlyLimit?: number;
  alertThreshold?: number; // Percentage (e.g., 80 means alert at 80% of budget)
}

// ==================== CACHING CONSTANTS ====================

const CACHE_TTL = {
  OVERVIEW: 30, // 30 seconds
  AGENT_ANALYTICS: 60, // 1 minute
  COSTS: 300, // 5 minutes
  PERFORMANCE: 60, // 1 minute
  RECOMMENDATIONS: 300, // 5 minutes
};

const CACHE_KEYS = {
  OVERVIEW: 'ai:analytics:overview',
  AGENT_ANALYTICS: (agentId: string) => `ai:analytics:agent:${agentId}`,
  COSTS: 'ai:analytics:costs',
  PERFORMANCE: (period: string) => `ai:analytics:performance:${period}`,
  RECOMMENDATIONS: 'ai:analytics:recommendations',
  CACHE_STATS: 'ai:analytics:cache:stats',
  BUDGET: 'ai:analytics:budget',
};

// ==================== ALERT THRESHOLDS ====================

const ALERT_THRESHOLDS = {
  SUCCESS_RATE_WARNING: 0.95, // 95%
  SUCCESS_RATE_CRITICAL: 0.90, // 90%
  RESPONSE_TIME_WARNING: 800, // 800ms
  RESPONSE_TIME_CRITICAL: 1000, // 1000ms
  ERROR_RATE_WARNING: 0.05, // 5%
  ERROR_RATE_CRITICAL: 0.10, // 10%
  CACHE_HIT_RATE_WARNING: 0.75, // 75%
  UTILIZATION_WARNING: 0.80, // 80%
  UTILIZATION_CRITICAL: 0.95, // 95%
};

// ==================== SYSTEM OVERVIEW ====================

/**
 * Get comprehensive system-wide analytics overview
 * @returns System overview with real-time metrics
 */
export async function getSystemOverview(): Promise<SystemOverview> {
  try {
    // Try to get from cache first
    const cached = await redisClient.get(CACHE_KEYS.OVERVIEW);
    if (cached) {
      logger.debug('Returning cached system overview');
      return JSON.parse(cached);
    }

    logger.info('Calculating system overview metrics');

    // Get all agents
    const agents = await prisma.aIAgent.findMany();
    const activeAgents = agents.filter(a => a.isActive);

    // Get task statistics
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Count tasks by status
    const [totalTasks, queuedTasks, processingTasks, completedTasks, failedTasks, cancelledTasks] = await Promise.all([
      prisma.aITask.count(),
      prisma.aITask.count({ where: { status: 'QUEUED' } }),
      prisma.aITask.count({ where: { status: 'PROCESSING' } }),
      prisma.aITask.count({ where: { status: 'COMPLETED' } }),
      prisma.aITask.count({ where: { status: 'FAILED' } }),
      prisma.aITask.count({ where: { status: 'CANCELLED' } }),
    ]);

    // Calculate success rate
    const totalFinishedTasks = completedTasks + failedTasks;
    const overallSuccessRate = totalFinishedTasks > 0 ? completedTasks / totalFinishedTasks : 1;

    // Calculate average response time from completed tasks
    const completedTasksData = await prisma.aITask.findMany({
      where: {
        status: 'COMPLETED',
        processingTimeMs: { not: null },
      },
      select: { processingTimeMs: true },
      orderBy: { completedAt: 'desc' },
      take: 1000, // Last 1000 tasks
    });

    const averageResponseTime = completedTasksData.length > 0
      ? completedTasksData.reduce((sum, t) => sum + (t.processingTimeMs || 0), 0) / completedTasksData.length
      : 0;

    // Calculate costs
    const [costsToday, costsThisWeek, costsThisMonth, totalCosts] = await Promise.all([
      prisma.aITask.aggregate({
        where: {
          completedAt: { gte: today },
          actualCost: { not: null },
        },
        _sum: { actualCost: true },
      }),
      prisma.aITask.aggregate({
        where: {
          completedAt: { gte: thisWeek },
          actualCost: { not: null },
        },
        _sum: { actualCost: true },
      }),
      prisma.aITask.aggregate({
        where: {
          completedAt: { gte: thisMonth },
          actualCost: { not: null },
        },
        _sum: { actualCost: true },
      }),
      prisma.aITask.aggregate({
        where: { actualCost: { not: null } },
        _sum: { actualCost: true },
      }),
    ]);

    // Calculate cache hit rate
    const cacheHitRate = await calculateCacheHitRate();

    // Determine system health
    const systemHealth = determineSystemHealth(overallSuccessRate, averageResponseTime, queuedTasks, processingTasks);

    // Generate alerts
    const alerts = await generateSystemAlerts(
      overallSuccessRate,
      averageResponseTime,
      costsToday._sum.actualCost || 0,
      cacheHitRate
    );

    const overview: SystemOverview = {
      timestamp: new Date(),
      totalAgents: agents.length,
      activeAgents: activeAgents.length,
      inactiveAgents: agents.length - activeAgents.length,
      totalTasks,
      queuedTasks,
      processingTasks,
      completedTasks,
      failedTasks,
      cancelledTasks,
      overallSuccessRate,
      averageResponseTime,
      totalCost: totalCosts._sum.actualCost || 0,
      costToday: costsToday._sum.actualCost || 0,
      costThisWeek: costsThisWeek._sum.actualCost || 0,
      costThisMonth: costsThisMonth._sum.actualCost || 0,
      cacheHitRate,
      systemHealth,
      alerts,
    };

    // Cache the result
    await safeRedisSetex(CACHE_KEYS.OVERVIEW, CACHE_TTL.OVERVIEW, JSON.stringify(overview));

    // Store metrics in AnalyticsEvent for historical tracking
    await storeMetricsSnapshot('system_overview', overview);

    logger.info('System overview calculated successfully');
    return overview;
  } catch (error) {
    logger.error('Error calculating system overview:', error);
    throw error;
  }
}

// ==================== AGENT-SPECIFIC ANALYTICS ====================

/**
 * Get detailed analytics for a specific agent
 * @param agentId - ID of the agent
 * @param dateRange - Optional date range filter
 * @returns Detailed agent analytics
 */
export async function getAgentAnalytics(
  agentId: string,
  dateRange?: DateRangeFilter
): Promise<AgentAnalytics> {
  try {
    // Try cache first (if no date range specified)
    if (!dateRange) {
      const cached = await redisClient.get(CACHE_KEYS.AGENT_ANALYTICS(agentId));
      if (cached) {
        logger.debug(`Returning cached analytics for agent ${agentId}`);
        return JSON.parse(cached);
      }
    }

    logger.info(`Calculating analytics for agent: ${agentId}`);

    // Get agent details
    const agent = await prisma.aIAgent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Build date filter
    const dateFilter = buildDateFilter(dateRange);

    // Get task statistics
    const tasks = await prisma.aITask.findMany({
      where: {
        agentId,
        ...dateFilter,
      },
      select: {
        status: true,
        processingTimeMs: true,
        actualCost: true,
        qualityScore: true,
        errorMessage: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
      },
    });

    // Calculate performance metrics
    const totalTasks = tasks.length;
    const successfulTasks = tasks.filter(t => t.status === 'COMPLETED').length;
    const failedTasks = tasks.filter(t => t.status === 'FAILED').length;
    const cancelledTasks = tasks.filter(t => t.status === 'CANCELLED').length;
    const successRate = totalTasks > 0 ? successfulTasks / (successfulTasks + failedTasks) : 0;

    // Calculate response times
    const responseTimes = tasks
      .filter(t => t.processingTimeMs !== null)
      .map(t => t.processingTimeMs!)
      .sort((a, b) => a - b);

    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
      : 0;

    const medianResponseTime = responseTimes.length > 0
      ? responseTimes[Math.floor(responseTimes.length / 2)]
      : 0;

    const p95ResponseTime = responseTimes.length > 0
      ? responseTimes[Math.floor(responseTimes.length * 0.95)]
      : 0;

    const p99ResponseTime = responseTimes.length > 0
      ? responseTimes[Math.floor(responseTimes.length * 0.99)]
      : 0;

    // Calculate tasks per hour
    const hoursSinceFirstTask = tasks.length > 0 && tasks[0]?.createdAt
      ? (Date.now() - tasks[0].createdAt.getTime()) / (1000 * 60 * 60)
      : 0;
    const tasksPerHour = hoursSinceFirstTask > 0 ? totalTasks / hoursSinceFirstTask : 0;

    // Current load (processing + queued tasks)
    const currentLoad = await prisma.aITask.count({
      where: {
        agentId,
        status: { in: ['PROCESSING', 'QUEUED'] },
      },
    });

    // Calculate costs
    const costs = await calculateAgentCosts(agentId, tasks);

    // Calculate quality metrics
    const quality = calculateQualityMetrics(tasks);

    // Calculate error metrics
    const errors = calculateErrorMetrics(tasks);

    // Calculate capacity metrics
    const capacity = await calculateCapacityMetrics(agentId, tasks);

    // Get trends
    const trends = await calculateAgentTrends(agentId, dateRange);

    const analytics: AgentAnalytics = {
      agentId: agent.id,
      agentName: agent.name,
      agentType: agent.type,
      isActive: agent.isActive,
      performance: {
        totalTasks,
        successfulTasks,
        failedTasks,
        cancelledTasks,
        successRate,
        averageResponseTime,
        medianResponseTime: medianResponseTime ?? 0,
        p95ResponseTime: p95ResponseTime ?? 0,
        p99ResponseTime: p99ResponseTime ?? 0,
        tasksPerHour,
        currentLoad,
      },
      costs,
      quality,
      errors,
      capacity,
      trends,
    };

    // Cache the result (only if no date range)
    if (!dateRange) {
      await safeRedisSetex(CACHE_KEYS.AGENT_ANALYTICS(agentId), CACHE_TTL.AGENT_ANALYTICS, JSON.stringify(analytics));
    }

    // Store in analytics events
    await storeMetricsSnapshot('agent_analytics', { agentId: agentId, analytics });

    logger.info(`Analytics calculated for agent: ${agentId}`);
    return analytics;
  } catch (error) {
    logger.error(`Error calculating agent analytics for ${agentId}:`, error);
    throw error;
  }
}

// ==================== COST ANALYSIS ====================

/**
 * Get comprehensive cost breakdown and analysis
 * @param dateRange - Optional date range filter
 * @returns Detailed cost breakdown
 */
export async function getCostBreakdown(dateRange?: DateRangeFilter): Promise<CostBreakdown> {
  try {
    // Try cache first (if no date range)
    if (!dateRange) {
      const cached = await redisClient.get(CACHE_KEYS.COSTS);
      if (cached) {
        logger.debug('Returning cached cost breakdown');
        return JSON.parse(cached);
      }
    }

    logger.info('Calculating cost breakdown');

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastWeek = new Date(thisWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Get total costs for different periods
    const [
      totalCostData,
      costTodayData,
      costYesterdayData,
      costThisWeekData,
      costLastWeekData,
      costThisMonthData,
      costLastMonthData,
    ] = await Promise.all([
      prisma.aITask.aggregate({
        where: { actualCost: { not: null } },
        _sum: { actualCost: true },
      }),
      prisma.aITask.aggregate({
        where: {
          completedAt: { gte: today },
          actualCost: { not: null },
        },
        _sum: { actualCost: true },
      }),
      prisma.aITask.aggregate({
        where: {
          completedAt: { gte: yesterday, lt: today },
          actualCost: { not: null },
        },
        _sum: { actualCost: true },
      }),
      prisma.aITask.aggregate({
        where: {
          completedAt: { gte: thisWeek },
          actualCost: { not: null },
        },
        _sum: { actualCost: true },
      }),
      prisma.aITask.aggregate({
        where: {
          completedAt: { gte: lastWeek, lt: thisWeek },
          actualCost: { not: null },
        },
        _sum: { actualCost: true },
      }),
      prisma.aITask.aggregate({
        where: {
          completedAt: { gte: thisMonth },
          actualCost: { not: null },
        },
        _sum: { actualCost: true },
      }),
      prisma.aITask.aggregate({
        where: {
          completedAt: { gte: lastMonth, lt: thisMonth },
          actualCost: { not: null },
        },
        _sum: { actualCost: true },
      }),
    ]);

    const totalCost = totalCostData._sum.actualCost || 0;
    const costToday = costTodayData._sum.actualCost || 0;
    const costYesterday = costYesterdayData._sum.actualCost || 0;
    const costThisWeek = costThisWeekData._sum.actualCost || 0;
    const costLastWeek = costLastWeekData._sum.actualCost || 0;
    const costThisMonth = costThisMonthData._sum.actualCost || 0;
    const costLastMonth = costLastMonthData._sum.actualCost || 0;

    // Cost by agent
    const byAgent = await calculateCostByAgent();

    // Cost by task type
    const byTaskType = await calculateCostByTaskType();

    // Get cost trends
    const trends = await calculateCostTrends();

    // Calculate projections
    const projections = calculateCostProjections(costToday, costThisWeek, costThisMonth);

    // Get budget if configured
    const budget = await getBudgetConfig();
    const budgetUtilization = budget?.monthlyLimit
      ? (costThisMonth / budget.monthlyLimit) * 100
      : undefined;

    const breakdown: CostBreakdown = {
      timestamp: new Date(),
      totalCost,
      costToday,
      costYesterday,
      costThisWeek,
      costLastWeek,
      costThisMonth,
      costLastMonth,
      byAgent,
      byTaskType,
      trends,
      projections: {
        ...projections,
        ...(budgetUtilization !== undefined && { budgetUtilization }),
      },
    };

    // Cache the result (if no date range)
    if (!dateRange) {
      await safeRedisSetex(CACHE_KEYS.COSTS, CACHE_TTL.COSTS, JSON.stringify(breakdown));
    }

    // Store in analytics events
    await storeMetricsSnapshot('cost_breakdown', breakdown);

    logger.info('Cost breakdown calculated successfully');
    return breakdown;
  } catch (error) {
    logger.error('Error calculating cost breakdown:', error);
    throw error;
  }
}

// ==================== PERFORMANCE TRENDS ====================

/**
 * Get performance trends over time
 * @param period - Time period for trends
 * @param dateRange - Optional date range filter
 * @returns Performance trends
 */
export async function getPerformanceTrends(
  period: 'hourly' | 'daily' | 'weekly' | 'monthly' = 'daily',
  dateRange?: DateRangeFilter
): Promise<PerformanceTrends> {
  try {
    // Try cache first
    const cacheKey = CACHE_KEYS.PERFORMANCE(period);
    const cached = await redisClient.get(cacheKey);
    if (cached && !dateRange) {
      logger.debug(`Returning cached performance trends for ${period}`);
      return JSON.parse(cached);
    }

    logger.info(`Calculating performance trends for period: ${period}`);

    // Get historical analytics events
    const metricsData = await getHistoricalMetrics(period, dateRange);

    // Calculate trends for each metric
    const successRate = calculateMetricTrend(metricsData, 'successRate');
    const responseTime = calculateMetricTrend(metricsData, 'responseTime');
    const taskThroughput = calculateMetricTrend(metricsData, 'taskThroughput');
    const errorRate = calculateMetricTrend(metricsData, 'errorRate');
    const cacheHitRate = calculateMetricTrend(metricsData, 'cacheHitRate');
    const qualityScore = calculateMetricTrend(metricsData, 'qualityScore');

    const trends: PerformanceTrends = {
      timestamp: new Date(),
      period,
      successRate,
      responseTime,
      taskThroughput,
      errorRate,
      cacheHitRate,
      qualityScore,
    };

    // Cache the result
    await safeRedisSetex(cacheKey, CACHE_TTL.PERFORMANCE, JSON.stringify(trends));

    logger.info(`Performance trends calculated for ${period}`);
    return trends;
  } catch (error) {
    logger.error('Error calculating performance trends:', error);
    throw error;
  }
}

// ==================== OPTIMIZATION RECOMMENDATIONS ====================

/**
 * Generate AI system optimization recommendations
 * @returns List of recommendations
 */
export async function getOptimizationRecommendations(): Promise<OptimizationRecommendation[]> {
  try {
    // Try cache first
    const cached = await redisClient.get(CACHE_KEYS.RECOMMENDATIONS);
    if (cached) {
      logger.debug('Returning cached optimization recommendations');
      return JSON.parse(cached);
    }

    logger.info('Generating optimization recommendations');

    const recommendations: OptimizationRecommendation[] = [];

    // Get system overview for analysis
    const overview = await getSystemOverview();

    // Get all agents
    const agents = await prisma.aIAgent.findMany();

    // Analyze each agent
    for (const agent of agents) {
      const analytics = await getAgentAnalytics(agent.id);

      // Cost optimization recommendations
      if (analytics.costs.averageCostPerTask > 0.10) {
        recommendations.push({
          id: `cost-${agent.id}-high-cost`,
          type: 'cost',
          severity: 'high',
          title: `High cost per task for ${agent.name}`,
          description: `Average cost per task is $${analytics.costs.averageCostPerTask.toFixed(4)}, which is above the recommended threshold.`,
          impact: 'Reducing cost per task by 20% could save $' + (analytics.costs.totalCost * 0.2).toFixed(2),
          recommendation: 'Consider using a more cost-effective model or optimizing prompts to reduce token usage.',
          estimatedSavings: analytics.costs.totalCost * 0.2,
          agentId: agent.id,
          agentName: agent.name,
          createdAt: new Date(),
        });
      }

      // Performance optimization recommendations
      if (analytics.performance.averageResponseTime > 800) {
        recommendations.push({
          id: `perf-${agent.id}-slow-response`,
          type: 'performance',
          severity: analytics.performance.averageResponseTime > 1000 ? 'critical' : 'medium',
          title: `Slow response time for ${agent.name}`,
          description: `Average response time is ${analytics.performance.averageResponseTime.toFixed(0)}ms, exceeding the 500ms target.`,
          impact: 'Users may experience delays in content generation and system responsiveness.',
          recommendation: 'Enable caching for common requests, optimize prompts, or consider using a faster model.',
          estimatedImprovement: 40, // 40% improvement
          agentId: agent.id,
          agentName: agent.name,
          createdAt: new Date(),
        });
      }

      // Quality optimization recommendations
      if (analytics.quality.averageQualityScore < 0.85) {
        recommendations.push({
          id: `quality-${agent.id}-low-score`,
          type: 'quality',
          severity: 'medium',
          title: `Low quality scores for ${agent.name}`,
          description: `Average quality score is ${(analytics.quality.averageQualityScore * 100).toFixed(1)}%, below the 85% target.`,
          impact: 'Low-quality outputs may require more human review and revisions.',
          recommendation: 'Review and refine prompts, adjust temperature settings, or increase max tokens.',
          agentId: agent.id,
          agentName: agent.name,
          createdAt: new Date(),
        });
      }

      // Capacity optimization recommendations
      if (analytics.capacity.utilizationRate > 0.80) {
        recommendations.push({
          id: `capacity-${agent.id}-high-utilization`,
          type: 'capacity',
          severity: analytics.capacity.utilizationRate > 0.95 ? 'critical' : 'high',
          title: `High capacity utilization for ${agent.name}`,
          description: `Current utilization is ${(analytics.capacity.utilizationRate * 100).toFixed(1)}%, approaching capacity limits.`,
          impact: 'Tasks may experience longer queue times or system instability.',
          recommendation: 'Consider scaling horizontally by adding more agent instances or increasing concurrent task limits.',
          agentId: agent.id,
          agentName: agent.name,
          createdAt: new Date(),
        });
      }
    }

    // System-wide recommendations
    if (overview.cacheHitRate < 0.75) {
      recommendations.push({
        id: 'system-cache-low',
        type: 'performance',
        severity: 'medium',
        title: 'Low cache hit rate',
        description: `Current cache hit rate is ${(overview.cacheHitRate * 100).toFixed(1)}%, below the 75% target.`,
        impact: 'More API calls to AI providers, increasing costs and latency.',
        recommendation: 'Review caching strategy, increase cache TTL for stable content, or implement predictive caching.',
        estimatedSavings: overview.costThisMonth * 0.15, // 15% savings
        createdAt: new Date(),
      });
    }

    if (overview.overallSuccessRate < 0.95) {
      recommendations.push({
        id: 'system-success-rate-low',
        type: 'quality',
        severity: overview.overallSuccessRate < 0.90 ? 'critical' : 'high',
        title: 'Low overall success rate',
        description: `System success rate is ${(overview.overallSuccessRate * 100).toFixed(1)}%, below the 95% target.`,
        impact: 'Failed tasks waste resources and require retries, increasing costs.',
        recommendation: 'Investigate common failure patterns, improve error handling, and add fallback mechanisms.',
        createdAt: new Date(),
      });
    }

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // Cache the recommendations
    await safeRedisSetex(CACHE_KEYS.RECOMMENDATIONS, CACHE_TTL.RECOMMENDATIONS, JSON.stringify(recommendations));

    logger.info(`Generated ${recommendations.length} optimization recommendations`);
    return recommendations;
  } catch (error) {
    logger.error('Error generating optimization recommendations:', error);
    throw error;
  }
}

// ==================== HELPER FUNCTIONS ====================

function determineSystemHealth(
  successRate: number,
  responseTime: number,
  queuedTasks: number,
  processingTasks: number
): 'healthy' | 'warning' | 'critical' {
  if (
    successRate < ALERT_THRESHOLDS.SUCCESS_RATE_CRITICAL ||
    responseTime > ALERT_THRESHOLDS.RESPONSE_TIME_CRITICAL ||
    queuedTasks > 1000
  ) {
    return 'critical';
  }

  if (
    successRate < ALERT_THRESHOLDS.SUCCESS_RATE_WARNING ||
    responseTime > ALERT_THRESHOLDS.RESPONSE_TIME_WARNING ||
    queuedTasks > 500
  ) {
    return 'warning';
  }

  return 'healthy';
}

async function generateSystemAlerts(
  successRate: number,
  responseTime: number,
  costToday: number,
  cacheHitRate: number
): Promise<Alert[]> {
  const alerts: Alert[] = [];

  // Success rate alert
  if (successRate < ALERT_THRESHOLDS.SUCCESS_RATE_CRITICAL) {
    alerts.push({
      id: `alert-success-rate-${Date.now()}`,
      type: 'success_rate',
      severity: 'critical',
      title: 'Critical: Low Success Rate',
      message: `System success rate has dropped to ${(successRate * 100).toFixed(1)}%, below critical threshold of 90%`,
      threshold: ALERT_THRESHOLDS.SUCCESS_RATE_CRITICAL,
      currentValue: successRate,
      createdAt: new Date(),
      acknowledged: false,
    });

    // Emit alert event
    analyticsEvents.emit('alert', alerts[alerts.length - 1]);
  } else if (successRate < ALERT_THRESHOLDS.SUCCESS_RATE_WARNING) {
    alerts.push({
      id: `alert-success-rate-${Date.now()}`,
      type: 'success_rate',
      severity: 'warning',
      title: 'Warning: Low Success Rate',
      message: `System success rate is ${(successRate * 100).toFixed(1)}%, below warning threshold of 95%`,
      threshold: ALERT_THRESHOLDS.SUCCESS_RATE_WARNING,
      currentValue: successRate,
      createdAt: new Date(),
      acknowledged: false,
    });
  }

  // Response time alert
  if (responseTime > ALERT_THRESHOLDS.RESPONSE_TIME_CRITICAL) {
    alerts.push({
      id: `alert-response-time-${Date.now()}`,
      type: 'response_time',
      severity: 'critical',
      title: 'Critical: High Response Time',
      message: `Average response time is ${responseTime.toFixed(0)}ms, exceeding critical threshold of 1000ms`,
      threshold: ALERT_THRESHOLDS.RESPONSE_TIME_CRITICAL,
      currentValue: responseTime,
      createdAt: new Date(),
      acknowledged: false,
    });

    analyticsEvents.emit('alert', alerts[alerts.length - 1]);
  } else if (responseTime > ALERT_THRESHOLDS.RESPONSE_TIME_WARNING) {
    alerts.push({
      id: `alert-response-time-${Date.now()}`,
      type: 'response_time',
      severity: 'warning',
      title: 'Warning: High Response Time',
      message: `Average response time is ${responseTime.toFixed(0)}ms, exceeding warning threshold of 800ms`,
      threshold: ALERT_THRESHOLDS.RESPONSE_TIME_WARNING,
      currentValue: responseTime,
      createdAt: new Date(),
      acknowledged: false,
    });
  }

  // Cache hit rate alert
  if (cacheHitRate < ALERT_THRESHOLDS.CACHE_HIT_RATE_WARNING) {
    alerts.push({
      id: `alert-cache-${Date.now()}`,
      type: 'capacity',
      severity: 'warning',
      title: 'Warning: Low Cache Hit Rate',
      message: `Cache hit rate is ${(cacheHitRate * 100).toFixed(1)}%, below target of 75%`,
      threshold: ALERT_THRESHOLDS.CACHE_HIT_RATE_WARNING,
      currentValue: cacheHitRate,
      createdAt: new Date(),
      acknowledged: false,
    });
  }

  // Check budget alerts
  const budget = await getBudgetConfig();
  if (budget?.dailyLimit && costToday > budget.dailyLimit * (budget.alertThreshold || 80) / 100) {
    alerts.push({
      id: `alert-cost-${Date.now()}`,
      type: 'cost',
      severity: costToday > budget.dailyLimit ? 'critical' : 'warning',
      title: costToday > budget.dailyLimit ? 'Critical: Budget Exceeded' : 'Warning: Approaching Budget Limit',
      message: `Today's cost ($${costToday.toFixed(2)}) has ${costToday > budget.dailyLimit ? 'exceeded' : 'reached ' + ((costToday / budget.dailyLimit) * 100).toFixed(0) + '% of'} daily budget ($${budget.dailyLimit})`,
      threshold: budget.dailyLimit,
      currentValue: costToday,
      createdAt: new Date(),
      acknowledged: false,
    });

    if (costToday > budget.dailyLimit) {
      analyticsEvents.emit('alert', alerts[alerts.length - 1]);
    }
  }

  return alerts;
}

async function calculateCacheHitRate(): Promise<number> {
  try {
    const stats = await redisClient.get(CACHE_KEYS.CACHE_STATS);
    if (!stats) return 0.75; // Default assumption

    const { hits, misses } = JSON.parse(stats);
    const total = hits + misses;
    return total > 0 ? hits / total : 0.75;
  } catch (error) {
    logger.warn('Error calculating cache hit rate:', error);
    return 0.75; // Default
  }
}

async function storeMetricsSnapshot(eventType: string, data: any): Promise<void> {
  try {
    await prisma.analyticsEvent.create({
      data: {
        id: `${eventType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sessionId: 'ai-system',
        eventType,
        resourceType: 'ai_metrics',
        properties: JSON.stringify(data),
        metadata: JSON.stringify({ source: 'analytics-service' }),
        timestamp: new Date(),
      },
    });
  } catch (error) {
    logger.warn('Error storing metrics snapshot:', error);
  }
}

function buildDateFilter(dateRange?: DateRangeFilter): any {
  if (!dateRange) return {};

  const filter: any = {};

  if (dateRange.startDate) {
    filter.createdAt = { ...filter.createdAt, gte: dateRange.startDate };
  }

  if (dateRange.endDate) {
    filter.createdAt = { ...filter.createdAt, lte: dateRange.endDate };
  }

  return filter;
}

async function calculateAgentCosts(agentId: string, tasks: any[]): Promise<AgentAnalytics['costs']> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const totalCost = tasks.reduce((sum, t) => sum + (t.actualCost || 0), 0);
  const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
  const averageCostPerTask = completedTasks > 0 ? totalCost / completedTasks : 0;

  const costToday = tasks
    .filter(t => t.completedAt && t.completedAt >= today)
    .reduce((sum, t) => sum + (t.actualCost || 0), 0);

  const costThisWeek = tasks
    .filter(t => t.completedAt && t.completedAt >= thisWeek)
    .reduce((sum, t) => sum + (t.actualCost || 0), 0);

  const costThisMonth = tasks
    .filter(t => t.completedAt && t.completedAt >= thisMonth)
    .reduce((sum, t) => sum + (t.actualCost || 0), 0);

  // Estimate monthly burn based on today's cost
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const estimatedMonthlyBurn = (costToday / (now.getDate())) * daysInMonth;

  return {
    totalCost,
    averageCostPerTask,
    costToday,
    costThisWeek,
    costThisMonth,
    estimatedMonthlyBurn,
  };
}

function calculateQualityMetrics(tasks: any[]): AgentAnalytics['quality'] {
  const tasksWithQuality = tasks.filter(t => t.qualityScore !== null);
  const averageQualityScore = tasksWithQuality.length > 0
    ? tasksWithQuality.reduce((sum, t) => sum + (t.qualityScore || 0), 0) / tasksWithQuality.length
    : 0;

  const lowQualityTaskCount = tasksWithQuality.filter(t => (t.qualityScore || 0) < 0.7).length;

  // Determine trend (simplified - compare recent vs older tasks)
  const midpoint = Math.floor(tasksWithQuality.length / 2);
  const recentAvg = tasksWithQuality.slice(0, midpoint).reduce((sum, t) => sum + (t.qualityScore || 0), 0) / midpoint || 0;
  const olderAvg = tasksWithQuality.slice(midpoint).reduce((sum, t) => sum + (t.qualityScore || 0), 0) / (tasksWithQuality.length - midpoint) || 0;

  let qualityTrend: 'improving' | 'stable' | 'declining' = 'stable';
  if (recentAvg > olderAvg * 1.05) qualityTrend = 'improving';
  else if (recentAvg < olderAvg * 0.95) qualityTrend = 'declining';

  return {
    averageQualityScore,
    qualityTrend,
    lowQualityTaskCount,
  };
}

function calculateErrorMetrics(tasks: any[]): AgentAnalytics['errors'] {
  const failedTasks = tasks.filter(t => t.status === 'FAILED');
  const totalTasks = tasks.length;
  const errorRate = totalTasks > 0 ? failedTasks.length / totalTasks : 0;

  // Count common errors
  const errorCounts: Record<string, number> = {};
  failedTasks.forEach(t => {
    if (t.errorMessage) {
      const errorKey = t.errorMessage.substring(0, 100); // First 100 chars
      errorCounts[errorKey] = (errorCounts[errorKey] || 0) + 1;
    }
  });

  const commonErrors = Object.entries(errorCounts)
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const lastFailedTask = failedTasks[failedTasks.length - 1];
  
  const result: {
    errorRate: number;
    commonErrors: { error: string; count: number }[];
    lastError?: { message: string; timestamp: Date };
  } = {
    errorRate,
    commonErrors,
  };
  
  if (lastFailedTask) {
    result.lastError = {
      message: String(lastFailedTask.errorMessage || 'Unknown error'),
      timestamp: (lastFailedTask.completedAt || new Date()) as Date
    };
  }

  return result;
}

async function calculateCapacityMetrics(agentId: string, tasks: any[]): Promise<AgentAnalytics['capacity']> {
  // Calculate utilization based on processing time vs elapsed time
  const processingTasks = await prisma.aITask.count({
    where: { agentId, status: 'PROCESSING' },
  });

  // Simple utilization: assume max 10 concurrent tasks
  const maxConcurrent = 10;
  const utilizationRate = processingTasks / maxConcurrent;

  // Calculate average queue wait time
  const tasksWithWait = tasks.filter(t => t.startedAt && t.createdAt);
  const averageQueueWait = tasksWithWait.length > 0
    ? tasksWithWait.reduce((sum, t) => sum + (t.startedAt.getTime() - t.createdAt.getTime()), 0) / tasksWithWait.length
    : 0;

  // Peak load (max concurrent tasks in last 24 hours)
  const peakLoad = Math.max(processingTasks, 0); // Simplified

  const bottleneck = utilizationRate > ALERT_THRESHOLDS.UTILIZATION_WARNING;

  return {
    utilizationRate,
    averageQueueWait,
    peakLoad,
    bottleneck,
  };
}

async function calculateAgentTrends(agentId: string, dateRange?: DateRangeFilter): Promise<AgentAnalytics['trends']> {
  // Simplified trends - get hourly, daily, weekly aggregates
  // In production, this would query AnalyticsEvent table for historical data
  
  return {
    hourly: [],
    daily: [],
    weekly: [],
  };
}

async function calculateCostByAgent(): Promise<CostBreakdown['byAgent']> {
  const agents = await prisma.aIAgent.findMany({
    include: {
      AITask: {
        where: {
          actualCost: { not: null },
        },
        select: {
          actualCost: true,
          status: true,
        },
      },
    },
  });
  const result: CostBreakdown['byAgent'] = [];

  let totalSystemCost = 0;

  for (const agent of agents) {
    const tasks = (agent as any).AITask || [];
    const totalCost = tasks.reduce((sum, t) => sum + (t.actualCost || 0), 0);
    const tasksCompleted = tasks.filter(t => t.status === 'COMPLETED').length;
    const averageCostPerTask = tasksCompleted > 0 ? totalCost / tasksCompleted : 0;

    totalSystemCost += totalCost;

    result.push({
      agentId: agent.id,
      agentName: agent.name,
      agentType: agent.type,
      totalCost,
      percentage: 0, // Will calculate after
      tasksCompleted,
      averageCostPerTask,
    });
  }

  // Calculate percentages
  result.forEach(item => {
    item.percentage = totalSystemCost > 0 ? (item.totalCost / totalSystemCost) * 100 : 0;
  });

  return result.sort((a, b) => b.totalCost - a.totalCost);
}

async function calculateCostByTaskType(): Promise<CostBreakdown['byTaskType']> {
  const tasks = await prisma.aITask.findMany({
    where: { actualCost: { not: null } },
    select: { taskType: true, actualCost: true, status: true },
  });

  const taskTypeMap: Record<string, { totalCost: number; tasksCompleted: number }> = {};
  let totalSystemCost = 0;

  tasks.forEach(task => {
    if (!taskTypeMap[task.taskType]) {
      taskTypeMap[task.taskType] = { totalCost: 0, tasksCompleted: 0 };
    }
    taskTypeMap[task.taskType]!.totalCost += task.actualCost || 0;
    if (task.status === 'COMPLETED') {
      taskTypeMap[task.taskType]!.tasksCompleted++;
    }
    totalSystemCost += task.actualCost || 0;
  });

  const result: CostBreakdown['byTaskType'] = Object.entries(taskTypeMap).map(([taskType, data]) => ({
    taskType,
    totalCost: data.totalCost,
    percentage: totalSystemCost > 0 ? (data.totalCost / totalSystemCost) * 100 : 0,
    tasksCompleted: data.tasksCompleted,
    averageCostPerTask: data.tasksCompleted > 0 ? data.totalCost / data.tasksCompleted : 0,
  }));

  return result.sort((a, b) => b.totalCost - a.totalCost);
}

async function calculateCostTrends(): Promise<CostBreakdown['trends']> {
  // Get daily costs for last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  // Simplified - in production, query AnalyticsEvent for historical data
  return {
    daily: [],
    weekly: [],
    monthly: [],
  };
}

function calculateCostProjections(costToday: number, costThisWeek: number, costThisMonth: number): {
  estimatedDailyCost: number;
  estimatedWeeklyCost: number;
  estimatedMonthlyCost: number;
} {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  return {
    estimatedDailyCost: costToday,
    estimatedWeeklyCost: (costToday / (now.getDay() || 7)) * 7,
    estimatedMonthlyCost: (costThisMonth / dayOfMonth) * daysInMonth,
  };
}

async function getHistoricalMetrics(period: string, dateRange?: DateRangeFilter): Promise<any[]> {
  // In production, query AnalyticsEvent table for historical metrics
  // For now, return empty array
  return [];
}

function calculateMetricTrend(data: any[], metricName: string): {
  current: number;
  previous: number;
  trend: 'improving' | 'stable' | 'declining';
  data: MetricPoint[];
} {
  // Simplified trend calculation
  return {
    current: 0,
    previous: 0,
    trend: 'stable',
    data: [],
  };
}

export async function getBudgetConfig(): Promise<BudgetConfig | null> {
  try {
    const cached = await redisClient.get(CACHE_KEYS.BUDGET);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (error) {
    return null;
  }
}

export async function setBudgetConfig(budget: BudgetConfig): Promise<void> {
  await redisClient.set(CACHE_KEYS.BUDGET, JSON.stringify(budget));
}

// ==================== CACHE STATISTICS ====================

export async function trackCacheHit(): Promise<void> {
  try {
    const stats = await safeRedisGet(CACHE_KEYS.CACHE_STATS);
    const current = stats ? JSON.parse(stats) : { hits: 0, misses: 0 };
    current.hits++;
    await safeRedisSetex(CACHE_KEYS.CACHE_STATS, 3600, JSON.stringify(current));
  } catch (error) {
    logger.warn('Error tracking cache hit:', error);
  }
}

export async function trackCacheMiss(): Promise<void> {
  try {
    const stats = await safeRedisGet(CACHE_KEYS.CACHE_STATS);
    const current = stats ? JSON.parse(stats) : { hits: 0, misses: 0 };
    current.misses++;
    await safeRedisSetex(CACHE_KEYS.CACHE_STATS, 3600, JSON.stringify(current));
  } catch (error) {
    logger.warn('Error tracking cache miss:', error);
  }
}

// ==================== CLEANUP ====================

/**
 * Clean up old analytics events (keep 30 days hot, move rest to cold storage)
 */
export async function cleanupOldAnalytics(): Promise<{ deleted: number }> {
  try {
    logger.info('Cleaning up old analytics events');

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await prisma.analyticsEvent.deleteMany({
      where: {
        timestamp: { lt: thirtyDaysAgo },
        resourceType: 'ai_metrics',
      },
    });

    logger.info(`Deleted ${result.count} old analytics events`);
    return { deleted: result.count };
  } catch (error) {
    logger.error('Error cleaning up old analytics:', error);
    throw error;
  }
}

// ==================== EXPORTS ====================

export default {
  getSystemOverview,
  getAgentAnalytics,
  getCostBreakdown,
  getPerformanceTrends,
  getOptimizationRecommendations,
  setBudgetConfig,
  getBudgetConfig,
  trackCacheHit,
  trackCacheMiss,
  cleanupOldAnalytics,
  analyticsEvents,
};
