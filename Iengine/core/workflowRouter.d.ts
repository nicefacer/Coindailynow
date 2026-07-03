/**
 * Workflow Router
 * Routes generation requests to the correct ComfyUI workflow
 * based on story type, urgency, and resource availability.
 */
import { WorkflowConfig, WorkflowType, StoryType, UrgencyLevel, ScenePlan } from '../types';
export declare const workflowConfigs: Record<WorkflowType, WorkflowConfig>;
export declare class WorkflowRouter {
    /**
     * Route a scene plan to the appropriate workflow config.
     */
    route(scene: ScenePlan): WorkflowConfig;
    /**
     * Route by story type directly (simpler path).
     */
    routeByStoryType(storyType: StoryType, urgency?: UrgencyLevel): WorkflowConfig;
    /**
     * Get all available workflow types.
     */
    getAvailableWorkflows(): WorkflowType[];
    /**
     * Get workflow config by name.
     */
    getWorkflow(name: WorkflowType): WorkflowConfig;
    /**
     * Apply urgency override to reduce generation time.
     */
    private applyUrgencyOverride;
}
export default WorkflowRouter;
//# sourceMappingURL=workflowRouter.d.ts.map