/**
 * Utility function to fix common JSON formatting issues
 * This is a simple implementation that handles basic JSON repair
 */
export function fixJson(jsonString: string): string {
  if (!jsonString || typeof jsonString !== 'string') {
    return '{}';
  }

  try {
    // First try to parse as-is
    JSON.parse(jsonString);
    return jsonString;
  } catch (e) {
    // Try to fix common issues
    let fixed = jsonString.trim();
    
    // Remove trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // Fix unquoted keys
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
    
    // Fix single quotes to double quotes
    fixed = fixed.replace(/'/g, '"');
    
    // Try to parse again
    try {
      JSON.parse(fixed);
      return fixed;
    } catch (e2) {
      // If still can't parse, return empty object
      return '{}';
    }
  }
}