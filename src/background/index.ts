/**
 * Background Service Worker Entry Point.
 */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && typeof message === 'object' && 'type' in message) {
    console.warn('Received extension message:', message.type);
    sendResponse({ status: 'ACK' });
  }
  return true;
});
