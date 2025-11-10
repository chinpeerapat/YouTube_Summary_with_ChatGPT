"use strict";

console.log("connected...");
const onInstallURL = "https://glasp.co/youtube-summary";

// On Chrome Install
chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason === "install") {
        chrome.tabs.create({ url: onInstallURL });
    }
});

let prompt = "";

// On Message
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.message === "setPrompt") {
        prompt = request.prompt;
    } else if (request.message === "getPrompt") {
        sendResponse({ prompt: prompt });
        prompt = ""; // Reset prompt
    } else if (request.message === "openOptions") {
        chrome.runtime.openOptionsPage();
    } else if (request.message === "generateSummary") {
        // Handle API call in background to bypass CORS
        handleGenerateSummary(request.prompt, request.apiKey, request.model)
            .then(result => sendResponse({ success: true, data: result }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Will respond asynchronously
    } else if (request.message === "testApiKey") {
        // Handle API key testing
        handleTestApiKey(request.apiKey)
            .then(isValid => sendResponse({ success: true, isValid: isValid }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Will respond asynchronously
    }
});

// Handle streaming via Port connections
chrome.runtime.onConnect.addListener(function(port) {
    if (port.name === "summaryStream") {
        port.onMessage.addListener(async function(msg) {
            if (msg.action === "startStream") {
                try {
                    await handleGenerateSummaryStream(
                        msg.prompt,
                        msg.apiKey,
                        msg.model,
                        (chunk) => {
                            port.postMessage({ type: "chunk", data: chunk });
                        }
                    );
                    port.postMessage({ type: "done" });
                } catch (error) {
                    port.postMessage({ type: "error", error: error.message });
                }
            }
        });
    }
});

async function handleGenerateSummary(prompt, apiKey, model) {
    const apiEndpoint = 'https://api.openai.com/v1/chat/completions';

    const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model || 'gpt-3.5-turbo',
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
}

async function handleGenerateSummaryStream(prompt, apiKey, model, onChunk) {
    const apiEndpoint = 'https://api.openai.com/v1/chat/completions';

    const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model || 'gpt-3.5-turbo',
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
    let buffer = ''; // Buffer to accumulate incomplete lines

    while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        // Use { stream: true } to handle multi-byte UTF-8 characters split across chunks
        buffer += decoder.decode(value, { stream: true });

        // Split on newlines, but keep the last incomplete line in the buffer
        const lines = buffer.split('\n');

        // The last element might be incomplete, so we keep it in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
            // Skip empty lines
            if (line.trim() === '') continue;

            if (line.startsWith('data: ')) {
                const data = line.slice(6);

                if (data === '[DONE]') {
                    continue;
                }

                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices[0]?.delta?.content;

                    if (content) {
                        onChunk(content);
                    }
                } catch (e) {
                    console.warn('Failed to parse SSE data:', data, e);
                }
            }
        }
    }

    // Process any remaining data in the buffer after the stream ends
    if (buffer.trim() !== '') {
        if (buffer.startsWith('data: ')) {
            const data = buffer.slice(6);
            if (data !== '[DONE]') {
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices[0]?.delta?.content;
                    if (content) {
                        onChunk(content);
                    }
                } catch (e) {
                    console.warn('Failed to parse final SSE data:', data, e);
                }
            }
        }
    }
}

async function handleTestApiKey(apiKey) {
    const apiEndpoint = 'https://api.openai.com/v1/chat/completions';

    try {
        const response = await fetch(apiEndpoint, {
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