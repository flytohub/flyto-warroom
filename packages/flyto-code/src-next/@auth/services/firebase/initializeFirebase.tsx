import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import firebaseConfig from './firebaseAuthConfig';

let initialized = false;

export function initializeFirebase() {
	if (initialized) return true;

	try {
		// Check if already initialized (e.g. by src/lib/firebase.ts via modular API)
		if (!firebase.apps.length) {
			firebase.initializeApp(firebaseConfig);
		}

		firebase.auth();
		initialized = true;
	} catch (error) {
		console.error('Error initializing Firebase:', error);
		initialized = false;
	}

	return initialized;
}

// Initialize on module load
initializeFirebase();

export const firebaseInitialized = initialized;
