// Import random values polyfill FIRST (required for bcrypt in React Native)
import 'react-native-get-random-values';
import 'react-native-gesture-handler';
import { registerPlatformRuntime } from './src/services/registerPlatformRuntime';

// Fix: Polyfill to prevent Response construction with status 0
// This error occurs when network requests fail and libraries try to create Response with status 0
// Status 0 indicates a network failure (no connection), not an HTTP error response
if (typeof global !== 'undefined' && global.Response) {
  const OriginalResponse = global.Response;
  global.Response = class Response extends OriginalResponse {
    constructor(body, init = {}) {
      // Convert status 0 or invalid status codes to 500 to prevent RangeError
      // The error: "Failed to construct 'Response': The status provided (0) is outside the range [200, 599]"
      if (init && (init.status === 0 || (init.status !== undefined && (init.status < 200 || init.status > 599)))) {
        init = { ...init, status: 500 };
      }
      super(body, init);
    }
  };
}

import { registerRootComponent } from 'expo';
import App from './src/App';

void registerPlatformRuntime();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
