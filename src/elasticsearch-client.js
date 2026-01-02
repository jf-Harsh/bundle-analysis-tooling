/**
 * Elasticsearch Client with Dynamic Mappings
 * Handles automatic field mapping and bulk indexing
 */
const { Client } = require('@elastic/elasticsearch');
const { Utils } = require('./utils');

class ElasticsearchClient {
  constructor(url = 'http://localhost:9200') {
    this.client = new Client({ node: url });
    this.bundleId = null;
    this.indexPrefix = 'support-bundle';
  }

  /**
   * Initialize Elasticsearch connection and create templates
   */
  async initialize() {
    try {
      // Test connection
      await this.client.ping();
      console.log('✅ Connected to Elasticsearch');
      
      // Create dynamic index template
      await this.createDynamicIndexTemplate();
      
      // Create index lifecycle policy for data retention
      await this.createIndexLifecyclePolicy();
      
    } catch (error) {
      throw new Error(`Failed to connect to Elasticsearch: ${error.message}`);
    }
  }

  /**
   * Create dynamic index template for automatic field mapping
   */
  async createDynamicIndexTemplate() {
    const template = {
      name: 'support-bundle-dynamic',
      index_patterns: ['support-bundle-*'],
      template: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
          'index.lifecycle.name': 'support-bundle-policy',
          'index.lifecycle.rollover_alias': 'support-bundle-alias'
        },
        mappings: {
          dynamic: true, // Allow dynamic field mapping
          properties: {
            '@timestamp': { 
              type: 'date',
              format: 'strict_date_optional_time||epoch_millis'
            },
            'bundle_id': { 
              type: 'keyword',
              index: true
            },
            'service_name': { 
              type: 'keyword',
              index: true
            },
            'log_type': { 
              type: 'keyword',
              index: true
            },
            'request_id': { 
              type: 'keyword',
              index: true
            },
            'client_ip': { 
              type: 'ip',
              index: true
            },
            'user': { 
              type: 'keyword',
              index: true
            },
            'method': { 
              type: 'keyword',
              index: true
            },
            'path': { 
              type: 'text',
              fields: { 
                keyword: { 
                  type: 'keyword',
                  ignore_above: 256
                } 
              }
            },
            'status_code': { 
              type: 'integer',
              index: true
            },
            'response_size': { 
              type: 'long',
              index: true
            },
            'duration': { 
              type: 'integer',
              index: true
            },
            'log_level': { 
              type: 'keyword',
              index: true
            },
            'thread_name': { 
              type: 'keyword',
              index: true
            },
            'class_name': { 
              type: 'keyword',
              index: true
            },
            'message': { 
              type: 'text',
              analyzer: 'standard'
            },
            'raw_message': { 
              type: 'text',
              analyzer: 'standard'
            },
            'action': { 
              type: 'keyword',
              index: true
            },
            'details': { 
              type: 'object',
              dynamic: true
            },
            'service_code': { 
              type: 'keyword',
              index: true
            },
            'node_id': { 
              type: 'keyword',
              index: true
            },
            'delimiter_used': { 
              type: 'keyword',
              index: false
            },
            'line_length': { 
              type: 'integer',
              index: false
            },
            'has_timestamp': { 
              type: 'boolean',
              index: false
            }
          }
        }
      }
    };

    try {
      await this.client.indices.putIndexTemplate({
        name: template.name,
        body: template
      });
      console.log('✅ Dynamic index template created');
    } catch (error) {
      console.warn('⚠️ Failed to create index template:', error.message);
    }
  }

  /**
   * Create index lifecycle policy for data retention
   */
  async createIndexLifecyclePolicy() {
    const policy = {
      policy: {
        phases: {
          hot: {
            actions: {
              rollover: {
                max_size: '10GB',
                max_age: '7d'
              }
            }
          },
          warm: {
            min_age: '7d',
            actions: {
              allocate: {
                number_of_replicas: 0
              }
            }
          },
          delete: {
            min_age: '30d'
          }
        }
      }
    };

    try {
      await this.client.ilm.putLifecycle({
        policy: 'support-bundle-policy',
        body: policy
      });
      console.log('✅ Index lifecycle policy created');
    } catch (error) {
      console.warn('⚠️ Failed to create lifecycle policy:', error.message);
    }
  }

  /**
   * Set bundle ID for indexing
   * @param {string} bundleId - Bundle ID
   */
  setBundleId(bundleId) {
    this.bundleId = bundleId;
  }

  /**
   * Bulk index documents to Elasticsearch
   * @param {string} indexType - Type of index (requests, service, audit, etc.)
   * @param {Array} documents - Array of documents to index
   */
  async bulkIndex(indexType, documents) {
    if (!documents || documents.length === 0) return;

    if (!this.bundleId) {
      throw new Error('Bundle ID not set. Call setBundleId() first.');
    }

    // Normalize field names to snake_case
    const normalizedDocs = documents.map(doc => this.normalizeDocument(doc));

    // Create index name
    const indexName = `${this.indexPrefix}-${this.bundleId}-${indexType}`;

    // Prepare bulk body
    const body = normalizedDocs.flatMap(doc => [
      { index: { _index: indexName } },
      doc
    ]);

    try {
      const response = await this.client.bulk({ 
        body,
        refresh: false // Don't refresh immediately for better performance
      });
      
      if (response.errors) {
        const failedItems = response.items.filter(item => item.index.error);
        console.warn(`⚠️ ${failedItems.length} documents failed to index:`, 
          failedItems.slice(0, 5).map(item => item.index.error.reason));
      }
      
      console.log(`📊 Indexed ${documents.length} documents to ${indexType}`);
      
    } catch (error) {
      console.error(`❌ Bulk index error for ${indexType}:`, error.message);
      throw error;
    }
  }

  /**
   * Normalize document field names to snake_case
   * @param {object} doc - Document to normalize
   * @returns {object} Normalized document
   */
  normalizeDocument(doc) {
    if (!doc || typeof doc !== 'object') return doc;
    
    const normalized = {};
    
    for (const [key, value] of Object.entries(doc)) {
      const normalizedKey = Utils.normalizeFieldName(key);
      normalized[normalizedKey] = Utils.sanitizeValue(value);
    }
    
    return normalized;
  }

  /**
   * Create index with specific settings
   * @param {string} indexName - Name of the index
   * @param {object} settings - Index settings
   */
  async createIndex(indexName, settings = {}) {
    try {
      const exists = await this.client.indices.exists({ index: indexName });
      if (!exists) {
        await this.client.indices.create({
          index: indexName,
          body: settings
        });
        console.log(`✅ Created index: ${indexName}`);
      }
    } catch (error) {
      console.error(`❌ Failed to create index ${indexName}:`, error.message);
      throw error;
    }
  }

  /**
   * Get index statistics
   * @param {string} indexPattern - Index pattern to get stats for
   * @returns {object} Index statistics
   */
  async getIndexStats(indexPattern) {
    try {
      const response = await this.client.indices.stats({
        index: indexPattern
      });
      return response.indices;
    } catch (error) {
      console.error(`❌ Failed to get index stats for ${indexPattern}:`, error.message);
      return {};
    }
  }

  /**
   * Search documents
   * @param {string} indexPattern - Index pattern to search
   * @param {object} query - Elasticsearch query
   * @returns {object} Search results
   */
  async search(indexPattern, query) {
    try {
      const response = await this.client.search({
        index: indexPattern,
        body: query
      });
      return response;
    } catch (error) {
      console.error(`❌ Search failed for ${indexPattern}:`, error.message);
      throw error;
    }
  }

  /**
   * Get cluster health
   * @returns {object} Cluster health information
   */
  async getClusterHealth() {
    try {
      const response = await this.client.cluster.health();
      return response;
    } catch (error) {
      console.error('❌ Failed to get cluster health:', error.message);
      return {};
    }
  }

  /**
   * Refresh indices to make documents searchable
   * @param {string} indexPattern - Index pattern to refresh
   */
  async refreshIndices(indexPattern) {
    try {
      await this.client.indices.refresh({ index: indexPattern });
      console.log(`✅ Refreshed indices: ${indexPattern}`);
    } catch (error) {
      console.warn(`⚠️ Failed to refresh indices ${indexPattern}:`, error.message);
    }
  }

  /**
   * Delete indices matching pattern
   * @param {string} indexPattern - Index pattern to delete
   */
  async deleteIndices(indexPattern) {
    try {
      await this.client.indices.delete({ index: indexPattern });
      console.log(`✅ Deleted indices: ${indexPattern}`);
    } catch (error) {
      console.warn(`⚠️ Failed to delete indices ${indexPattern}:`, error.message);
    }
  }

  /**
   * Get all indices matching pattern
   * @param {string} indexPattern - Index pattern
   * @returns {Array} List of index names
   */
  async getIndices(indexPattern) {
    try {
      const response = await this.client.cat.indices({
        index: indexPattern,
        format: 'json'
      });
      return response.map(index => index.index);
    } catch (error) {
      console.error(`❌ Failed to get indices for ${indexPattern}:`, error.message);
      return [];
    }
  }

  /**
   * Close the Elasticsearch client
   */
  async close() {
    try {
      await this.client.close();
      console.log('✅ Elasticsearch client closed');
    } catch (error) {
      console.warn('⚠️ Error closing Elasticsearch client:', error.message);
    }
  }
}

module.exports = { ElasticsearchClient };
