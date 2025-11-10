/**
 * Options page script for YouTube Summary with ChatGPT
 * Handles API key configuration and settings
 */

document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const modelSelect = document.getElementById('model');
  const useStreamingCheckbox = document.getElementById('useStreaming');
  const toggleApiKeyBtn = document.getElementById('toggleApiKey');
  const testApiKeyBtn = document.getElementById('testApiKey');
  const saveSettingsBtn = document.getElementById('saveSettings');
  const statusMessage = document.getElementById('statusMessage');

  // Load saved settings
  await loadSettings();

  // Toggle API key visibility
  toggleApiKeyBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleApiKeyBtn.textContent = 'Hide';
    } else {
      apiKeyInput.type = 'password';
      toggleApiKeyBtn.textContent = 'Show';
    }
  });

  // Test API key
  testApiKeyBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      showStatus('Please enter an API key first', 'error');
      return;
    }

    if (!apiKey.startsWith('sk-')) {
      showStatus('Invalid API key format. OpenAI API keys start with "sk-"', 'error');
      return;
    }

    testApiKeyBtn.disabled = true;
    testApiKeyBtn.textContent = 'Testing...';
    showStatus('Testing API key...', 'info');

    try {
      const isValid = await testApiKey(apiKey);

      if (isValid) {
        showStatus('API key is valid! ✓', 'success');
      } else {
        showStatus('API key is invalid or unauthorized. Please check your key.', 'error');
      }
    } catch (error) {
      showStatus(`Error testing API key: ${error.message}`, 'error');
    } finally {
      testApiKeyBtn.disabled = false;
      testApiKeyBtn.textContent = 'Test API Key';
    }
  });

  // Save settings
  saveSettingsBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const model = modelSelect.value;
    const useStreaming = useStreamingCheckbox.checked;

    if (apiKey && !apiKey.startsWith('sk-')) {
      showStatus('Invalid API key format. OpenAI API keys start with "sk-"', 'error');
      return;
    }

    saveSettingsBtn.disabled = true;
    saveSettingsBtn.textContent = 'Saving...';

    try {
      await chrome.storage.sync.set({
        openaiApiKey: apiKey,
        openaiModel: model,
        useStreaming: useStreaming
      });

      showStatus('Settings saved successfully! ✓', 'success');

      // If API key was saved, test it
      if (apiKey) {
        setTimeout(() => {
          showStatus('Settings saved. You can now use inline summaries on YouTube!', 'success');
        }, 1500);
      }
    } catch (error) {
      showStatus(`Error saving settings: ${error.message}`, 'error');
    } finally {
      saveSettingsBtn.disabled = false;
      saveSettingsBtn.textContent = 'Save Settings';
    }
  });

  // Load settings from storage
  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get([
        'openaiApiKey',
        'openaiModel',
        'useStreaming'
      ]);

      if (result.openaiApiKey) {
        apiKeyInput.value = result.openaiApiKey;
      }

      if (result.openaiModel) {
        modelSelect.value = result.openaiModel;
      }

      if (result.useStreaming !== undefined) {
        useStreamingCheckbox.checked = result.useStreaming;
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      showStatus('Error loading settings. Please refresh the page.', 'error');
    }
  }

  // Test API key function (via background service worker)
  async function testApiKey(apiKey) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          message: 'testApiKey',
          apiKey: apiKey
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('Failed to communicate with extension:', chrome.runtime.lastError);
            resolve(false);
            return;
          }

          if (response.success) {
            resolve(response.isValid);
          } else {
            console.error('API test error:', response.error);
            resolve(false);
          }
        }
      );
    });
  }

  // Show status message
  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';

    // Auto-hide after 5 seconds for success messages
    if (type === 'success') {
      setTimeout(() => {
        statusMessage.style.display = 'none';
      }, 5000);
    }
  }
});
