/**
 * Vitora HMIS Desktop - Preload Script
 * 
 * This script runs in a privileged context and exposes safe APIs
 * to the renderer process through contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Make an API request to the backend
   * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
   * @param {string} endpoint - API endpoint path
   * @param {object} data - Request data (for POST, PUT)
   * @returns {Promise} Response from backend
   */
  apiRequest: (method, endpoint, data) => {
    return ipcRenderer.invoke('api-request', { method, endpoint, data });
  },
  
  /**
   * Get the backend URL
   * @returns {Promise<string>} Backend URL
   */
  getBackendUrl: () => {
    return ipcRenderer.invoke('get-backend-url');
  }
});
