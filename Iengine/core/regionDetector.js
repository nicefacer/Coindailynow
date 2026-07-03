"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegionDetector = void 0;
const regionEntities_json_1 = __importDefault(require("../data/regionEntities.json"));
class RegionDetector {
    detect(text) {
        let bestRegion = 'global';
        let bestScore = 0;
        for (const [region, entities] of Object.entries(regionEntities_json_1.default)) {
            if (!Array.isArray(entities))
                continue;
            let score = 0;
            for (const kw of entities) {
                if (text.includes(kw))
                    score++;
            }
            if (score > bestScore) {
                bestScore = score;
                bestRegion = region;
            }
        }
        return bestRegion;
    }
}
exports.RegionDetector = RegionDetector;
exports.default = RegionDetector;
//# sourceMappingURL=regionDetector.js.map