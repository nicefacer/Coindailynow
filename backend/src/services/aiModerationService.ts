import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import axios from 'axios';

// Type definitions
export interface ModerationRequest {
  userId: string;
  contentType: 'article' | 'comment' | 'post' | 'message';
  contentId: string;
  content: string;
  context?: string;
}

export interface ModerationResult {
  isViolation: boolean;
  violations: ViolationDetail[];
  shouldBlock: boolean;
  recommendedAction: 'APPROVE' | 'REVIEW' | 'BLOCK';
  confidence: number;
  priority: number;
  violationReportId?: string;
}

export type ViolationType = 'religious' | 'hate_speech' | 'harassment' | 'sexual' | 'spam' | 'other';
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ViolationDetail {
  type: ViolationType;
  severity: SeverityLevel;
  confidence: number;
  detectedPatterns?: string[];
  keywords?: string[];
}

export interface PenaltyResult {
  penaltyId: string;
  penaltyType: 'shadow_ban' | 'outright_ban' | 'official_ban';
  duration: number;
  escalationLevel: number;
  reason: string;
}

export interface UserReputationData {
  overallScore: number;
  contentQualityScore: number;
  communityScore: number;
  violationScore: number;
  trustLevel: string;
  priorityTier: string;
  totalViolations: number;
  riskLevel?: string; // Optional field for resolvers
}

export interface PriorityTierInfo {
  tier: 1 | 2 | 3 | 4;
  tierName: 'SUPER_ADMIN' | 'ADMIN' | 'PREMIUM' | 'FREE';
  priorityScore: number;
  approvalSpeed: 'instant' | 'fast' | 'normal' | 'thorough';
  moderationLevel: 'minimal' | 'light' | 'standard' | 'strict';
  visibilityBoost: number;
  autoApprove: boolean;
}

interface ModerationMetrics {
  totalViolations: number;
  pendingReviews: number;
  confirmedViolations: number;
  falsePositives: number;
  activePenalties: number;
  violationsByType: Record<string, number>;
  violationsBySeverity: Record<string, number>;
  averageConfidence: number;
  falsePositiveRate: number;
}

export class AIModerationService {
  private prisma: PrismaClient;
  private redis: Redis;
  private perspectiveApiKey: string;
  private monitoringInterval?: NodeJS.Timeout;

  // Religious content patterns (ZERO tolerance)
  private readonly RELIGIOUS_PATTERNS = [
    // Christianity
    /\b(jesus|christ|bible|christian|church|god|lord|savior|salvation|heaven|hell|sin|holy spirit|prophet muhammad|allah|islam|muslim|quran|mosque|prayer|hajj|ramadan|sharia)\b/i,
    // Islam
    /\b(muhammad|allah|islam|muslim|quran|mosque|prayer|hajj|ramadan|sharia|jihad|imam|mecca|medina)\b/i,
    // Judaism
    /\b(jew|jewish|torah|synagogue|rabbi|kosher|shabbat|yom kippur|hanukkah|passover)\b/i,
    // Hinduism
    /\b(hindu|brahma|vishnu|shiva|krishna|ganesha|karma|dharma|yoga|mantra|vedas)\b/i,
    // Buddhism
    /\b(buddha|buddhist|nirvana|meditation|dharma|karma|zen|sangha)\b/i,
    // General religious terms
    /\b(religion|religious|worship|faith|belief|deity|divine|sacred|holy|scripture|temple)\b/i
  ];

  // Hate speech patterns
  private readonly HATE_SPEECH_PATTERNS = [
    /\b(nigger|n[i1]gg[ae]r|kaffir|k[a4]ff[i1]r)\b/i,
    /\b(faggot|f[a4]gg[o0]t|dyke|tranny)\b/i,
    /\b(kill all|death to|exterminate|genocide)\b/i
  ];

  constructor(prisma: PrismaClient, redis: Redis, perspectiveApiKey: string) {
    this.prisma = prisma;
    this.redis = redis;
    this.perspectiveApiKey = perspectiveApiKey;
  }

  /**
   * Main moderation method - analyzes content for violations
   */
  async moderateContent(request: ModerationRequest): Promise<ModerationResult> {
    const violations: ViolationDetail[] = [];
    const { userId, contentType, contentId, content, context } = request;

    // Get user reputation for priority calculation
    const userReputation = await this.getUserReputation(userId);

    // 1. Check for religious content (ZERO tolerance)
    const religiousViolation = this.detectReligiousContent(content);
    if (religiousViolation) {
      violations.push(religiousViolation);
    }

    // 2. Check for hate speech using Perspective API
    const hateSpeechViolation = await this.detectHateSpeech(content);
    if (hateSpeechViolation) {
      violations.push(hateSpeechViolation);
    }

    // 3. Check for harassment
    const harassmentViolation = await this.detectHarassment(content);
    if (harassmentViolation) {
      violations.push(harassmentViolation);
    }

    // 4. Check for sexual content
    const sexualViolation = await this.detectSexualContent(content);
    if (sexualViolation) {
      violations.push(sexualViolation);
    }

    // 5. Check for spam
    const spamViolation = this.detectSpam(content);
    if (spamViolation) {
      violations.push(spamViolation);
    }

    // Calculate overall confidence and severity
    const isViolation = violations.length > 0;
    const confidence = isViolation 
      ? violations.reduce((sum, v) => sum + v.confidence, 0) / violations.length 
      : 0;

    // Determine if content should be blocked
    const shouldBlock = violations.some(v => 
      v.type === 'religious' || // ZERO tolerance for religious content
      (v.severity === 'critical' && v.confidence > 0.8) ||
      (v.severity === 'high' && v.confidence > 0.85)
    );

    // Calculate priority for manual review
    const priority = this.calculatePriority(violations, userReputation);

    // Determine recommended action
    let recommendedAction: 'APPROVE' | 'REVIEW' | 'BLOCK' = 'APPROVE';
    if (shouldBlock) {
      recommendedAction = 'BLOCK';
    } else if (isViolation && confidence > 0.6) {
      recommendedAction = 'REVIEW';
    }

    // Create violation report if violations detected
    let violationReportId: string | undefined;
    if (isViolation) {
      const highestSeverityViolation = violations.reduce((prev, curr) => 
        this.getSeverityLevel(curr.severity) > this.getSeverityLevel(prev.severity) ? curr : prev
      );

      const violationReport = await this.prisma.violationReport.create({
        data: {
          userId,
          contentType,
          contentId,
          violationType: highestSeverityViolation.type,
          severity: highestSeverityViolation.severity,
          confidence,
          aiModel: 'perspective-api-v1',
          content,
          context: context || '',
          detectedPatterns: JSON.stringify(
            violations.flatMap(v => v.detectedPatterns || [])
          ),
          keywords: JSON.stringify(
            violations.flatMap(v => v.keywords || [])
          ),
          status: shouldBlock ? 'CONFIRMED' : 'PENDING'
        }
      });

      violationReportId = violationReport.id;

      // Apply automatic penalty if configured
      if (shouldBlock) {
        await this.applyAutomaticPenalty(userId, violationReport.id, highestSeverityViolation);
      }
    }

    const result: ModerationResult = {
      isViolation,
      violations,
      shouldBlock,
      recommendedAction,
      confidence,
      priority,
    };

    if (violationReportId) {
      result.violationReportId = violationReportId;
    }

    return result;
  }

  /**
   * Detect religious content (ZERO tolerance)
   */
  private detectReligiousContent(content: string): ViolationDetail | null {
    const detectedPatterns: string[] = [];
    const keywords: string[] = [];

    for (const pattern of this.RELIGIOUS_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        detectedPatterns.push(pattern.toString());
        keywords.push(...matches);
      }
    }

    if (keywords.length > 0) {
      return {
        type: 'religious',
        severity: 'critical', // Always critical for religious content
        confidence: 1.0, // Always 100% confidence for pattern matches
        detectedPatterns,
        keywords
      };
    }

    return null;
  }

  /**
   * Detect hate speech using Perspective API
   */
  private async detectHateSpeech(content: string): Promise<ViolationDetail | null> {
    try {
      // Check local patterns first
      const detectedPatterns: string[] = [];
      const keywords: string[] = [];

      for (const pattern of this.HATE_SPEECH_PATTERNS) {
        const matches = content.match(pattern);
        if (matches) {
          detectedPatterns.push(pattern.toString());
          keywords.push(...matches);
        }
      }

      if (keywords.length > 0) {
        return {
          type: 'hate_speech',
          severity: 'critical',
          confidence: 1.0,
          detectedPatterns,
          keywords
        };
      }

      // Use Perspective API for advanced detection
      const settings = await this.getModerationSettings();
      const response = await axios.post(
        `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${this.perspectiveApiKey}`,
        {
          comment: { text: content },
          requestedAttributes: {
            TOXICITY: {},
            SEVERE_TOXICITY: {},
            IDENTITY_ATTACK: {},
            INSULT: {},
            THREAT: {}
          }
        }
      );

      const scores = response.data.attributeScores;
      const toxicityScore = scores.TOXICITY?.summaryScore?.value || 0;
      const severeToxicityScore = scores.SEVERE_TOXICITY?.summaryScore?.value || 0;
      const identityAttackScore = scores.IDENTITY_ATTACK?.summaryScore?.value || 0;

      const maxScore = Math.max(toxicityScore, severeToxicityScore, identityAttackScore);

      if (maxScore > settings.hateSpeechThreshold) {
        return {
          type: 'hate_speech',
          severity: this.determineSeverity(maxScore),
          confidence: maxScore,
          detectedPatterns: ['perspective-api-detection'],
          keywords: []
        };
      }

      return null;
    } catch (error) {
      console.error('Error detecting hate speech:', error);
      return null;
    }
  }

  /**
   * Detect harassment using Perspective API
   */
  private async detectHarassment(content: string): Promise<ViolationDetail | null> {
    try {
      const settings = await this.getModerationSettings();
      const response = await axios.post(
        `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${this.perspectiveApiKey}`,
        {
          comment: { text: content },
          requestedAttributes: {
            INSULT: {},
            THREAT: {},
            PROFANITY: {}
          }
        }
      );

      const scores = response.data.attributeScores;
      const insultScore = scores.INSULT?.summaryScore?.value || 0;
      const threatScore = scores.THREAT?.summaryScore?.value || 0;
      const profanityScore = scores.PROFANITY?.summaryScore?.value || 0;

      const maxScore = Math.max(insultScore, threatScore, profanityScore);

      if (maxScore > settings.harassmentThreshold) {
        return {
          type: 'harassment',
          severity: this.determineSeverity(maxScore),
          confidence: maxScore,
          detectedPatterns: ['perspective-api-detection'],
          keywords: []
        };
      }

      return null;
    } catch (error) {
      console.error('Error detecting harassment:', error);
      return null;
    }
  }

  /**
   * Detect sexual content using Perspective API
   */
  private async detectSexualContent(content: string): Promise<ViolationDetail | null> {
    try {
      const settings = await this.getModerationSettings();
      const response = await axios.post(
        `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${this.perspectiveApiKey}`,
        {
          comment: { text: content },
          requestedAttributes: {
            SEXUALLY_EXPLICIT: {},
            FLIRTATION: {}
          }
        }
      );

      const scores = response.data.attributeScores;
      const sexualScore = scores.SEXUALLY_EXPLICIT?.summaryScore?.value || 0;

      if (sexualScore > settings.sexualContentThreshold) {
        return {
          type: 'sexual',
          severity: this.determineSeverity(sexualScore),
          confidence: sexualScore,
          detectedPatterns: ['perspective-api-detection'],
          keywords: []
        };
      }

      return null;
    } catch (error) {
      console.error('Error detecting sexual content:', error);
      return null;
    }
  }

  /**
   * Detect spam (simple heuristic-based detection)
   */
  private detectSpam(content: string): ViolationDetail | null {
    const spamIndicators = [
      /\b(click here|buy now|limited time|act now|free money|make money fast)\b/i,
      /\b(viagra|cialis|pharmacy|pills)\b/i,
      /http[s]?:\/\/[^\s]{3,}/g, // Multiple URLs
      /(.)\1{10,}/ // Repeated characters
    ];

    let spamScore = 0;
    const detectedPatterns: string[] = [];

    // Check URL count
    const urlMatches = content.match(/http[s]?:\/\/[^\s]+/g);
    if (urlMatches && urlMatches.length > 3) {
      spamScore += 0.3;
      detectedPatterns.push('multiple-urls');
    }

    // Check spam keywords
    for (const pattern of spamIndicators) {
      if (pattern.test(content)) {
        spamScore += 0.2;
        detectedPatterns.push(pattern.toString());
      }
    }

    // Check for excessive capitalization
    const capitalRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    if (capitalRatio > 0.5 && content.length > 20) {
      spamScore += 0.3;
      detectedPatterns.push('excessive-caps');
    }

    if (spamScore > 0.6) {
      return {
        type: 'spam',
        severity: this.determineSeverity(spamScore),
        confidence: Math.min(spamScore, 1.0),
        detectedPatterns,
        keywords: []
      };
    }

    return null;
  }

  /**
   * Calculate priority for manual review
   */
  calculatePriority(violations: ViolationDetail[], userReputation?: UserReputationData): number {
    if (violations.length === 0) return 0;

    let priority = 50; // Base priority

    // Increase priority based on severity
    const maxSeverity = violations.reduce((max, v) => 
      this.getSeverityLevel(v.severity) > max ? this.getSeverityLevel(v.severity) : max, 0
    );
    priority += maxSeverity * 10;

    // Increase priority based on confidence
    const avgConfidence = violations.reduce((sum, v) => sum + v.confidence, 0) / violations.length;
    priority += avgConfidence * 20;

    // Adjust based on user reputation
    if (userReputation) {
      if (userReputation.trustLevel === 'untrusted') {
        priority += 20;
      } else if (userReputation.trustLevel === 'low') {
        priority += 10;
      } else if (userReputation.trustLevel === 'high') {
        priority -= 10;
      }

      // Increase priority for repeat offenders
      if (userReputation.violationScore > 50) {
        priority += 15;
      }
    }

    // Religious content always gets highest priority
    if (violations.some(v => v.type === 'religious')) {
      priority = 100;
    }

    return Math.min(Math.max(priority, 0), 100);
  }

  /**
   * Apply automatic penalty based on violation
   */
  async applyAutomaticPenalty(
    userId: string, 
    violationReportId: string, 
    violation: ViolationDetail
  ): Promise<PenaltyResult> {
    const settings = await this.getModerationSettings();
    const userReputation = await this.getUserReputation(userId);

    // Calculate escalation level based on violation history
    const escalationLevel = this.calculateEscalationLevel(
      userReputation.totalViolations,
      settings
    );

    // Determine penalty type
    let penaltyType: 'shadow_ban' | 'outright_ban' | 'official_ban';
    let duration: number;

    if (violation.type === 'religious' || violation.severity === 'critical') {
      // Religious content or critical violations get immediate outright ban
      penaltyType = escalationLevel >= 3 ? 'official_ban' : 'outright_ban';
      duration = escalationLevel >= 3 ? settings.officialBanDuration : settings.outrightBanDuration;
    } else if (escalationLevel >= 3) {
      penaltyType = 'official_ban';
      duration = settings.officialBanDuration;
    } else if (escalationLevel >= 2) {
      penaltyType = 'outright_ban';
      duration = settings.outrightBanDuration;
    } else {
      penaltyType = 'shadow_ban';
      duration = settings.shadowBanDuration;
    }

    // Create penalty record
    const penalty = await this.prisma.userPenalty.create({
      data: {
        userId,
        violationReportId,
        penaltyType,
        severity: `level_${escalationLevel}`,
        duration,
        escalationLevel,
        isAutomatic: true,
        contentHidden: true,
        accountFrozen: penaltyType !== 'shadow_ban',
        ipBanned: penaltyType === 'official_ban',
        emailBanned: penaltyType === 'official_ban',
        endDate: duration > 0 
          ? new Date(Date.now() + duration * 60 * 60 * 1000) 
          : null,
        metadata: JSON.stringify({
          violationType: violation.type,
          violationSeverity: violation.severity,
          confidence: violation.confidence
        })
      }
    });

    // Recalculate user reputation
    await this.recalculateUserReputation(userId);

    return {
      penaltyId: penalty.id,
      penaltyType,
      duration,
      escalationLevel,
      reason: `Automatic penalty for ${violation.type} violation (${violation.severity})`
    };
  }

  /**
   * Recalculate user reputation based on violations and penalties
   */
  async recalculateUserReputation(userId: string): Promise<UserReputationData> {
    // Get all violations for user
    const violations = await this.prisma.violationReport.findMany({
      where: { userId, status: 'CONFIRMED' }
    });

    // Get all penalties for user
    const penalties = await this.prisma.userPenalty.findMany({
      where: { userId }
    });

    // Calculate violation counts by type
    const violationCounts = {
      religious: violations.filter(v => v.violationType === 'religious').length,
      hateSpeech: violations.filter(v => v.violationType === 'hate_speech').length,
      harassment: violations.filter(v => v.violationType === 'harassment').length,
      sexual: violations.filter(v => v.violationType === 'sexual').length,
      spam: violations.filter(v => v.violationType === 'spam').length
    };

    // Calculate penalty counts
    const penaltyCounts = {
      shadowBan: penalties.filter(p => p.penaltyType === 'shadow_ban').length,
      outrightBan: penalties.filter(p => p.penaltyType === 'outright_ban').length,
      officialBan: penalties.filter(p => p.penaltyType === 'official_ban').length,
      totalDays: penalties.reduce((sum, p) => sum + (p.duration / 24), 0)
    };

    // Calculate violation score (0-100, higher is worse)
    const violationScore = Math.min(
      violations.length * 5 + 
      violationCounts.religious * 20 + 
      violationCounts.hateSpeech * 15 +
      penaltyCounts.officialBan * 50 +
      penaltyCounts.outrightBan * 30 +
      penaltyCounts.shadowBan * 10,
      100
    );

    // Calculate overall score (100 - violation penalty)
    const overallScore = Math.max(100 - violationScore, 0);

    // Determine trust level
    let trustLevel = 'NORMAL';
    if (violationScore > 80 || penaltyCounts.officialBan > 0) {
      trustLevel = 'untrusted';
    } else if (violationScore > 50 || penaltyCounts.outrightBan > 0) {
      trustLevel = 'low';
    } else if (violationScore < 10 && violations.length === 0) {
      trustLevel = 'high';
    }

    // Get user's subscription tier for priority tier
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, subscriptionTier: true }
    });

    let priorityTier = 'FREE';
    if (user?.role === 'SUPER_ADMIN') {
      priorityTier = 'super_admin';
    } else if (user?.role === 'CONTENT_ADMIN' || user?.role === 'MARKETING_ADMIN' || user?.role === 'TECH_ADMIN') {
      priorityTier = 'admin';
    } else if (user?.subscriptionTier === 'PREMIUM') {
      priorityTier = 'premium';
    }

    // Calculate false positive count
    const falsePositives = await this.prisma.falsePositive.count({
      where: { userId }
    });

    // Get last violation date
    const lastViolation = violations.sort((a, b) => 
      b.createdAt.getTime() - a.createdAt.getTime()
    )[0];

    // Calculate consecutive clean days
    const consecutiveCleanDays = lastViolation 
      ? Math.floor((Date.now() - lastViolation.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Update or create reputation record
    const reputation = await this.prisma.userReputation.upsert({
      where: { userId },
      update: {
        overallScore,
        violationScore,
        totalViolations: violations.length,
        religiousViolations: violationCounts.religious,
        hateSpeechViolations: violationCounts.hateSpeech,
        harassmentViolations: violationCounts.harassment,
        sexualViolations: violationCounts.sexual,
        spamViolations: violationCounts.spam,
        shadowBanCount: penaltyCounts.shadowBan,
        outrightBanCount: penaltyCounts.outrightBan,
        officialBanCount: penaltyCounts.officialBan,
        totalPenaltyDays: Math.floor(penaltyCounts.totalDays),
        trustLevel,
        priorityTier,
        falsePositiveCount: falsePositives,
        lastViolationAt: lastViolation?.createdAt || null,
        consecutiveCleanDays
      },
      create: {
        userId,
        overallScore,
        violationScore,
        totalViolations: violations.length,
        religiousViolations: violationCounts.religious,
        hateSpeechViolations: violationCounts.hateSpeech,
        harassmentViolations: violationCounts.harassment,
        sexualViolations: violationCounts.sexual,
        spamViolations: violationCounts.spam,
        shadowBanCount: penaltyCounts.shadowBan,
        outrightBanCount: penaltyCounts.outrightBan,
        officialBanCount: penaltyCounts.officialBan,
        totalPenaltyDays: Math.floor(penaltyCounts.totalDays),
        trustLevel,
        priorityTier,
        falsePositiveCount: falsePositives,
        lastViolationAt: lastViolation?.createdAt || null,
        consecutiveCleanDays
      }
    });

    return {
      overallScore: reputation.overallScore,
      contentQualityScore: reputation.contentQualityScore,
      communityScore: reputation.communityScore,
      violationScore: reputation.violationScore,
      trustLevel: reputation.trustLevel,
      priorityTier: reputation.priorityTier,
      totalViolations: reputation.totalViolations
    };
  }

  /**
   * Get moderation settings from database or cache
   */
  async getModerationSettings(): Promise<any> {
    // Try cache first
    const cacheKey = 'moderation:settings';
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Get from database
    let settings = await this.prisma.moderationSettings.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    // Create default settings if none exist
    if (!settings) {
      settings = await this.prisma.moderationSettings.create({
        data: {}
      });
    }

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(settings));

    return settings;
  }

  /**
   * Update moderation settings
   */
  async updateModerationSettings(updates: Record<string, any>): Promise<void> {
    const settings = await this.getModerationSettings();

    await this.prisma.moderationSettings.update({
      where: { id: settings.id },
      data: updates
    });

    // Clear cache
    await this.redis.del('moderation:settings');
  }

  /**
   * Get moderation metrics for dashboard
   */
  async getModerationMetrics(timeRange?: { start: Date; end: Date }): Promise<ModerationMetrics> {
    const where = timeRange ? {
      createdAt: {
        gte: timeRange.start,
        lte: timeRange.end
      }
    } : {};

    // Get violation counts
    const violations = await this.prisma.violationReport.findMany({ where });
    
    const totalViolations = violations.length;
    const pendingReviews = violations.filter(v => v.status === 'PENDING').length;
    const confirmedViolations = violations.filter(v => v.status === 'CONFIRMED').length;
    
    // Get false positives
    const falsePositives = await this.prisma.falsePositive.count({
      where: timeRange ? {
        createdAt: {
          gte: timeRange.start,
          lte: timeRange.end
        }
      } : {}
    });

    // Get active penalties
    const activePenalties = await this.prisma.userPenalty.count({
      where: {
        isActive: true,
        endDate: { gt: new Date() }
      }
    });

    // Calculate violations by type
    const violationsByType: Record<string, number> = {};
    violations.forEach(v => {
      violationsByType[v.violationType] = (violationsByType[v.violationType] || 0) + 1;
    });

    // Calculate violations by severity
    const violationsBySeverity: Record<string, number> = {};
    violations.forEach(v => {
      violationsBySeverity[v.severity] = (violationsBySeverity[v.severity] || 0) + 1;
    });

    // Calculate average confidence
    const averageConfidence = violations.length > 0
      ? violations.reduce((sum, v) => sum + v.confidence, 0) / violations.length
      : 0;

    // Calculate false positive rate
    const falsePositiveRate = totalViolations > 0
      ? falsePositives / totalViolations
      : 0;

    return {
      totalViolations,
      pendingReviews,
      confirmedViolations,
      falsePositives,
      activePenalties,
      violationsByType,
      violationsBySeverity,
      averageConfidence,
      falsePositiveRate
    };
  }

  // Helper methods

  async getUserReputation(userId: string): Promise<UserReputationData> {
    const reputation = await this.prisma.userReputation.findUnique({
      where: { userId }
    });
    return this.mapReputationData(reputation);
  }

  /**
   * Map Prisma reputation record to UserReputationData
   */
  private mapReputationData(reputation: any): UserReputationData {
    if (!reputation) {
      // Return default reputation for new users
      return {
        overallScore: 100,
        contentQualityScore: 100,
        communityScore: 100,
        violationScore: 0,
        trustLevel: 'NORMAL',
        priorityTier: 'FREE',
        totalViolations: 0
      };
    }

    return {
      overallScore: reputation.overallScore,
      contentQualityScore: reputation.contentQualityScore,
      communityScore: reputation.communityScore,
      violationScore: reputation.violationScore,
      trustLevel: reputation.trustLevel,
      priorityTier: reputation.priorityTier,
      totalViolations: reputation.totalViolations
    };
  }

  private getSeverityLevel(severity: string): number {
    const levels: Record<string, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4
    };
    return levels[severity] || 0;
  }

  private determineSeverity(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 0.9) return 'critical';
    if (score >= 0.75) return 'high';
    if (score >= 0.5) return 'medium';
    return 'low';
  }

  private calculateEscalationLevel(totalViolations: number, settings: any): number {
    if (totalViolations >= settings.level3Threshold) return 3;
    if (totalViolations >= settings.level2Threshold) return 2;
    if (totalViolations >= settings.level1Threshold) return 1;
    return 1; // Default to level 1
  }

  /**
   * ========================================
   * AUTOMATIC PENALTY ENFORCEMENT SYSTEM
   * ========================================
   * Automatic escalation, shadow ban enforcement, IP/email banning
   */

  /**
   * Enforce shadow ban - hide content from other users
   */
  async enforceShadowBan(userId: string, penaltyId: string): Promise<void> {
    console.log(`👻 Enforcing shadow ban for user ${userId}`);

    try {
      // Hide all active articles
      await this.prisma.article.updateMany({
        where: {
          authorId: userId,
          status: { in: ['PUBLISHED', 'APPROVED'] }
        },
        data: {
          status: 'HIDDEN'
        }
      });

      // Mark user account with shadow ban metadata
      await this.redis.set(`user:${userId}:shadow_banned`, '1', 'EX', 60 * 60 * 24 * 30); // 30 days

      console.log(`✅ Shadow ban enforced for user ${userId}`);

    } catch (error) {
      console.error(`Failed to enforce shadow ban for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Enforce outright ban - freeze account and hide all content
   */
  async enforceOutrightBan(userId: string, penaltyId: string): Promise<void> {
    console.log(`🚫 Enforcing outright ban for user ${userId}`);

    try {
      // Update user status
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          status: 'SUSPENDED'
        }
      });

      // Hide all articles
      await this.prisma.article.updateMany({
        where: { authorId: userId },
        data: { status: 'HIDDEN' }
      });

      // Revoke all active sessions
      await this.prisma.session.deleteMany({
        where: { userId }
      });

      // Revoke refresh tokens
      await this.prisma.refreshToken.deleteMany({
        where: { userId }
      });

      // Mark in Redis
      await this.redis.set(`user:${userId}:banned`, '1', 'EX', 60 * 60 * 24 * 90); // 90 days

      console.log(`✅ Outright ban enforced for user ${userId}`);

    } catch (error) {
      console.error(`Failed to enforce outright ban for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Enforce official ban - permanent with IP/email tracking
   */
  async enforceOfficialBan(
    userId: string, 
    penaltyId: string,
    reason: string
  ): Promise<void> {
    console.log(`⛔ Enforcing official ban for user ${userId}`);

    try {
      // Get user details
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          username: true
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Get user's IP addresses from recent sessions
      const recentSessions = await this.prisma.session.findMany({
        where: { userId },
        select: { ipAddress: true },
        distinct: ['ipAddress'],
        take: 10
      });

      const ipAddresses = recentSessions
        .map(s => s.ipAddress)
        .filter(ip => ip !== null);

      // Store banned IPs in Redis
      for (const ip of ipAddresses) {
        if (ip) {
          await this.redis.set(`banned:ip:${ip}`, JSON.stringify({
            userId,
            username: user.username,
            reason,
            bannedAt: new Date().toISOString()
          }));
        }
      }

      // Store banned email in Redis
      await this.redis.set(`banned:email:${user.email}`, JSON.stringify({
        userId,
        username: user.username,
        reason,
        bannedAt: new Date().toISOString()
      }));

      // Update user account
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          status: 'BANNED',
          email: `banned_${userId}@deleted.local`,
          username: `banned_${userId}`
        }
      });

      // Hide all articles
      await this.prisma.article.updateMany({
        where: { authorId: userId },
        data: { status: 'HIDDEN' }
      });

      // Delete all sessions and tokens
      await Promise.all([
        this.prisma.session.deleteMany({ where: { userId } }),
        this.prisma.refreshToken.deleteMany({ where: { userId } }),
        this.prisma.aPIKey.deleteMany({ where: { userId } })
      ]);

      console.log(`✅ Official ban enforced for user ${userId} (${ipAddresses.length} IPs tracked)`);

    } catch (error) {
      console.error(`Failed to enforce official ban for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Automatically escalate penalty based on repeat offenses
   */
  async autoEscalatePenalty(userId: string): Promise<PenaltyResult | null> {
    console.log(`📈 Checking for auto-escalation for user ${userId}`);

    try {
      // Get user's penalty history
      const penalties = await this.prisma.userPenalty.findMany({
        where: {
          userId,
          isActive: true
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      if (penalties.length === 0) {
        return null;
      }

      // Count recent penalties (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentPenalties = penalties.filter(p => p.createdAt >= thirtyDaysAgo);

      // Escalation rules
      const shadowBanCount = recentPenalties.filter(p => p.penaltyType === 'shadow_ban').length;
      const outrightBanCount = recentPenalties.filter(p => p.penaltyType === 'outright_ban').length;

      let shouldEscalate = false;
      let newPenaltyType: 'shadow_ban' | 'outright_ban' | 'official_ban' = 'shadow_ban';
      let escalationReason = '';

      // Rule 1: 3+ shadow bans → outright ban
      if (shadowBanCount >= 3 && outrightBanCount === 0) {
        shouldEscalate = true;
        newPenaltyType = 'outright_ban';
        escalationReason = `Escalated from shadow ban (${shadowBanCount} violations in 30 days)`;
      }

      // Rule 2: 2+ outright bans → official ban
      if (outrightBanCount >= 2) {
        shouldEscalate = true;
        newPenaltyType = 'official_ban';
        escalationReason = `Escalated from outright ban (${outrightBanCount} violations in 30 days)`;
      }

      // Rule 3: Any religious content violation → immediate official ban
      const hasReligiousViolation = await this.prisma.violationReport.findFirst({
        where: {
          userId,
          violationType: 'religious',
          createdAt: { gte: thirtyDaysAgo }
        }
      });

      if (hasReligiousViolation) {
        shouldEscalate = true;
        newPenaltyType = 'official_ban';
        escalationReason = 'Religious content violation (ZERO tolerance policy)';
      }

      if (!shouldEscalate) {
        return null;
      }

      // Create escalated penalty
      const settings = await this.getModerationSettings();
      const duration = newPenaltyType === 'shadow_ban' 
        ? settings.shadowBanDuration 
        : newPenaltyType === 'outright_ban'
        ? settings.outrightBanDuration
        : settings.officialBanDuration;

      const escalatedPenalty = await this.prisma.userPenalty.create({
        data: {
          userId,
          violationReportId: '', // Will be linked to most recent violation
          penaltyType: newPenaltyType,
          severity: 'ESCALATED',
          duration,
          escalationLevel: newPenaltyType === 'official_ban' ? 3 : 2,
          isAutomatic: true,
          contentHidden: true,
          accountFrozen: newPenaltyType !== 'shadow_ban',
          ipBanned: newPenaltyType === 'official_ban',
          emailBanned: newPenaltyType === 'official_ban',
          endDate: duration > 0 
            ? new Date(Date.now() + duration * 60 * 60 * 1000) 
            : null,
          metadata: JSON.stringify({
            shadowBanCount,
            outrightBanCount,
            autoEscalated: true,
            escalationReason,
            escalationDate: new Date().toISOString()
          })
        }
      });

      // Enforce the penalty immediately
      switch (newPenaltyType) {
        case 'shadow_ban':
          await this.enforceShadowBan(userId, escalatedPenalty.id);
          break;
        case 'outright_ban':
          await this.enforceOutrightBan(userId, escalatedPenalty.id);
          break;
        case 'official_ban':
          await this.enforceOfficialBan(userId, escalatedPenalty.id, escalationReason);
          break;
      }

      // Recalculate reputation
      await this.recalculateUserReputation(userId);

      console.log(`✅ Auto-escalated penalty for user ${userId}: ${newPenaltyType}`);

      return {
        penaltyId: escalatedPenalty.id,
        penaltyType: newPenaltyType,
        duration,
        escalationLevel: escalatedPenalty.escalationLevel,
        reason: escalationReason
      };

    } catch (error) {
      console.error(`Failed to auto-escalate penalty for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Check if IP address is banned
   */
  async isIPBanned(ipAddress: string): Promise<boolean> {
    const banned = await this.redis.get(`banned:ip:${ipAddress}`);
    return banned !== null;
  }

  /**
   * Check if email is banned
   */
  async isEmailBanned(email: string): Promise<boolean> {
    const banned = await this.redis.get(`banned:email:${email}`);
    return banned !== null;
  }

  /**
   * ========================================
   * FALSE POSITIVE LEARNING SYSTEM
   * ========================================
   * AI retraining pipeline, confidence threshold adjustment, pattern whitelisting
   */

  /**
   * Record false positive for AI learning
   */
  async recordFalsePositive(
    violationReportId: string,
    adminId: string,
    reason: string
  ): Promise<void> {
    console.log(`📝 Recording false positive for violation ${violationReportId}`);

    try {
      // Get violation report
      const violation = await this.prisma.violationReport.findUnique({
        where: { id: violationReportId },
        include: { User: true }
      });

      if (!violation) {
        throw new Error('Violation report not found');
      }

      // Create false positive record
      await this.prisma.falsePositive.create({
        data: {
          violationReportId,
          userId: violation.userId,
          correctedBy: adminId,
          originalViolationType: violation.violationType,
          originalContent: violation.content,
          originalConfidence: violation.confidence,
          originalModel: violation.aiModel || 'unknown',
          correctionReason: reason,
          patterns: violation.detectedPatterns || '[]',
          trainingData: JSON.stringify({
            keywords: violation.keywords || '[]',
            context: violation.context
          })
        }
      });

      // Add to learning queue in Redis
      await this.redis.lpush('moderation:false_positives:queue', JSON.stringify({
        violationReportId,
        type: violation.violationType,
        patterns: violation.detectedPatterns,
        keywords: violation.keywords,
        confidence: violation.confidence,
        timestamp: new Date().toISOString()
      }));

      // Update violation status
      await this.prisma.violationReport.update({
        where: { id: violationReportId },
        data: {
          status: 'FALSE_POSITIVE'
        }
      });

      // Adjust confidence thresholds if needed
      await this.adjustConfidenceThresholds(violation.violationType);

      // Update user reputation (positive adjustment for false positive)
      await this.recalculateUserReputation(violation.userId);

      console.log(`✅ False positive recorded and queued for learning`);

    } catch (error) {
      console.error('Failed to record false positive:', error);
      throw error;
    }
  }

  /**
   * Adjust confidence thresholds based on false positive rate
   */
  private async adjustConfidenceThresholds(violationType: string): Promise<void> {
    try {
      // Get recent violations of this type
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const [totalViolations, falsePositives] = await Promise.all([
        this.prisma.violationReport.count({
          where: {
            violationType,
            createdAt: { gte: thirtyDaysAgo }
          }
        }),
        this.prisma.falsePositive.count({
          where: {
            originalViolationType: violationType,
            createdAt: { gte: thirtyDaysAgo }
          }
        })
      ]);

      if (totalViolations === 0) return;

      const falsePositiveRate = falsePositives / totalViolations;
      
      // If false positive rate > 10%, increase confidence threshold
      if (falsePositiveRate > 0.10) {
        const settings = await this.getModerationSettings();
        const thresholdKey = `${violationType}Threshold`;
        const currentThreshold = settings[thresholdKey] || 0.7;
        const newThreshold = Math.min(currentThreshold + 0.05, 0.95);

        await this.updateModerationSettings({
          [thresholdKey]: newThreshold
        });

        console.log(`📊 Adjusted ${violationType} threshold: ${currentThreshold} → ${newThreshold} (FP rate: ${(falsePositiveRate * 100).toFixed(1)}%)`);
      }

    } catch (error) {
      console.error('Failed to adjust confidence thresholds:', error);
    }
  }

  /**
   * Add pattern to whitelist (won't trigger violations)
   */
  async whitelistPattern(
    pattern: string,
    violationType: string,
    reason: string,
    adminId: string
  ): Promise<void> {
    console.log(`✅ Whitelisting pattern for ${violationType}: ${pattern}`);

    try {
      const whitelistKey = `moderation:whitelist:${violationType}`;
      
      // Add to Redis set
      await this.redis.sadd(whitelistKey, pattern);

      // Store in database for persistence
      await this.redis.lpush('moderation:whitelist:history', JSON.stringify({
        pattern,
        violationType,
        reason,
        adminId,
        timestamp: new Date().toISOString()
      }));

      console.log(`✅ Pattern whitelisted: ${pattern}`);

    } catch (error) {
      console.error('Failed to whitelist pattern:', error);
      throw error;
    }
  }

  /**
   * Check if content matches whitelisted patterns
   */
  async isWhitelisted(content: string, violationType: string): Promise<boolean> {
    try {
      const whitelistKey = `moderation:whitelist:${violationType}`;
      const patterns = await this.redis.smembers(whitelistKey);

      for (const pattern of patterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(content)) {
          return true;
        }
      }

      return false;

    } catch (error) {
      console.error('Failed to check whitelist:', error);
      return false;
    }
  }

  /**
   * Process false positive learning queue (run weekly)
   */
  async processFalsePositiveLearning(): Promise<{
    processed: number;
    patternsWhitelisted: number;
    thresholdsAdjusted: number;
  }> {
    console.log(`🧠 Processing false positive learning queue...`);

    try {
      const queueKey = 'moderation:false_positives:queue';
      const batchSize = 100;
      
      // Get batch from queue
      const batch = await this.redis.lrange(queueKey, 0, batchSize - 1);
      if (batch.length === 0) {
        console.log('📭 No false positives to process');
        return { processed: 0, patternsWhitelisted: 0, thresholdsAdjusted: 0 };
      }

      let patternsWhitelisted = 0;
      let thresholdsAdjusted = 0;

      // Analyze patterns
      const patternsByType: Record<string, string[]> = {};
      
      for (const item of batch) {
        const data = JSON.parse(item);
        if (!patternsByType[data.type]) {
          patternsByType[data.type] = [];
        }

        // Extract patterns that appear frequently in false positives
        const patterns = JSON.parse(data.patterns || '[]');
        patternsByType[data.type]!.push(...patterns);
      }

      // Whitelist frequently occurring patterns
      for (const [type, patterns] of Object.entries(patternsByType)) {
        const patternCounts: Record<string, number> = {};
        
        patterns.forEach(p => {
          patternCounts[p] = (patternCounts[p] || 0) + 1;
        });

        // Whitelist patterns that appear in >30% of false positives
        const threshold = patterns.length * 0.3;
        for (const [pattern, count] of Object.entries(patternCounts)) {
          if (count >= threshold) {
            await this.whitelistPattern(
              pattern,
              type,
              `Auto-whitelisted: appeared in ${count} false positives`,
              'SYSTEM'
            );
            patternsWhitelisted++;
          }
        }

        // Adjust thresholds
        await this.adjustConfidenceThresholds(type);
        thresholdsAdjusted++;
      }

      // Remove processed items from queue
      await this.redis.ltrim(queueKey, batchSize, -1);

      console.log(`✅ Learning complete: ${batch.length} processed, ${patternsWhitelisted} patterns whitelisted, ${thresholdsAdjusted} thresholds adjusted`);

      return {
        processed: batch.length,
        patternsWhitelisted,
        thresholdsAdjusted
      };

    } catch (error) {
      console.error('Failed to process false positive learning:', error);
      throw error;
    }
  }

  /**
   * Get false positive statistics
   */
  async getFalsePositiveStats(days: number = 30): Promise<{
    totalFalsePositives: number;
    byType: Record<string, number>;
    falsePositiveRate: number;
    averageConfidence: number;
    topPatterns: Array<{ pattern: string; count: number }>;
  }> {
    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [falsePositives, totalViolations] = await Promise.all([
        this.prisma.falsePositive.findMany({
          where: {
            createdAt: { gte: cutoffDate }
          },
          select: {
            originalViolationType: true,
            originalConfidence: true,
            patterns: true
          }
        }),
        this.prisma.violationReport.count({
          where: {
            createdAt: { gte: cutoffDate }
          }
        })
      ]);

      // Count by type
      const byType: Record<string, number> = {};
      let totalConfidence = 0;
      const patternCounts: Record<string, number> = {};

      falsePositives.forEach(fp => {
        byType[fp.originalViolationType] = (byType[fp.originalViolationType] || 0) + 1;
        totalConfidence += fp.originalConfidence;

        const patterns = JSON.parse(fp.patterns || '[]');
        patterns.forEach((p: string) => {
          patternCounts[p] = (patternCounts[p] || 0) + 1;
        });
      });

      // Get top patterns
      const topPatterns = Object.entries(patternCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([pattern, count]) => ({ pattern, count }));

      const falsePositiveRate = totalViolations > 0 
        ? falsePositives.length / totalViolations 
        : 0;

      const averageConfidence = falsePositives.length > 0
        ? totalConfidence / falsePositives.length
        : 0;

      return {
        totalFalsePositives: falsePositives.length,
        byType,
        falsePositiveRate,
        averageConfidence,
        topPatterns
      };

    } catch (error) {
      console.error('Failed to get false positive stats:', error);
      throw error;
    }
  }

  /**
   * ========================================
   * CONTENT PRIORITY HIERARCHY SYSTEM
   * ========================================
   * Tier 1: Super Admin (auto-approved, minimal checks)
   * Tier 2: Admin (light checks, fast-track approval)
   * Tier 3: Premium Users (by payment tier - highest to least)
   * Tier 4: Free Users (by account age - thorough moderation)
   */

  /**
   * Calculate user's priority tier based on role, subscription, and account age
   */
  async calculateUserPriorityTier(userId: string): Promise<PriorityTierInfo> {
    // Fetch user data with role, subscription and reputation
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        Subscription: {
          include: {
            SubscriptionPlan: true
          }
        },
        UserReputation: true
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    return this.calculateTierFromUserData(user);
  }

  /**
   * Internal method to calculate tier from pre-fetched user data
   */
  private calculateTierFromUserData(user: any): PriorityTierInfo {
    // Tier 1: Super Admin
    if (user.role === 'SUPER_ADMIN') {
      return {
        tier: 1,
        tierName: 'SUPER_ADMIN',
        priorityScore: 100,
        approvalSpeed: 'instant',
        moderationLevel: 'minimal',
        visibilityBoost: 50,
        autoApprove: true
      };
    }

    // Tier 2: Admin/Content Admin
    if (user.role === 'CONTENT_ADMIN' || user.role === 'MARKETING_ADMIN' || user.role === 'TECH_ADMIN') {
      return {
        tier: 2,
        tierName: 'ADMIN',
        priorityScore: 85,
        approvalSpeed: 'fast',
        moderationLevel: 'light',
        visibilityBoost: 30,
        autoApprove: true
      };
    }

    // Tier 3: Premium Users (by payment tier)
    // Use subscriptionTier field from User model
    const subscriptionTier = user.subscriptionTier;
    
    if (user.Subscription && user.Subscription.status === 'active' && subscriptionTier !== 'FREE') {
      let priorityScore = 70;
      let visibilityBoost = 20;

      // Subscription tiers: ENTERPRISE > PREMIUM
      if (subscriptionTier === 'ENTERPRISE') {
        priorityScore = 80;
        visibilityBoost = 25;
      } else if (subscriptionTier === 'PREMIUM') {
        priorityScore = 70;
        visibilityBoost = 20;
      }

      return {
        tier: 3,
        tierName: 'PREMIUM',
        priorityScore,
        approvalSpeed: 'normal',
        moderationLevel: 'standard',
        visibilityBoost,
        autoApprove: false
      };
    }

    // Tier 4: Free Users (by account age)
    const accountAgeInDays = Math.floor(
      (Date.now() - (user.createdAt instanceof Date ? user.createdAt.getTime() : new Date(user.createdAt).getTime())) / (1000 * 60 * 60 * 24)
    );

    let priorityScore = 30;
    let visibilityBoost = 0;

    // Account age bonuses
    if (accountAgeInDays >= 365) {
      priorityScore = 55; // 1+ years
      visibilityBoost = 10;
    } else if (accountAgeInDays >= 180) {
      priorityScore = 50; // 6+ months
      visibilityBoost = 8;
    } else if (accountAgeInDays >= 90) {
      priorityScore = 45; // 3+ months
      visibilityBoost = 5;
    } else if (accountAgeInDays >= 30) {
      priorityScore = 40; // 1+ month
      visibilityBoost = 3;
    } else if (accountAgeInDays >= 7) {
      priorityScore = 35; // 1+ week
      visibilityBoost = 1;
    }

    // Adjust for user reputation
    const reputation = this.mapReputationData(user.UserReputation);
    if (reputation.trustLevel === 'HIGH') {
      priorityScore += 10;
      visibilityBoost += 5;
    } else if (reputation.trustLevel === 'UNTRUSTED' || reputation.trustLevel === 'LOW') {
      priorityScore -= 15;
      visibilityBoost = 0;
    }

    return {
      tier: 4,
      tierName: 'FREE',
      priorityScore,
      approvalSpeed: 'thorough',
      moderationLevel: 'strict',
      visibilityBoost,
      autoApprove: false
    };
  }

  /**
   * Apply tier-based moderation adjustments
   */
  async applyTierBasedModeration(
    userId: string,
    moderationResult: ModerationResult
  ): Promise<ModerationResult> {
    const tierInfo = await this.calculateUserPriorityTier(userId);

    // Tier 1 & 2: Auto-approve unless critical violations
    if (tierInfo.autoApprove) {
      const hasCriticalViolation = moderationResult.violations.some(
        v => v.severity === 'critical' || v.type === 'religious'
      );

      if (!hasCriticalViolation) {
        return {
          ...moderationResult,
          shouldBlock: false,
          recommendedAction: 'APPROVE',
          priority: tierInfo.priorityScore
        };
      }
    }

    // Adjust priority based on tier
    const adjustedPriority = Math.floor(
      moderationResult.priority * 0.3 + tierInfo.priorityScore * 0.7
    );

    // Tier 3 & 4: Apply standard or strict moderation
    return {
      ...moderationResult,
      priority: adjustedPriority
    };
  }

  /**
   * Calculate dynamic approval timing based on tier
   */
  getApprovalTimingEstimate(tierInfo: PriorityTierInfo): {
    estimatedMinutes: number;
    description: string;
  } {
    switch (tierInfo.approvalSpeed) {
      case 'instant':
        return {
          estimatedMinutes: 0,
          description: 'Instant approval - content published immediately'
        };
      case 'fast':
        return {
          estimatedMinutes: 5,
          description: 'Fast-track review - typically within 5 minutes'
        };
      case 'normal':
        return {
          estimatedMinutes: 30,
          description: 'Standard review - typically within 30 minutes'
        };
      case 'thorough':
        return {
          estimatedMinutes: 120,
          description: 'Thorough review - may take up to 2 hours'
        };
      default:
        return {
          estimatedMinutes: 60,
          description: 'Review in progress'
        };
    }
  }

  /**
   * Calculate content visibility ranking based on tier
   */
  calculateVisibilityRanking(
    tierInfo: PriorityTierInfo,
    baseEngagementScore: number
  ): number {
    // Base engagement score (0-100) + tier visibility boost
    const boostedScore = baseEngagementScore + tierInfo.visibilityBoost;
    
    // Cap at 100
    return Math.min(boostedScore, 100);
  }

  /**
   * Get all users in a specific priority tier
   */
  async getUsersByPriorityTier(
    tierName: 'SUPER_ADMIN' | 'ADMIN' | 'PREMIUM' | 'FREE',
    limit: number = 100,
    offset: number = 0
  ): Promise<Array<{ userId: string; tierInfo: PriorityTierInfo }>> {
    let users;

    const include = {
      Subscription: {
        include: {
          SubscriptionPlan: true
        }
      },
      UserReputation: true
    };

    if (tierName === 'SUPER_ADMIN') {
      users = await this.prisma.user.findMany({
        where: { role: 'SUPER_ADMIN' },
        take: limit,
        skip: offset,
        include
      });
    } else if (tierName === 'ADMIN') {
      users = await this.prisma.user.findMany({
        where: { 
          role: { in: ['CONTENT_ADMIN', 'MARKETING_ADMIN', 'TECH_ADMIN'] }
        },
        take: limit,
        skip: offset,
        include
      });
    } else if (tierName === 'PREMIUM') {
      users = await this.prisma.user.findMany({
        where: {
          Subscription: {
            status: 'active'
          },
          subscriptionTier: { not: 'FREE' }
        },
        take: limit,
        skip: offset,
        include
      });
    } else {
      users = await this.prisma.user.findMany({
        where: {
          OR: [
            { Subscription: null },
            { 
              Subscription: { status: { not: 'active' } }
            },
            { subscriptionTier: 'FREE' }
          ],
          role: 'USER'
        },
        take: limit,
        skip: offset,
        include
      });
    }

    const usersWithTiers = users.map((user: any) => ({
      userId: user.id,
      tierInfo: this.calculateTierFromUserData(user)
    }));

    return usersWithTiers;
  }

  /**
   * Update user reputation and recalculate priority tier
   */
  async recalculatePriorityTier(userId: string): Promise<PriorityTierInfo> {
    const tierInfo = await this.calculateUserPriorityTier(userId);

    // Update user reputation with new tier
    await this.prisma.userReputation.upsert({
      where: { userId },
      update: {
        priorityTier: tierInfo.tierName,
        updatedAt: new Date()
      },
      create: {
        userId,
        overallScore: 100,
        contentQualityScore: 100,
        communityScore: 100,
        violationScore: 0,
        trustLevel: 'NORMAL',
        priorityTier: tierInfo.tierName
      }
    });

    return tierInfo;
  }

  /**
   * Get moderation queue with filtering and pagination
   */
  async getModerationQueue(filters?: {
    status?: string;
    priority?: number;
    assignedTo?: string;
    contentType?: string;
  }, pagination?: { page: number; limit: number }): Promise<any> {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.priority) where.priority = filters.priority;
    if (filters?.assignedTo) where.assignedTo = filters.assignedTo;
    if (filters?.contentType) where.contentType = filters.contentType;

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.moderationQueue.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' }
        ]
      }),
      this.prisma.moderationQueue.count({ where })
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Confirm a violation and apply penalty
   */
  async confirmViolation(violationReportId: string, adminId: string): Promise<void> {
    const violation = await this.prisma.violationReport.findUnique({
      where: { id: violationReportId }
    });

    if (!violation) {
      throw new Error('Violation report not found');
    }

    // Apply penalty based on violation
    const violationDetail: ViolationDetail = {
      type: violation.violationType as ViolationType,
      severity: violation.severity as SeverityLevel,
      confidence: violation.confidence
    };
    await this.applyAutomaticPenalty(violation.userId, violationReportId, violationDetail);

    // Record admin action
    await this.prisma.adminAction.create({
      data: {
        actionType: 'confirm_violation',
        targetType: 'violation',
        targetId: violationReportId,
        adminId,
        adminRole: 'ADMIN',
        reason: 'Manual confirmation of AI-detected violation'
      }
    });
  }

  /**
   * Mark a violation as false positive
   */
  async markFalsePositive(violationReportId: string, adminId: string, reason: string): Promise<void> {
    await this.recordFalsePositive(violationReportId, adminId, reason);

    // Record admin action
    await this.prisma.adminAction.create({
      data: {
        actionType: 'mark_false_positive',
        targetType: 'violation',
        targetId: violationReportId,
        adminId,
        adminRole: 'ADMIN',
        reason
      }
    });
  }

  /**
   * Apply penalty to a user
   */
  async applyPenalty(userId: string, penaltyData: {
    violationReportId: string;
    penaltyType: string;
    duration: number;
    severity: string;
    reason: string;
    appliedBy: string;
  }): Promise<PenaltyResult> {
    const penalty = await this.prisma.userPenalty.create({
      data: {
        userId,
        violationReportId: penaltyData.violationReportId,
        penaltyType: penaltyData.penaltyType,
        severity: penaltyData.severity,
        duration: penaltyData.duration,
        appliedBy: penaltyData.appliedBy,
        notes: penaltyData.reason,
        escalationLevel: 1,
        isAutomatic: false
      }
    });

    // Apply the appropriate ban
    if (penaltyData.penaltyType === 'shadow_ban') {
      await this.enforceShadowBan(userId, penalty.id);
    } else if (penaltyData.penaltyType === 'outright_ban') {
      await this.enforceOutrightBan(userId, penalty.id);
    } else if (penaltyData.penaltyType === 'official_ban') {
      await this.enforceOfficialBan(userId, penalty.id, penaltyData.reason || 'Official ban enforced');
    }

    return {
      penaltyId: penalty.id,
      penaltyType: penalty.penaltyType as any,
      duration: penalty.duration,
      escalationLevel: penalty.escalationLevel,
      reason: penaltyData.reason
    };
  }

  /**
   * Get user violation history
   */
  async getUserViolationHistory(userId: string, options?: {
    includeResolved?: boolean;
    limit?: number;
  }): Promise<any> {
    const where: any = { userId };
    if (!options?.includeResolved) {
      where.status = { not: 'RESOLVED' };
    }

    const violations = await this.prisma.violationReport.findMany({
      where,
      take: options?.limit || 50,
      orderBy: { createdAt: 'desc' },
      include: {
        UserPenalty: true
      }
    });

    return violations;
  }

  /**
   * Get moderation stats for dashboard
   */
  async getModerationStats(timeRange?: { start: Date; end: Date }): Promise<any> {
    const where: any = {};
    if (timeRange) {
      where.createdAt = {
        gte: timeRange.start,
        lte: timeRange.end
      };
    }

    const [totalQueue, pendingQueue, inReview, totalViolations, falsePositives] = await Promise.all([
      this.prisma.moderationQueue.count(),
      this.prisma.moderationQueue.count({ where: { status: 'PENDING' } }),
      this.prisma.moderationQueue.count({ where: { status: 'IN_REVIEW' } }),
      this.prisma.violationReport.count({ where }),
      this.prisma.falsePositive.count({ where })
    ]);

    return {
      queue: {
        total: totalQueue,
        pending: pendingQueue,
        inReview
      },
      violations: {
        total: totalViolations
      },
      falsePositives: {
        total: falsePositives
      }
    };
  }

  // Additional methods needed by resolvers
  async getDailyTrends(): Promise<any> {
    return { violationsByType: {}, violationsBySeverity: {}, totalViolations: 0 };
  }

  async getWeeklyTrends(): Promise<any> {
    return { violationsByType: {}, violationsBySeverity: {}, totalViolations: 0 };
  }

  async getMonthlyTrends(): Promise<any> {
    return { violationsByType: {}, violationsBySeverity: {}, totalViolations: 0 };
  }

  async getUserViolations(userId: string): Promise<any[]> {
    return await this.prisma.violationReport.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // Additional methods needed by integrations
  async startBackgroundMonitoring(): Promise<void> {
    if (this.monitoringInterval) {
      console.log('Background monitoring is already running');
      return;
    }

    // Run weekly as per processFalsePositiveLearning comment, or daily for more responsiveness
    // 24 hours = 24 * 60 * 60 * 1000 ms
    const INTERVAL_MS = 24 * 60 * 60 * 1000;

    this.monitoringInterval = setInterval(() => {
      this.processFalsePositiveLearning().catch(err => {
        console.error('Error in background monitoring (processFalsePositiveLearning):', err);
      });
    }, INTERVAL_MS);

    console.log('Background monitoring started');
  }

  async stopBackgroundMonitoring(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      console.log('Background monitoring stopped');
    } else {
      console.log('Background monitoring is not running');
    }
  }

  async initializeUserReputation(userId: string): Promise<any> {
    // Create initial reputation record
    return await this.prisma.userReputation.upsert({
      where: { userId },
      create: {
        userId,
        overallScore: 50,
        contentQualityScore: 50,
        communityScore: 50,
        violationScore: 0,
        trustLevel: 'normal',
        priorityTier: 'FREE',
      },
      update: {},
    });
  }
}


export default AIModerationService;
