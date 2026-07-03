/**
 * AI Agent Service
 * Handles CRUD operations, lifecycle management, and performance tracking for AI agents
 * 
 * Features:
 * - Agent registration and deactivation
 * - Performance metrics tracking and updates
 * - Configuration management with validation
 * - Health status monitoring
 * - Database persistence with Prisma
 * - Redis caching for optimal performance
 */

import { AIAgent } from '@prisma/client';
import prisma from '../lib/prisma';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

// ==================== TYPES AND INTERFACES ====================

export interface AIAgentConfig {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  timeout?: number;
  retryAttempts?: number;
  [key: string]: any;
}

export interface PerformanceMetrics {
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  averageResponseTime: number;
  successRate: number;
  lastExecutionTime?: number;
  totalCost: number;
  averageCost: number;
  lastHealthCheck?: Date;
  uptime?: number;
}

export interface RegisterAIAgentInput {
  id: string;
  name: string;
  type: string; // 'content_generation', 'market_analysis', 'translation', etc.
  modelProvider: string; // 'openai', 'grok', 'meta', 'google'
  modelName: string;
  configuration?: AIAgentConfig;
  isActive?: boolean;
}

export interface UpdateAIAgentConfigInput {
  configuration: AIAgentConfig;
}

export interface AgentMetricsFilter {
  startDate?: Date;
  endDate?: Date;
}

// ==================== CACHING CONSTANTS ====================

const CACHE_TTL = {
  AGENT_STATUS: 30, // 30 seconds
  AGENT_METRICS: 300, // 5 minutes
  AGENT_LIST: 60, // 1 minute
};

const CACHE_KEYS = {
  AGENT: (id: string) => `ai:agent:${id}`,
  AGENT_LIST: 'ai:agents:list',
  AGENT_METRICS: (id: string) => `ai:agent:metrics:${id}`,
  AGENT_HEALTH: (id: string) => `ai:agent:health:${id}`,
};

// ==================== AGENT REGISTRATION ====================

/**
 * Register a new AI agent in the database
 * @param input - Agent registration data
 * @returns Registered agent with initial metrics
 */
export async function registerAIAgent(input: RegisterAIAgentInput) {
  try {
    logger.info(`Registering AI agent: ${input.name} (${input.type})`);

    // Validate input
    if (!input.id || !input.name || !input.type || !input.modelProvider) {
      throw new Error('Missing required agent registration fields');
    }

    // Initialize performance metrics
    const initialMetrics: PerformanceMetrics = {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      averageResponseTime: 0,
      successRate: 0,
      totalCost: 0,
      averageCost: 0,
      lastHealthCheck: new Date(),
      uptime: 0,
    };

    // Create agent in database
    const agent = await prisma.aIAgent.create({
      data: {
        id: input.id,
        name: input.name,
        type: input.type,
        modelProvider: input.modelProvider,
        modelName: input.modelName,
        configuration: input.configuration ? JSON.stringify(input.configuration) : null,
        isActive: input.isActive !== undefined ? input.isActive : true,
        performanceMetrics: JSON.stringify(initialMetrics),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Cache the agent data
    await cacheAgent(agent);

    // Invalidate agent list cache
    await redisClient.del(CACHE_KEYS.AGENT_LIST);

    logger.info(`AI agent registered successfully: ${agent.id}`);
    
    return formatAgentResponse(agent);
  } catch (error) {
    logger.error('Error registering AI agent:', error);
    throw error;
  }
}

/**
 * Register agent on startup (idempotent operation)
 * @param input - Agent registration data
 * @returns Registered or existing agent
 */
export async function registerAgentOnStartup(input: RegisterAIAgentInput) {
  try {
    // Check if agent already exists
    const existing = await prisma.aIAgent.findUnique({
      where: { id: input.id },
    });

    if (existing) {
      logger.info(`Agent ${input.id} already registered, updating configuration`);
      
      // Update configuration if provided
      if (input.configuration) {
        return await updateAIAgentConfig(input.id, { configuration: input.configuration });
      }
      
      return formatAgentResponse(existing);
    }

    // Register new agent
    return await registerAIAgent(input);
  } catch (error) {
    logger.error('Error in agent startup registration:', error);
    throw error;
  }
}

// ==================== AGENT RETRIEVAL ====================

/**
 * Get agent by ID with caching
 * @param id - Agent ID
 * @returns Agent data or null
 */
export async function getAIAgentById(id: string) {
  try {
    // Check cache first
    const cacheKey = CACHE_KEYS.AGENT(id);
    const cached = await redisClient.get(cacheKey);
    
    if (cached) {
      logger.debug(`Cache HIT for agent: ${id}`);
      return JSON.parse(cached);
    }

    logger.debug(`Cache MISS for agent: ${id}`);

    // Fetch from database
    const agent = await prisma.aIAgent.findUnique({
      where: { id },
      include: {
        AITask: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!agent) {
      return null;
    }

    const formattedAgent = formatAgentResponse(agent);

    // Cache the result
    await cacheAgent(agent);

    return formattedAgent;
  } catch (error) {
    logger.error(`Error fetching agent ${id}:`, error);
    throw error;
  }
}

/**
 * Get all agents with optional filtering
 * @param filter - Optional filter criteria
 * @returns List of agents
 */
export async function getAllAIAgents(filter?: { type?: string; isActive?: boolean }) {
  try {
    // Try cache first (only for unfiltered requests)
    if (!filter) {
      const cached = await redisClient.get(CACHE_KEYS.AGENT_LIST);
      if (cached) {
        logger.debug('Cache HIT for agent list');
        return JSON.parse(cached);
      }
    }

    logger.debug('Cache MISS for agent list');

    // Build where clause
    const where: any = {};
    if (filter?.type) where.type = filter.type;
    if (filter?.isActive !== undefined) where.isActive = filter.isActive;

    // Fetch from database
    const agents = await prisma.aIAgent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const formattedAgents = agents.map(formatAgentResponse);

    // Cache unfiltered results
    if (!filter) {
      await redisClient.setEx(
        CACHE_KEYS.AGENT_LIST,
        CACHE_TTL.AGENT_LIST,
        JSON.stringify(formattedAgents)
      );
    }

    return formattedAgents;
  } catch (error) {
    logger.error('Error fetching all agents:', error);
    throw error;
  }
}

// ==================== AGENT UPDATES ====================

/**
 * Update agent configuration
 * @param id - Agent ID
 * @param input - Configuration update
 * @returns Updated agent
 */
export async function updateAIAgentConfig(id: string, input: UpdateAIAgentConfigInput) {
  try {
    logger.info(`Updating configuration for agent: ${id}`);

    // Validate agent exists
    const existing = await prisma.aIAgent.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Agent not found: ${id}`);
    }

    // Update configuration
    const updatedAgent = await prisma.aIAgent.update({
      where: { id },
      data: {
        configuration: JSON.stringify(input.configuration),
        updatedAt: new Date(),
      },
    });

    // Update cache
    await cacheAgent(updatedAgent);
    await redisClient.del(CACHE_KEYS.AGENT_LIST);

    logger.info(`Agent configuration updated: ${id}`);
    
    return formatAgentResponse(updatedAgent);
  } catch (error) {
    logger.error(`Error updating agent config ${id}:`, error);
    throw error;
  }
}

/**
 * Toggle agent active status
 * @param id - Agent ID
 * @param isActive - Active status
 * @returns Updated agent
 */
export async function toggleAIAgent(id: string, isActive: boolean) {
  try {
    logger.info(`${isActive ? 'Activating' : 'Deactivating'} agent: ${id}`);

    const updatedAgent = await prisma.aIAgent.update({
      where: { id },
      data: {
        isActive,
        updatedAt: new Date(),
      },
    });

    // Update cache
    await cacheAgent(updatedAgent);
    await redisClient.del(CACHE_KEYS.AGENT_LIST);

    logger.info(`Agent ${isActive ? 'activated' : 'deactivated'}: ${id}`);
    
    return formatAgentResponse(updatedAgent);
  } catch (error) {
    logger.error(`Error toggling agent ${id}:`, error);
    throw error;
  }
}

/**
 * Deactivate (soft delete) an agent
 * @param id - Agent ID
 * @returns Deactivated agent
 */
export async function deactivateAIAgent(id: string) {
  return await toggleAIAgent(id, false);
}

// ==================== PERFORMANCE METRICS ====================

/**
 * Update agent performance metrics
 * @param agentId - Agent ID
 * @param metrics - Partial metrics to update
 * @param existingAgent - Optional existing agent object to avoid redundant DB lookup
 */
export async function updateAgentMetrics(
  agentId: string,
  metrics: Partial<PerformanceMetrics>,
  existingAgent?: AIAgent
) {
  try {
    const agent = existingAgent || await prisma.aIAgent.findUnique({ where: { id: agentId } });
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Parse existing metrics
    const currentMetrics: PerformanceMetrics = agent.performanceMetrics
      ? JSON.parse(agent.performanceMetrics)
      : {
          totalTasks: 0,
          successfulTasks: 0,
          failedTasks: 0,
          averageResponseTime: 0,
          successRate: 0,
          totalCost: 0,
          averageCost: 0,
        };

    // Merge with new metrics
    const updatedMetrics: PerformanceMetrics = {
      ...currentMetrics,
      ...metrics,
      successRate:
        metrics.successfulTasks !== undefined || metrics.totalTasks !== undefined
          ? ((metrics.successfulTasks ?? currentMetrics.successfulTasks) /
              (metrics.totalTasks ?? currentMetrics.totalTasks)) *
            100
          : currentMetrics.successRate,
      averageCost:
        metrics.totalCost !== undefined || metrics.totalTasks !== undefined
          ? (metrics.totalCost ?? currentMetrics.totalCost) /
            (metrics.totalTasks ?? currentMetrics.totalTasks)
          : currentMetrics.averageCost,
    };

    // Update in database
    await prisma.aIAgent.update({
      where: { id: agentId },
      data: {
        performanceMetrics: JSON.stringify(updatedMetrics),
        updatedAt: new Date(),
      },
    });

    // Update cache
    await redisClient.setEx(
      CACHE_KEYS.AGENT_METRICS(agentId),
      CACHE_TTL.AGENT_METRICS,
      JSON.stringify(updatedMetrics)
    );

    // Invalidate agent cache to reflect updated metrics
    await redisClient.del(CACHE_KEYS.AGENT(agentId));

    logger.debug(`Metrics updated for agent: ${agentId}`);
  } catch (error) {
    logger.error(`Error updating metrics for agent ${agentId}:`, error);
    throw error;
  }
}

/**
 * Get agent performance metrics with caching
 * @param agentId - Agent ID
 * @param filter - Optional date range filter
 * @returns Performance metrics
 */
export async function getAIAgentMetrics(agentId: string, filter?: AgentMetricsFilter) {
  try {
    // Check cache (only for unfiltered requests)
    if (!filter) {
      const cacheKey = CACHE_KEYS.AGENT_METRICS(agentId);
      const cached = await redisClient.get(cacheKey);
      
      if (cached) {
        logger.debug(`Cache HIT for agent metrics: ${agentId}`);
        return JSON.parse(cached);
      }
    }

    logger.debug(`Cache MISS for agent metrics: ${agentId}`);

    // Fetch agent
    const agent = await prisma.aIAgent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Parse metrics
    const metrics: PerformanceMetrics = agent.performanceMetrics
      ? JSON.parse(agent.performanceMetrics)
      : {
          totalTasks: 0,
          successfulTasks: 0,
          failedTasks: 0,
          averageResponseTime: 0,
          successRate: 0,
          totalCost: 0,
          averageCost: 0,
        };

    // If date range filter is provided, calculate filtered metrics
    if (filter?.startDate || filter?.endDate) {
      const whereClause: any = {
        agentId,
      };
      
      if (filter.startDate || filter.endDate) {
        whereClause.createdAt = {};
        if (filter.startDate) whereClause.createdAt.gte = filter.startDate;
        if (filter.endDate) whereClause.createdAt.lte = filter.endDate;
      }
      
      const tasks = await prisma.aITask.findMany({
        where: whereClause,
      });

      const filteredMetrics = calculateMetricsFromTasks(tasks);
      return filteredMetrics;
    }

    // Cache unfiltered results
    if (!filter) {
      await redisClient.setEx(
        CACHE_KEYS.AGENT_METRICS(agentId),
        CACHE_TTL.AGENT_METRICS,
        JSON.stringify(metrics)
      );
    }

    return metrics;
  } catch (error) {
    logger.error(`Error fetching metrics for agent ${agentId}:`, error);
    throw error;
  }
}

/**
 * Calculate metrics from task list
 */
function calculateMetricsFromTasks(tasks: any[]): PerformanceMetrics {
  const totalTasks = tasks.length;
  const successfulTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
  const failedTasks = tasks.filter((t) => t.status === 'FAILED').length;
  
  const totalResponseTime = tasks.reduce((sum, t) => sum + (t.processingTimeMs || 0), 0);
  const averageResponseTime = totalTasks > 0 ? totalResponseTime / totalTasks : 0;
  
  const totalCost = tasks.reduce((sum, t) => sum + (t.actualCost || 0), 0);
  const averageCost = totalTasks > 0 ? totalCost / totalTasks : 0;
  
  const successRate = totalTasks > 0 ? (successfulTasks / totalTasks) * 100 : 0;

  return {
    totalTasks,
    successfulTasks,
    failedTasks,
    averageResponseTime,
    successRate,
    totalCost,
    averageCost,
  };
}

// ==================== HEALTH MONITORING ====================

/**
 * Update agent health status
 * @param agentId - Agent ID
 * @param isHealthy - Health status
 */
export async function updateAgentHealth(agentId: string, isHealthy: boolean) {
  try {
    const healthData = {
      isHealthy,
      lastCheck: new Date(),
      timestamp: Date.now(),
    };

    await redisClient.setEx(
      CACHE_KEYS.AGENT_HEALTH(agentId),
      CACHE_TTL.AGENT_STATUS,
      JSON.stringify(healthData)
    );

    // Update metrics with health check time
    await updateAgentMetrics(agentId, {
      lastHealthCheck: new Date(),
    });

    logger.debug(`Health status updated for agent ${agentId}: ${isHealthy}`);
  } catch (error) {
    logger.error(`Error updating health for agent ${agentId}:`, error);
    throw error;
  }
}

/**
 * Get agent health status
 * @param agentId - Agent ID
 * @returns Health status
 */
export async function getAgentHealth(agentId: string) {
  try {
    const cached = await redisClient.get(CACHE_KEYS.AGENT_HEALTH(agentId));
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Default to healthy if no data
    return {
      isHealthy: true,
      lastCheck: new Date(),
      timestamp: Date.now(),
    };
  } catch (error) {
    logger.error(`Error fetching health for agent ${agentId}:`, error);
    return {
      isHealthy: false,
      lastCheck: new Date(),
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Reset agent state (clear metrics and restart)
 * @param agentId - Agent ID
 * @returns Reset agent
 */
export async function resetAgentState(agentId: string) {
  try {
    logger.info(`Resetting state for agent: ${agentId}`);

    // Reset metrics
    const initialMetrics: PerformanceMetrics = {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      averageResponseTime: 0,
      successRate: 0,
      totalCost: 0,
      averageCost: 0,
      lastHealthCheck: new Date(),
      uptime: 0,
    };

    const updatedAgent = await prisma.aIAgent.update({
      where: { id: agentId },
      data: {
        performanceMetrics: JSON.stringify(initialMetrics),
        updatedAt: new Date(),
      },
    });

    // Clear all caches for this agent
    await redisClient.del(CACHE_KEYS.AGENT(agentId));
    await redisClient.del(CACHE_KEYS.AGENT_METRICS(agentId));
    await redisClient.del(CACHE_KEYS.AGENT_HEALTH(agentId));
    await redisClient.del(CACHE_KEYS.AGENT_LIST);

    logger.info(`Agent state reset successfully: ${agentId}`);
    
    return formatAgentResponse(updatedAgent);
  } catch (error) {
    logger.error(`Error resetting agent state ${agentId}:`, error);
    throw error;
  }
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Cache agent data
 */
async function cacheAgent(agent: any) {
  try {
    const formatted = formatAgentResponse(agent);
    await redisClient.setEx(
      CACHE_KEYS.AGENT(agent.id),
      CACHE_TTL.AGENT_STATUS,
      JSON.stringify(formatted)
    );
  } catch (error) {
    logger.error(`Error caching agent ${agent.id}:`, error);
    // Don't throw - caching failures shouldn't break the operation
  }
}

/**
 * Format agent response for API
 */
function formatAgentResponse(agent: any) {
  return {
    id: agent.id,
    name: agent.name,
    type: agent.type,
    modelProvider: agent.modelProvider,
    modelName: agent.modelName,
    configuration: agent.configuration ? JSON.parse(agent.configuration) : null,
    isActive: agent.isActive,
    performanceMetrics: agent.performanceMetrics
      ? JSON.parse(agent.performanceMetrics)
      : null,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    recentTasks: agent.AITask || [],
  };
}

// ==================== BACKGROUND TASKS ====================

/**
 * Start background metrics update task
 * Updates metrics every 30 seconds for all active agents
 */
export function startMetricsUpdateTask() {
  setInterval(async () => {
    try {
      const agents = await prisma.aIAgent.findMany({
        where: { isActive: true },
      });

      if (agents.length > 0) {
        const now = new Date();
        await Promise.all(
          agents.map((agent) =>
            updateAgentMetrics(agent.id, { lastHealthCheck: now }, agent)
          )
        );
      }

      logger.debug(`Metrics updated for ${agents.length} active agents`);
    } catch (error) {
      logger.error('Error in metrics update task:', error);
    }
  }, 30000); // 30 seconds
}

// ==================== AUDIT LOGGING ====================

/**
 * Log AI operation for audit trail
 * @param operation - Operation type
 * @param agentId - Agent ID
 * @param details - Operation details
 */
export async function logAIOperation(
  operation: string,
  agentId: string,
  details: Record<string, any>
) {
  try {
    // Store in analytics events for audit trail
    await prisma.analyticsEvent.create({
      data: {
        id: `ai-audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sessionId: `ai-system-${Date.now()}`,
        eventType: 'ai_operation',
        resourceType: 'ai_agent',
        resourceId: agentId,
        properties: JSON.stringify({
          operation,
          ...details,
        }),
        metadata: JSON.stringify({
          timestamp: new Date(),
          source: 'ai_agent_service',
        }),
        timestamp: new Date(),
      },
    });

    logger.debug(`AI operation logged: ${operation} for agent ${agentId}`);
  } catch (error) {
    logger.error('Error logging AI operation:', error);
    // Don't throw - audit logging failures shouldn't break operations
  }
}

// Export all functions
export default {
  registerAIAgent,
  registerAgentOnStartup,
  getAIAgentById,
  getAllAIAgents,
  updateAIAgentConfig,
  toggleAIAgent,
  deactivateAIAgent,
  updateAgentMetrics,
  getAIAgentMetrics,
  updateAgentHealth,
  getAgentHealth,
  resetAgentState,
  startMetricsUpdateTask,
  logAIOperation,
};
