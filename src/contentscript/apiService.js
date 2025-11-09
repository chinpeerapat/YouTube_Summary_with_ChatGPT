/**
 * API Service for OpenAI ChatGPT API calls
 * Handles communication with OpenAI's API to generate summaries
 */

class ApiService {
  constructor() {
    this.apiKey = null;
    this.apiEndpoint = 'https://api.openai.com/v1/chat/completions';
    this.model = 'gpt-3.5-turbo'; // Default model
  }

  /**
   * Initialize the API service by loading the API key from storage
   */
  async initialize() {
    try {
      const result = await chrome.storage.sync.get(['openaiApiKey', 'openaiModel']);
      this.apiKey = result.openaiApiKey || null;
      this.model = result.openaiModel || 'gpt-3.5-turbo';
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
   * Generate summary using OpenAI API
   * @param {string} prompt - The prompt to send to the API
   * @param {function} onProgress - Callback for streaming updates (optional)
   * @returns {Promise<string>} The generated summary
   */
  async generateSummary(prompt, onProgress = null) {
    if (!this.apiKey) {
      throw new Error('API key not configured. Please set your OpenAI API key in the extension options.');
    }

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that creates concise and informative summaries of YouTube video transcripts.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1000,
          stream: false
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (response.status === 401) {
          throw new Error('Invalid API key. Please check your OpenAI API key in the extension options.');
        } else if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        } else if (response.status === 400) {
          throw new Error(`Bad request: ${errorData.error?.message || 'Invalid request parameters'}`);
        } else {
          throw new Error(`API error (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
        }
      }

      const data = await response.json();

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from API');
      }

      return data.choices[0].message.content.trim();
    } catch (error) {
      if (error.message.includes('fetch')) {
        throw new Error('Network error. Please check your internet connection.');
      }
      throw error;
    }
  }

  /**
   * Generate summary with streaming support
   * @param {string} prompt - The prompt to send to the API
   * @param {function} onChunk - Callback for each chunk of text
   * @returns {Promise<string>} The complete generated summary
   */
  async generateSummaryStream(prompt, onChunk) {
    if (!this.apiKey) {
      throw new Error('API key not configured. Please set your OpenAI API key in the extension options.');
    }

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that creates concise and informative summaries of YouTube video transcripts.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1000,
          stream: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API error (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;

              if (content) {
                fullText += content;
                if (onChunk) {
                  onChunk(content);
                }
              }
            } catch (e) {
              console.warn('Failed to parse chunk:', e);
            }
          }
        }
      }

      return fullText;
    } catch (error) {
      if (error.message.includes('fetch')) {
        throw new Error('Network error. Please check your internet connection.');
      }
      throw error;
    }
  }

  /**
   * Test the API key
   */
  async testApiKey(apiKey) {
    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 5
        })
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
const apiService = new ApiService();
export default apiService;
