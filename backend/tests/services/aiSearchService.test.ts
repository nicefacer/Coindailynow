
import AISearchService from '../../src/services/aiSearchService';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

// Mock Prisma and Redis
const mockPrisma = {
  articleTranslation: {
    findMany: jest.fn(),
  },
  article: {
    findMany: jest.fn(),
  },
} as unknown as PrismaClient;

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
} as unknown as Redis;

describe('AISearchService - multiLanguageSearch', () => {
  let aiSearchService: AISearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    aiSearchService = new AISearchService(mockPrisma, mockRedis);

    // Mock mapArticleToSearchResult to avoid complex logic
    (aiSearchService as any).mapArticleToSearchResult = jest.fn().mockImplementation((article, query) => ({
      id: article.id,
      title: article.title,
      language: 'en'
    }));
  });

  it('should correctly map translations to articles using Map lookup', async () => {
    const query = 'crypto';
    const languages = ['en', 'fr'];
    const translations = [
      { articleId: '1', languageCode: 'en' },
      { articleId: '2', languageCode: 'fr' },
    ];
    const articles = [
      { id: '1', title: 'Article 1', qualityScores: [], translations: [], author: { id: 'a1' } },
      { id: '2', title: 'Article 2', qualityScores: [], translations: [], author: { id: 'a2' } },
    ];

    (mockRedis.get as jest.Mock).mockResolvedValue(null);
    (mockPrisma.articleTranslation.findMany as jest.Mock).mockResolvedValue(translations);
    (mockPrisma.article.findMany as jest.Mock).mockResolvedValue(articles);

    const results = await aiSearchService.multiLanguageSearch(query, languages);

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('1');
    expect(results[0].language).toBe('en');
    expect(results[1].id).toBe('2');
    expect(results[1].language).toBe('fr');

    expect(mockPrisma.article.findMany).toHaveBeenCalled();
  });

  it('should filter out translations without matching articles', async () => {
    const query = 'crypto';
    const languages = ['en'];
    const translations = [
      { articleId: '1', languageCode: 'en' },
      { articleId: '2', languageCode: 'en' },
    ];
    const articles = [
      { id: '1', title: 'Article 1', qualityScores: [], translations: [], author: { id: 'a1' } },
    ];

    (mockRedis.get as jest.Mock).mockResolvedValue(null);
    (mockPrisma.articleTranslation.findMany as jest.Mock).mockResolvedValue(translations);
    (mockPrisma.article.findMany as jest.Mock).mockResolvedValue(articles);

    const results = await aiSearchService.multiLanguageSearch(query, languages);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('1');
  });

  it('should return cached results if available', async () => {
    const cachedResults = [{ id: '1', title: 'Cached' }];
    (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(cachedResults));

    const results = await aiSearchService.multiLanguageSearch('query', ['en']);

    expect(results).toEqual(cachedResults);
    expect(mockPrisma.articleTranslation.findMany).not.toHaveBeenCalled();
  });
});
