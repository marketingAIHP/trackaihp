const LocationTrackingService = {
  async checkInEmployee() {
    return { success: true };
  },
  async checkOutEmployee() {
    return;
  },
  async resumeTrackingIfNeeded() {
    return;
  },
  async forceOneTimeUpdate() {
    return;
  },
  async isTrackingActive() {
    return false;
  },
  async getLastSentTimestamp() {
    return null;
  },
  async getLastError() {
    return null;
  },
  async getLogs() {
    return [];
  },
  async clearLogs() {
    return;
  },
};

export default LocationTrackingService;
