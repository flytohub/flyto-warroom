import Paper from '@mui/material/Paper';
import FirebaseSignUpTab from '../tabs/sign-up/FirebaseSignUpTab';
import SignUpPageTitle from '../ui/SignUpPageTitle';
import AuthPagesMessageSection from '../ui/AuthPagesMessageSection';
import { Navigate } from 'react-router';
import { env } from '@lib/env';

// The JWT / Firebase tab switcher was Fuse template demo content —
// it pointed at /assets/images/logo/jwt.svg + firebase.svg which
// aren't in this project, so both tab icons rendered as broken-image
// placeholders. The JWT path is also an MSW mock; only Firebase is
// real auth. Both reasons add up to: drop the switcher, render the
// Firebase form directly.
function SignUpPageView() {
	const localAuth = env.authMode === 'local' || env.authMode === 'local_jwt' || env.authMode === 'community';
	if (localAuth) return <Navigate to="/sign-in" replace />;

	return (
		<div className="flex min-w-0 flex-auto flex-col items-center sm:flex-row sm:justify-center md:items-start md:justify-start">
			<Paper className="h-full w-full px-4 py-2 sm:h-auto sm:w-auto sm:rounded-xl sm:p-12 sm:shadow-sm md:flex md:h-full md:w-1/2 md:items-center md:justify-end md:rounded-none md:p-16 md:shadow-none ltr:border-r-1 rtl:border-l-1">
				<div className="mx-auto flex w-full max-w-80 flex-col gap-8 sm:mx-0 sm:w-80">
					<SignUpPageTitle />
					<FirebaseSignUpTab />
				</div>
			</Paper>

			<AuthPagesMessageSection />
		</div>
	);
}

export default SignUpPageView;
