import { registerRootComponent } from 'expo';
import BackgroundFetch from 'react-native-background-fetch';
import App from './src/App';
import { headlessSync } from './src/sms/backgroundSync';

registerRootComponent(App);

// Runs the SMS sync when Android wakes the app with no UI (app terminated).
BackgroundFetch.registerHeadlessTask(headlessSync);
