#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
// @ts-ignore
import PinterestScraper from './pinterest-scraper.js';

// Default configuration constants
const DEFAULT_SEARCH_LIMIT = 10;
const DEFAULT_SEARCH_KEYWORD = 'landscape';
const DEFAULT_HEADLESS_MODE = true;

/**
 * Pinterest MCP Server
 * Provides Pinterest image search functionality
 */
class PinterestMcpServer {
  private server: Server;
  private scraper: PinterestScraper;

  constructor() {
    // Initialize MCP server
    this.server = new Server(
      {
        name: 'pinterest-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize Pinterest scraper
    this.scraper = new PinterestScraper();
    
    // Set up tool handlers
    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    
    // Handle process termination signals
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    await this.server.close();
  }

  /**
   * Set up tool handlers
   */
  private setupToolHandlers(): void {
    // Handle tool list requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'pinterest_search',
          description: 'Search for images on Pinterest by keyword',
          inputSchema: {
            type: 'object',
            properties: {
              keyword: {
                type: 'string',
                description: 'Search keyword',
              },
              limit: {
                type: 'integer',
                description: `Number of images to return (default: ${DEFAULT_SEARCH_LIMIT})`,
                default: DEFAULT_SEARCH_LIMIT,
              },
              headless: {
                type: 'boolean',
                description: `Whether to use headless browser mode (default: ${DEFAULT_HEADLESS_MODE})`,
                default: DEFAULT_HEADLESS_MODE,
              },
            },
            required: ['keyword'],
          },
        },
        {
          name: 'pinterest_get_image_info',
          description: 'Get Pinterest image information',
          inputSchema: {
            type: 'object',
            properties: {
              image_url: {
                type: 'string',
                description: 'Image URL',
              },
            },
            required: ['image_url'],
          },
        }
      ]
    }));

    // Handle tool call requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      try {
        // 打印完整的请求对象，帮助调试
        console.error('Received request:', JSON.stringify(request, null, 2));
        console.error('Request params:', JSON.stringify(request.params, null, 2));
        
        switch (request.params.name) {
          case 'pinterest_search':
            return await this.handlePinterestSearch(request.params.args || request.params.arguments);
          case 'pinterest_get_image_info':
            return await this.handlePinterestGetImageInfo(request.params.args || request.params.arguments);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error: any) {
        console.error(`[Tool call error] ${request.params.name}:`, error);
        throw new McpError(
          ErrorCode.InternalError,
          `Tool call failed: ${error.message}`
        );
      }
    });
  }

  /**
   * Handle Pinterest search requests
   */
  private async handlePinterestSearch(args: any) {
    try {
      // Extract keyword and limits from input
      let keyword = '';
      let limit = DEFAULT_SEARCH_LIMIT;
      let headless = DEFAULT_HEADLESS_MODE;
      
      // Normalize args if it's a string with backticks
      if (typeof args === 'string') {
        // Replace backticks with double quotes
        args = args.replace(/`/g, '"');
        console.error('Normalized args string:', args);
      }
      
      // Handle different input types
      if (args) {
        if (typeof args === 'object') {
          // If object, try to get properties directly
          console.error('Args is object with keys:', Object.keys(args));
          
          // Check for keyword property
          if ('keyword' in args && typeof args.keyword === 'string') {
            keyword = args.keyword.trim();
            console.error('Found keyword in object:', keyword);
          } else if ('`keyword`' in args) {
            keyword = String(args['`keyword`']).trim();
            console.error('Found `keyword` in object:', keyword);
          }
          
          // Check for limit property
          if ('limit' in args && (typeof args.limit === 'number' || !isNaN(parseInt(String(args.limit))))) {
            limit = typeof args.limit === 'number' ? args.limit : parseInt(String(args.limit), 10);
            console.error('Found limit in object:', limit);
          } else if ('`limit`' in args) {
            const limitValue = args['`limit`'];
            limit = typeof limitValue === 'number' ? limitValue : parseInt(String(limitValue), 10);
            console.error('Found `limit` in object:', limit);
          }
          
          // Check for headless property
          if ('headless' in args && typeof args.headless === 'boolean') {
            headless = args.headless;
            console.error('Found headless in object:', headless);
          } else if ('`headless`' in args) {
            headless = Boolean(args['`headless`']);
            console.error('Found `headless` in object:', headless);
          }
        } else if (typeof args === 'string') {
          console.error('Args is string type, attempting to parse');
          
          // Try to parse as JSON
          try {
            // First try standard JSON parsing
            let parsed;
            try {
              parsed = JSON.parse(args);
              console.error('Successfully parsed as standard JSON');
            } catch (jsonError) {
              // If that fails, try to fix common JSON format issues
              console.error('Standard JSON parse failed, trying to fix format');
              
              // Replace single quotes with double quotes
              const fixedJson = args
                .replace(/'/g, '"')
                .replace(/(\w+):/g, '"$1":'); // Convert unquoted keys to quoted keys
              
              console.error('Attempting to parse fixed JSON:', fixedJson);
              parsed = JSON.parse(fixedJson);
              console.error('Successfully parsed fixed JSON');
            }
            
            // Extract values from parsed object
            if (parsed) {
              if (parsed.keyword && typeof parsed.keyword === 'string') {
                keyword = parsed.keyword.trim();
                console.error('Found keyword in parsed JSON:', keyword);
              }
              
              if (parsed.limit !== undefined) {
                if (typeof parsed.limit === 'number') {
                  limit = parsed.limit;
                } else if (typeof parsed.limit === 'string' && !isNaN(parseInt(parsed.limit))) {
                  limit = parseInt(parsed.limit, 10);
                }
                console.error('Found limit in parsed JSON:', limit);
              }
              
              if (parsed.headless !== undefined && typeof parsed.headless === 'boolean') {
                headless = parsed.headless;
                console.error('Found headless in parsed JSON:', headless);
              }
            }
          } catch (e) {
            console.error('All JSON parsing attempts failed, trying regex');
            
            // If can't parse as JSON, try to extract using regex
            const keywordMatch = args.match(/["`']?keyword["`']?\s*[:=]\s*["`']([^"`']+)["`']/i);
            if (keywordMatch && keywordMatch[1]) {
              keyword = keywordMatch[1].trim();
              console.error('Found keyword using regex:', keyword);
            }
            
            // Try to extract limit
            const limitMatch = args.match(/["`']?limit["`']?\s*[:=]\s*(\d+)/i);
            if (limitMatch && limitMatch[1]) {
              limit = parseInt(limitMatch[1], 10);
              console.error('Found limit using regex:', limit);
            }
          }
        }
      }
      
      // If keyword is empty, use default keyword
      if (!keyword) {
        keyword = DEFAULT_SEARCH_KEYWORD;
        console.error('No keyword provided, using default keyword:', keyword);
      }
      
      // Ensure limit is a positive number
      if (isNaN(limit) || limit <= 0) {
        limit = DEFAULT_SEARCH_LIMIT;
        console.error('Invalid limit, using default limit:', limit);
      }
      
      console.error('Final parameters - keyword:', keyword, 'limit:', limit, 'headless:', headless);
      
      // Execute search
      let results = [];
      try {
        results = await this.scraper.search(keyword, limit, headless);
      } catch (searchError) {
        console.error('Search error:', searchError);
        results = [];
      }
      
      // Ensure results is an array
      const validResults = Array.isArray(results) ? results : [];
      
      // Validate and fix image URLs
      for (const result of validResults) {
        if (result.image_url) {
          // Check if URL contains thumbnail markers
          const thumbnailPatterns = ['/60x60/', '/236x/', '/474x/', '/736x/'];
          let needsFix = false;
          
          // Check if matches any thumbnail pattern
          for (const pattern of thumbnailPatterns) {
            if (result.image_url.includes(pattern)) {
              needsFix = true;
              break;
            }
          }
          
          // Use regex to check more generic thumbnail formats
          if (!needsFix && result.image_url.match(/\/\d+x\d*\//)) {
            needsFix = true;
          }
          
          // If needs fixing, replace with original image URL
          if (needsFix) {
            console.error(`Fixing thumbnail URL: ${result.image_url}`);
            result.image_url = result.image_url.replace(/\/\d+x\d*\//, '/originals/');
            console.error(`Fixed URL: ${result.image_url}`);
          }
        }
      }
      
      // Return results in MCP protocol format
      const contentItems = [
        {
          type: 'text',
          text: `Found ${validResults.length} images related to "${keyword}" on Pinterest`
        }
      ];
      
      // Add a text content item for each image result
      validResults.forEach((result, index) => {
        contentItems.push({
          type: 'text',
          text: `Image ${index + 1}: ${result.title || 'No title'}`
        });
        
        // Add image link
        contentItems.push({
          type: 'text',
          text: `Link: ${result.image_url || 'No link'}`
        });
        
        // Add original page link (if available)
        if (result.link && result.link !== result.image_url) {
          contentItems.push({
            type: 'text',
            text: `Original page: ${result.link}`
          });
        }
        
        // Add separator (except for last result)
        if (index < validResults.length - 1) {
          contentItems.push({
            type: 'text',
            text: `---`
          });
        }
      });
      
      return {
        content: contentItems
      };
    } catch (error: any) {
      console.error('Pinterest search handling error:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error during search: ${error.message}`
          }
        ]
      };
    }
  }

  /**
   * Handle Pinterest get image info requests
   */
  private async handlePinterestGetImageInfo(args: any) {
    try {
      // Extract parameters
      const imageUrl = args.image_url;
      
      // Return image info
      return {
        content: [
          {
            type: 'text',
            text: `Pinterest Image Information`,
          },
          {
            type: 'text',
            text: JSON.stringify({
              image_url: imageUrl,
              source: 'Pinterest',
              timestamp: new Date().toISOString(),
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      console.error('Error getting Pinterest image info:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error getting image info: ${error.message}`,
          },
        ],
      };
    }
  }

  /**
   * Run the server
   */
  async run(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('Pinterest MCP server running via stdio');
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Create and run server
const server = new PinterestMcpServer();
server.run().catch(error => {
  console.error('Error running server:', error);
  process.exit(1);
}); 