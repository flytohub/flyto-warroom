import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Link from '@fuse/core/Link';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@hooks/useAuth';
import { useSnackbar } from 'notistack';
import { t } from '@lib/i18n';
import { env } from '@lib/env';

function createSchema() {
	return z.object({
		email: z.string().email(t('auth.validation.emailInvalid')).nonempty(t('auth.validation.emailRequired')),
		password: z
			.string()
			.min(8, t('auth.validation.passwordTooShort8'))
			.nonempty(t('auth.validation.passwordRequired'))
	});
}

type FormType = z.infer<ReturnType<typeof createSchema>>;

const defaultValues: FormType = {
	email: '',
	password: ''
};

function GoogleIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24">
			<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
			<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
			<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
			<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
		</svg>
	);
}

function GithubIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
			<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
		</svg>
	);
}

function friendlyFirebaseError(msg: string): string {
	if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) {
		return t('login.invalidCredentials')
	}
	if (msg.includes('too-many-requests')) return t('hardcoded.too.many.login.attempts.please.try.again.in.2361cd43')
	if (msg.includes('network-request-failed')) return t('hardcoded.network.error.check.your.connection.and.try.again.916c8a25')
	if (msg.includes('user-disabled')) return t('hardcoded.this.account.has.been.disabled.contact.support.a62863f0')
	if (msg.includes('popup-closed-by-user')) return t('hardcoded.sign.in.cancelled.24d3d6e6')
	if (msg.includes('popup-blocked')) return t('hardcoded.pop.up.was.blocked.by.your.browser.please.fc4bb07d')
	if (msg.includes('account-exists-with-different-credential')) return t('hardcoded.an.account.already.exists.with.this.email.using.4da624ea')
	if (msg.includes('email-already-in-use')) return t('hardcoded.this.email.is.already.registered.b775015e')
	return msg
}

function FirebaseSignInForm() {
	const { signInWithEmail, signInWithGoogle, signInWithGithub } = useAuth();
	const { enqueueSnackbar } = useSnackbar();
	const schema = createSchema();
	const localAuth = env.authMode === 'local' || env.authMode === 'local_jwt' || env.authMode === 'community';

	const { control, formState, handleSubmit, setError } = useForm<FormType>({
		mode: 'onChange',
		defaultValues,
		resolver: zodResolver(schema)
	});

	const { isValid, errors } = formState;

	function onSubmit(formData: FormType) {
		const { email, password } = formData;
		signInWithEmail(email, password).catch((err) => {
			const raw = err instanceof Error ? err.message : String(err);
			const msg = friendlyFirebaseError(raw);
			if (raw.includes('user-not-found') || raw.includes('wrong-password') || raw.includes('invalid-credential')) {
				setError('email', { type: 'manual', message: msg });
			} else {
				enqueueSnackbar(msg, { variant: 'error' });
			}
		});
	}

	function handleGoogleSignIn() {
		signInWithGoogle().catch((err) => {
			const msg = friendlyFirebaseError(err instanceof Error ? err.message : String(err));
			if (!msg.includes('cancelled')) enqueueSnackbar(msg, { variant: 'error' });
		});
	}

	function handleGithubSignIn() {
		signInWithGithub().catch((err) => {
			const msg = friendlyFirebaseError(err instanceof Error ? err.message : String(err));
			if (!msg.includes('cancelled')) enqueueSnackbar(msg, { variant: 'error' });
		});
	}

	return (
		<div className="w-full">
			{/* OAuth buttons */}
			{!localAuth && (
				<>
					<div className="flex gap-3 mb-6">
						<Button
							variant="outlined"
							className="flex-1"
							startIcon={<GoogleIcon />}
							onClick={handleGoogleSignIn}
							size="large"
							sx={{ textTransform: 'none', fontWeight: 500, borderColor: 'divider', color: 'text.primary' }}
						>
							{t('auth.continueWithGoogle')}
						</Button>
						<Button
							variant="outlined"
							className="flex-1"
							startIcon={<GithubIcon />}
							onClick={handleGithubSignIn}
							size="large"
							sx={{ textTransform: 'none', fontWeight: 500, borderColor: 'divider', color: 'text.primary' }}
						>
							{t('auth.continueWithGithub')}
						</Button>
					</div>

					<Divider className="mb-6">
						<Typography variant="caption" color="text.secondary">{t('auth.orSignInWithEmail')}</Typography>
					</Divider>
				</>
			)}

			{/* Email/password form */}
			<form
				name="loginForm"
				noValidate
				className="flex w-full flex-col justify-center"
				onSubmit={handleSubmit(onSubmit)}
			>
				<Controller
					name="email"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							className="mb-6"
							label={t('auth.email')}
							autoFocus
							autoComplete="email"
							type="email"
							error={!!errors.email}
							helperText={errors?.email?.message}
							variant="outlined"
							required
							fullWidth
						/>
					)}
				/>
				<Controller
					name="password"
					control={control}
					render={({ field }) => (
						<TextField
							{...field}
							className="mb-6"
							label={t('auth.password')}
							type="password"
							autoComplete="current-password"
							error={!!errors.password}
							helperText={errors?.password?.message}
							variant="outlined"
							required
							fullWidth
						/>
					)}
				/>
				{!localAuth && (
					<div className="mb-3 flex justify-end">
						<Link
							className="text-md font-medium"
							to="/forgot-password"
						>
							{t('auth.forgotPassword')}
						</Link>
					</div>
				)}

				<Button
					variant="contained"
					color="primary"
					className="w-full"
					aria-label={t('auth.signIn')}
					disabled={!isValid}
					type="submit"
					size="large"
				>
					{t('auth.signIn')}
				</Button>
			</form>
		</div>
	);
}

export default FirebaseSignInForm;
