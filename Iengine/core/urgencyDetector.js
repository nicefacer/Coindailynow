"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UrgencyDetector = void 0;
const urgencyTriggers_json_1 = __importDefault(require("../data/urgencyTriggers.json"));
class UrgencyDetector {
    detect(text) {
        for (const level of ['critical', 'high', 'medium', 'low']) {
            const triggers = urgencyTriggers_json_1.default[level];
            if (triggers) {
                for (const kw of triggers) {
                    if (text.includes(kw))
                        return level;
                }
            }
        }
        return 'medium';
    }
}
exports.UrgencyDetector = UrgencyDetector;
exports.default = UrgencyDetector;
//# sourceMappingURL=urgencyDetector.js.map