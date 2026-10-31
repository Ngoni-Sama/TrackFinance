import { registerRootComponent } from 'expo';
import App from './src/App';
import { registerHeadlessSync } from './src/sms/backgroundSync';

registerRootComponent(App);

// Runs the SMS sync when Android wakes the app with no UI (app terminated).
registerHeadlessSync();
