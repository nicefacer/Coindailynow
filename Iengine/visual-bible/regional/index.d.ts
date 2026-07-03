/**
 * Visual Bible — Regional Visual Identities
 * Defines location-specific visual languages for CoinDaily's coverage regions:
 * Africa, Latin America, Caribbean, and global markets.
 */
import { RegionalProfile } from '../../types';
export interface RegionalStyleProfile {
    id: RegionalProfile;
    name: string;
    palette: string[];
    mood: string[];
    architecture: string[];
    lighting: string[];
    symbols: string[];
    camera_notes: string[];
    environments: string[];
}
export declare const regionalProfiles: Record<string, RegionalStyleProfile>;
/**
 * Get regional profile by identifier or region detection.
 */
export declare function getRegionalProfile(region?: string): RegionalStyleProfile;
/**
 * Build regional environment instruction for prompt.
 */
export declare function buildRegionalInstruction(profile: RegionalStyleProfile): string;
export default regionalProfiles;
//# sourceMappingURL=index.d.ts.map