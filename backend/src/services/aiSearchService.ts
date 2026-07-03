/**
 * AI Search Service
 * 
 * Production-ready implementation of AI-powered search capabilities including:
 * - Semantic search using embeddings
 * - Query understanding and expansion
 * - Personalized search results
 * - Multi-language search across translations
 * - Quality score ranking integration
 * 
 * Performance targets:
 * - Search response time < 200ms (cached)
 * - Semantic search < 500ms (uncached)
 * - Cache hit rate > 75%
 * 
 * @module aiSearchService
 */

import { PrismaClient, Article, User } from '@prisma/client';
import Redis from 'ioredis';
import { complete, generateEmbeddings, AI_MODELS, AI_ENDPOINTS } from './aiClient';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface SearchQuery {
  query: string;
  userId?: string;
  language?: string;
  filters?: SearchFilters;
  page?: number;
  limit?: number;
}

export interface SearchFilters {
  categoryId?: string;
  contentType?: string[];
  minQualityScore?: number;
  dateRange?: {
    start: Date;
    end: Date;
  };
  tags?: string[];
  isPremium?: boolean;
}

export interface SearchResult {
  id: string;
  title: string;
  excerpt: string;
  content?: string;
  categoryId: string;
  categoryName?: string;
  author: {
    id: string;
    name: string;
    avatar?: string;
  };
  publishedAt: Date;
  qualityScore: number;
  relevanceScore: number;
  semanticScore?: number;
  isPremium: boolean;
  tags: string[];
  imageUrl?: string;
  language: string;
  translationAvailable: string[];
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
  queryExpansions?: string[];
  suggestions?: string[];
  processingTime: number;
  cached: boolean;
}

export interface SemanticSearchParams {
  query: string;
  userId?: string;
  language?: string;
  limit?: number;
  minSimilarity?: number;
}

export interface QuerySuggestion {
  suggestion: string;
  type: 'correction' | 'expansion' | 'related';
  score: number;
}

export interface PersonalizedSearchParams {
  userId: string;
  query: string;
  language?: string;
  limit?: number;
}

export interface UserSearchPreferences {
  userId: string;
  favoriteCategories: string[];
  favoriteTopics: string[];
  readingHistory: string[]; // Article IDs
  searchHistory: string[]; // Recent queries
  languagePreference: string;
  contentDifficulty?: 'beginner' | 'intermediate' | 'advanced';
}

export interface SearchAnalytics {
  query: string;
  resultCount: number;
  clickThroughRate: number;
  averagePosition: number;
  zeroResultsRate: number;
  popularQueries: Array<{
    query: string;
    count: number;
    averageResults: number;
  }>;
}

// ============================================================================
// AI Search Service
// ============================================================================

export class AISearchService {
  private prisma: PrismaClient;
  private redis: Redis;

  // Cache TTLs
  private readonly CACHE_TTL = {
    search: 300, // 5 minutes
    semantic: 600, // 10 minutes
    suggestions: 1800, // 30 minutes
    embeddings: 3600, // 1 hour
    userPreferences: 600, // 10 minutes
  };

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  // ==========================================================================
  // AI-Powered Search Enhancement
  // ==========================================================================

  /**
   * AI-enhanced search with query understanding, expansion, and personalization
   */
  async aiEnhancedSearch(params: SearchQuery): Promise<SearchResponse> {
    const startTime = Date.now();
    const cacheKey = `ai_search:enhanced:${JSON.stringify(params)}`;

    try {
      // Try cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const result = JSON.parse(cached) as SearchResponse;
        return {
          ...result,
          cached: true,
          processingTime: Date.now() - startTime,
        };
      }

      // Step 1: Query understanding and expansion
      const expandedQueries = await this.expandQuery(params.query);
      
      // Step 2: Get user preferences for personalization
      const userPrefs = params.userId
        ? await this.getUserSearchPreferences(params.userId)
        : null;

      // Step 3: Build search parameters
      const searchParams = this.buildSearchParams(params, expandedQueries, userPrefs);

      // Step 4: Execute multi-faceted search
      const [textResults, semanticResults] = await Promise.all([
        this.textSearch(searchParams),
        this.semanticSearch({
          query: params.query,
          ...(params.userId && { userId: params.userId }),
          ...(params.language && { language: params.language }),
          ...(params.limit && { limit: params.limit }),
        }),
      ]);

      // Step 5: Merge and rank results
      const mergedResults = this.mergeAndRankResults(
        textResults,
        semanticResults,
        userPrefs
      );

      // Step 6: Apply filters and pagination
      const filteredResults = this.applyFilters(mergedResults, params.filters);
      const paginatedResults = this.paginate(
        filteredResults,
        params.page || 1,
        params.limit || 10
      );

      // Step 7: Get query suggestions
      const suggestions = await this.getQuerySuggestions(params.query);

      const response: SearchResponse = {
        results: paginatedResults.items,
        totalCount: filteredResults.length,
        page: params.page || 1,
        limit: params.limit || 10,
        hasMore: paginatedResults.hasMore,
        queryExpansions: expandedQueries,
        suggestions: suggestions.map(s => s.suggestion),
        processingTime: Date.now() - startTime,
        cached: false,
      };

      // Cache the response
      await this.redis.setex(cacheKey, this.CACHE_TTL.search, JSON.stringify(response));

      // Track search analytics
      await this.trackSearchAnalytics(params.query, response.totalCount, params.userId);

      return response;
    } catch (error) {
      console.error('AI Enhanced Search Error:', error);
      throw new Error(`AI enhanced search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Query expansion using AI (GPT-4)
   */
  private async expandQuery(query: string): Promise<string[]> {
    const cacheKey = `ai_search:expand:${query}`;

    try {
      // Try cache
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as string[];
      }

      // Use Ollama to expand query
      const completion = await complete(
        `Expand this search query: "${query}"`,
        {
          systemPrompt: 'You are a search query expansion expert for a cryptocurrency news platform. Generate 3-5 related search queries that capture different aspects and synonyms of the user\'s intent. Return only the queries as a JSON array.',
          model: AI_MODELS.LLAMA,
          temperature: 0.7,
          maxTokens: 200,
        }
      );

      // Parse expansions and ensure they are valid
      const content = completion;
      const jsonMatch = content?.match(/\[[\s\S]*\]/);
      const expansions = jsonMatch ? JSON.parse(jsonMatch[0]) as string[] : [];
      
      // Cache expansions
      await this.redis.setex(cacheKey, this.CACHE_TTL.suggestions, JSON.stringify(expansions));

      return expansions;
    } catch (error) {
      console.error('Query expansion error:', error);
      return [query]; // Fallback to original query
    }
  }

  /**
   * Traditional text-based search using Prisma full-text search
   */
  private async textSearch(params: any): Promise<SearchResult[]> {
    try {
      const articles = await this.prisma.article.findMany({
        where: {
          OR: [
            { title: { contains: params.query, mode: 'insensitive' } },
            { content: { contains: params.query, mode: 'insensitive' } },
            { excerpt: { contains: params.query, mode: 'insensitive' } },
            { tags: { hasSome: params.query.split(' ') } },
          ],
          status: 'published',
          ...params.filters,
        },
        include: {
          User: {
            select: {
              id: true,
              username: true,
              UserProfile: {
                select: {
                  bio: true,
                },
              },
            },
          },
          Category: {
            select: {
              id: true,
              name: true,
            },
          },
          ArticleTranslation: {
            select: {
              languageCode: true,
            },
          },
        },
        take: 50, // Limit initial results
      });

      return articles.map(article => this.mapArticleToSearchResult(article, params.query));
    } catch (error) {
      console.error('Text search error:', error);
      return [];
    }
  }

  // ==========================================================================
  // Semantic Search Using Embeddings
  // ==========================================================================

  /**
   * Semantic search using OpenAI embeddings
   */
  async semanticSearch(params: SemanticSearchParams): Promise<SearchResult[]> {
    const cacheKey = `ai_search:semantic:${JSON.stringify(params)}`;

    try {
      // Try cache
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as SearchResult[];
      }

      // Step 1: Generate query embedding
      const queryEmbedding = await this.generateEmbedding(params.query);

      // Step 2: Get all article embeddings (in production, use vector DB like Pinecone)
      const articles = await this.prisma.article.findMany({
        where: {
          status: 'published',
        },
        include: {
          User: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
          Category: {
            select: {
              id: true,
              name: true,
            },
          },
          ArticleTranslation: {
            select: {
              languageCode: true,
            },
          },
        },
        take: 100, // Limit for performance
      });

      // Step 3: Calculate semantic similarity
      const resultsWithScores = await Promise.all(
        articles.map(async (article) => {
          const articleEmbedding = await this.getOrCreateArticleEmbedding(article.id, article.content);
          const similarity = this.cosineSimilarity(queryEmbedding, articleEmbedding);

          return {
            article,
            semanticScore: similarity,
          };
        })
      );

      // Step 4: Filter by minimum similarity and sort
      const minSimilarity = params.minSimilarity || 0.7;
      const filteredResults = resultsWithScores
        .filter(r => r.semanticScore >= minSimilarity)
        .sort((a, b) => b.semanticScore - a.semanticScore)
        .slice(0, params.limit || 10);

      // Step 5: Map to SearchResult
      const searchResults = filteredResults.map(r => {
        const result = this.mapArticleToSearchResult(r.article, params.query);
        result.semanticScore = r.semanticScore;
        result.relevanceScore = r.semanticScore; // Use semantic score as relevance
        return result;
      });

      // Cache results
      await this.redis.setex(cacheKey, this.CACHE_TTL.semantic, JSON.stringify(searchResults));

      return searchResults;
    } catch (error) {
      console.error('Semantic search error:', error);
      return [];
    }
  }

  /**
   * Generate embedding for text using OpenAI
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const cacheKey = `ai_search:embedding:${text.substring(0, 100)}`;

    try {
      // Try cache
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as number[];
      }

      // Generate embedding using local BGE model
      const embedding = await generateEmbeddings(text);

      if (!embedding || embedding.length === 0) {
        throw new Error('Failed to generate embedding');
      }

      // Cache embedding
      await this.redis.setex(cacheKey, this.CACHE_TTL.embeddings, JSON.stringify(embedding));

      return embedding;
    } catch (error) {
      console.error('Embedding generation error:', error);
      throw error;
    }
  }

  /**
   * Get or create article embedding
   */
  private async getOrCreateArticleEmbedding(articleId: string, content: string): Promise<number[]> {
    const cacheKey = `ai_search:article_embedding:${articleId}`;

    try {
      // Try cache
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as number[];
      }

      // Generate embedding for article content (first 2000 chars for performance)
      const truncatedContent = content.substring(0, 2000);
      const embedding = await this.generateEmbedding(truncatedContent);

      // Cache indefinitely (embeddings don't change)
      await this.redis.set(cacheKey, JSON.stringify(embedding));

      return embedding;
    } catch (error) {
      console.error('Article embedding error:', error);
      // Return zero vector as fallback
      return new Array(1536).fill(0);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      const a = vecA[i] ?? 0;
      const b = vecB[i] ?? 0;
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    return similarity;
  }

  // ==========================================================================
  // Query Suggestions
  // ==========================================================================

  /**
   * Get AI-powered query suggestions
   */
  async getQuerySuggestions(query: string): Promise<QuerySuggestion[]> {
    const cacheKey = `ai_search:suggestions:${query}`;

    try {
      // Try cache
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as QuerySuggestion[];
      }

      // Get suggestions from multiple sources
      const [aiSuggestions, popularQueries, relatedQueries] = await Promise.all([
        this.getAISuggestions(query),
        this.getPopularQueries(query),
        this.getRelatedQueries(query),
      ]);

      // Combine and rank suggestions
      const allSuggestions: QuerySuggestion[] = [
        ...aiSuggestions.map(s => ({ suggestion: s, type: 'expansion' as const, score: 0.9 })),
        ...popularQueries.map(s => ({ suggestion: s, type: 'related' as const, score: 0.8 })),
        ...relatedQueries.map(s => ({ suggestion: s, type: 'related' as const, score: 0.7 })),
      ];

      // Remove duplicates and sort by score
      const uniqueSuggestions = this.deduplicateSuggestions(allSuggestions);
      const topSuggestions = uniqueSuggestions.slice(0, 5);

      // Cache suggestions
      await this.redis.setex(cacheKey, this.CACHE_TTL.suggestions, JSON.stringify(topSuggestions));

      return topSuggestions;
    } catch (error) {
      console.error('Query suggestions error:', error);
      return [];
    }
  }

  /**
   * Get AI-generated query suggestions
   */
  private async getAISuggestions(query: string): Promise<string[]> {
    try {
      const prompt = `You are a search suggestion expert for cryptocurrency news. Suggest 3 related search queries that users might find helpful.

Query: "${query}"

Return ONLY a JSON array of 3 suggested queries, nothing else. Example: ["query 1", "query 2", "query 3"]`;

      const response = await complete(prompt);
      
      // Extract JSON array from response
      const jsonMatch = response.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as string[];
      }
      return [];
    } catch (error) {
      console.error('AI suggestions error:', error);
      return [];
    }
  }

  /**
   * Get popular queries similar to input
   */
  private async getPopularQueries(query: string): Promise<string[]> {
    try {
      // Get search analytics
      const analytics = await this.prisma.analyticsEvent.findMany({
        where: {
          eventType: 'search',
          properties: {
            contains: query.toLowerCase(),
          },
        },
        select: {
          metadata: true,
          properties: true,
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: 100,
      });

      // Count query occurrences
      const queryCounts = new Map<string, number>();
      analytics.forEach(event => {
        const searchQuery = (event.metadata as any)?.query as string;
        if (searchQuery) {
          queryCounts.set(searchQuery, (queryCounts.get(searchQuery) || 0) + 1);
        }
      });

      // Sort by count and return top 3
      return Array.from(queryCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([q]) => q);
    } catch (error) {
      console.error('Popular queries error:', error);
      return [];
    }
  }

  /**
   * Get related queries from article tags
   */
  private async getRelatedQueries(query: string): Promise<string[]> {
    try {
      // Find articles matching query
      const articles = await this.prisma.article.findMany({
        where: {
          OR: [
            { title: { contains: query } },
            { tags: { contains: query } },
          ],
          status: 'published',
        },
        select: {
          tags: true,
        },
        take: 20,
      });

      // Extract unique tags
      const allTags = articles.flatMap(a => a.tags);
      const uniqueTags = Array.from(new Set(allTags));

      // Filter out the original query words and return top 3
      const queryWords = query.toLowerCase().split(' ');
      const relatedTags = uniqueTags
        .filter((tag): tag is string => tag !== null && !queryWords.includes(tag.toLowerCase()))
        .slice(0, 3);

      return relatedTags;
    } catch (error) {
      console.error('Related queries error:', error);
      return [];
    }
  }

  /**
   * Remove duplicate suggestions
   */
  private deduplicateSuggestions(suggestions: QuerySuggestion[]): QuerySuggestion[] {
    const seen = new Set<string>();
    return suggestions.filter(s => {
      const normalized = s.suggestion.toLowerCase();
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
  }

  // ==========================================================================
  // Personalized Search
  // ==========================================================================

  /**
   * Get user search preferences
   */
  async getUserSearchPreferences(userId: string): Promise<UserSearchPreferences> {
    const cacheKey = `ai_search:user_prefs:${userId}`;

    try {
      // Try cache
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as UserSearchPreferences;
      }

      // Get user data
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          UserEngagement: {
            where: { actionType: 'READ' },
            orderBy: { createdAt: 'desc' },
            take: 90, // Last 90 entries
            include: {
              Article: {
                select: {
                  id: true,
                  categoryId: true,
                  tags: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Extract preferences from UserEngagement data
      const readingEngagements = user.UserEngagement.filter(e => e.Article);
      const favoriteCategories = this.extractFavoriteCategories(readingEngagements);
      const favoriteTopics = this.extractFavoriteTopics(readingEngagements);
      const readingHistory = readingEngagements.map(e => e.Article!.id);

      // Get search history
      const searchHistory = await this.getSearchHistory(userId);

      // Get user preferences
      const userPreferences = await this.prisma.userPreference.findUnique({
        where: { userId }
      });

      const preferences: UserSearchPreferences = {
        userId,
        favoriteCategories,
        favoriteTopics,
        readingHistory,
        searchHistory,
        languagePreference: user.preferredLanguage || 'en',
        contentDifficulty: (userPreferences?.readingLevel.toLowerCase() as 'beginner' | 'intermediate' | 'advanced') || 'intermediate',
      };

      // Cache preferences
      await this.redis.setex(cacheKey, this.CACHE_TTL.userPreferences, JSON.stringify(preferences));

      return preferences;
    } catch (error) {
      console.error('User preferences error:', error);
      // Return default preferences
      return {
        userId,
        favoriteCategories: [],
        favoriteTopics: [],
        readingHistory: [],
        searchHistory: [],
        languagePreference: 'en',
      };
    }
  }

  /**
   * Extract favorite categories from reading history
   */
  private extractFavoriteCategories(readingEngagements: any[]): string[] {
    const categoryCounts = new Map<string, number>();
    
    readingEngagements.forEach(engagement => {
      if (engagement.Article) {
        const categoryId = engagement.Article.categoryId;
        if (categoryId) {
          categoryCounts.set(categoryId, (categoryCounts.get(categoryId) || 0) + 1);
        }
      }
    });

    return Array.from(categoryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);
  }

  /**
   * Extract favorite topics from reading engagements
   */
  private extractFavoriteTopics(readingEngagements: any[]): string[] {
    const topicCounts = new Map<string, number>();
    
    readingEngagements.forEach(engagement => {
      if (engagement.Article && engagement.Article.tags) {
        const tags = typeof engagement.Article.tags === 'string' 
          ? JSON.parse(engagement.Article.tags) 
          : engagement.Article.tags;
        
        if (Array.isArray(tags)) {
          tags.forEach((tag: string) => {
            topicCounts.set(tag, (topicCounts.get(tag) || 0) + 1);
          });
        }
      }
    });

    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic]) => topic);
  }

  /**
   * Get user search history
   */
  private async getSearchHistory(userId: string): Promise<string[]> {
    try {
      const history = await this.prisma.analyticsEvent.findMany({
        where: {
          userId,
          eventType: 'search',
        },
        select: {
          metadata: true,
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: 20,
      });

      return history.map(h => (h.metadata as any)?.query as string).filter(Boolean);
    } catch (error) {
      console.error('Search history error:', error);
      return [];
    }
  }

  // ==========================================================================
  // Ranking & Filtering
  // ==========================================================================

  /**
   * Merge and rank results from multiple search methods
   */
  private mergeAndRankResults(
    textResults: SearchResult[],
    semanticResults: SearchResult[],
    userPrefs: UserSearchPreferences | null
  ): SearchResult[] {
    // Create a map to merge results by article ID
    const resultsMap = new Map<string, SearchResult>();

    // Add text results
    textResults.forEach(result => {
      resultsMap.set(result.id, result);
    });

    // Merge semantic results
    semanticResults.forEach(result => {
      const existing = resultsMap.get(result.id);
      if (existing) {
        // Combine scores (weighted average)
        existing.relevanceScore = (existing.relevanceScore * 0.4) + (result.relevanceScore * 0.6);
        existing.semanticScore = result.semanticScore ?? 0;
      } else {
        resultsMap.set(result.id, result);
      }
    });

    // Convert to array
    let results = Array.from(resultsMap.values());

    // Apply personalization boost
    if (userPrefs) {
      results = results.map(result => {
        let personalizedScore = result.relevanceScore;

        // Boost favorite categories (10%)
        if (userPrefs.favoriteCategories.includes(result.categoryId)) {
          personalizedScore *= 1.1;
        }

        // Boost favorite topics (15%)
        const hasTopicMatch = result.tags.some(tag => userPrefs.favoriteTopics.includes(tag));
        if (hasTopicMatch) {
          personalizedScore *= 1.15;
        }

        // Penalize already read articles (20%)
        if (userPrefs.readingHistory.includes(result.id)) {
          personalizedScore *= 0.8;
        }

        return {
          ...result,
          relevanceScore: personalizedScore,
        };
      });
    }

    // Apply quality score boost (20% weight)
    results = results.map(result => ({
      ...result,
      relevanceScore: (result.relevanceScore * 0.8) + (result.qualityScore * 0.2),
    }));

    // Sort by final relevance score
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return results;
  }

  /**
   * Apply filters to search results
   */
  private applyFilters(results: SearchResult[], filters?: SearchFilters): SearchResult[] {
    if (!filters) return results;

    let filtered = results;

    if (filters.categoryId) {
      filtered = filtered.filter(r => r.categoryId === filters.categoryId);
    }

    if (filters.minQualityScore) {
      filtered = filtered.filter(r => r.qualityScore >= (filters.minQualityScore || 0));
    }

    if (filters.dateRange) {
      filtered = filtered.filter(r => {
        const publishedAt = new Date(r.publishedAt);
        return publishedAt >= filters.dateRange!.start && publishedAt <= filters.dateRange!.end;
      });
    }

    if (filters.tags && filters.tags.length > 0) {
      filtered = filtered.filter(r => {
        return filters.tags!.some(tag => r.tags.includes(tag));
      });
    }

    if (filters.isPremium !== undefined) {
      filtered = filtered.filter(r => r.isPremium === filters.isPremium);
    }

    return filtered;
  }

  /**
   * Paginate results
   */
  private paginate(
    results: SearchResult[],
    page: number,
    limit: number
  ): { items: SearchResult[]; hasMore: boolean } {
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const items = results.slice(startIndex, endIndex);
    const hasMore = endIndex < results.length;

    return { items, hasMore };
  }

  // ==========================================================================
  // Multi-Language Search
  // ==========================================================================

  /**
   * Search across all translations
   */
  async multiLanguageSearch(
    query: string,
    languages: string[],
    limit: number = 10
  ): Promise<SearchResult[]> {
    const cacheKey = `ai_search:multilang:${query}:${languages.join(',')}`;

    try {
      // Try cache
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as SearchResult[];
      }

      // Search in translations
      const translations = await this.prisma.articleTranslation.findMany({
        where: {
          languageCode: { in: languages },
          OR: [
            { title: { contains: query } },
            { content: { contains: query } },
          ],
        },
        include: {
          Article: {
            include: {
              User: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  avatarUrl: true,
                },
              },
              Category: {
                select: {
                  id: true,
                  name: true,
                },
              },
              ArticleTranslation: {
                select: {
                  languageCode: true,
                },
              },
            },
          },
        },
        take: limit,
      });

      // Fetch articles separately for translations
      const articleIds = translations.map(t => t.articleId);
      const articles = await this.prisma.article.findMany({
        where: { id: { in: articleIds } },
        include: {
          Category: true,
          User: { select: { username: true, id: true } },
        },
      });

      // Create a map for faster lookup
      const articleMap = new Map(articles.map(a => [a.id, a]));

      // Map to search results
      const results = translations.map(t => {
        const article = articleMap.get(t.articleId);
        if (!article) return null;
        const result = this.mapArticleToSearchResult(article, query);
        result.language = t.languageCode;
        return result;
      }).filter(Boolean) as SearchResult[];

      // Cache results
      await this.redis.setex(cacheKey, this.CACHE_TTL.search, JSON.stringify(results));

      return results;
    } catch (error) {
      console.error('Multi-language search error:', error);
      return [];
    }
  }

  // ==========================================================================
  // Analytics & Tracking
  // ==========================================================================

  /**
   * Track search analytics
   */
  private async trackSearchAnalytics(
    query: string,
    resultCount: number,
    userId?: string
  ): Promise<void> {
    try {
      await this.prisma.analyticsEvent.create({
        data: {
          id: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          sessionId: userId || 'anonymous',
          eventType: 'search',
          userId: userId || null,
          properties: JSON.stringify({}),
          metadata: JSON.stringify({
            query,
            resultCount,
            timestamp: new Date(),
          }),
        },
      });
    } catch (error) {
      console.error('Search analytics tracking error:', error);
    }
  }

  /**
   * Get search analytics
   */
  async getSearchAnalytics(days: number = 30): Promise<SearchAnalytics> {
    const cacheKey = `ai_search:analytics:${days}`;

    try {
      // Try cache
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as SearchAnalytics;
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const events = await this.prisma.analyticsEvent.findMany({
        where: {
          eventType: 'search',
          timestamp: { gte: cutoffDate },
        },
        select: {
          metadata: true,
        },
      });

      // Calculate analytics
      const queryCounts = new Map<string, { count: number; totalResults: number }>();
      let totalQueries = 0;
      let zeroResultCount = 0;

      events.forEach(event => {
        const meta = event.metadata as any;
        const query = meta.query as string;
        const resultCount = meta.resultCount as number;

        totalQueries++;

        if (resultCount === 0) {
          zeroResultCount++;
        }

        const existing = queryCounts.get(query) || { count: 0, totalResults: 0 };
        queryCounts.set(query, {
          count: existing.count + 1,
          totalResults: existing.totalResults + resultCount,
        });
      });

      const popularQueries = Array.from(queryCounts.entries())
        .map(([query, data]) => ({
          query,
          count: data.count,
          averageResults: data.totalResults / data.count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const analytics: SearchAnalytics = {
        query: '', // Aggregated analytics
        resultCount: totalQueries,
        clickThroughRate: 0, // Would need click tracking
        averagePosition: 0, // Would need position tracking
        zeroResultsRate: totalQueries > 0 ? zeroResultCount / totalQueries : 0,
        popularQueries,
      };

      // Cache analytics
      await this.redis.setex(cacheKey, 3600, JSON.stringify(analytics));

      return analytics;
    } catch (error) {
      console.error('Search analytics error:', error);
      throw error;
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Build search parameters from query and preferences
   */
  private buildSearchParams(
    params: SearchQuery,
    expandedQueries: string[],
    userPrefs: UserSearchPreferences | null
  ): any {
    return {
      query: params.query,
      expandedQueries,
      language: params.language || userPrefs?.languagePreference || 'en',
      filters: params.filters || {},
      page: params.page || 1,
      limit: params.limit || 10,
    };
  }

  /**
   * Map Prisma article to SearchResult
   */
  private mapArticleToSearchResult(article: any, query: string): SearchResult {
    const qualityScore = article.qualityScores[0]?.overallScore || 0.5;
    const translationLanguages = article.translations.map((t: any) => t.language);

    // Calculate basic relevance score based on where query appears
    let relevanceScore = 0.5;
    const lowerQuery = query.toLowerCase();
    
    if (article.title.toLowerCase().includes(lowerQuery)) {
      relevanceScore += 0.3;
    }
    if (article.excerpt?.toLowerCase().includes(lowerQuery)) {
      relevanceScore += 0.1;
    }
    if (article.tags.some((tag: string) => tag.toLowerCase().includes(lowerQuery))) {
      relevanceScore += 0.1;
    }

    return {
      id: article.id,
      title: article.title,
      excerpt: article.excerpt || article.content.substring(0, 200) + '...',
      content: article.content,
      categoryId: article.categoryId,
      categoryName: article.category?.name,
      author: {
        id: article.author.id,
        name: article.author.profile?.fullName || article.author.username,
        avatar: article.author.profile?.avatar,
      },
      publishedAt: article.publishedAt,
      qualityScore,
      relevanceScore,
      isPremium: article.isPremium || false,
      tags: article.tags || [],
      imageUrl: article.featuredImage,
      language: 'en', // Default language
      translationAvailable: translationLanguages,
    };
  }

  // ==========================================================================
  // Health Check
  // ==========================================================================

  /**
   * Health check for AI search service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: {
      database: boolean;
      redis: boolean;
      openai: boolean;
    };
    timestamp: Date;
  }> {
    const checks = {
      database: false,
      redis: false,
      openai: false,
    };

    try {
      // Check database
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch (error) {
      console.error('Database health check failed:', error);
    }

    try {
      // Check Redis
      await this.redis.ping();
      checks.redis = true;
    } catch (error) {
      console.error('Redis health check failed:', error);
    }

    try {
      // Check local AI (Ollama health check)
      const response = await fetch(`${AI_ENDPOINTS.OLLAMA}/api/tags`);
      checks.openai = response.ok; // Keep same key for compatibility
    } catch (error) {
      console.error('AI service health check failed:', error);
    }

    const allHealthy = Object.values(checks).every(c => c);
    const someHealthy = Object.values(checks).some(c => c);

    return {
      status: allHealthy ? 'healthy' : someHealthy ? 'degraded' : 'unhealthy',
      checks,
      timestamp: new Date(),
    };
  }
}

// ============================================================================
// Export
// ============================================================================

export default AISearchService;
