"use strict";
/**
 * ComfyUI JSON Injector
 * Dynamic workflow mutation engine.
 * Transforms scene data into executable ComfyUI workflows
 * by injecting prompts, parameters, seeds, and routing.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowInjector = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const WORKFLOW_DIR = path.join(__dirname, '..', 'workflows');
// Well-known ComfyUI node IDs for standard SDXL workflow
const NODE_IDS = {
    KSAMPLER: '3',
    POSITIVE_PROMPT: '6',
    NEGATIVE_PROMPT: '7',
    LATENT_IMAGE: '5',
    CHECKPOINT_LOADER: '4',
    VAE_DECODE: '8',
    SAVE_IMAGE: '9',
};
class WorkflowInjector {
    /**
     * Load a base workflow template and inject dynamic parameters.
     */
    inject(params) {
        let workflow;
        if (params.workflowJson) {
            workflow = JSON.parse(JSON.stringify(params.workflowJson));
        }
        else if (params.workflowPath) {
            const raw = fs.readFileSync(params.workflowPath, 'utf-8');
            workflow = JSON.parse(raw);
        }
        else {
            workflow = this.getDefaultWorkflow();
        }
        this.injectPrompts(workflow, params.positivePrompt, params.negativePrompt);
        this.injectSampler(workflow, params);
        this.injectDimensions(workflow, params.width, params.height);
        if (params.model) {
            this.injectModel(workflow, params.model);
        }
        if (params.loras && params.loras.length > 0) {
            this.injectLoras(workflow, params.loras);
        }
        return workflow;
    }
    /**
     * Build a workflow from a WorkflowConfig + prompts.
     */
    buildFromConfig(config, positivePrompt, negativePrompt, seed) {
        const workflowPath = this.resolveWorkflowPath(config.name);
        let baseWorkflow;
        if (workflowPath && fs.existsSync(workflowPath)) {
            baseWorkflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
        }
        return this.inject({
            workflowJson: baseWorkflow,
            positivePrompt,
            negativePrompt,
            width: config.width,
            height: config.height,
            steps: config.steps,
            cfg: config.cfg,
            seed: seed ?? Math.floor(Math.random() * 2147483647),
            sampler: config.sampler,
            scheduler: config.scheduler,
            model: config.model,
            loras: config.lora,
        });
    }
    injectPrompts(workflow, positive, negative) {
        if (workflow[NODE_IDS.POSITIVE_PROMPT]) {
            workflow[NODE_IDS.POSITIVE_PROMPT].inputs.text = positive;
        }
        if (workflow[NODE_IDS.NEGATIVE_PROMPT]) {
            workflow[NODE_IDS.NEGATIVE_PROMPT].inputs.text = negative;
        }
    }
    injectSampler(workflow, params) {
        const node = workflow[NODE_IDS.KSAMPLER];
        if (!node)
            return;
        node.inputs.steps = params.steps;
        node.inputs.cfg = params.cfg;
        node.inputs.seed = params.seed ?? Math.floor(Math.random() * 2147483647);
        if (params.sampler) {
            node.inputs.sampler_name = params.sampler;
        }
        if (params.scheduler) {
            node.inputs.scheduler = params.scheduler;
        }
    }
    injectDimensions(workflow, width, height) {
        const node = workflow[NODE_IDS.LATENT_IMAGE];
        if (!node)
            return;
        node.inputs.width = width;
        node.inputs.height = height;
    }
    injectModel(workflow, model) {
        const node = workflow[NODE_IDS.CHECKPOINT_LOADER];
        if (!node)
            return;
        node.inputs.ckpt_name = model;
    }
    injectLoras(workflow, loras) {
        // LoRA injection adds LoraLoader nodes between the checkpoint and KSampler
        // Each platform may have different node structures; this handles the common pattern
        for (let i = 0; i < loras.length; i++) {
            const loraNodeId = `lora_${i}`;
            workflow[loraNodeId] = {
                inputs: {
                    lora_name: loras[i],
                    strength_model: 0.8,
                    strength_clip: 0.8,
                    model: [i === 0 ? NODE_IDS.CHECKPOINT_LOADER : `lora_${i - 1}`, 0],
                    clip: [i === 0 ? NODE_IDS.CHECKPOINT_LOADER : `lora_${i - 1}`, 1],
                },
                class_type: 'LoraLoader',
                _meta: { title: `LoRA: ${loras[i]}` },
            };
        }
        if (loras.length > 0) {
            const lastLoraId = `lora_${loras.length - 1}`;
            if (workflow[NODE_IDS.POSITIVE_PROMPT]) {
                workflow[NODE_IDS.POSITIVE_PROMPT].inputs.clip = [lastLoraId, 1];
            }
            if (workflow[NODE_IDS.NEGATIVE_PROMPT]) {
                workflow[NODE_IDS.NEGATIVE_PROMPT].inputs.clip = [lastLoraId, 1];
            }
            if (workflow[NODE_IDS.KSAMPLER]) {
                workflow[NODE_IDS.KSAMPLER].inputs.model = [lastLoraId, 0];
            }
        }
    }
    resolveWorkflowPath(workflowName) {
        const dirMap = {
            'breaking-fast': 'breaking',
            'premium-cinematic': 'premium',
            'cybercrime-dark': 'cybercrime',
            afrofuturist: 'afrofuturism',
            'market-chart': 'market-analysis',
            'thumbnail-optimized': 'thumbnail',
            'social-crop': 'social-banner',
        };
        const dir = dirMap[workflowName] || workflowName;
        const filePath = path.join(WORKFLOW_DIR, dir, 'workflow.json');
        return filePath;
    }
    /**
     * Default SDXL workflow when no template is found.
     */
    getDefaultWorkflow() {
        return {
            [NODE_IDS.KSAMPLER]: {
                inputs: {
                    seed: 0,
                    steps: 30,
                    cfg: 7,
                    sampler_name: 'dpmpp_2m',
                    scheduler: 'karras',
                    denoise: 1,
                    model: [NODE_IDS.CHECKPOINT_LOADER, 0],
                    positive: [NODE_IDS.POSITIVE_PROMPT, 0],
                    negative: [NODE_IDS.NEGATIVE_PROMPT, 0],
                    latent_image: [NODE_IDS.LATENT_IMAGE, 0],
                },
                class_type: 'KSampler',
                _meta: { title: 'KSampler' },
            },
            [NODE_IDS.CHECKPOINT_LOADER]: {
                inputs: {
                    ckpt_name: 'juggernautxl_v9.safetensors',
                },
                class_type: 'CheckpointLoaderSimple',
                _meta: { title: 'Load Checkpoint' },
            },
            [NODE_IDS.LATENT_IMAGE]: {
                inputs: {
                    width: 1024,
                    height: 1024,
                    batch_size: 1,
                },
                class_type: 'EmptyLatentImage',
                _meta: { title: 'Empty Latent Image' },
            },
            [NODE_IDS.POSITIVE_PROMPT]: {
                inputs: {
                    text: '',
                    clip: [NODE_IDS.CHECKPOINT_LOADER, 1],
                },
                class_type: 'CLIPTextEncode',
                _meta: { title: 'Positive Prompt' },
            },
            [NODE_IDS.NEGATIVE_PROMPT]: {
                inputs: {
                    text: '',
                    clip: [NODE_IDS.CHECKPOINT_LOADER, 1],
                },
                class_type: 'CLIPTextEncode',
                _meta: { title: 'Negative Prompt' },
            },
            [NODE_IDS.VAE_DECODE]: {
                inputs: {
                    samples: [NODE_IDS.KSAMPLER, 0],
                    vae: [NODE_IDS.CHECKPOINT_LOADER, 2],
                },
                class_type: 'VAEDecode',
                _meta: { title: 'VAE Decode' },
            },
            [NODE_IDS.SAVE_IMAGE]: {
                inputs: {
                    filename_prefix: 'Iengine',
                    images: [NODE_IDS.VAE_DECODE, 0],
                },
                class_type: 'SaveImage',
                _meta: { title: 'Save Image' },
            },
        };
    }
}
exports.WorkflowInjector = WorkflowInjector;
exports.default = WorkflowInjector;
//# sourceMappingURL=injectWorkflow.js.map