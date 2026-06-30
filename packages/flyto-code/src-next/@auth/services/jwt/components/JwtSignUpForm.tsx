import { Controller, useForm } from 'react-hook-form';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import FormHelperText from '@mui/material/FormHelperText';
import Button from '@mui/material/Button';
import _ from 'lodash';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import useJwtAuth from '../useJwtAuth';
import { t } from '@lib/i18n';

/**
 * Form Validation Schema
 */
function createSchema() {
	return z
		.object({
			displayName: z.string().nonempty(t('auth.validation.nameRequired')),
			email: z.string().email(t('auth.validation.emailInvalid')).nonempty(t('auth.validation.emailRequired')),
			password: z
				.string()
				.nonempty(t('auth.validation.passwordRequired'))
				.min(8, t('auth.validation.passwordTooShort8')),
			passwordConfirm: z.string().nonempty(t('auth.validation.passwordConfirmRequired')),
			acceptTermsConditions: z.boolean().refine((val) => val === true, t('auth.validation.acceptTermsRequired'))
		})
		.refine((data) => data.password === data.passwordConfirm, {
			message: t('auth.validation.passwordsMustMatch'),
			path: ['passwordConfirm']
		});
}

type FormType = z.infer<ReturnType<typeof createSchema>>;

const defaultValues = {
	displayName: '',
	email: '',
	password: '',
	passwordConfirm: '',
	acceptTermsConditions: false
};

function JwtSignUpForm() {
	const { signUp } = useJwtAuth();
	const schema = createSchema();

	const { control, formState, handleSubmit, setError } = useForm<FormType>({
		mode: 'onChange',
		defaultValues,
		resolver: zodResolver(schema)
	});

	const { isValid, dirtyFields, errors } = formState;

	function onSubmit(formData: FormType) {
		const { displayName, email, password } = formData;
		signUp({
			displayName,
			password,
			email
		})
			.then(() => {
				// No need to do anything, registered user data will be set at app/auth/AuthRouteProvider
			})
			.catch((error) => {
				const errorData = error?.data as {
					type: 'email' | 'password' | `root.${string}` | 'root';
					message: string;
				}[];

				errorData?.forEach?.(({ message, type }) => {
					setError(type, { type: 'manual', message });
				});
			});
	}

	return (
		<form
			name="registerForm"
			noValidate
			className="flex w-full flex-col justify-center"
			onSubmit={handleSubmit(onSubmit)}
		>
			<Controller
				name="displayName"
				control={control}
				render={({ field }) => (
					<TextField
						{...field}
						className="mb-6"
						label={t('auth.displayName')}
						autoFocus
						type="name"
						error={!!errors.displayName}
						helperText={errors?.displayName?.message}
						variant="outlined"
						required
						fullWidth
					/>
				)}
			/>

			<Controller
				name="email"
				control={control}
				render={({ field }) => (
					<TextField
						{...field}
						className="mb-6"
						label={t('auth.email')}
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

			<Controller
				name="passwordConfirm"
				control={control}
				render={({ field }) => (
					<TextField
						{...field}
						className="mb-6"
						label={t('auth.passwordConfirm')}
						type="password"
						error={!!errors.passwordConfirm}
						helperText={errors?.passwordConfirm?.message}
						variant="outlined"
						required
						fullWidth
					/>
				)}
			/>

			<Controller
				name="acceptTermsConditions"
				control={control}
				render={({ field }) => (
					<FormControl error={!!errors.acceptTermsConditions}>
						<FormControlLabel
								label={t('auth.acceptTerms')}
							control={
								<Checkbox
									size="small"
									{...field}
								/>
							}
						/>
						<FormHelperText>{errors?.acceptTermsConditions?.message}</FormHelperText>
					</FormControl>
				)}
			/>

			<Button
				variant="contained"
				color="secondary"
				className="mt-6 w-full"
				aria-label={t('auth.register')}
				disabled={_.isEmpty(dirtyFields) || !isValid}
				type="submit"
				size="large"
			>
					{t('auth.createFreeAccount')}
			</Button>
		</form>
	);
}

export default JwtSignUpForm;
