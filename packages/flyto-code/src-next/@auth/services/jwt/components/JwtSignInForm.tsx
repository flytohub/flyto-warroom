import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import isEmpty from 'lodash/isEmpty';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Link from '@fuse/core/Link';
import Button from '@mui/material/Button';
import useJwtAuth from '../useJwtAuth';
import { t } from '@lib/i18n'

/**
 * Form Validation Schema
 */
function createSchema() {
	return z.object({
		email: z.string().email(t('auth.validation.emailInvalid')).nonempty(t('auth.validation.emailRequired')),
		password: z
			.string()
			.min(4, t('auth.validation.passwordTooShort4'))
			.nonempty(t('auth.validation.passwordRequired')),
		remember: z.boolean().optional()
	});
}

type FormType = z.infer<ReturnType<typeof createSchema>>;

const defaultValues: FormType = {
	email: '',
	password: '',
	remember: true
};

function JwtSignInForm() {
	const { signIn } = useJwtAuth();
	const schema = createSchema();

	const { control, formState, handleSubmit, setValue, setError } = useForm<FormType>({
		mode: 'onChange',
		defaultValues,
		resolver: zodResolver(schema)
	});

	const { isValid, dirtyFields, errors } = formState;

	// NOTE: a previous version pre-filled `admin@fusetheme.com` /
	// `5;4+0IOx:\\Dy` via setValue() in useEffect. That was Fuse
	// template demo content — removed because (a) it leaked unrelated
	// brand naming, (b) confused real users into thinking they had a
	// saved session, and (c) wired a dummy password into the bundle.

	function onSubmit(formData: FormType) {
		const { email, password } = formData;

		signIn({
			email,
			password
		}).catch((error) => {
			const errorData = error?.data as {
				type: 'email' | 'password' | 'remember' | `root.${string}` | 'root';
				message: string;
			}[];

			errorData?.forEach?.((err) => {
				setError(err.type, {
					type: 'manual',
					message: err.message
				});
			});
		});
	}

	return (
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
						error={!!errors.password}
						helperText={errors?.password?.message}
						variant="outlined"
						required
						fullWidth
					/>
				)}
			/>

			<div className="flex flex-col items-center justify-center sm:flex-row sm:justify-between">
				<Controller
					name="remember"
					control={control}
					render={({ field }) => (
						<FormControl>
							<FormControlLabel
								label={t('auth.rememberMe')}
								control={
									<Checkbox
										size="small"
										{...field}
									/>
								}
							/>
						</FormControl>
					)}
				/>

				<Link
					className="text-md font-medium"
					to="/forgot-password"
				>
					{t('auth.forgotPassword')}
				</Link>
			</div>

			<Button
				variant="contained"
				color="primary"
				className="mt-4 w-full"
				aria-label={t('auth.signIn')}
				disabled={isEmpty(dirtyFields) || !isValid}
				type="submit"
				size="large"
			>
				{t('auth.signIn')}
			</Button>
		</form>
	);
}

export default JwtSignInForm;
