/**
 * Generic Log Parser for Support Bundle Logs
 * Automatically detects and parses different log formats
 */
const { Utils } = require('./utils');

class LogParser {
  constructor(logType) {
    this.logType = logType;
    this.parsers = {
      'requests': this.parseRequestLog.bind(this),
      'service': this.parseServiceLog.bind(this),
      'audit': this.parseAuditLog.bind(this),
      'access': this.parseAccessLog.bind(this),
      'security': this.parseSecurityLog.bind(this),
      'generic': this.parseGenericLog.bind(this)
    };
  }

  /**
   * Main parse method that routes to appropriate parser
   * @param {string} line - Log line to parse
   * @param {string} serviceName - Service name
   * @param {string} bundleId - Bundle ID
   * @returns {object|null} Parsed log document
   */
  parse(line, serviceName, bundleId) {
    if (!line || typeof line !== 'string') return null;
    
    const parser = this.parsers[this.logType] || this.parsers['generic'];
    return parser(line, serviceName, bundleId);
  }

  /**
   * Parse request logs (pipe-delimited format)
   * @param {string} line - Log line
   * @param {string} serviceName - Service name
   * @param {string} bundleId - Bundle ID
   * @returns {object|null} Parsed document
   */
  parseRequestLog(line, serviceName, bundleId) {
    // Auto-detect delimiter (pipe, comma, tab, space)
    const delimiters = ['|', ',', '\t'];
    let fields = [];
    let delimiter = '|';
    
    for (const delim of delimiters) {
      const testFields = line.split(delim);
      if (testFields.length >= 5) {
        fields = testFields;
        delimiter = delim;
        break;
      }
    }
    
    if (fields.length < 5) return null;

    // Auto-detect field positions based on content
    const timestampIndex = this.findTimestampIndex(fields);
    const statusIndex = this.findStatusIndex(fields);
    const methodIndex = this.findMethodIndex(fields);
    const pathIndex = this.findPathIndex(fields);
    
    const doc = {
      '@timestamp': Utils.parseTimestamp(fields[timestampIndex]),
      'bundle_id': bundleId,
      'service_name': serviceName,
      'log_type': 'request',
      'delimiter_used': delimiter
    };
    
    // Dynamically map fields
    if (fields[timestampIndex + 1]) doc.request_id = Utils.sanitizeValue(fields[timestampIndex + 1]);
    if (fields[timestampIndex + 2]) doc.client_ip = Utils.sanitizeValue(fields[timestampIndex + 2]);
    if (fields[timestampIndex + 3]) doc.user = Utils.sanitizeValue(fields[timestampIndex + 3]);
    if (methodIndex !== -1) doc.method = Utils.sanitizeValue(fields[methodIndex]);
    if (pathIndex !== -1) doc.path = Utils.sanitizeValue(fields[pathIndex]);
    if (statusIndex !== -1) doc.status_code = Utils.extractNumericValue(fields[statusIndex]);
    
    // Add remaining fields dynamically
    fields.forEach((field, index) => {
      if (index !== timestampIndex && index !== statusIndex && index !== methodIndex && index !== pathIndex) {
        const fieldName = `field_${index}`;
        doc[fieldName] = Utils.sanitizeValue(field);
      }
    });
    
    return doc;
  }

  /**
   * Parse service logs (structured format)
   * @param {string} line - Log line
   * @param {string} serviceName - Service name
   * @param {string} bundleId - Bundle ID
   * @returns {object|null} Parsed document
   */
  parseServiceLog(line, serviceName, bundleId) {
    // Generic service log parser - multiple patterns
    const patterns = [
      // Standard format: timestamp [service] [level] [request_id] [class:line] [thread] - message
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+-\s+(.*)$/,
      // Alternative format: timestamp [service] [level] message
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)$/,
      // Simple format: timestamp level message
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+(\w+)\s+(.*)$/
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        if (match.length === 8) {
          // Full format
          return {
            '@timestamp': Utils.parseTimestamp(match[1]),
            'bundle_id': bundleId,
            'service_name': serviceName,
            'log_type': 'service',
            'service_code': Utils.sanitizeValue(match[2]),
            'log_level': Utils.sanitizeValue(match[3]),
            'request_id': Utils.sanitizeValue(match[4]),
            'class_name': Utils.sanitizeValue(match[5]),
            'thread_name': Utils.sanitizeValue(match[6]),
            'message': Utils.sanitizeValue(match[7])
          };
        } else if (match.length === 5) {
          // Alternative format
          return {
            '@timestamp': Utils.parseTimestamp(match[1]),
            'bundle_id': bundleId,
            'service_name': serviceName,
            'log_type': 'service',
            'service_code': Utils.sanitizeValue(match[2]),
            'log_level': Utils.sanitizeValue(match[3]),
            'message': Utils.sanitizeValue(match[4])
          };
        } else if (match.length === 4) {
          // Simple format
          return {
            '@timestamp': Utils.parseTimestamp(match[1]),
            'bundle_id': bundleId,
            'service_name': serviceName,
            'log_type': 'service',
            'log_level': Utils.sanitizeValue(match[2]),
            'message': Utils.sanitizeValue(match[3])
          };
        }
      }
    }
    
    return this.parseGenericLog(line, serviceName, bundleId);
  }

  /**
   * Parse audit logs
   * @param {string} line - Log line
   * @param {string} serviceName - Service name
   * @param {string} bundleId - Bundle ID
   * @returns {object|null} Parsed document
   */
  parseAuditLog(line, serviceName, bundleId) {
    const patterns = [
      // Standard audit format: timestamp [AUDIT] action details
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+\[AUDIT\]\s+(.*)$/,
      // Alternative audit format: timestamp AUDIT action details
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+AUDIT\s+(.*)$/
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        return {
          '@timestamp': Utils.parseTimestamp(match[1]),
          'bundle_id': bundleId,
          'service_name': serviceName,
          'log_type': 'audit',
          'action': this.extractAuditAction(match[2]),
          'user': this.extractAuditUser(match[2]),
          'details': this.extractAuditDetails(match[2]),
          'raw_message': Utils.sanitizeValue(match[2])
        };
      }
    }
    
    return this.parseGenericLog(line, serviceName, bundleId);
  }

  /**
   * Parse access logs
   * @param {string} line - Log line
   * @param {string} serviceName - Service name
   * @param {string} bundleId - Bundle ID
   * @returns {object|null} Parsed document
   */
  parseAccessLog(line, serviceName, bundleId) {
    const patterns = [
      // Access log format: timestamp [request_id] [ACTION] details for client : user / ip [auth_method]
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*?)\s+for client\s*:\s*([^/]+)\s*\/\s*([^\s]+)\s*\[([^\]]+)\]$/,
      // Alternative format: timestamp [request_id] [ACTION] details
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)$/
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        if (match.length === 8) {
          return {
            '@timestamp': Utils.parseTimestamp(match[1]),
            'bundle_id': bundleId,
            'service_name': serviceName,
            'log_type': 'access',
            'request_id': Utils.sanitizeValue(match[2]),
            'action': Utils.sanitizeValue(match[3]),
            'details': Utils.sanitizeValue(match[4]),
            'user': Utils.sanitizeValue(match[5]),
            'client_ip': Utils.sanitizeValue(match[6]),
            'auth_method': Utils.sanitizeValue(match[7])
          };
        } else if (match.length === 5) {
          return {
            '@timestamp': Utils.parseTimestamp(match[1]),
            'bundle_id': bundleId,
            'service_name': serviceName,
            'log_type': 'access',
            'request_id': Utils.sanitizeValue(match[2]),
            'action': Utils.sanitizeValue(match[3]),
            'details': Utils.sanitizeValue(match[4])
          };
        }
      }
    }
    
    return this.parseGenericLog(line, serviceName, bundleId);
  }

  /**
   * Parse security logs
   * @param {string} line - Log line
   * @param {string} serviceName - Service name
   * @param {string} bundleId - Bundle ID
   * @returns {object|null} Parsed document
   */
  parseSecurityLog(line, serviceName, bundleId) {
    // Security logs often follow similar patterns to audit logs
    return this.parseAuditLog(line, serviceName, bundleId);
  }

  /**
   * Parse generic logs (fallback parser)
   * @param {string} line - Log line
   * @param {string} serviceName - Service name
   * @param {string} bundleId - Bundle ID
   * @returns {object} Parsed document
   */
  parseGenericLog(line, serviceName, bundleId) {
    // Try to extract timestamp from the beginning
    let timestamp = new Date();
    let message = line;
    
    const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
    if (timestampMatch) {
      timestamp = Utils.parseTimestamp(timestampMatch[1]);
      message = line.substring(timestampMatch[0].length).trim();
    }
    
    return {
      '@timestamp': timestamp,
      'bundle_id': bundleId,
      'service_name': serviceName,
      'log_type': 'generic',
      'raw_message': Utils.sanitizeValue(line),
      'message': Utils.sanitizeValue(message),
      'line_length': line.length,
      'has_timestamp': !!timestampMatch
    };
  }

  // Helper methods for field detection
  findTimestampIndex(fields) {
    for (let i = 0; i < fields.length; i++) {
      if (Utils.isTimestamp(fields[i])) return i;
    }
    return 0;
  }

  findStatusIndex(fields) {
    for (let i = 0; i < fields.length; i++) {
      if (Utils.isStatusCode(fields[i])) return i;
    }
    return -1;
  }

  findMethodIndex(fields) {
    for (let i = 0; i < fields.length; i++) {
      if (Utils.isHttpMethod(fields[i])) return i;
    }
    return -1;
  }

  findPathIndex(fields) {
    for (let i = 0; i < fields.length; i++) {
      if (Utils.isFilePath(fields[i])) return i;
    }
    return -1;
  }

  // Audit log specific helpers
  extractAuditAction(text) {
    if (!text || typeof text !== 'string') return 'unknown';
    
    const actions = [
      { pattern: /Token created/i, action: 'token_created' },
      { pattern: /Token revoked/i, action: 'token_revoked' },
      { pattern: /Login/i, action: 'login' },
      { pattern: /Logout/i, action: 'logout' },
      { pattern: /Access granted/i, action: 'access_granted' },
      { pattern: /Access denied/i, action: 'access_denied' },
      { pattern: /Authentication/i, action: 'authentication' },
      { pattern: /Authorization/i, action: 'authorization' }
    ];
    
    for (const { pattern, action } of actions) {
      if (pattern.test(text)) return action;
    }
    
    return 'unknown';
  }

  extractAuditUser(text) {
    if (!text || typeof text !== 'string') return 'unknown';
    
    const patterns = [
      /by '([^']+)'/,
      /user[:\s]+([^\s,]+)/i,
      /subject[:\s]+([^\s,]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return Utils.sanitizeValue(match[1]);
    }
    
    return 'unknown';
  }

  extractAuditDetails(text) {
    if (!text || typeof text !== 'string') return {};
    
    const details = {};
    
    // Extract common audit details
    const patterns = [
      { pattern: /tokenId='([^']+)'/, key: 'token_id' },
      { pattern: /issuer='([^']+)'/, key: 'issuer' },
      { pattern: /subject='([^']+)'/, key: 'subject' },
      { pattern: /expiry=(\d+)/, key: 'expiry' },
      { pattern: /refreshable=(\w+)/, key: 'refreshable' }
    ];
    
    for (const { pattern, key } of patterns) {
      const match = text.match(pattern);
      if (match) {
        details[key] = Utils.sanitizeValue(match[1]);
      }
    }
    
    return details;
  }
}

module.exports = { LogParser };
