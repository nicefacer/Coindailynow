/**
 * Iengine Type Definitions
 * AI Visual Journalism Intelligence Engine
 */
export type StoryType = 'breaking-news' | 'premium-feature' | 'market-analysis' | 'cybercrime' | 'regulation' | 'ai-future' | 'startup-vc' | 'afrofuturism' | 'thumbnail-fast' | 'social-banner';
export type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low';
export type RegionalProfile = 'global' | 'africa-west' | 'africa-east' | 'africa-south' | 'latam-brazil' | 'latam-spanish' | 'caribbean' | 'middle-east' | 'asia' | 'europe' | 'americas';
export type StyleProfile = 'crypto-core' | 'tradfi-institutional' | 'ai-futurism' | 'cybercrime-dark' | 'regulation-authority' | 'afrofuturism' | 'latam-frontier' | 'caribbean-digital' | 'crypto-tradfi-fusion' | 'startup-energy';
export interface CameraDirective {
    angle: string;
    lens: string;
    movement: string;
    depth: string;
}
export interface EnvironmentDirective {
    location: string;
    time: string;
    weather: string;
    architecture: string;
}
export interface SubjectDirective {
    type: string;
    importance: 'primary' | 'secondary' | 'background';
    position?: string;
}
export interface LightingDirective {
    primary: string;
    secondary?: string;
    ambient?: string;
    volumetric?: boolean;
}
export interface MotionDirective {
    type: string;
    intensity: 'subtle' | 'moderate' | 'dynamic' | 'extreme';
    direction?: string;
}
export interface CompositionDirective {
    rule: string;
    focal_point: string;
    balance: string;
    depth_layers?: number;
}
export interface ScenePlan {
    story_type: StoryType;
    urgency: UrgencyLevel;
    narrative: string;
    emotion: string;
    camera: CameraDirective;
    environment: EnvironmentDirective;
    subjects: SubjectDirective[];
    lighting: LightingDirective;
    motion: MotionDirective;
    symbolism: string[];
    composition: CompositionDirective;
    workflow: WorkflowType;
    style_profile: StyleProfile;
    regional_profile: RegionalProfile;
}
export interface NarrativeAnalysis {
    topic: string;
    category: string;
    story_type: StoryType;
    entities: string[];
    keywords: string[];
    sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
    geopolitical_tension: number;
    market_emotion: string;
    institutional_vs_retail: 'institutional' | 'retail' | 'mixed';
    urgency: UrgencyLevel;
    symbolic_archetypes: string[];
}
export interface EmotionAnalysis {
    primary_emotion: string;
    secondary_emotion?: string;
    intensity: number;
    valence: 'positive' | 'negative' | 'neutral' | 'mixed';
    visual_mood: string;
    color_temperature: 'warm' | 'cool' | 'neutral' | 'mixed';
}
export type WorkflowType = 'breaking-fast' | 'premium-cinematic' | 'cybercrime-dark' | 'afrofuturist' | 'market-chart' | 'thumbnail-optimized' | 'social-crop';
export interface WorkflowConfig {
    name: WorkflowType;
    model: string;
    steps: number;
    cfg: number;
    width: number;
    height: number;
    sampler: string;
    scheduler: string;
    use_controlnet: boolean;
    use_ipadapter: boolean;
    use_upscaler: boolean;
    lora?: string[];
    sla_seconds: number;
}
export interface GenerationRequest {
    id: string;
    articleId?: string;
    headline: string;
    excerpt?: string;
    category?: string;
    tags?: string[];
    region?: string;
    urgency?: UrgencyLevel;
    story_type?: StoryType;
    requested_by?: string;
    callback_url?: string;
    priority?: number;
    variants?: number;
    output_formats?: OutputFormat[];
}
export interface OutputFormat {
    type: 'hero' | 'thumbnail' | 'social-twitter' | 'social-telegram' | 'social-youtube' | 'mobile-card' | 'banner';
    width: number;
    height: number;
}
export interface GenerationResult {
    id: string;
    request_id: string;
    article_id?: string;
    scene_plan: ScenePlan;
    prompt: string;
    negative_prompt: string;
    workflow_used: WorkflowType;
    image_url: string;
    thumbnail_url?: string;
    cdn_urls: Record<string, string>;
    quality_scores: QualityScores;
    variants: ImageVariant[];
    metadata: GenerationMetadata;
    status: 'pending' | 'generating' | 'scoring' | 'approved' | 'rejected' | 'delivered';
    created_at: Date;
    completed_at?: Date;
}
export interface ImageVariant {
    format: string;
    width: number;
    height: number;
    url: string;
    size_bytes: number;
}
export interface GenerationMetadata {
    generation_time_ms: number;
    model_used: string;
    seed: number;
    steps: number;
    cfg: number;
    sampler: string;
    scheduler: string;
    loras?: string[];
    controlnet?: string;
}
export interface QualityScores {
    clip_score: number;
    aesthetic_score: number;
    artifact_score: number;
    brand_alignment: number;
    composition_score: number;
    technical_quality: number;
    overall_score: number;
    approved: boolean;
    rejection_reasons?: string[];
}
export interface TechnicalValidation {
    blur_detected: boolean;
    anatomy_valid: boolean;
    duplicate_objects: boolean;
    malformed_hands: boolean;
    text_artifacts: boolean;
    resolution_adequate: boolean;
}
export interface EditorialValidation {
    emotional_clarity: number;
    focal_hierarchy: number;
    brand_consistency: number;
    composition_balance: number;
    narrative_alignment: number;
}
export interface ThumbnailPlan {
    focal_subject: string;
    emotion: string;
    crop_focus: 'center' | 'left' | 'right' | 'top' | 'bottom';
    contrast: 'high' | 'medium' | 'low';
    mobile_visibility: boolean;
    platform_variants: PlatformCrop[];
}
export interface PlatformCrop {
    platform: 'twitter' | 'youtube' | 'telegram' | 'homepage' | 'mobile';
    width: number;
    height: number;
    crop_gravity: string;
}
export interface VisualBibleRule {
    category: string;
    objectives: string[];
    rules: string[];
    avoid: string[];
}
export interface ColorPalette {
    name: string;
    primary: string[];
    secondary: string[];
    accent?: string[];
}
export interface SymbolSet {
    category: string;
    symbols: string[];
    contexts: string[];
}
export type QueuePriority = 'breaking' | 'premium' | 'standard' | 'background';
export interface QueueJob {
    id: string;
    type: 'generate' | 'upscale' | 'thumbnail' | 'quality-check' | 'retry';
    priority: QueuePriority;
    data: GenerationRequest;
    scene_plan?: ScenePlan;
    prompt?: string;
    negative_prompt?: string;
    workflow?: WorkflowConfig;
    attempts: number;
    max_attempts: number;
    created_at: Date;
}
export interface WorkerStatus {
    id: string;
    gpu_id: number;
    status: 'idle' | 'busy' | 'error' | 'offline';
    current_job?: string;
    vram_used_mb?: number;
    vram_total_mb?: number;
    jobs_completed: number;
    uptime_seconds: number;
}
export interface ComfyUIWorkflow {
    [nodeId: string]: ComfyUINode;
}
export interface ComfyUINode {
    inputs: Record<string, any>;
    class_type: string;
    _meta?: {
        title: string;
    };
}
export interface ComfyUIPromptResponse {
    prompt_id: string;
    number: number;
    node_errors: Record<string, any>;
}
export interface ComfyUIProgress {
    prompt_id: string;
    node: string;
    value: number;
    max: number;
}
export type IengineEvent = 'generation:started' | 'generation:progress' | 'generation:completed' | 'generation:failed' | 'quality:scored' | 'quality:rejected' | 'thumbnail:generated' | 'delivery:completed' | 'worker:status';
export interface IengineEventPayload {
    event: IengineEvent;
    job_id: string;
    data: any;
    timestamp: Date;
}
//# sourceMappingURL=index.d.ts.map