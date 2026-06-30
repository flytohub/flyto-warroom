const firebaseConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
	// Optional — only needed if you use these services
	databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || undefined,
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
};

export default firebaseConfig;
