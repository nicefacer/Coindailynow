"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TopicClassifier = void 0;
const topicKeywords_json_1 = __importDefault(require("../data/topicKeywords.json"));
class TopicClassifier {
    classify(text) {
        let bestTopic = 'crypto';
        let bestScore = 0;
        for (const [topic, keywords] of Object.entries(topicKeywords_json_1.default)) {
            if (!Array.isArray(keywords))
                continue;
            let score = 0;
            for (const kw of keywords) {
                if (text.includes(kw))
                    score++;
            }
            if (score > bestScore) {
                bestScore = score;
                bestTopic = topic;
            }
        }
        return bestTopic;
    }
}
exports.TopicClassifier = TopicClassifier;
exports.default = TopicClassifier;
//# sourceMappingURL=topicClassifier.js.map