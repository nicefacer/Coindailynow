
import { getCostBreakdown } from '../../services/aiAnalyticsService';
import prisma from '../../lib/prisma';
import { redisClient } from '../../config/redis';

jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: {
    aIAgent: {
      findMany: jest.fn(),
    },
    aITask: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
    analyticsEvent: {
      create: jest.fn(),
    },
  },
}));

jest.mock('../../config/redis', () => ({
  redisClient: {
    get: jest.fn(),
    setex: jest.fn(),
    isOpen: true,
  },
}));

describe('aiAnalyticsService', () => {
  describe('getCostBreakdown performance', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (redisClient.get as jest.Mock).mockResolvedValue(null);
      (prisma.aITask.aggregate as jest.Mock).mockResolvedValue({ _sum: { actualCost: 0 } });
      (prisma.analyticsEvent.create as jest.Mock).mockResolvedValue({});
    });

    it('should verify optimization in calculateCostByAgent (no N+1)', async () => {
      const mockAgents = [
        { id: 'agent-1', name: 'Agent 1', type: 'TYPE-A', AITask: [] },
        { id: 'agent-2', name: 'Agent 2', type: 'TYPE-B', AITask: [] },
        { id: 'agent-3', name: 'Agent 3', type: 'TYPE-C', AITask: [] },
      ];

      (prisma.aIAgent.findMany as jest.Mock).mockResolvedValue(mockAgents);
      (prisma.aITask.findMany as jest.Mock).mockResolvedValue([]);

      await getCostBreakdown();

      // prisma.aIAgent.findMany is called once in calculateCostByAgent
      expect(prisma.aIAgent.findMany).toHaveBeenCalledTimes(1);

      // prisma.aITask.findMany is called:
      // - 0 times in calculateCostByAgent (optimized)
      // - 1 time in calculateCostByTaskType
      // Total: 1 time
      expect(prisma.aITask.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
