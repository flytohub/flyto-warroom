import Paper from '@mui/material/Paper';
import FirebaseSignInTab from '../tabs/sign-in/FirebaseSignInTab';
import SignInPageTitle from '../ui/SignInPageTitle';
import AuthPagesMessageSection from '../ui/AuthPagesMessageSection';
import CircularProgress from '@mui/material/CircularProgress';
import { getLocalBootstrapStatus } from '@lib/engine/auth';
import { env } from '@lib/env';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';

function SignInPageView() {
	const localAuth = env.authMode === 'local' || env.authMode === 'local_jwt' || env.authMode === 'community';
	const [bootstrapRequired, setBootstrapRequired] = useState(false);
	const [checkingBootstrap, setCheckingBootstrap] = useState(localAuth);

	useEffect(() => {
		if (!localAuth) return;
		let cancelled = false;
		getLocalBootstrapStatus()
			.then((status) => {
				if (!cancelled) setBootstrapRequired(status.required && status.registrationOpen);
			})
			.catch(() => {
				// Login remains available for legacy installs and transient status errors.
			})
			.finally(() => {
				if (!cancelled) setCheckingBootstrap(false);
			});
		return () => { cancelled = true; };
	}, [localAuth]);

	if (bootstrapRequired) return <Navigate to="/sign-up" replace />;
	if (checkingBootstrap) {
		return <div className="flex min-h-full flex-auto items-center justify-center"><CircularProgress aria-label="Checking setup status" /></div>;
	}

	return (
		<div className="flex min-w-0 flex-auto flex-col items-center sm:flex-row sm:justify-center md:items-start md:justify-start">
			<Paper className="h-full w-full px-4 py-2 sm:h-auto sm:w-auto sm:rounded-xl sm:p-12 sm:shadow-sm md:flex md:h-full md:w-1/2 md:items-center md:justify-end md:rounded-none md:p-16 md:shadow-none ltr:border-r-1 rtl:border-l-1">
				<div className="mx-auto flex w-full max-w-80 flex-col gap-8 sm:mx-0 sm:w-80">
					<SignInPageTitle />
					<FirebaseSignInTab />
				</div>
			</Paper>

			<AuthPagesMessageSection />
		</div>
	);
}

export default SignInPageView;
