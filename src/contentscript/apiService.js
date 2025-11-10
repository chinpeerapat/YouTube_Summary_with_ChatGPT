/**
 * API Service for OpenAI ChatGPT API calls
 * Proxies requests through the background service worker to bypass CORS
 */

class ApiService {
  constructor() {
    this.apiKey = null;
    this.model = 'gpt-5-mini'; // Default model
  }

  /**
   * Initialize the API service by loading the API key from storage
   */
  async initialize() {
    try {
      const result = await chrome.storage.sync.get(['openaiApiKey', 'openaiModel']);
      this.apiKey = result.openaiApiKey || null;
      this.model = result.openaiModel || 'gpt-5-mini';
      return !!this.apiKey;
    } catch (error) {
      console.error('Failed to initialize API service:', error);
      return false;
    }
  }

  /**
   * Check if API key is configured
   */
  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Generate summary using OpenAI API (via background service worker)
   * @param {string} prompt - The prompt to send to the API
   * @returns {Promise<string>} The generated summary
   */
  async generateSummary(prompt) {
    if (!this.apiKey) {
      throw new Error('API key not configured. Please set your OpenAI API key in the extension options.');
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          message: 'generateSummary',
          prompt: prompt,
          apiKey: this.apiKey,
          model: this.model
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error('Failed to communicate with extension: ' + chrome.runtime.lastError.message));
            return;
          }

          if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error));
          }
        }
      );
    });
  }

  /**
   * Generate summary with streaming support (via background service worker)
   * @param {string} prompt - The prompt to send to the API
   * @param {function} onChunk - Callback for each chunk of text
   * @returns {Promise<string>} The complete generated summary
   */
  async generateSummaryStream(prompt, onChunk) {
    if (!this.apiKey) {
      throw new Error('API key not configured. Please set your OpenAI API key in the extension options.');
    }

    return new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: 'summaryStream' });
      let fullText = '';

      port.onMessage.addListener((msg) => {
        if (msg.type === 'chunk') {
          fullText += msg.data;
          if (onChunk) {
            onChunk(msg.data);
          }
        } else if (msg.type === 'done') {
          port.disconnect();
          resolve(fullText);
        } else if (msg.type === 'error') {
          port.disconnect();
          reject(new Error(msg.error));
        }
      });

      port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) {
          reject(new Error('Connection lost: ' + chrome.runtime.lastError.message));
        }
      });

      // Start the stream
      port.postMessage({
        action: 'startStream',
        prompt: prompt,
        apiKey: this.apiKey,
        model: this.model
      });
    });
  }

  /**
   * Test the API key (via background service worker)
   */
  async testApiKey(apiKey) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          message: 'testApiKey',
          apiKey: apiKey
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error('Failed to communicate with extension: ' + chrome.runtime.lastError.message));
            return;
          }

          if (response.success) {
            resolve(response.isValid);
          } else {
            reject(new Error(response.error));
          }
        }
      );
    });
  }
}

// Export singleton instance
const apiService = new ApiService();
export default apiService;
