/**
 * Utility functions for data normalization and field name conversion
 */
class Utils {
  /**
   * Convert string to snake_case
   * @param {string} str - Input string
   * @returns {string} snake_case string
   */
  static toSnakeCase(str) {
    if (!str || typeof str !== 'string') return str;
    
    return str
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
      .replace(/__+/g, '_')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Convert string to camelCase
   * @param {string} str - Input string
   * @returns {string} camelCase string
   */
  static toCamelCase(str) {
    if (!str || typeof str !== 'string') return str;
    
    return str
      .replace(/_([a-z])/g, (match, letter) => letter.toUpperCase())
      .replace(/^[A-Z]/, (match) => match.toLowerCase());
  }

  /**
   * Normalize field names to standard snake_case format
   * @param {string} fieldName - Original field name
   * @returns {string} Normalized field name
   */
  static normalizeFieldName(fieldName) {
    if (!fieldName || typeof fieldName !== 'string') return fieldName;
    
    let normalized = this.toSnakeCase(fieldName);
    
    // Handle common field mappings and special cases
    const fieldMappings = {
      'timestamp': '@timestamp',
      'request_id': 'request_id',
      'client_ip': 'client_ip',
      'user_agent': 'user_agent',
      'response_size': 'response_size',
      'status_code': 'status_code',
      'log_level': 'log_level',
      'thread_name': 'thread_name',
      'class_name': 'class_name',
      'node_id': 'node_id',
      'service_name': 'service_name',
      'bundle_id': 'bundle_id',
      'raw_message': 'raw_message',
      'message': 'message',
      'action': 'action',
      'user': 'user',
      'details': 'details',
      'service_code': 'service_code',
      'method': 'method',
      'path': 'path',
      'duration': 'duration',
      'line_length': 'line_length'
    };
    
    return fieldMappings[normalized] || normalized;
  }

  /**
   * Sanitize values to prevent Elasticsearch indexing issues
   * @param {any} value - Input value
   * @returns {any} Sanitized value
   */
  static sanitizeValue(value) {
    if (value === null || value === undefined) return null;
    
    if (typeof value === 'string') {
      // Remove special characters that might cause issues
      return value
        .replace(/[\r\n\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    if (typeof value === 'number') {
      // Handle NaN and Infinity
      if (isNaN(value) || !isFinite(value)) return 0;
      return value;
    }
    
    if (typeof value === 'boolean') {
      return value;
    }
    
    if (value instanceof Date) {
      return value;
    }
    
    if (typeof value === 'object') {
      return value;
    }
    
    return value;
  }

  /**
   * Extract numeric value from string or number
   * @param {any} value - Input value
   * @returns {number} Numeric value
   */
  static extractNumericValue(value) {
    if (typeof value === 'number') {
      return isNaN(value) || !isFinite(value) ? 0 : value;
    }
    
    if (typeof value === 'string') {
      const num = parseInt(value, 10);
      return isNaN(num) ? 0 : num;
    }
    
    return 0;
  }

  /**
   * Extract floating point value from string or number
   * @param {any} value - Input value
   * @returns {number} Floating point value
   */
  static extractFloatValue(value) {
    if (typeof value === 'number') {
      return isNaN(value) || !isFinite(value) ? 0.0 : value;
    }
    
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? 0.0 : num;
    }
    
    return 0.0;
  }

  /**
   * Check if a string looks like a timestamp
   * @param {string} value - Input string
   * @returns {boolean} True if looks like timestamp
   */
  static isTimestamp(value) {
    if (!value || typeof value !== 'string') return false;
    
    // Check for ISO 8601 format
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) ||
           /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(value);
  }

  /**
   * Check if a value looks like an HTTP status code
   * @param {any} value - Input value
   * @returns {boolean} True if looks like status code
   */
  static isStatusCode(value) {
    const num = this.extractNumericValue(value);
    return num >= 100 && num <= 599;
  }

  /**
   * Check if a value looks like an HTTP method
   * @param {string} value - Input string
   * @returns {boolean} True if looks like HTTP method
   */
  static isHttpMethod(value) {
    if (!value || typeof value !== 'string') return false;
    
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'TRACE'];
    return methods.includes(value.toUpperCase());
  }

  /**
   * Check if a value looks like a file path
   * @param {string} value - Input string
   * @returns {boolean} True if looks like file path
   */
  static isFilePath(value) {
    if (!value || typeof value !== 'string') return false;
    
    return value.startsWith('/') || value.includes('\\') || value.includes('.');
  }

  /**
   * Parse timestamp string to Date object
   * @param {string} value - Timestamp string
   * @returns {Date} Date object
   */
  static parseTimestamp(value) {
    if (!value) return new Date();
    
    try {
      // Handle various timestamp formats
      let dateStr = value;
      
      // Remove 'Z' and add timezone if missing
      if (dateStr.endsWith('Z')) {
        dateStr = dateStr.slice(0, -1) + '+00:00';
      }
      
      const date = new Date(dateStr);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return new Date();
      }
      
      return date;
    } catch (error) {
      console.warn(`Failed to parse timestamp: ${value}`, error.message);
      return new Date();
    }
  }

  /**
   * Extract node ID from various log formats
   * @param {string} text - Input text
   * @returns {string} Node ID or 'unknown'
   */
  static extractNodeId(text) {
    if (!text || typeof text !== 'string') return 'unknown';
    
    // Look for common node ID patterns
    const patterns = [
      /u999jfart002d\.in\.bundesbank\.de/,
      /node[_-]?(\w+)/i,
      /host[_-]?(\w+)/i,
      /server[_-]?(\w+)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0];
      }
    }
    
    return 'unknown';
  }

  /**
   * Deep clone an object
   * @param {any} obj - Input object
   * @returns {any} Cloned object
   */
  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));
    if (typeof obj === 'object') {
      const cloned = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = this.deepClone(obj[key]);
        }
      }
      return cloned;
    }
    return obj;
  }

  /**
   * Merge two objects deeply
   * @param {object} target - Target object
   * @param {object} source - Source object
   * @returns {object} Merged object
   */
  static deepMerge(target, source) {
    const result = this.deepClone(target);
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }
}

module.exports = { Utils };
